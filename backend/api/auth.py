import os
import hashlib
import hmac
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from database import get_db

SECRET_KEY = os.environ.get("SECRET_KEY", "hexstrike-secret-change-in-prod")
ALGORITHM = "HS256"
ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
ADMIN_PASS = os.environ.get("ADMIN_PASS", "hexstrike")
AUTH_ENABLED = os.environ.get("AUTH_ENABLED", "false").lower() == "true"

router = APIRouter(prefix="/api/auth", tags=["auth"])


def hash_password(password: str) -> str:
    salt = os.urandom(16).hex()
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000).hex()
    return f"{salt}${hashed}"


def verify_password(password: str, stored: str) -> bool:
    parts = stored.split("$")
    if len(parts) != 2:
        return False
    salt, stored_hash = parts
    computed = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000).hex()
    return hmac.compare_digest(computed, stored_hash)


def extract_jwt_payload(request: Request) -> dict:
    """Extract and decode JWT from request (header or query param)."""
    if not AUTH_ENABLED:
        return {"sub": "admin", "role": "administrator", "user_id": None}
    auth_header = request.headers.get("Authorization", "")
    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
    elif request.query_params.get("token"):
        token = request.query_params["token"]
    if not token:
        return {}
    try:
        from jose import jwt
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except Exception:
        return {}


class LoginRequest(BaseModel):
    username: str
    password: str


@router.get("/config")
async def auth_config():
    return {"auth_enabled": AUTH_ENABLED}


@router.post("/login")
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    if not AUTH_ENABLED:
        return {"token": "no-auth", "username": data.username, "role": "administrator"}

    try:
        from jose import jwt
    except ImportError:
        raise HTTPException(status_code=500, detail="JWT library not available")

    from models import User

    # Check DB users first
    result = await db.execute(
        select(User).where(User.username == data.username, User.is_active == True)
    )
    db_user = result.scalar_one_or_none()

    if db_user and verify_password(data.password, db_user.password_hash):
        role = db_user.role
        user_id = db_user.id
    elif data.username == ADMIN_USER and data.password == ADMIN_PASS:
        # ENV admin fallback (always available as emergency access)
        role = "administrator"
        user_id = None
    else:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    payload = {
        "sub": data.username,
        "role": role,
        "user_id": user_id,
        "exp": datetime.utcnow() + timedelta(days=30),
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return {"token": token, "username": data.username, "role": role}


@router.get("/me")
async def me(request: Request, db: AsyncSession = Depends(get_db)):
    payload = extract_jwt_payload(request)
    if not payload:
        raise HTTPException(status_code=401, detail="No autorizado")

    role = payload.get("role", "viewer")
    user_id = payload.get("user_id")
    username = payload.get("sub", "")

    if user_id:
        from models import User
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user:
            return {"id": user.id, "username": user.username, "role": user.role, "email": user.email}

    return {"id": None, "username": username, "role": role, "email": None}
