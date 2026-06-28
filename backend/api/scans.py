import asyncio
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db, AsyncSessionLocal
from models import ScanSession, Target, Finding, TargetEnvironment, User
from schemas import ScanCreate, ScanOut, ScanSummary, FindingStatusUpdate, FindingUpdate
from services.claude_orchestrator import run_pentest, sse_manager

router = APIRouter(prefix="/api/scans", tags=["scans"])


@router.get("/", response_model=list[ScanSummary])
async def list_scans(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ScanSession)
        .options(
            selectinload(ScanSession.target).selectinload(Target.environments),
            selectinload(ScanSession.environment),
        )
        .order_by(ScanSession.started_at.desc())
        .limit(50)
    )
    return result.scalars().all()


@router.post("/", response_model=ScanOut, status_code=201)
async def start_scan(
    data: ScanCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    target_result = await db.execute(select(Target).where(Target.id == data.target_id))
    target = target_result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    if data.profile not in ("web", "network", "full"):
        raise HTTPException(status_code=400, detail="Profile must be: web, network, or full")

    # Resolve target string: environment overrides target
    target_str = target.url or target.ip or target.name
    if data.environment_id:
        env_result = await db.execute(
            select(TargetEnvironment).where(
                TargetEnvironment.id == data.environment_id,
                TargetEnvironment.target_id == data.target_id,
            )
        )
        env = env_result.scalar_one_or_none()
        if env:
            target_str = env.url or env.ip or target_str

    scan_config_dict = data.scan_config.model_dump() if data.scan_config else {}

    session = ScanSession(
        target_id=data.target_id,
        environment_id=data.environment_id,
        profile=data.profile,
        scan_config=scan_config_dict,
        status="pending",
        current_phase="",
        completed_phases=[],
        findings_count={"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0},
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    background_tasks.add_task(
        run_pentest,
        session.id,
        target_str,
        data.profile,
        AsyncSessionLocal,
        scan_config_dict,
    )

    result = await db.execute(
        select(ScanSession)
        .options(
            selectinload(ScanSession.target).selectinload(Target.environments),
            selectinload(ScanSession.environment),
            selectinload(ScanSession.findings),
        )
        .where(ScanSession.id == session.id)
    )
    return result.scalar_one()


@router.get("/{scan_id}", response_model=ScanOut)
async def get_scan(scan_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ScanSession)
        .options(
            selectinload(ScanSession.target).selectinload(Target.environments),
            selectinload(ScanSession.environment),
            selectinload(ScanSession.findings).selectinload(Finding.assigned_to),
        )
        .where(ScanSession.id == scan_id)
    )
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    return scan


@router.post("/{scan_id}/cancel", response_model=dict)
async def cancel_scan(scan_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ScanSession).where(ScanSession.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan.status not in ("pending", "running"):
        raise HTTPException(status_code=400, detail="Scan is not running")

    await db.execute(
        update(ScanSession)
        .where(ScanSession.id == scan_id)
        .values(status="cancelled", finished_at=datetime.utcnow())
    )
    await db.commit()

    await sse_manager.push(scan_id, {"type": "status", "data": {"status": "cancelled"}, "ts": datetime.utcnow().isoformat()})
    await sse_manager.close(scan_id)

    return {"status": "cancelled"}


@router.delete("/{scan_id}", status_code=204)
async def delete_scan(scan_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ScanSession).where(ScanSession.id == scan_id))
    scan = result.scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan.status in ("pending", "running"):
        raise HTTPException(status_code=400, detail="No se puede eliminar un scan en ejecución")
    await db.delete(scan)
    await db.commit()


@router.get("/{scan_id}/stream")
async def stream_scan(scan_id: int):
    """SSE endpoint: streams live events from the active pentest."""

    queue = sse_manager.subscribe(scan_id)

    async def event_generator():
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=25.0)
                    if event is None:
                        yield "data: {\"type\":\"done\"}\n\n"
                        break
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    yield "data: {\"type\":\"ping\"}\n\n"
        finally:
            sse_manager.unsubscribe(scan_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.patch("/{scan_id}/findings/{finding_id}", response_model=dict)
async def update_finding_status(
    scan_id: int,
    finding_id: int,
    data: FindingUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Finding).where(Finding.id == finding_id, Finding.session_id == scan_id)
    )
    finding = result.scalar_one_or_none()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")

    if data.remediation_status is not None:
        valid = {"pending", "in_progress", "remediated", "false_positive", "accepted"}
        if data.remediation_status not in valid:
            raise HTTPException(status_code=400, detail=f"Status must be one of: {', '.join(valid)}")
        finding.remediation_status = data.remediation_status

    if data.assigned_to_id is not None:
        finding.assigned_to_id = data.assigned_to_id if data.assigned_to_id > 0 else None

    await db.commit()
    return {"id": finding_id, "remediation_status": finding.remediation_status}


@router.get("/{scan_id}/findings", response_model=list)
async def get_findings(scan_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Finding)
        .where(Finding.session_id == scan_id)
        .order_by(Finding.created_at)
    )
    findings = result.scalars().all()
    return [
        {
            "id": f.id,
            "severity": f.severity,
            "title": f.title,
            "description": f.description,
            "tool": f.tool,
            "phase": f.phase,
            "evidence": f.evidence,
            "cve": f.cve,
            "cvss": f.cvss,
            "created_at": f.created_at.isoformat() if f.created_at else None,
            "is_duplicate": bool(f.is_duplicate),
            "duplicate_of": f.duplicate_of,
        }
        for f in findings
    ]
