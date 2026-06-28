from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.jira import is_configured as jira_is_configured
from database import get_db
from models import AppSettings
from schemas import AppSettingsOut, AppSettingsUpdate

router = APIRouter(prefix="/api/settings", tags=["settings"])


async def _get_or_create_settings(db: AsyncSession) -> AppSettings:
    result = await db.execute(select(AppSettings).where(AppSettings.id == 1))
    settings = result.scalar_one_or_none()
    if not settings:
        settings = AppSettings(id=1)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings


@router.get("/", response_model=AppSettingsOut)
async def get_settings(db: AsyncSession = Depends(get_db)):
    return await _get_or_create_settings(db)


@router.patch("/", response_model=AppSettingsOut)
async def update_settings(data: AppSettingsUpdate, db: AsyncSession = Depends(get_db)):
    settings = await _get_or_create_settings(db)

    updates = data.model_dump(exclude_unset=True)
    for k, v in updates.items():
        setattr(settings, k, v)

    await db.commit()
    await db.refresh(settings)
    return settings


@router.get("/jira")
async def jira_config_status():
    return {"configured": jira_is_configured()}
