import os
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models import Finding, FindingComment, FindingActivity, ScanSession, Target, User, SLAConfig
from schemas import FindingUpdate, CommentCreate, CommentUpdate
from api.auth import extract_jwt_payload

router = APIRouter(prefix="/api/vulnerabilities", tags=["vulnerabilities"])

UPLOAD_DIR = "/app/uploads"


# ── Helpers ────────────────────────────────────────────────────────────────

def _get_actor(request: Request) -> dict:
    payload = extract_jwt_payload(request)
    return {
        "user_id": payload.get("user_id"),
        "username": payload.get("sub", "sistema"),
    }


async def _log_activity(db: AsyncSession, finding_id: int, user_id, username: str, action_type: str, details: dict):
    entry = FindingActivity(
        finding_id=finding_id,
        user_id=user_id,
        username=username,
        action_type=action_type,
        details=details or {},
    )
    db.add(entry)


# ── List all vulnerabilities ────────────────────────────────────────────────

@router.get("/")
async def list_vulnerabilities(db: AsyncSession = Depends(get_db)):
    sla_result = await db.execute(select(SLAConfig))
    sla_map = {c.severity: c.hours for c in sla_result.scalars().all()}

    result = await db.execute(
        select(Finding)
        .options(
            selectinload(Finding.session).selectinload(ScanSession.target),
            selectinload(Finding.assigned_to),
        )
        .where(Finding.is_duplicate == False)
        .order_by(Finding.created_at.desc())
    )
    findings = result.scalars().all()

    now = datetime.utcnow()
    out = []
    for f in findings:
        sla_hours = sla_map.get(f.severity)
        sla_deadline = None
        sla_expired = False
        if sla_hours and f.created_at:
            sla_deadline = f.created_at + timedelta(hours=sla_hours)
            sla_expired = now > sla_deadline

        target_name = ""
        target_id = None
        if f.session and f.session.target:
            target_name = f.session.target.name
            target_id = f.session.target.id

        assigned = None
        if f.assigned_to:
            assigned = {
                "id": f.assigned_to.id,
                "username": f.assigned_to.username,
                "role": f.assigned_to.role,
                "email": f.assigned_to.email,
                "is_active": f.assigned_to.is_active,
                "created_at": f.assigned_to.created_at.isoformat() if f.assigned_to.created_at else None,
            }

        out.append({
            "id": f.id,
            "session_id": f.session_id,
            "scan_id": f.session_id,
            "target_name": target_name,
            "target_id": target_id,
            "severity": f.severity,
            "title": f.title,
            "description": f.description,
            "tool": f.tool,
            "phase": f.phase,
            "cve": f.cve,
            "cvss": f.cvss,
            "remediation_status": f.remediation_status or "pending",
            "assigned_to_id": f.assigned_to_id,
            "assigned_to": assigned,
            "created_at": f.created_at.isoformat() + "Z" if f.created_at else None,
            "sla_hours": sla_hours,
            "sla_deadline": sla_deadline.isoformat() + "Z" if sla_deadline else None,
            "sla_expired": sla_expired,
        })

    return out


# ── Update vulnerability status / assignment ────────────────────────────────

