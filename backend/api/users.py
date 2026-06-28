from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import User
from schemas import UserCreate, UserUpdate, UserOut
from api.auth import hash_password, verify_password, extract_jwt_payload

router = APIRouter(prefix="/api/users", tags=["users"])


def require_admin(request: Request):
    payload = extract_jwt_payload(request)
    role = payload.get("role", "viewer")
    if role != "administrator":
        raise HTTPException(status_code=403, detail="Solo administradores pueden gestionar usuarios")


@router.get("/", response_model=list[UserOut])
async def list_users(request: Request, db: AsyncSession = Depends(get_db)):
    require_admin(request)
    result = await db.execute(select(User).order_by(User.created_at.asc()))
    return result.scalars().all()


@router.post("/", response_model=UserOut, status_code=201)
async def create_user(data: UserCreate, request: Request, db: AsyncSession = Depends(get_db)):
    require_admin(request)

    if data.role not in ("administrator", "analista", "viewer"):
        raise HTTPException(status_code=400, detail="Rol inválido. Usar: administrator, analista, viewer")

    existing = await db.execute(select(User).where(User.username == data.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="El nombre de usuario ya existe")

    user = User(
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
        role=data.role,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserOut)
async def update_user(user_id: int, data: UserUpdate, request: Request, db: AsyncSession = Depends(get_db)):
    require_admin(request)

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if data.role is not None and data.role not in ("administrator", "analista", "viewer"):
        raise HTTPException(status_code=400, detail="Rol inválido. Usar: administrator, analista, viewer")

    if data.email is not None:
        user.email = data.email
    if data.password is not None:
        user.password_hash = hash_password(data.password)
    if data.role is not None:
        user.role = data.role
    if data.is_active is not None:
        user.is_active = data.is_active

    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=204)
async def delete_user(user_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    require_admin(request)

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    await db.delete(user)
    await db.commit()
