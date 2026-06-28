import asyncio
import logging
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.jira import (
    add_comment as jira_add_comment,
    create_jira_issue,
    fetch_comments as jira_fetch_comments,
    fetch_issue_status,
    is_configured,
    transition_issue,
    _JIRA_TO_APP_STATUS,
)
from database import get_db
from models import SupportComment, SupportRequest, User
from schemas import (
    SupportCommentCreate,
    SupportCommentOut,
    SupportRequestCreate,
    SupportRequestOut,
    SupportStatusUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/support", tags=["support"])

UPLOAD_DIR = "/app/uploads"

VALID_TYPES = {"support", "feature"}
VALID_PRIORITIES = {"low", "medium", "high"}
VALID_STATUSES = {"open", "in_progress", "resolved", "closed"}

_STATUS_LABELS = {
    "open": "Abierto",
    "in_progress": "En proceso",
    "resolved": "Resuelto",
    "closed": "Cerrado",
}


def _current_user(request: Request) -> dict:
    return {
        "username": getattr(request.state, "username", "admin"),
        "user_id": getattr(request.state, "user_id", None),
        "role": getattr(request.state, "user_role", "viewer"),
    }


async def _get_or_404(req_id: int, db: AsyncSession) -> SupportRequest:
    result = await db.execute(select(SupportRequest).where(SupportRequest.id == req_id))
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(404, "Solicitud no encontrada")
    return req


# ── Create ─────────────────────────────────────────────────────────────────

@router.post("", response_model=SupportRequestOut, status_code=201)
async def create_support_request(
    body: SupportRequestCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    if body.type not in VALID_TYPES:
        raise HTTPException(400, f"Tipo inválido: {body.type}")
    if body.priority not in VALID_PRIORITIES:
        raise HTTPException(400, f"Prioridad inválida: {body.priority}")

    user = _current_user(request)

    sr = SupportRequest(
        type=body.type,
        subject=body.subject.strip(),
        description=body.description.strip(),
        priority=body.priority,
        username=user["username"],
        user_id=user["user_id"],
        attachments=body.attachments or [],
    )
    db.add(sr)
    await db.commit()
    await db.refresh(sr)

    jira_key = await asyncio.to_thread(create_jira_issue, sr)
    if jira_key:
        sr.jira_issue_key = jira_key
        await db.commit()

    result = await db.execute(
        select(SupportRequest)
        .options(selectinload(SupportRequest.comments))
        .where(SupportRequest.id == sr.id)
    )
    return result.scalar_one()


# ── List ───────────────────────────────────────────────────────────────────

@router.get("", response_model=list[SupportRequestOut])
async def list_support_requests(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = _current_user(request)
    if user["role"] == "administrator":
        result = await db.execute(
            select(SupportRequest)
            .options(selectinload(SupportRequest.comments))
            .order_by(SupportRequest.created_at.desc())
        )
    else:
        result = await db.execute(
            select(SupportRequest)
            .options(selectinload(SupportRequest.comments))
            .where(SupportRequest.username == user["username"])
            .order_by(SupportRequest.created_at.desc())
        )
    return result.scalars().all()


# ── Get single ─────────────────────────────────────────────────────────────

@router.get("/{req_id}", response_model=SupportRequestOut)
async def get_support_request(
    req_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = _current_user(request)
    result = await db.execute(
        select(SupportRequest)
        .options(selectinload(SupportRequest.comments))
        .where(SupportRequest.id == req_id)
    )
    sr = result.scalar_one_or_none()
    if not sr:
        raise HTTPException(404, "Solicitud no encontrada")
    if user["role"] != "administrator" and sr.username != user["username"]:
        raise HTTPException(403, "Acceso denegado")
    return sr


# ── Update status (admin only) ─────────────────────────────────────────────

@router.patch("/{req_id}/status", response_model=SupportRequestOut)
async def update_status(
    req_id: int,
    body: SupportStatusUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = _current_user(request)
    if user["role"] != "administrator":
        raise HTTPException(403, "Se requiere rol administrador")
    if body.status not in VALID_STATUSES:
        raise HTTPException(400, f"Estado inválido: {body.status}")

    sr = await _get_or_404(req_id, db)
    sr.status = body.status
    await db.commit()

    if sr.jira_issue_key:
        await asyncio.to_thread(transition_issue, sr.jira_issue_key, body.status)

    result = await db.execute(
        select(SupportRequest)
        .options(selectinload(SupportRequest.comments))
        .where(SupportRequest.id == req_id)
    )
    return result.scalar_one()


# ── Comments ───────────────────────────────────────────────────────────────

@router.get("/{req_id}/comments", response_model=list[SupportCommentOut])
async def list_comments(
    req_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    sr = await _get_or_404(req_id, db)
    user = _current_user(request)
    if user["role"] != "administrator" and sr.username != user["username"]:
        raise HTTPException(403, "Acceso denegado")

    result = await db.execute(
        select(SupportComment)
        .where(SupportComment.support_request_id == req_id)
        .order_by(SupportComment.created_at.desc())
    )
    return result.scalars().all()


@router.post("/{req_id}/comments", response_model=SupportCommentOut, status_code=201)
async def add_comment(
    req_id: int,
    body: SupportCommentCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    sr = await _get_or_404(req_id, db)
    user = _current_user(request)
    if user["role"] != "administrator" and sr.username != user["username"]:
        raise HTTPException(403, "Acceso denegado")

    comment = SupportComment(
        support_request_id=req_id,
        author=user["username"],
        body=body.body.strip(),
        source="app",
        attachments=body.attachments or [],
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)

    if sr.jira_issue_key:
        jira_id = await asyncio.to_thread(
            jira_add_comment, sr.jira_issue_key, body.body, user["username"],
            body.attachments or [],
        )
        if jira_id:
            comment.jira_comment_id = jira_id
            await db.commit()

    return comment


# ── Sync from Jira ─────────────────────────────────────────────────────────

@router.post("/{req_id}/sync", response_model=SupportRequestOut)
async def sync_from_jira(
    req_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = _current_user(request)
    if user["role"] != "administrator":
        raise HTTPException(403, "Se requiere rol administrador")

    sr = await _get_or_404(req_id, db)
    if not sr.jira_issue_key:
        raise HTTPException(400, "Este ticket no tiene un issue de Jira asociado")

    jira_status = await asyncio.to_thread(fetch_issue_status, sr.jira_issue_key)
    if jira_status and jira_status != sr.status:
        sr.status = jira_status
        await db.commit()

    existing_result = await db.execute(
        select(SupportComment)
        .where(SupportComment.support_request_id == req_id)
    )
    existing_comments = existing_result.scalars().all()
    existing_jira_ids = {c.jira_comment_id for c in existing_comments if c.jira_comment_id}

    # Eliminar duplicados ya existentes: comentarios de Jira cuyo body coincide con un comentario del app
    app_bodies = {f"[{c.author}] {c.body}" for c in existing_comments if c.source == "app"}
    for c in list(existing_comments):
        if c.source == "jira" and c.body in app_bodies:
            await db.delete(c)
    await db.commit()

    # Recargar tras la limpieza
    existing_result = await db.execute(
        select(SupportComment)
        .where(SupportComment.support_request_id == req_id)
    )
    existing_comments = existing_result.scalars().all()
    existing_jira_ids = {c.jira_comment_id for c in existing_comments if c.jira_comment_id}

    # Map of expected Jira body → unsynced app comment (race condition recovery)
    unsynced_map = {
        f"[{c.author}] {c.body}": c
        for c in existing_comments
        if c.source == "app" and not c.jira_comment_id
    }

    jira_comments = await asyncio.to_thread(jira_fetch_comments, sr.jira_issue_key)
    for jc in jira_comments:
        jira_id = jc["jira_comment_id"]
        body = jc.get("body", "")
        created_at = jc.get("created_at_dt")

        if jira_id in existing_jira_ids:
            continue

        # Race condition: app comment sent to Jira before jira_comment_id was saved in DB
        if body in unsynced_map:
            unsynced_map[body].jira_comment_id = jira_id
            continue

        db.add(SupportComment(
            support_request_id=req_id,
            author=jc["author"],
            body=body,
            source="jira",
            jira_comment_id=jira_id,
            created_at=created_at,
        ))

    await db.commit()

    result = await db.execute(
        select(SupportRequest)
        .options(selectinload(SupportRequest.comments))
        .where(SupportRequest.id == req_id)
    )
    return result.scalar_one()


# ── Jira status ────────────────────────────────────────────────────────────

@router.get("/jira/status")
async def jira_status():
    return {"configured": is_configured()}


# ── File uploads ────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload_support_file(file: UploadFile = File(...)):
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
        "url": f"/api/support/uploads/{stored_name}",
        "size": len(content),
        "content_type": file.content_type or "application/octet-stream",
    }


@router.get("/uploads/{filename}")
async def serve_support_file(filename: str):
    filename = os.path.basename(filename)
    filepath = os.path.join(UPLOAD_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    return FileResponse(filepath)
