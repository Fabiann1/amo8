"""Асинхронный клиент amoCRM API v4 и демо-имитация с тем же интерфейсом."""
import asyncio
import copy
import json
import os
import random
import threading
import time

import httpx

from . import config


class AmoError(Exception):
    def __init__(self, status: int, data, msg: str | None = None):
        self.status = status
        self.data = data
        super().__init__(msg or f"amoCRM вернул {status}: {json.dumps(data, ensure_ascii=False)[:300]}")


def _params(params: dict | None) -> list[tuple[str, str]]:
    out = []
    for k, v in (params or {}).items():
        if isinstance(v, (list, tuple)):
            out += [(k, str(x)) for x in v]
        elif v is not None and v != "":
            out.append((k, str(v)))
    return out


def base_url(cfg: dict) -> str:
    a = cfg["amo"]
    sub = (a.get("subdomain") or "").strip().replace("https://", "").replace("http://", "").split("/")[0]
    if "." in sub:
        return "https://" + sub
    return f"https://{sub}.{a.get('domain') or 'amocrm.ru'}"


_http: httpx.AsyncClient | None = None


def http() -> httpx.AsyncClient:
    global _http
    if _http is None:
        _http = httpx.AsyncClient(timeout=40, headers={"User-Agent": "imas-manager-site/2.0"})
    return _http


async def close_http() -> None:
    global _http
    if _http is not None:
        await _http.aclose()
        _http = None


class AmoClient:
    """Настоящий amoCRM: долгосрочный токен или OAuth 2.0 с автообновлением."""

    _rate = asyncio.Lock()
    _last = 0.0

    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.base = base_url(cfg)

    async def _oauth(self, payload: dict) -> None:
        a = self.cfg["amo"]
        body = {"client_id": a["client_id"], "client_secret": a["client_secret"], "redirect_uri": a["redirect_uri"], **payload}
        try:
            r = await http().post(self.base + "/oauth2/access_token", json=body)
        except httpx.HTTPError as e:
            raise AmoError(0, {}, f"Нет связи с amoCRM ({self.base}): {e}")
        if r.status_code >= 400:
            raise AmoError(r.status_code, _json(r), "Не удалось получить токен amoCRM: " + r.text[:300])
        d = r.json()
        self.cfg = config.update_config({"amo": {
            "access_token": d.get("access_token", ""),
            "refresh_token": d.get("refresh_token", ""),
            "expires_at": int(time.time()) + int(d.get("expires_in") or 86400),
        }})

    async def exchange_code(self, code: str) -> None:
        await self._oauth({"grant_type": "authorization_code", "code": code.strip()})

    async def _token(self) -> str:
        a = self.cfg["amo"]
        if a.get("auth_mode") == "longlived":
            return (a.get("long_token") or "").strip()
        if a.get("refresh_token") and time.time() > float(a.get("expires_at") or 0) - 120:
            await self._oauth({"grant_type": "refresh_token", "refresh_token": a["refresh_token"]})
        return self.cfg["amo"].get("access_token") or ""

    async def request(self, method: str, path: str, params: dict | None = None, body=None, _retry: bool = True):
        if not self.cfg["amo"].get("subdomain"):
            raise AmoError(400, {}, "amoCRM не подключён: укажите адрес аккаунта в Настройках")
        token = await self._token()
        if not token:
            raise AmoError(401, {}, "amoCRM не подключён: укажите токен в Настройках → Подключение amoCRM")
        async with AmoClient._rate:  # лимит amoCRM — 7 запросов в секунду
            wait = 0.16 - (time.monotonic() - AmoClient._last)
            if wait > 0:
                await asyncio.sleep(wait)
            AmoClient._last = time.monotonic()
        try:
            r = await http().request(method, self.base + path, params=_params(params), json=body,
                                     headers={"Authorization": "Bearer " + token})
        except httpx.HTTPError as e:
            raise AmoError(0, {}, f"Нет связи с amoCRM ({self.base}): {e}")
        if r.status_code == 401 and _retry and self.cfg["amo"].get("auth_mode") == "oauth" and self.cfg["amo"].get("refresh_token"):
            await self._oauth({"grant_type": "refresh_token", "refresh_token": self.cfg["amo"]["refresh_token"]})
            return await self.request(method, path, params, body, _retry=False)
        if r.status_code == 204 or not r.content:
            return {}
        if r.status_code >= 400:
            if r.status_code == 401:
                raise AmoError(401, _json(r), "amoCRM отклонил токен (401). Проверьте токен в Настройках")
            raise AmoError(r.status_code, _json(r))
        return _json(r)


