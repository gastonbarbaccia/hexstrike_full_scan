from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models import ScheduledScan, Target, TargetEnvironment
from schemas import ScheduledScanCreate, ScheduledScanUpdate, ScheduledScanOut

router = APIRouter(prefix="/api/scheduled", tags=["scheduled"])


@router.get("/", response_model=list[ScheduledScanOut])
async def list_scheduled(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ScheduledScan)
        .options(
            selectinload(ScheduledScan.target).selectinload(Target.environments),
            selectinload(ScheduledScan.environment),
        )
        .order_by(ScheduledScan.created_at.desc())
    )
    return result.scalars().all()


@router.post("/", response_model=ScheduledScanOut, status_code=201)
async def create_scheduled(data: ScheduledScanCreate, db: AsyncSession = Depends(get_db)):
    target_result = await db.execute(select(Target).where(Target.id == data.target_id))
    if not target_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Target not found")

    scan_config_dict = data.scan_config.model_dump() if data.scan_config else {}

    sched = ScheduledScan(
        target_id=data.target_id,
        environment_id=data.environment_id,
        profile=data.profile,
        cron_expr=data.cron_expr,
        label=data.label,
        scan_config=scan_config_dict,
        active=data.active if data.active is not None else True,
    )

    # Compute next_run from cron expression
    try:
        from apscheduler.triggers.cron import CronTrigger
        from main import SCHEDULER_TZ
        trigger = CronTrigger.from_crontab(data.cron_expr, timezone=SCHEDULER_TZ)
        next_fire = trigger.get_next_fire_time(None, datetime.utcnow())
        if next_fire is not None:
            sched.next_run_at = next_fire.replace(tzinfo=None)
    except Exception:
        pass

    db.add(sched)
    await db.commit()
    await db.refresh(sched)

    # Register with the global scheduler
    from main import register_scheduled_scan
    await register_scheduled_scan(sched.id, data.cron_expr, data.active)

    result = await db.execute(
        select(ScheduledScan)
        .options(
            selectinload(ScheduledScan.target).selectinload(Target.environments),
            selectinload(ScheduledScan.environment),
        )
        .where(ScheduledScan.id == sched.id)
    )
    return result.scalar_one()


@router.patch("/{sched_id}", response_model=ScheduledScanOut)
async def update_scheduled(
    sched_id: int,
    data: ScheduledScanUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ScheduledScan).where(ScheduledScan.id == sched_id))
    sched = result.scalar_one_or_none()
    if not sched:
        raise HTTPException(status_code=404, detail="Scheduled scan not found")

    updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None or k == "active"}
    if "scan_config" in updates and isinstance(updates["scan_config"], dict):
        pass
    if "cron_expr" in updates:
        try:
            from apscheduler.triggers.cron import CronTrigger
            from main import SCHEDULER_TZ
            trigger = CronTrigger.from_crontab(updates["cron_expr"], timezone=SCHEDULER_TZ)
            next_fire = trigger.get_next_fire_time(None, datetime.utcnow())
            if next_fire is not None:
                updates["next_run_at"] = next_fire.replace(tzinfo=None)
        except Exception:
            pass

    await db.execute(update(ScheduledScan).where(ScheduledScan.id == sched_id).values(**updates))
    await db.commit()

    # Re-register scheduler job
    new_cron = updates.get("cron_expr", sched.cron_expr)
    new_active = updates.get("active", sched.active)
    from main import register_scheduled_scan
    await register_scheduled_scan(sched_id, new_cron, new_active)

    result = await db.execute(
        select(ScheduledScan)
        .options(
            selectinload(ScheduledScan.target).selectinload(Target.environments),
            selectinload(ScheduledScan.environment),
        )
        .where(ScheduledScan.id == sched_id)
    )
    return result.scalar_one()


@router.delete("/{sched_id}", status_code=204)
async def delete_scheduled(sched_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ScheduledScan).where(ScheduledScan.id == sched_id))
    sched = result.scalar_one_or_none()
    if not sched:
        raise HTTPException(status_code=404, detail="Scheduled scan not found")

    from main import remove_scheduled_scan
    remove_scheduled_scan(sched_id)

    await db.delete(sched)
    await db.commit()
