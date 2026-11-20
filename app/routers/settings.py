import copy

from fastapi import APIRouter, Depends, HTTPException, Request

from .. import amocrm, config, services
from ..auth import check_pw, hash_pw, require_user
from ..schemas import OAuthCode, PasswordChange

router = APIRouter(prefix="/api", tags=["Настройки"], dependencies=[Depends(require_user)])
MASK = "••••••••"


@router.get("/settings")
def get_settings(request: Request):
    cfg = config.get_config()
    out = copy.deepcopy(cfg)
    out.pop("ui_password", None)
    for sec, key in config.SECRET_KEYS:
        if out[sec].get(key):
            out[sec][key] = MASK
    base = str(request.base_url).rstrip("/")
    out["_oauth_redirect"] = base + "/oauth/callback"
    out["_status"] = {
        "amo": bool(cfg["amo"].get("long_token") or cfg["amo"].get("access_token")),
        "send": services.can_send(cfg),
    }
    return out


@router.post("/settings")
def save_settings(patch: dict):
    patch.pop("ui_password", None)
    for sec, key in config.SECRET_KEYS:
        if isinstance(patch.get(sec), dict) and patch[sec].get(key) == MASK:
            patch[sec].pop(key)
    config.update_config(patch)
    services.drop_meta_cache()
    return {"ok": True}


@router.post("/settings/password")
def change_password(body: PasswordChange):
    if not check_pw(body.old, config.get_config().get("ui_password", "")):
        raise HTTPException(400, "Текущий пароль неверен")
    config.update_config({"ui_password": hash_pw(body.new)})
    return {"ok": True}


@router.get("/amo/meta")
async def amo_meta(force: bool = False):
    return await services.meta(force=force)


@router.post("/amo/test")
async def amo_test():
    return await services.meta(force=True)


@router.post("/amo/oauth")
async def amo_oauth(body: OAuthCode):
    await amocrm.AmoClient(config.get_config()).exchange_code(body.code)
    config.update_config({"demo": False})
    return await services.meta(force=True)


@router.post("/demo/reset")
def demo_reset():
    if not config.get_config().get("demo"):
        raise HTTPException(400, "Доступно только в демо-режиме")
    amocrm.DemoAmo.reset()
    services.drop_meta_cache()
    return {"ok": True}
