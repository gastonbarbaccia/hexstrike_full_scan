from datetime import datetime
from typing import Optional, List, Dict
from pydantic import BaseModel


# ── ScanConfig ─────────────────────────────────────────────────────────────

class ScanConfig(BaseModel):
    excluded_paths: Optional[List[str]] = []
    target_ports: Optional[str] = ""
    auth_headers: Optional[Dict[str, str]] = {}
    auth_cookies: Optional[Dict[str, str]] = {}
    notes: Optional[str] = ""


# ── User ───────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str
    email: Optional[str] = None
    password: str
    role: Optional[str] = "viewer"  # administrator, analista, viewer


class UserUpdate(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class UserOut(BaseModel):
    id: int
    username: str
    email: Optional[str]
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── SLAConfig ──────────────────────────────────────────────────────────────

class SLAConfigOut(BaseModel):
    severity: str
    hours: int

    model_config = {"from_attributes": True}


class SLAConfigUpdate(BaseModel):
    CRITICAL: Optional[int] = None
    HIGH: Optional[int] = None
    MEDIUM: Optional[int] = None
    LOW: Optional[int] = None
    INFO: Optional[int] = None


# ── TargetEnvironment ──────────────────────────────────────────────────────

class TargetEnvironmentCreate(BaseModel):
    name: str
    env_type: Optional[str] = "production"
    url: Optional[str] = None
    ip: Optional[str] = None
    notes: Optional[str] = None


class TargetEnvironmentOut(BaseModel):
    id: int
    target_id: int
    name: str
    env_type: Optional[str]
    url: Optional[str]
    ip: Optional[str]
    notes: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Target ─────────────────────────────────────────────────────────────────

class TargetCreate(BaseModel):
    name: str
    url: Optional[str] = None
    ip: Optional[str] = None
    notes: Optional[str] = None


class TargetUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    ip: Optional[str] = None
    notes: Optional[str] = None


class TargetOut(BaseModel):
    id: int
    name: str
    url: Optional[str]
    ip: Optional[str]
    notes: Optional[str]
    created_at: datetime
    environments: Optional[List[TargetEnvironmentOut]] = []

    model_config = {"from_attributes": True}


# ── Finding ────────────────────────────────────────────────────────────────

class FindingOut(BaseModel):
    id: int
    session_id: int
    severity: str
    title: str
    description: Optional[str]
    tool: Optional[str]
    phase: Optional[str]
    evidence: Optional[str]
    cve: Optional[str]
    cvss: Optional[float]
    remediation_status: Optional[str] = "pending"
    assigned_to_id: Optional[int] = None
    assigned_to: Optional[UserOut] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class FindingStatusUpdate(BaseModel):
    remediation_status: str


class FindingUpdate(BaseModel):
    remediation_status: Optional[str] = None
    assigned_to_id: Optional[int] = None


# ── ScanSession ────────────────────────────────────────────────────────────

class ScanCreate(BaseModel):
    target_id: int
    profile: str = "web"   # web | network | full
    environment_id: Optional[int] = None
    scan_config: Optional[ScanConfig] = None


class ScanOut(BaseModel):
    id: int
    target_id: int
    environment_id: Optional[int]
    status: str
    profile: str
    scan_config: Optional[dict]
    current_phase: Optional[str]
    completed_phases: Optional[list]
    findings_count: Optional[dict]
    log: Optional[str]
    report_technical: Optional[str]
    report_executive: Optional[str]
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    target: Optional[TargetOut]
    environment: Optional[TargetEnvironmentOut]
    findings: Optional[List[FindingOut]] = []

    model_config = {"from_attributes": True}


class ScanSummary(BaseModel):
    id: int
    target_id: int
    environment_id: Optional[int]
    status: str
    profile: str
    current_phase: Optional[str]
    completed_phases: Optional[list]
    findings_count: Optional[dict]
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    target: Optional[TargetOut]
    environment: Optional[TargetEnvironmentOut]

    model_config = {"from_attributes": True}


# ── ScheduledScan ──────────────────────────────────────────────────────────

class ScheduledScanCreate(BaseModel):
    target_id: int
    environment_id: Optional[int] = None
    profile: str = "web"
    cron_expr: str
    label: Optional[str] = None
    scan_config: Optional[ScanConfig] = None
    active: Optional[bool] = True


class ScheduledScanUpdate(BaseModel):
    profile: Optional[str] = None
    cron_expr: Optional[str] = None
    label: Optional[str] = None
    scan_config: Optional[ScanConfig] = None
    active: Optional[bool] = None


class ScheduledScanOut(BaseModel):
    id: int
    target_id: int
    environment_id: Optional[int]
    profile: str
    cron_expr: str
    label: Optional[str]
    scan_config: Optional[dict]
    active: bool
    is_running: bool = False
    last_run_at: Optional[datetime]
    next_run_at: Optional[datetime]
    created_at: datetime
    target: Optional[TargetOut]
    environment: Optional[TargetEnvironmentOut]

    model_config = {"from_attributes": True}


# ── AppSettings ────────────────────────────────────────────────────────────

class AppSettingsOut(BaseModel):
    webhook_url: Optional[str]
    webhook_on_critical: bool
    webhook_on_complete: bool

    model_config = {"from_attributes": True}


class AppSettingsUpdate(BaseModel):
    webhook_url: Optional[str] = None
    webhook_on_critical: Optional[bool] = None
    webhook_on_complete: Optional[bool] = None


# ── Dashboard ──────────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_targets: int
    total_scans: int
    running_scans: int
    completed_scans: int
    total_findings: int
    findings_by_severity: dict


# ── FindingComment ─────────────────────────────────────────────────────────

class CommentCreate(BaseModel):
    content: str
    attachments: Optional[List[dict]] = []


class CommentUpdate(BaseModel):
    content: str


class CommentOut(BaseModel):
    id: int
    finding_id: int
    user_id: Optional[int]
    username: str
    content: str
    attachments: Optional[List[dict]] = []
    created_at: datetime
    updated_at: Optional[datetime] = None
    is_edited: bool = False

    model_config = {"from_attributes": True}


# ── FindingActivity ─────────────────────────────────────────────────────────

class ActivityOut(BaseModel):
    id: int
    finding_id: int
    user_id: Optional[int]
    username: str
    action_type: str
    details: Optional[dict] = {}
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Support ────────────────────────────────────────────────────────────────

class SupportCommentOut(BaseModel):
    id: int
    support_request_id: int
    author: str
    body: str
    source: str
    attachments: Optional[List[dict]] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class SupportRequestCreate(BaseModel):
    type: str
    subject: str
    description: str
    priority: Optional[str] = "medium"
    attachments: Optional[List[dict]] = []


class SupportCommentCreate(BaseModel):
    body: str
    attachments: Optional[List[dict]] = []


class SupportRequestOut(BaseModel):
    id: int
    type: str
    subject: str
    description: str
    priority: str
    status: str
    username: str
    user_id: Optional[int]
    jira_issue_key: Optional[str]
    attachments: Optional[List[dict]] = []
    created_at: datetime
    comments: Optional[List[SupportCommentOut]] = []

    model_config = {"from_attributes": True}


class SupportStatusUpdate(BaseModel):
    status: str


# ── VulnerabilityKanban ────────────────────────────────────────────────────

class VulnerabilityOut(BaseModel):
    id: int
    session_id: int
    scan_id: int
    target_name: str
    target_id: int
    severity: str
    title: str
    description: Optional[str]
    tool: Optional[str]
    phase: Optional[str]
    cve: Optional[str]
    cvss: Optional[float]
    remediation_status: Optional[str] = "pending"
    assigned_to_id: Optional[int] = None
    assigned_to: Optional[UserOut] = None
    created_at: datetime
    sla_hours: Optional[int] = None
    sla_deadline: Optional[datetime] = None
    sla_expired: Optional[bool] = False

    model_config = {"from_attributes": True}
