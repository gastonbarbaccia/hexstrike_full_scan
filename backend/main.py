import os
import json
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import init_db, AsyncSessionLocal
from api.targets import router as targets_router
from api.scans import router as scans_router
from api.scheduled import router as scheduled_router
from api.settings_api import router as settings_router
from api.auth import router as auth_router, AUTH_ENABLED, SECRET_KEY, ALGORITHM
from api.users import router as users_router
from api.sla import router as sla_router
from api.vulnerabilities import router as vulnerabilities_router
from api.support import router as support_router

# ── APScheduler ─────────────────────────────────────────────────────────────

SCHEDULER_TZ = os.environ.get("SCHEDULER_TZ", "America/Argentina/Buenos_Aires")

try:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron import CronTrigger
    SCHEDULER_AVAILABLE = True
except ImportError:
    SCHEDULER_AVAILABLE = False

scheduler = None


async def _run_scheduled_scan(sched_id: int):
    """Execute one scheduled scan run."""
    from models import ScheduledScan, ScanSession, Target, TargetEnvironment
    from services.claude_orchestrator import run_pentest
    from sqlalchemy import select, update

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ScheduledScan)
            .where(ScheduledScan.id == sched_id, ScheduledScan.active == True)
        )
        sched = result.scalar_one_or_none()
        if not sched:
            return

        target_result = await db.execute(select(Target).where(Target.id == sched.target_id))
        target = target_result.scalar_one_or_none()
        if not target:
            return

        target_str = target.url or target.ip or target.name
        if sched.environment_id:
            env_result = await db.execute(
                select(TargetEnvironment).where(TargetEnvironment.id == sched.environment_id)
            )
            env = env_result.scalar_one_or_none()
            if env:
                target_str = env.url or env.ip or target_str

        session = ScanSession(
            target_id=sched.target_id,
            environment_id=sched.environment_id,
            profile=sched.profile,
            scan_config=sched.scan_config or {},
            status="pending",
            current_phase="",
            completed_phases=[],
            findings_count={"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0},
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)

        now = datetime.utcnow()
        try:
            trigger = CronTrigger.from_crontab(sched.cron_expr, timezone=SCHEDULER_TZ)
            next_fire = trigger.get_next_fire_time(None, now)
            next_run = next_fire.replace(tzinfo=None) if next_fire is not None else None
        except Exception:
            next_run = None

        await db.execute(
            update(ScheduledScan)
            .where(ScheduledScan.id == sched_id)
            .values(last_run_at=now, next_run_at=next_run, is_running=True)
        )
        await db.commit()

        session_id = session.id
        scan_config = sched.scan_config or {}

    try:
        await run_pentest(session_id, target_str, sched.profile, AsyncSessionLocal, scan_config)
    finally:
        async with AsyncSessionLocal() as db:
            await db.execute(
                update(ScheduledScan)
                .where(ScheduledScan.id == sched_id)
                .values(is_running=False)
            )
            await db.commit()


async def register_scheduled_scan(sched_id: int, cron_expr: str, active: bool):
    if not SCHEDULER_AVAILABLE or scheduler is None:
        return

    job_id = f"sched_{sched_id}"
    try:
        scheduler.remove_job(job_id)
    except Exception:
        pass

    if active:
        try:
            trigger = CronTrigger.from_crontab(cron_expr, timezone=SCHEDULER_TZ)
            scheduler.add_job(
                _run_scheduled_scan,
                trigger=trigger,
                args=[sched_id],
                id=job_id,
                replace_existing=True,
            )
        except Exception as e:
            print(f"[Scheduler] Failed to register job {job_id}: {e}")


def remove_scheduled_scan(sched_id: int):
    if not SCHEDULER_AVAILABLE or scheduler is None:
        return
    try:
        scheduler.remove_job(f"sched_{sched_id}")
    except Exception:
        pass


# ── Lifespan ────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global scheduler

    await init_db()
    await _migrate()
    await _seed_sla_defaults()
    await _seed_admin_user()

    if SCHEDULER_AVAILABLE:
        scheduler = AsyncIOScheduler()
        scheduler.start()
        await _load_scheduled_scans()

    yield

    if scheduler:
        scheduler.shutdown(wait=False)


async def _load_scheduled_scans():
    from models import ScheduledScan
    from sqlalchemy import select, update

    async with AsyncSessionLocal() as db:
        await db.execute(update(ScheduledScan).values(is_running=False))
        await db.commit()

        result = await db.execute(
            select(ScheduledScan).where(ScheduledScan.active == True)
        )
        scans = result.scalars().all()
        for sched in scans:
            await register_scheduled_scan(sched.id, sched.cron_expr, sched.active)


async def _migrate():
    """Apply additive schema migrations."""
    from database import engine
    from sqlalchemy import text

    async with engine.begin() as conn:
        # Existing migrations
        await conn.execute(text(
            "ALTER TABLE findings ADD COLUMN IF NOT EXISTS "
            "remediation_status VARCHAR(50) DEFAULT 'pending'"
        ))
        await conn.execute(text(
            "ALTER TABLE scan_sessions ADD COLUMN IF NOT EXISTS "
            "scan_config JSONB DEFAULT '{}'"
        ))
        await conn.execute(text(
            "ALTER TABLE scan_sessions ADD COLUMN IF NOT EXISTS "
            "environment_id INTEGER"
        ))
        await conn.execute(text(
            "ALTER TABLE scheduled_scans ADD COLUMN IF NOT EXISTS "
            "is_running BOOLEAN DEFAULT FALSE"
        ))
        # New: users table
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'viewer',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))
        # New: sla_configs table
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS sla_configs (
                id SERIAL PRIMARY KEY,
                severity VARCHAR(20) UNIQUE NOT NULL,
                hours INTEGER NOT NULL,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """))
        # New: assigned_to_id on findings
        await conn.execute(text(
            "ALTER TABLE findings ADD COLUMN IF NOT EXISTS "
            "assigned_to_id INTEGER REFERENCES users(id) ON DELETE SET NULL"
        ))
        # New: duplicate tracking
        await conn.execute(text(
            "ALTER TABLE findings ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT FALSE"
        ))
        await conn.execute(text(
            "ALTER TABLE findings ADD COLUMN IF NOT EXISTS "
            "duplicate_of INTEGER REFERENCES findings(id) ON DELETE SET NULL"
        ))
        # New: finding_comments table
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS finding_comments (
                id SERIAL PRIMARY KEY,
                finding_id INTEGER NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                username VARCHAR(100) NOT NULL,
                content TEXT NOT NULL,
                attachments JSONB DEFAULT '[]',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP
            )
        """))
        # New: finding_activity table
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS finding_activity (
                id SERIAL PRIMARY KEY,
                finding_id INTEGER NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                username VARCHAR(100) NOT NULL,
                action_type VARCHAR(50) NOT NULL,
                details JSONB DEFAULT '{}',
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))
        # Support tables
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS support_requests (
                id SERIAL PRIMARY KEY,
                type VARCHAR(20) NOT NULL,
                subject VARCHAR(200) NOT NULL,
                description TEXT NOT NULL,
                priority VARCHAR(20) DEFAULT 'medium',
                status VARCHAR(20) DEFAULT 'open',
                username VARCHAR(100) NOT NULL,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                jira_issue_key VARCHAR(50),
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS support_comments (
                id SERIAL PRIMARY KEY,
                support_request_id INTEGER NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
                author VARCHAR(100) NOT NULL,
                body TEXT NOT NULL,
                source VARCHAR(20) DEFAULT 'app',
                jira_comment_id VARCHAR(50),
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))
        await conn.execute(text(
            "ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'"
        ))
        await conn.execute(text(
            "ALTER TABLE support_comments ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'"
        ))