def _json(r: httpx.Response):
    try:
        return r.json()
    except Exception:
        return {"raw": r.text[:300]}


# =====================================================================
#  Демо-режим: имитация amoCRM в памяти (сохраняется в data/demo.json)
# =====================================================================
DEMO_PATH = config.DATA / "demo.json"


def _now() -> int:
    return int(time.time())


def _seed() -> dict:
    now = _now()
    users = [{"id": 1, "name": "gremer", "email": "manager@imas.kz"}, {"id": 2, "name": "Айгерим", "email": "aigerim@imas.kz"}]
    statuses = [
        {"id": 142001, "name": "Неразобранное", "sort": 10, "color": "#c1c1c1", "type": 1},
        {"id": 142002, "name": "Новый лид", "sort": 20, "color": "#99ccff", "type": 0},
        {"id": 142003, "name": "Лид в беседе", "sort": 30, "color": "#ffff99", "type": 0},
        {"id": 142004, "name": "Заинтересован", "sort": 40, "color": "#ffcc66", "type": 0},
        {"id": 142005, "name": "Демо", "sort": 50, "color": "#ccc8f9", "type": 0},
        {"id": 142006, "name": "Переговоры", "sort": 60, "color": "#ff8f92", "type": 0},
        {"id": 142, "name": "Успешно реализовано", "sort": 10000, "color": "#CCFF66", "type": 0},
        {"id": 143, "name": "Закрыто и не реализовано", "sort": 11000, "color": "#D5D8DB", "type": 0},
    ]
    pipelines = [{"id": 7001, "name": "Продажи IMAS", "is_main": True, "_embedded": {"statuses": statuses}}]
    sample = [
        ("Сделка #5901339", "~nevermore", 142003, 0, ["AI: тёплый"], [
            ("[CLIENT] Привет", 7200),
            ("[BOT] Здравствуйте! Я — виртуальный помощник IMAS. Чем могу помочь — интересует мониторинг СМИ/соцсетей, демонстрация системы или коммерческие условия?", 7190),
            ("[CLIENT] Привет 2", 600)]),
        ("Акимат г. Алматы — мониторинг СМИ", "Ержан Ахметов", 142004, 1500000, ["AI: горячий", "AI: госсектор"], [
            ("[CLIENT] Добрый день! Нам нужен мониторинг упоминаний акимата в СМИ и соцсетях.", 86400 * 2),
            ("[BOT] Добрый день, Ержан! Подскажите, какие источники для вас приоритетны и сколько ключевых тем планируете отслеживать?", 86400 * 2 - 60),
            ("[CLIENT] Казахстанские СМИ, Instagram, Telegram. Тем около 10. Сколько стоит?", 86400),
            ("[AI-STATE] state=qualified; temp=hot; score=72; segment=government; sentiment=positive; lang=ru\n📊 Квалифицирован · hot · 72/100\n📝 Акимат, нужен мониторинг СМИ и соцсетей по ~10 темам\n➡️ Предложить демо и отправить КП", 86400 - 30)]),
        ("ТОО «Kaspi Retail» — бренд-мониторинг", "Динара Сейтказы", 142005, 900000, ["AI: тёплый", "AI: бизнес"], [
            ("[CLIENT] Здравствуйте, хотим посмотреть демо", 3 * 86400),
            ("[MANAGER] Динара, добрый день! Предлагаю четверг 15:00, подойдёт?", 3 * 86400 - 600),
            ("[CLIENT] Да, отлично", 3 * 86400 - 500)]),
        ("Министерство информации — тендер", "Асель Нурланова", 142006, 4200000, ["AI: горячий", "AI: госсектор", "AI: нужен менеджер"], [
            ("[CLIENT] Подготовьте, пожалуйста, коммерческое предложение для участия в тендере.", 5 * 3600),
            ("[AI-STATE] state=negotiation; temp=hot; score=80; segment=government; sentiment=neutral; lang=ru; needs_human=yes\n📊 Переговоры · hot · 80/100\n📝 Министерство, тендер на мониторинг СМИ\n➡️ Подготовить КП для тендера\n🙋 Нужен менеджер: запрос КП для тендера", 5 * 3600 - 40),
            ("[AI DRAFT] 💡 Черновик ответа (не отправлен; причина: тег AI_STOP):\nАсель, добрый день! Коммерческое предложение подготовит наш менеджер и пришлёт сегодня до конца дня.", 5 * 3600 - 35)]),
        ("Чат: Бауыржан (whatsapp)", "Бауыржан", 142002, 0, [], [
            ("[CLIENT] Сәлеметсіз бе! Бағасы қанша?", 1800)]),
        ("BI Group — PR-аналитика", "Мария Ким", 142003, 650000, ["AI: холодный", "AI: бизнес", "AI_DRAFT"], [
            ("[CLIENT] Интересно, но бюджет будет только в следующем квартале", 6 * 86400)]),
    ]
    contacts, leads, notes, tasks = {}, {}, {}, {}
    lid, cid, nid, tid = 5901339, 3001, 90001, 70001
    for i, (lname, cname, status, price, tags, msgs) in enumerate(sample):
        contacts[str(cid)] = {"id": cid, "name": cname, "custom_fields_values": [
            {"field_code": "PHONE", "field_name": "Телефон", "values": [{"value": f"+7 70{i} 555 {10 + i:02d} {20 + i:02d}", "enum_code": "WORK"}]}],
            "created_at": now - 86400 * (i + 1), "_embedded": {"leads": [{"id": lid}]}}
        leads[str(lid)] = {"id": lid, "name": lname, "price": price, "status_id": status, "pipeline_id": 7001,
                           "responsible_user_id": 1 if i % 3 else 2, "created_at": now - 86400 * (i + 1) - 3600,
                           "updated_at": now - min(m[1] for m in msgs), "custom_fields_values": [],
                           "_embedded": {"tags": [{"id": 100 + j, "name": t} for j, t in enumerate(tags)],
                                         "contacts": [{"id": cid, "is_main": True}]}}
        notes[str(lid)] = []
        for text, ago in msgs:
            notes[str(lid)].append({"id": nid, "entity_id": lid, "note_type": "common",
                                    "created_by": 1 if text.startswith("[MANAGER]") else 0,
                                    "created_at": now - ago, "updated_at": now - ago, "params": {"text": text}})
            nid += 1
        lid += 7
        cid += 1
    # дополнительные демо-переписки за последние 2 недели — чтобы графики на рабочем столе были наглядными
    rnd = random.Random(7)
    extra = [("ТОО «Air Astana Media»", "Гульнара Ермек", 142003), ("Агентство «Digital KZ»", "Тимур Ли", 142002),
             ("Университет КазНУ — PR", "Айжан Бек", 142004), ("Банк «Qazaq» — репутация", "Сергей Ким", 142005),
             ("Акимат Шымкента", "Нурлан Ахмет", 142003), ("ТОО «Agro Trade»", "Елена Пак", 142002)]
    phrases = ["[CLIENT] Здравствуйте, расскажите про мониторинг", "[BOT] Добрый день! Что вы хотели бы отслеживать: СМИ, соцсети или всё вместе?",
               "[CLIENT] Нужны соцсети и Telegram-каналы", "[BOT] Понял! Могу предложить короткий демо-созвон — когда вам удобно?",
               "[CLIENT] Можно в четверг после обеда", "[MANAGER] Отлично, отправил приглашение на четверг 15:00"]
    for k, (lname, cname, status) in enumerate(extra):
        contacts[str(cid)] = {"id": cid, "name": cname, "custom_fields_values": [], "created_at": now - 86400 * 13,
                              "_embedded": {"leads": [{"id": lid}]}}
        start = now - 86400 * rnd.randint(2, 13) - rnd.randint(0, 36000)
        n_msgs = rnd.randint(2, len(phrases))
        leads[str(lid)] = {"id": lid, "name": lname, "price": rnd.choice([0, 350000, 800000, 1200000]), "status_id": status,
                           "pipeline_id": 7001, "responsible_user_id": 1 + k % 2, "created_at": start - 600,
                           "updated_at": start + n_msgs * 3600, "custom_fields_values": [],
                           "_embedded": {"tags": [{"id": 900 + k, "name": rnd.choice(["AI: тёплый", "AI: холодный", "AI: горячий"])}],
                                         "contacts": [{"id": cid, "is_main": True}]}}
        notes[str(lid)] = []
        for j in range(n_msgs):
            at = start + j * rnd.randint(1800, 30000)
            notes[str(lid)].append({"id": nid, "entity_id": lid, "note_type": "common", "created_by": 1 if phrases[j].startswith("[MANAGER]") else 0,
                                    "created_at": at, "updated_at": at, "params": {"text": phrases[j]}})
            nid += 1
        lid += 7
        cid += 1
    lids = list(leads)
    for lead_key, text, due in [
        (lids[0], "Связаться с клиентом", now - 86400 * 7 - 3600),
        (lids[1], "🤖 Квалифицирован: отправить КП акимату", now + 3600 * 3),
        (lids[2], "Провести демо в Zoom", now + 86400 + 3600 * 2),
        (lids[3], "🤖 Нужен менеджер: подготовить КП для тендера", now - 3600),
    ]:
        tasks[str(tid)] = {"id": tid, "text": text, "entity_id": int(lead_key), "entity_type": "leads", "task_type_id": 1,
                           "complete_till": due, "is_completed": False, "responsible_user_id": 1, "created_by": 0,
                           "created_at": now - 86400, "updated_at": now - 86400, "result": {}}
        tid += 1
    fields = [{"id": 1035851, "name": "AI ответ", "type": "textarea"}, {"id": 1035853, "name": "AI статус", "type": "text"}]
    return {"users": users, "pipelines": pipelines, "contacts": contacts, "leads": leads, "notes": notes, "tasks": tasks,
            "fields": fields, "seq": {"lead": lid, "contact": cid, "note": nid, "task": tid}}


