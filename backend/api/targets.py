from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models import Target, ScanSession, TargetEnvironment
from schemas import TargetCreate, TargetUpdate, TargetOut, DashboardStats, TargetEnvironmentCreate, TargetEnvironmentOut

router = APIRouter(prefix="/api/targets", tags=["targets"])


@router.get("/", response_model=list[TargetOut])
async def list_targets(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Target)
        .options(selectinload(Target.environments))
        .order_by(Target.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=TargetOut, status_code=201)
async def create_target(data: TargetCreate, db: AsyncSession = Depends(get_db)):
    target = Target(**data.model_dump())
    db.add(target)
    await db.commit()
    await db.refresh(target)
    result = await db.execute(
        select(Target).options(selectinload(Target.environments)).where(Target.id == target.id)
    )
    return result.scalar_one()


@router.get("/{target_id}", response_model=TargetOut)
async def get_target(target_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Target).options(selectinload(Target.environments)).where(Target.id == target_id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    return target


@router.put("/{target_id}", response_model=TargetOut)
async def update_target(target_id: int, data: TargetUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Target).options(selectinload(Target.environments)).where(Target.id == target_id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    update_data = data.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(target, field, value)

    await db.commit()
    await db.refresh(target)

    result = await db.execute(
        select(Target).options(selectinload(Target.environments)).where(Target.id == target_id)
    )
    return result.scalar_one()


@router.delete("/{target_id}", status_code=204)
async def delete_target(target_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Target).where(Target.id == target_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    await db.delete(target)
    await db.commit()


# ── Environments ───────────────────────────────────────────────────────────

@router.get("/{target_id}/environments", response_model=list[TargetEnvironmentOut])
async def list_environments(target_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TargetEnvironment)
        .where(TargetEnvironment.target_id == target_id)
        .order_by(TargetEnvironment.created_at.asc())
    )
    return result.scalars().all()


@router.post("/{target_id}/environments", response_model=TargetEnvironmentOut, status_code=201)
async def create_environment(
    target_id: int,
    data: TargetEnvironmentCreate,
    db: AsyncSession = Depends(get_db),
):
    target_result = await db.execute(select(Target).where(Target.id == target_id))
    if not target_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Target not found")

    env = TargetEnvironment(target_id=target_id, **data.model_dump())
    db.add(env)
    await db.commit()
    await db.refresh(env)
    return env


@router.delete("/{target_id}/environments/{env_id}", status_code=204)
async def delete_environment(
    target_id: int,
    env_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TargetEnvironment).where(
            TargetEnvironment.id == env_id,
            TargetEnvironment.target_id == target_id,
        )
    )
    env = result.scalar_one_or_none()
    if not env:
        raise HTTPException(status_code=404, detail="Environment not found")
    await db.delete(env)
    await db.commit()


@router.get("/../dashboard", response_model=DashboardStats)
async def dashboard(db: AsyncSession = Depends(get_db)):
    total_targets = (await db.execute(select(func.count(Target.id)))).scalar_one()
    total_scans = (await db.execute(select(func.count(ScanSession.id)))).scalar_one()
    running = (await db.execute(select(func.count(ScanSession.id)).where(ScanSession.status == "running"))).scalar_one()
    completed = (await db.execute(select(func.count(ScanSession.id)).where(ScanSession.status == "completed"))).scalar_one()

    from models import Finding
    from schemas import DashboardStats
    total_findings = (await db.execute(select(func.count(Finding.id)))).scalar_one()
    sev_result = await db.execute(
        select(Finding.severity, func.count(Finding.id)).group_by(Finding.severity)
    )
    by_severity = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0, "INFO": 0}
    for sev, cnt in sev_result:
        by_severity[sev] = cnt

    return DashboardStats(
        total_targets=total_targets,
        total_scans=total_scans,
        running_scans=running,
        completed_scans=completed,
        total_findings=total_findings,
        findings_by_severity=by_severity,
    )
