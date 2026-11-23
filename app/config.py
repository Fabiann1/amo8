"""Настройки сайта: data/config.json (редактируются в разделе «Настройки»)."""
import copy
import json
import os
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
STATIC = ROOT / "static"
DATA.mkdir(exist_ok=True)
CONFIG_PATH = DATA / "config.json"

DEFAULT_CONFIG: dict = {
    "ui_password": "",          # хэш пароля входа (задаётся при первом запуске)
    "demo": True,               # демо-режим: тестовые данные вместо amoCRM
    "amo": {
        "subdomain": "",        # например inheaveniam8
        "domain": "amocrm.ru",
        "auth_mode": "longlived",  # longlived | oauth
        "long_token": "",
        "client_id": "",
        "client_secret": "",
        "redirect_uri": "",
        "access_token": "",
        "refresh_token": "",
        "expires_at": 0,
    },
    "crm": {
        "pipeline_id": 0,       # воронка по умолчанию
        "reply_field_id": 0,    # поле «AI ответ» (как reply_field_id в n8n)
        "salesbot_id": 0,       # Salesbot, который отправляет это поле клиенту
        "takeover_minutes": 60, # сколько минут n8n молчит после сообщения менеджера (для подсказки)
        "tags": {
            "stop": "AI_STOP", "draft": "AI_DRAFT", "human": "AI: нужен менеджер",
            "hot": "AI: горячий", "warm": "AI: тёплый", "cold": "AI: холодный",
            "gov": "AI: госсектор", "biz": "AI: бизнес",
        },
    },
    "n8n": {
        "console_url": "",      # ссылка на форму «Manager console» в n8n (ИИ-помощник)
        "console_user": "",     # логин Basic Auth формы (если включён в n8n)
        "console_password": "", # пароль Basic Auth формы
    },
}

SECRET_KEYS = {("amo", "long_token"), ("amo", "client_secret"), ("amo", "access_token"), ("amo", "refresh_token"), ("n8n", "console_password")}

_lock = threading.RLock()
_cfg: dict | None = None


def _merge(base: dict, over: dict) -> dict:
    """Накладывает over на base, оставляя только известные ключи (старые ключи ИИ отбрасываются)."""
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        if k not in out:
            continue
        if isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


def get_config() -> dict:
    global _cfg
    with _lock:
        if _cfg is None:
            data = {}
            if CONFIG_PATH.exists():
                try:
                    data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
                except Exception:
                    data = {}
            _cfg = _merge(DEFAULT_CONFIG, data)
            save_config(_cfg)  # убирает устаревшие ключи (ИИ, Pinecone, Zoom) из файла
        return _cfg


def save_config(cfg: dict) -> None:
    global _cfg
    with _lock:
        _cfg = cfg
        tmp = CONFIG_PATH.with_suffix(".tmp")
        tmp.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, CONFIG_PATH)


def update_config(patch: dict) -> dict:
    with _lock:
        cfg = _merge(get_config(), patch)
        save_config(cfg)
        return cfg
