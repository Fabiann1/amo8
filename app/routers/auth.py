import asyncio

from fastapi import APIRouter, HTTPException, Request, Response

from .. import config, db
from ..auth import COOKIE, check_pw, hash_pw, is_authed, start_session
from ..schemas import Password

router = APIRouter(prefix="/api", tags=["Вход"])


@router.get("/me")
def me(request: Request):
    cfg = config.get_config()
    return {"authed": is_authed(request), "needs_setup": not cfg.get("ui_password"), "demo": cfg.get("demo")}


@router.post("/setup")
def setup(body: Password, response: Response):
    if config.get_config().get("ui_password"):
        raise HTTPException(403, "Пароль уже задан")
    if len(body.password) < 6:
        raise HTTPException(400, "Пароль должен быть не короче 6 символов")
    config.update_config({"ui_password": hash_pw(body.password)})
    start_session(response)
    return {"ok": True}


@router.post("/login")
async def login(body: Password, response: Response):
    await asyncio.sleep(0.4)  # замедляет перебор паролей
    if not check_pw(body.password, config.get_config().get("ui_password", "")):
        raise HTTPException(401, "Неверный пароль")
    start_session(response)
    return {"ok": True}


@router.post("/logout")
def logout(request: Request, response: Response):
    db.drop_session(request.cookies.get(COOKIE))
    response.delete_cookie(COOKIE)
    return {"ok": True}
