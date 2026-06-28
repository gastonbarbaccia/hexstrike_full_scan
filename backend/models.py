from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, Float, JSON, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), default="viewer")  # administrator, analista, viewer
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Target(Base):
    __tablename__ = "targets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    url = Column(String(500))
    ip = Column(String(100))
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    scans = relationship("ScanSession", back_populates="target", cascade="all, delete-orphan")
    environments = relationship("TargetEnvironment", back_populates="target", cascade="all, delete-orphan")


class TargetEnvironment(Base):
    __tablename__ = "target_environments"

    id = Column(Integer, primary_key=True, index=True)
    target_id = Column(Integer, ForeignKey("targets.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    env_type = Column(String(50), default="production")  # production, staging, dev, test
    url = Column(String(500))
    ip = Column(String(100))
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    target = relationship("Target", back_populates="environments")


class ScanSession(Base):
    __tablename__ = "scan_sessions"

    id = Column(Integer, primary_key=True, index=True)
    target_id = Column(Integer, ForeignKey("targets.id", ondelete="CASCADE"), nullable=False)
    environment_id = Column(Integer, ForeignKey("target_environments.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(50), default="pending")  # pending running completed failed cancelled
    profile = Column(String(50), nullable=False)    # web network full
    scan_config = Column(JSON, default=dict)
    current_phase = Column(String(100), default="")
    completed_phases = Column(JSON, default=list)
    findings_count = Column(JSON, default=lambda: {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0})
    log = Column(Text, default="")
    report_technical = Column(Text)
    report_executive = Column(Text)
    started_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime)

    target = relationship("Target", back_populates="scans")
    environment = relationship("TargetEnvironment")
    findings = relationship("Finding", back_populates="session", cascade="all, delete-orphan")


class Finding(Base):
    __tablename__ = "findings"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("scan_sessions.id", ondelete="CASCADE"), nullable=False)
    severity = Column(String(20), nullable=False)   # CRITICAL HIGH MEDIUM LOW INFO
    title = Column(String(500), nullable=False)
    description = Column(Text)
    tool = Column(String(100))
    phase = Column(String(100))
    evidence = Column(Text)
    cve = Column(String(50))
    cvss = Column(Float)
    remediation_status = Column(String(50), default="pending")  # pending in_progress remediated false_positive accepted
    assigned_to_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    is_duplicate = Column(Boolean, default=False)
    duplicate_of = Column(Integer, ForeignKey("findings.id", ondelete="SET NULL"), nullable=True)

    session = relationship("ScanSession", back_populates="findings")
    assigned_to = relationship("User", foreign_keys=[assigned_to_id])
    comments = relationship("FindingComment", back_populates="finding", cascade="all, delete-orphan", order_by="FindingComment.created_at")
    activity = relationship("FindingActivity", back_populates="finding", cascade="all, delete-orphan", order_by="FindingActivity.created_at")


class FindingComment(Base):
    __tablename__ = "finding_comments"

    id = Column(Integer, primary_key=True, index=True)
    finding_id = Column(Integer, ForeignKey("findings.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    username = Column(String(100), nullable=False)
    content = Column(Text, nullable=False)
    attachments = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True)

    finding = relationship("Finding", back_populates="comments")


class FindingActivity(Base):
    __tablename__ = "finding_activity"

    id = Column(Integer, primary_key=True, index=True)
    finding_id = Column(Integer, ForeignKey("findings.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    username = Column(String(100), nullable=False)
    action_type = Column(String(50), nullable=False)  # status_change, comment_added, comment_edited, comment_deleted
    details = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

    finding = relationship("Finding", back_populates="activity")


class ScheduledScan(Base):
    __tablename__ = "scheduled_scans"

    id = Column(Integer, primary_key=True, index=True)
    target_id = Column(Integer, ForeignKey("targets.id", ondelete="CASCADE"), nullable=False)
    environment_id = Column(Integer, ForeignKey("target_environments.id", ondelete="SET NULL"), nullable=True)
    profile = Column(String(50), nullable=False)
    cron_expr = Column(String(100), nullable=False)
    label = Column(String(200))
    scan_config = Column(JSON, default=dict)
    active = Column(Boolean, default=True)
    is_running = Column(Boolean, default=False)
    last_run_at = Column(DateTime, nullable=True)
    next_run_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    target = relationship("Target")
    environment = relationship("TargetEnvironment")


class AppSettings(Base):
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, default=1)
    webhook_url = Column(String(500), nullable=True)
    webhook_on_critical = Column(Boolean, default=True)
    webhook_on_complete = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SLAConfig(Base):
    __tablename__ = "sla_configs"

    id = Column(Integer, primary_key=True, index=True)
    severity = Column(String(20), unique=True, nullable=False)  # CRITICAL HIGH MEDIUM LOW INFO
    hours = Column(Integer, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SupportRequest(Base):
    __tablename__ = "support_requests"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String(20), nullable=False)       # support | feature
    subject = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    priority = Column(String(20), default="medium") # low | medium | high
    status = Column(String(20), default="open")     # open | in_progress | resolved | closed
    username = Column(String(100), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    jira_issue_key = Column(String(50), nullable=True)
    attachments = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])
    comments = relationship("SupportComment", back_populates="request", cascade="all, delete-orphan", order_by="SupportComment.created_at")


class SupportComment(Base):
    __tablename__ = "support_comments"

    id = Column(Integer, primary_key=True, index=True)
    support_request_id = Column(Integer, ForeignKey("support_requests.id", ondelete="CASCADE"), nullable=False)
    author = Column(String(100), nullable=False)
    body = Column(Text, nullable=False)
    source = Column(String(20), default="app")  # app | jira
    jira_comment_id = Column(String(50), nullable=True)
    attachments = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)

    request = relationship("SupportRequest", back_populates="comments")