class DemoAmo:
    """Имитация amoCRM: тот же async request(), данные в data/demo.json."""
    base = "https://demo.amocrm.ru"
    _lock = threading.RLock()
    _db: dict | None = None

    def __init__(self, cfg: dict | None = None):
        with DemoAmo._lock:
            if DemoAmo._db is None:
                try:
                    DemoAmo._db = json.loads(DEMO_PATH.read_text(encoding="utf-8")) if DEMO_PATH.exists() else None
                except Exception:
                    DemoAmo._db = None
                if not DemoAmo._db or "pipelines" not in DemoAmo._db:
                    DemoAmo._db = _seed()
                    self._save()

    @classmethod
    def reset(cls) -> None:
        with cls._lock:
            cls._db = _seed()
            cls()._save()

    def _save(self) -> None:
        tmp = DEMO_PATH.with_suffix(".tmp")
        tmp.write_text(json.dumps(DemoAmo._db, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, DEMO_PATH)

    def _next(self, k: str) -> int:
        s = DemoAmo._db["seq"]
        s[k] += 7 if k == "lead" else 1
        return s[k]

    async def request(self, method: str, path: str, params: dict | None = None, body=None):
        with DemoAmo._lock:
            res = self._route(method, path.rstrip("/"), params or {}, body)
            if method != "GET":
                self._save()
            return copy.deepcopy(res)

    @staticmethod
    def _ids(q: dict, key: str) -> list[str]:
        v = q.get(key) or []
        return [str(x) for x in (v if isinstance(v, (list, tuple)) else [v])]

    def _route(self, m: str, p: str, q: dict, body):
        D = DemoAmo._db
        now = _now()
        parts = p.split("/")
        if p == "/api/v4/account":
            r = {"id": 1, "name": "IMAS (демо)", "subdomain": "demo", "currency": "KZT", "country": "KZ"}
            if "users" in str(q.get("with", "")):
                r["_embedded"] = {"users": D["users"]}
            return r
        if p == "/api/v4/users":
            return {"_embedded": {"users": D["users"]}}
        if p == "/api/v4/leads/pipelines":
            return {"_embedded": {"pipelines": D["pipelines"]}}
        if p == "/api/v4/leads/custom_fields":
            return {"_embedded": {"custom_fields": D["fields"]}}

        # ---- сделки ----
        if p == "/api/v4/leads" and m == "GET":
            items = list(D["leads"].values())
            if q.get("filter[pipeline_id]"):
                items = [l for l in items if str(l["pipeline_id"]) == str(q["filter[pipeline_id]"])]
            ids = self._ids(q, "filter[id][]")
            if ids:
                items = [l for l in items if str(l["id"]) in ids]
            qs = str(q.get("query") or "").lower().strip()
            if qs:
                def match(l):
                    names = [l["name"], str(l["id"])] + [D["contacts"].get(str(c["id"]), {}).get("name", "") for c in l["_embedded"]["contacts"]]
                    return any(qs in (n or "").lower() for n in names)
                items = [l for l in items if match(l)]
            items.sort(key=lambda l: -l.get("updated_at", 0))
            limit, page = int(q.get("limit") or 50), int(q.get("page") or 1)
            chunk = items[(page - 1) * limit: page * limit]
            return {"_page": page, "_embedded": {"leads": [self._lead_out(l, q) for l in chunk]}} if chunk else {}
        if p == "/api/v4/leads" and m == "POST":
            out = []
            for item in body:
                lid = self._next("lead")
                lead = {"id": lid, "name": item.get("name") or f"Сделка #{lid}", "price": item.get("price", 0),
                        "status_id": item.get("status_id") or 142002, "pipeline_id": item.get("pipeline_id") or 7001,
                        "responsible_user_id": item.get("responsible_user_id") or 1, "created_at": now, "updated_at": now,
                        "custom_fields_values": [], "_embedded": {"tags": [], "contacts": []}}
                for c in (item.get("_embedded") or {}).get("contacts", []):
                    lead["_embedded"]["contacts"].append({"id": int(c["id"]), "is_main": True})
                D["leads"][str(lid)] = lead
                D["notes"][str(lid)] = []
                out.append({"id": lid})
            return {"_embedded": {"leads": out}}
        if p == "/api/v4/leads" and m == "PATCH":
            for item in body:
                lead = D["leads"].get(str(item["id"]))
                if lead:
                    self._patch_lead(lead, item)
            return {"_embedded": {"leads": [{"id": i["id"]} for i in body]}}
        if p == "/api/v4/leads/notes" and m == "GET":
            items = [n for lst in D["notes"].values() for n in lst]
            if q.get("filter[note_type]"):
                items = [n for n in items if n["note_type"] == q["filter[note_type]"]]
            frm = int(q.get("filter[updated_at][from]") or 0)
            items = [n for n in items if n.get("updated_at", n["created_at"]) >= frm]
            items.sort(key=lambda n: -n["id"] if q.get("order[id]") == "desc" else n["id"])
            limit, page = int(q.get("limit") or 50), int(q.get("page") or 1)
            chunk = items[(page - 1) * limit: page * limit]
            return {"_embedded": {"notes": chunk}} if chunk else {}
        if len(parts) == 5 and parts[3] == "leads" and parts[4].isdigit():
            lead = D["leads"].get(parts[4])
            if not lead:
                raise AmoError(404, {"title": "Not found"}, f"Сделка {parts[4]} не найдена")
            return self._lead_out(lead, q)
        if len(parts) == 6 and parts[3] == "leads" and parts[5] == "notes":
            lid = parts[4]
            if lid not in D["leads"]:
                raise AmoError(404, {"title": "Not found"}, f"Сделка {lid} не найдена")
            lst = D["notes"].setdefault(lid, [])
            if m == "POST":
                out = []
                for n in body:
                    nid = self._next("note")
                    lst.append({"id": nid, "entity_id": int(lid), "note_type": n.get("note_type", "common"), "created_by": 1,
                                "created_at": now, "updated_at": now, "params": n.get("params", {})})
                    out.append({"id": nid})
                D["leads"][lid]["updated_at"] = now
                return {"_embedded": {"notes": out}}
            items = sorted(lst, key=lambda n: -n["id"] if q.get("order[id]") == "desc" else n["id"])
            return {"_embedded": {"notes": items[: int(q.get("limit") or 100)]}} if items else {}

        # ---- контакты ----
        if p == "/api/v4/contacts" and m == "GET":
            ids = self._ids(q, "filter[id][]")
            items = [c for k, c in D["contacts"].items() if not ids or k in ids]
            return {"_embedded": {"contacts": items}} if items else {}
        if p == "/api/v4/contacts" and m == "POST":
            out = []
            for item in body:
                cid = self._next("contact")
                D["contacts"][str(cid)] = {"id": cid, "name": item.get("name", "Клиент"),
                                           "custom_fields_values": item.get("custom_fields_values", []),
                                           "created_at": now, "_embedded": {"leads": []}}
                out.append({"id": cid})
            return {"_embedded": {"contacts": out}}
        if len(parts) == 5 and parts[3] == "contacts" and parts[4].isdigit():
            c = D["contacts"].get(parts[4])
            if not c:
                raise AmoError(404, {"title": "Not found"})
            return c

        # ---- задачи ----
        if p == "/api/v4/tasks" and m == "GET":
            items = list(D["tasks"].values())
            if "filter[is_completed]" in q:
                want = str(q["filter[is_completed]"]) in ("1", "true")
                items = [t for t in items if bool(t["is_completed"]) == want]
            if q.get("filter[entity_id]"):
                items = [t for t in items if str(t["entity_id"]) == str(q["filter[entity_id]"])]
            frm = int(q.get("filter[updated_at][from]") or 0)
            items = [t for t in items if t.get("updated_at", 0) >= frm]
            items.sort(key=lambda t: t["complete_till"])
            limit, page = int(q.get("limit") or 50), int(q.get("page") or 1)
            chunk = items[(page - 1) * limit: page * limit]
            return {"_embedded": {"tasks": chunk}} if chunk else {}
        if p == "/api/v4/tasks" and m == "POST":
            out = []
            for t in body:
                tid = self._next("task")
                D["tasks"][str(tid)] = {"id": tid, "text": t.get("text", ""), "entity_id": t.get("entity_id"),
                                        "entity_type": t.get("entity_type", "leads"), "task_type_id": t.get("task_type_id", 1),
                                        "complete_till": t.get("complete_till", now + 3600), "is_completed": False,
                                        "responsible_user_id": t.get("responsible_user_id", 1), "created_by": 1,
                                        "created_at": now, "updated_at": now, "result": {}}
                out.append({"id": tid})
            return {"_embedded": {"tasks": out}}
        if p == "/api/v4/tasks" and m == "PATCH":
            for t in body:
                ex = D["tasks"].get(str(t["id"]))
                if ex:
                    ex.update({k: v for k, v in t.items() if k != "id"})
                    ex["updated_at"] = now
            return {}
        if p == "/api/v2/salesbot/run":
            return {"success": True}
        raise AmoError(404, {}, f"Демо: запрос {m} {p} не поддерживается")

    def _lead_out(self, lead: dict, q: dict) -> dict:
        l = copy.deepcopy(lead)
        if "contacts" not in str(q.get("with", "")):
            l["_embedded"].pop("contacts", None)
        return l

    def _patch_lead(self, lead: dict, item: dict) -> None:
        for k in ("name", "price", "status_id", "pipeline_id", "responsible_user_id"):
            if k in item:
                lead[k] = item[k]
        tags = lead["_embedded"].setdefault("tags", [])
        for t in item.get("tags_to_add") or []:
            if not any(x["name"].lower() == t["name"].lower() for x in tags):
                tags.append({"id": random.randint(1000, 99999), "name": t["name"]})
        dels = [t["name"].lower() for t in item.get("tags_to_delete") or []]
        lead["_embedded"]["tags"] = [x for x in tags if x["name"].lower() not in dels]
        for f in item.get("custom_fields_values") or []:
            cf = lead.setdefault("custom_fields_values", [])
            name = next((x["name"] for x in DemoAmo._db["fields"] if x["id"] == f["field_id"]), "")
            ex = next((x for x in cf if x["field_id"] == f["field_id"]), None)
            if ex:
                ex["values"] = f["values"]
            else:
                cf.append({"field_id": f["field_id"], "field_name": name, "values": f["values"]})
        lead["updated_at"] = _now()


def client():
    cfg = config.get_config()
    return DemoAmo(cfg) if cfg.get("demo") else AmoClient(cfg)
