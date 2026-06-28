from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import SLAConfig
from schemas import SLAConfigOut, SLAConfigUpdate
from api.auth import extract_jwt_payload

router = APIRouter(prefix="/api/sla", tags=["sla"])

SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]


@router.get("/", response_model=list[SLAConfigOut])
async def get_sla_configs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SLAConfig).order_by(SLAConfig.id.asc())
    )
    return result.scalars().all()


@router.patch("/")
async def update_sla_configs(data: SLAConfigUpdate, request: Request, db: AsyncSession = Depends(get_db)):
    payload = extract_jwt_payload(request)
    if payload.get("role", "viewer") not in ("administrator", "analista"):
        raise HTTPException(status_code=403, detail="Sin permisos para modificar SLA")

    updates = data.model_dump(exclude_none=True)
    for severity, hours in updates.items():
        if hours < 1:
            raise HTTPException(status_code=400, detail=f"Las horas SLA deben ser >= 1 para {severity}")
        result = await db.execute(select(SLAConfig).where(SLAConfig.severity == severity))
        config = result.scalar_one_or_none()
        if config:
            config.hours = hours
        else:
            db.add(SLAConfig(severity=severity, hours=hours))

    await db.commit()

    result = await db.execute(select(SLAConfig).order_by(SLAConfig.id.asc()))
    configs = result.scalars().all()
    return [{"severity": c.severity, "hours": c.hours} for c in configs]
