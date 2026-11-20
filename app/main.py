"""IMAS · сайт менеджера (FastAPI).

ИИ, промпты и обработка вебхуков остаются в n8n. Сайт — рабочее место менеджера поверх amoCRM:
сделки, чаты (по примечаниям n8n), задачи, отправка сообщений и переключение режима ИИ тегами.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from . import amocrm, config, db, services
from .amocrm import AmoError
from .auth import is_authed
from .routers import auth, crm, settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init()
    config.get_config()
    yield
    await amocrm.close_http()


app = FastAPI(title="IMAS · CRM менеджера", lifespan=lifespan)
@app.middleware("http")
async def no_cache_static(request: Request, call_next):
    """Браузер всегда проверяет свежесть app.js/app.css — после обновления сайта менеджеры сразу видят новую версию."""
    resp = await call_next(request)
    if not request.url.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-cache"
    return resp


app.include_router(auth.router)
app.include_router(settings.router)
app.include_router(crm.router)


# ---- ошибки → {"error": "..."} на русском ----
@app.exception_handler(AmoError)
async def amo_error(_: Request, e: AmoError):
    code = 502 if e.status in (0, 500, 502, 503, 504) else 400
    return JSONResponse({"error": str(e)}, status_code=code)


@app.exception_handler(ValueError)
async def value_error(_: Request, e: ValueError):
    return JSONResponse({"error": str(e)}, status_code=400)


@app.exception_handler(HTTPException)
async def http_error(_: Request, e: HTTPException):
    return JSONResponse({"error": e.detail}, status_code=e.status_code)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, e: RequestValidationError):
    first = e.errors()[0] if e.errors() else {}
    field = ".".join(str(x) for x in first.get("loc", [])[1:])
    return JSONResponse({"error": f"Неверные данные: {field} — {first.get('msg', '')}"}, status_code=422)


@app.get("/oauth/callback", include_in_schema=False)
async def oauth_callback(request: Request, code: str = "", referer: str = ""):
    """Сюда amoCRM возвращает код авторизации, если интеграция настроена через OAuth."""
    if not is_authed(request):
        return RedirectResponse("/")
    if code:
        if referer:
            config.update_config({"amo": {"subdomain": referer}})
        await amocrm.AmoClient(config.get_config()).exchange_code(code)
        config.update_config({"demo": False})
        services.drop_meta_cache()
    return RedirectResponse("/#/settings/amo")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(config.STATIC / "index.html", headers={"Cache-Control": "no-store"})


app.mount("/", StaticFiles(directory=config.STATIC), name="static")