async def _seed_admin_user():
    """Ensure the ENV admin exists in the DB and has the correct role/password."""
    from models import User
    from sqlalchemy import select
    from api.auth import hash_password, ADMIN_USER, ADMIN_PASS

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.username == ADMIN_USER))
        admin = result.scalar_one_or_none()
        new_hash = hash_password(ADMIN_PASS)
        if not admin:
            db.add(User(
                username=ADMIN_USER,
                email=None,
                password_hash=new_hash,
                role="administrator",
                is_active=True,
            ))
        else:
            admin.password_hash = new_hash
            admin.role = "administrator"
        await db.commit()


async def _seed_sla_defaults():
    """Ensure default SLA entries exist."""
    from models import SLAConfig
    from sqlalchemy import select

    defaults = {
        "CRITICAL": 24,
        "HIGH": 72,
        "MEDIUM": 168,
        "LOW": 336,
        "INFO": 720,
    }
    async with AsyncSessionLocal() as db:
        for severity, hours in defaults.items():
            result = await db.execute(
                select(SLAConfig).where(SLAConfig.severity == severity)
            )
            if not result.scalar_one_or_none():
                db.add(SLAConfig(severity=severity, hours=hours))
        await db.commit()


# ── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="HexStrike AI Platform",
    description="Autonomous AI-powered penetration testing platform",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Auth middleware ──────────────────────────────────────────────────────────