@router.patch("/{finding_id}")
async def update_vulnerability(
    finding_id: int,
    data: FindingUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    payload = extract_jwt_payload(request)
    if payload.get("role", "viewer") == "viewer":
        raise HTTPException(status_code=403, detail="Sin permisos para modificar vulnerabilidades")

    actor = _get_actor(request)

    result = await db.execute(
        select(Finding)
        .options(
            selectinload(Finding.session).selectinload(ScanSession.target),
            selectinload(Finding.assigned_to),
        )
        .where(Finding.id == finding_id)
    )
    finding = result.scalar_one_or_none()
    if not finding:
        raise HTTPException(status_code=404, detail="Vulnerabilidad no encontrada")

    if data.remediation_status is not None:
        valid_statuses = ("pending", "in_progress", "remediated", "false_positive", "accepted")
        if data.remediation_status not in valid_statuses:
            raise HTTPException(status_code=400, detail="Estado de remediación inválido")
        old_status = finding.remediation_status or "pending"
        if old_status != data.remediation_status:
            finding.remediation_status = data.remediation_status
            await _log_activity(
                db, finding_id, actor["user_id"], actor["username"],
                "status_change",
                {"from": old_status, "to": data.remediation_status},
            )

    if data.assigned_to_id is not None:
        if data.assigned_to_id == 0:
            finding.assigned_to_id = None
        else:
            user_result = await db.execute(select(User).where(User.id == data.assigned_to_id))
            if not user_result.scalar_one_or_none():
                raise HTTPException(status_code=404, detail="Usuario no encontrado")
            finding.assigned_to_id = data.assigned_to_id

    await db.commit()
    return {"ok": True}


# ── Comments ────────────────────────────────────────────────────────────────

@router.get("/{finding_id}/comments")
async def list_comments(finding_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(FindingComment)
        .where(FindingComment.finding_id == finding_id)
        .order_by(FindingComment.created_at.asc())
    )
    comments = result.scalars().all()
    return [
        {
            "id": c.id,
            "finding_id": c.finding_id,
            "user_id": c.user_id,
            "username": c.username,
            "content": c.content,
            "attachments": c.attachments or [],
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            "is_edited": c.updated_at is not None,
        }
        for c in comments
    ]


@router.post("/{finding_id}/comments")
async def create_comment(
    finding_id: int,
    data: CommentCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    finding = await db.get(Finding, finding_id)
    if not finding:
        raise HTTPException(status_code=404, detail="Vulnerabilidad no encontrada")

    actor = _get_actor(request)

    comment = FindingComment(
        finding_id=finding_id,
        user_id=actor["user_id"],
        username=actor["username"],
        content=data.content,
        attachments=data.attachments or [],
    )
    db.add(comment)
    await db.flush()

    await _log_activity(
        db, finding_id, actor["user_id"], actor["username"],
        "comment_added",
        {"comment_id": comment.id},
    )

    await db.commit()
    await db.refresh(comment)

    return {
        "id": comment.id,
        "finding_id": comment.finding_id,
        "user_id": comment.user_id,
        "username": comment.username,
        "content": comment.content,
        "attachments": comment.attachments or [],
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
        "updated_at": None,
        "is_edited": False,
    }


@router.patch("/{finding_id}/comments/{comment_id}")
async def update_comment(
    finding_id: int,
    comment_id: int,
    data: CommentUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FindingComment).where(
            FindingComment.id == comment_id,
            FindingComment.finding_id == finding_id,
        )
    )
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comentario no encontrado")

    actor = _get_actor(request)

    comment.content = data.content
    comment.updated_at = datetime.utcnow()

    await _log_activity(
        db, finding_id, actor["user_id"], actor["username"],
        "comment_edited",
        {"comment_id": comment_id},
    )

    await db.commit()
    await db.refresh(comment)

    return {
        "id": comment.id,
        "finding_id": comment.finding_id,
        "user_id": comment.user_id,
        "username": comment.username,
        "content": comment.content,
        "attachments": comment.attachments or [],
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
        "updated_at": comment.updated_at.isoformat() if comment.updated_at else None,
        "is_edited": True,
    }


@router.delete("/{finding_id}/comments/{comment_id}")
async def delete_comment(
    finding_id: int,
    comment_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FindingComment).where(
            FindingComment.id == comment_id,
            FindingComment.finding_id == finding_id,
        )
    )
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comentario no encontrado")

    actor = _get_actor(request)

    # Store a short preview of the deleted content for activity
    plain_preview = comment.content[:80] if comment.content else ""

    await db.delete(comment)

    await _log_activity(
        db, finding_id, actor["user_id"], actor["username"],
        "comment_deleted",
        {"preview": plain_preview},
    )

    await db.commit()
    return {"ok": True}


# ── Activity ────────────────────────────────────────────────────────────────

@router.get("/{finding_id}/activity")
async def list_activity(finding_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(FindingActivity)
        .where(FindingActivity.finding_id == finding_id)
        .order_by(FindingActivity.created_at.desc())
    )
    items = result.scalars().all()
    return [
        {
            "id": a.id,
            "finding_id": a.finding_id,
            "user_id": a.user_id,
            "username": a.username,
            "action_type": a.action_type,
            "details": a.details or {},
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in items
    ]


# ── File uploads ────────────────────────────────────────────────────────────

@router.post("/uploads")
async def upload_file(file: UploadFile = File(...)):
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    original = file.filename or "archivo"
    ext = os.path.splitext(original)[1]
    stored_name = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, stored_name)
    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)
    return {
        "name": original,
        "url": f"/api/vulnerabilities/uploads/{stored_name}",
        "size": len(content),
        "content_type": file.content_type or "application/octet-stream",
    }


@router.get("/uploads/{filename}")
async def serve_file(filename: str):
    filename = os.path.basename(filename)  # prevent path traversal
    filepath = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return FileResponse(filepath)
