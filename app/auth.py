"""Вход по паролю: хэш PBKDF2 в config.json, сессии в SQLite, cookie sid."""
import hashlib
import hmac
import secrets

from fastapi import HTTPException, Request, Response

from . import config, db

COOKIE = "sid"


def hash_pw(pw: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(8)
    return f"{salt}${hashlib.pbkdf2_hmac('sha256', pw.encode(), salt.encode(), 200_000).hex()}"


def check_pw(pw: str, stored: str) -> bool:
    if not stored or "$" not in stored:
        return False
    return hmac.compare_digest(hash_pw(pw, stored.split("$", 1)[0]), stored)


def start_session(resp: Response) -> None:
    token = secrets.token_urlsafe(32)
    db.add_session(token)
    resp.set_cookie(COOKIE, token, max_age=30 * 86400, httponly=True, samesite="lax")


def is_authed(request: Request) -> bool:
    return bool(config.get_config().get("ui_password")) and db.session_ok(request.cookies.get(COOKIE))


def require_user(request: Request) -> None:
    """Зависимость FastAPI для защищённых маршрутов."""
    if not is_authed(request):
        raise HTTPException(401, "Требуется вход")