PUBLIC_PATHS = {
    "/api/auth/login",
    "/api/auth/config",
    "/api/health",
    "/api/support/jira/status",
}

PUBLIC_PREFIXES = (
    "/api/support/uploads/",
    "/api/vulnerabilities/uploads/",
)


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if not AUTH_ENABLED:
        return await call_next(request)

    path = request.url.path
    if path in PUBLIC_PATHS or any(path.startswith(p) for p in PUBLIC_PREFIXES):
        return await call_next(request)

    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
    elif request.query_params.get("token"):
        token = request.query_params["token"]
    else:
        return JSONResponse({"detail": "No autorizado"}, status_code=401)
    try:
        from jose import jwt, JWTError
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        # Store user info in request state for use by routes
        request.state.user_role = payload.get("role", "viewer")
        request.state.user_id = payload.get("user_id")
        request.state.username = payload.get("sub", "")
    except Exception:
        return JSONResponse({"detail": "Token inválido o expirado"}, status_code=401)

    return await call_next(request)


# ── Routers ──────────────────────────────────────────────────────────────────

app.include_router(auth_router)
app.include_router(targets_router)
app.include_router(scans_router)
app.include_router(scheduled_router)
app.include_router(settings_router)
app.include_router(users_router)
app.include_router(sla_router)
app.include_router(vulnerabilities_router)
app.include_router(support_router)


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "service": "HexStrike AI Backend",
        "scheduler": SCHEDULER_AVAILABLE and scheduler is not None,
    }


@app.get("/api/dashboard")
async def dashboard_stats():
    from sqlalchemy import select, func
    from models import Target, ScanSession, Finding

    async with AsyncSessionLocal() as db:
        total_targets = (await db.execute(select(func.count(Target.id)))).scalar_one()
        total_scans = (await db.execute(select(func.count(ScanSession.id)))).scalar_one()
        running = (await db.execute(
            select(func.count(ScanSession.id)).where(ScanSession.status == "running")
        )).scalar_one()
        completed = (await db.execute(
            select(func.count(ScanSession.id)).where(ScanSession.status == "completed")
        )).scalar_one()
        total_findings = (await db.execute(select(func.count(Finding.id)))).scalar_one()

        sev_result = await db.execute(
            select(Finding.severity, func.count(Finding.id)).group_by(Finding.severity)
        )
        by_severity = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0, "INFO": 0}
        for sev, cnt in sev_result:
            if sev in by_severity:
                by_severity[sev] = cnt

    return {
        "total_targets": total_targets,
        "total_scans": total_scans,
        "running_scans": running,
        "completed_scans": completed,
        "total_findings": total_findings,
        "findings_by_severity": by_severity,
    }
