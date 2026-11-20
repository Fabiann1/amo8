"""Работа с данными amoCRM для интерфейса: сделки, чаты, задачи, рабочий стол, действия менеджера."""
import asyncio
import time

from . import amocrm, config, db
from . import notes as N
from .amocrm import AmoError

CLOSED = {142, 143}  # «Успешно реализовано» / «Закрыто и не реализовано» — одинаковы во всех аккаунтах amoCRM

_meta_cache: dict = {"at": 0.0, "key": None, "data": None}


def emb(res, key: str) -> list:
    return ((res or {}).get("_embedded") or {}).get(key) or []


async def paged(a, path: str, params: dict, key: str, pages: int = 4) -> list:
    out = []
    for page in range(1, pages + 1):
        chunk = emb(await a.request("GET", path, {**params, "limit": 250, "page": page}), key)
        out += chunk
        if len(chunk) < 250:
            break
    return out


# ---------------- справочники ----------------

def drop_meta_cache() -> None:
    _meta_cache["data"] = None


async def meta(force: bool = False) -> dict:
    cfg = config.get_config()
    key = (cfg.get("demo"), cfg["amo"].get("subdomain"), cfg["amo"].get("auth_mode"))
    if not force and _meta_cache["data"] and _meta_cache["key"] == key and time.time() - _meta_cache["at"] < 300:
        return _meta_cache["data"]
    a = amocrm.client()
    try:
        acc = await a.request("GET", "/api/v4/account", {"with": "users"})
    except AmoError as e:
        # Часть аккаунтов amoCRM не принимает with=users у /account (400 "Invalid with") — тогда без него,
        # а пользователи ниже берутся из /api/v4/users
        if e.status != 400:
            raise
        acc = await a.request("GET", "/api/v4/account")
    users = emb(acc, "users")
    if not users:
        try:
            users = emb(await a.request("GET", "/api/v4/users", {"limit": 250}), "users")
        except AmoError:
            users = []
    pipelines = emb(await a.request("GET", "/api/v4/leads/pipelines"), "pipelines")
    try:
        fields = emb(await a.request("GET", "/api/v4/leads/custom_fields", {"limit": 250}), "custom_fields")
    except AmoError:
        fields = []
    data = {
        "account": {k: acc.get(k) for k in ("id", "name", "subdomain", "currency")},
        "users": [{"id": u["id"], "name": u.get("name"), "email": u.get("email")} for u in users],
        "pipelines": [{
            "id": p["id"], "name": p["name"], "is_main": p.get("is_main"),
            "statuses": [{"id": s["id"], "name": s["name"], "color": s.get("color"), "sort": s.get("sort"), "type": s.get("type")}
                         for s in sorted(emb(p, "statuses"), key=lambda s: s.get("sort", 0))],
        } for p in pipelines],
        "fields": [{"id": f["id"], "name": f["name"], "type": f.get("type")} for f in fields],
        "link": a.base,
    }
    _meta_cache.update(at=time.time(), key=key, data=data)
    return data


async def contacts_by_ids(ids) -> dict:
    ids = [i for i in dict.fromkeys(ids) if i]
    out: dict = {}
    a = amocrm.client()
    for b in range(0, len(ids), 200):
        try:
            res = await a.request("GET", "/api/v4/contacts", {"filter[id][]": ids[b:b + 200], "limit": 250})
        except AmoError:
            continue
        for c in emb(res, "contacts"):
            out[c["id"]] = c
    return out


async def leads_by_ids(ids) -> dict:
    ids = [i for i in dict.fromkeys(ids) if i]
    out: dict = {}
    a = amocrm.client()
    for b in range(0, len(ids), 200):
        res = await a.request("GET", "/api/v4/leads", {"filter[id][]": ids[b:b + 200], "limit": 250, "with": "contacts"})
        for l in emb(res, "leads"):
            out[l["id"]] = l
    return out


def contact_view(c: dict) -> dict:
    phones, emails = [], []
    for f in c.get("custom_fields_values") or []:
        vals = [v.get("value") for v in f.get("values") or []]
        if f.get("field_code") == "PHONE":
            phones += vals
        elif f.get("field_code") == "EMAIL":
            emails += vals
    return {"id": c["id"], "name": c.get("name"), "phones": phones, "emails": emails}


def main_contact_id(lead: dict):
    cs = (lead.get("_embedded") or {}).get("contacts") or []
    return cs[0]["id"] if cs else None


def lead_view(cfg: dict, l: dict, contacts: dict | None = None) -> dict:
    tags = N.lead_tags(l)
    cid = main_contact_id(l)
    c = (contacts or {}).get(cid)
    return {
        "id": l["id"], "name": l.get("name"), "price": l.get("price") or 0, "status_id": l.get("status_id"),
        "pipeline_id": l.get("pipeline_id"), "responsible_user_id": l.get("responsible_user_id"),
        "created_at": l.get("created_at"), "updated_at": l.get("updated_at"), "tags": tags,
        "contact": contact_view(c) if c else None,
        "ai_mode": N.ai_mode(cfg, tags), "temperature": N.temperature(cfg, tags),
        "needs_human": N.has_tag(tags, cfg["crm"]["tags"]["human"]),
    }


# ---------------- сделки ----------------

async def list_leads(pipeline_id: int | None = None, query: str = "") -> list[dict]:
    cfg = config.get_config()
    params = {"with": "contacts"}
    if pipeline_id:
        params["filter[pipeline_id]"] = pipeline_id
    if query:
        params["query"] = query
    leads = await paged(amocrm.client(), "/api/v4/leads", params, "leads")
    contacts = await contacts_by_ids([main_contact_id(l) for l in leads])
    return [lead_view(cfg, l, contacts) for l in leads]


async def lead_detail(lead_id: int) -> dict:
    cfg = config.get_config()
    a = amocrm.client()
    l = await a.request("GET", f"/api/v4/leads/{lead_id}", {"with": "contacts"})
    cids = [c["id"] for c in (l.get("_embedded") or {}).get("contacts") or []]
    contacts, notes_res, tasks_res = await asyncio.gather(
        contacts_by_ids(cids),
        a.request("GET", f"/api/v4/leads/{lead_id}/notes", {"limit": 250, "order[id]": "desc"}),
        _safe(a.request("GET", "/api/v4/tasks", {"filter[entity_id]": lead_id, "filter[entity_type]": "leads", "limit": 100})),
    )
    v = lead_view(cfg, l, contacts)
    v["contacts"] = [contact_view(contacts[c]) for c in cids if c in contacts]
    v["custom_fields"] = [{"id": f.get("field_id"), "name": f.get("field_name"),
                           "value": ", ".join(str(x.get("value")) for x in f.get("values") or [])}
                          for f in l.get("custom_fields_values") or []]
    v["timeline"] = N.timeline(emb(notes_res, "notes"))
    v["ai_state"], v["ai_state_text"] = N.last_state(v["timeline"])
    v["tasks"] = emb(tasks_res, "tasks")
    v["link"] = f"{a.base}/leads/detail/{lead_id}"
    if v["timeline"]:
        db.mark_seen(lead_id, max(n["id"] for n in v["timeline"]))
    return v


async def _safe(coro):
    try:
        return await coro
    except AmoError:
        return {}


async def create_lead(name: str, price: int, status_id: int | None, pipeline_id: int | None, contact_name: str, phone: str) -> int:
    a = amocrm.client()
    item: dict = {"name": name or "Новая сделка", "price": int(price or 0)}
    if status_id:
        item["status_id"] = int(status_id)
    if pipeline_id:
        item["pipeline_id"] = int(pipeline_id)
    if contact_name:
        c: dict = {"name": contact_name}
        if phone:
            c["custom_fields_values"] = [{"field_code": "PHONE", "values": [{"value": phone, "enum_code": "WORK"}]}]
        cid = emb(await a.request("POST", "/api/v4/contacts", body=[c]), "contacts")[0]["id"]
        item["_embedded"] = {"contacts": [{"id": cid}]}
    return emb(await a.request("POST", "/api/v4/leads", body=[item]), "leads")[0]["id"]


async def patch_lead(lead_id: int, data: dict) -> None:
    item = {"id": lead_id}
    for k in ("name", "price", "status_id", "pipeline_id", "responsible_user_id"):
        if data.get(k) not in (None, ""):
            item[k] = data[k] if k == "name" else int(data[k])
    await amocrm.client().request("PATCH", "/api/v4/leads", body=[item])


async def add_note(lead_id: int, text: str) -> None:
    await amocrm.client().request("POST", f"/api/v4/leads/{lead_id}/notes",
                                  body=[{"note_type": "common", "params": {"text": text}}])


# ---------------- действия менеджера (как «Manager console» в n8n, без ИИ) ----------------

def can_send(cfg: dict) -> bool:
    return bool(int(cfg["crm"].get("salesbot_id") or 0) and int(cfg["crm"].get("reply_field_id") or 0))


async def send_message(lead_id: int, text: str) -> None:
    """Отправка клиенту: заметка [MANAGER] → текст в поле «AI ответ» → запуск Salesbot.

    Заметка [MANAGER] сообщает n8n, что менеджер ведёт диалог (ИИ переходит в режим подсказок),
    а совпадение текста с полем «AI ответ» не даёт n8n записать это сообщение второй раз.
    """
    cfg = config.get_config()
    text = (text or "").strip()
    if not text:
        raise ValueError("Введите текст сообщения")
    if not can_send(cfg):
        raise ValueError("Отправка не настроена: укажите поле «AI ответ» и ID Salesbot в Настройках → Отправка и теги")
    a = amocrm.client()
    await a.request("POST", f"/api/v4/leads/{lead_id}/notes", body=[{"note_type": "common", "params": {"text": "[MANAGER] " + text}}])
    await a.request("PATCH", "/api/v4/leads", body=[{"id": lead_id, "custom_fields_values": [
        {"field_id": int(cfg["crm"]["reply_field_id"]), "values": [{"value": text}]}]}])
    await a.request("POST", "/api/v2/salesbot/run", body=[{"bot_id": int(cfg["crm"]["salesbot_id"]), "entity_id": lead_id, "entity_type": 2}])


async def set_ai_mode(lead_id: int, mode: str) -> None:
    """Переключение режима ИИ тегами — те же теги и заметки, что у консоли n8n."""
    T = config.get_config()["crm"]["tags"]
    if mode == "off":
        patch = {"tags_to_add": [{"name": T["stop"]}]}
        note = "ИИ выключен для этой сделки (сайт менеджера)"
    elif mode == "copilot":
        patch = {"tags_to_add": [{"name": T["draft"]}], "tags_to_delete": [{"name": T["stop"]}]}
        note = "Режим подсказок: ИИ пишет только черновики"
    elif mode == "auto":
        patch = {"tags_to_delete": [{"name": n} for n in (T["stop"], T["draft"], T["human"])]}
        note = "ИИ снова отвечает клиенту"
    else:
        raise ValueError("Неизвестный режим")
    a = amocrm.client()
    await a.request("PATCH", "/api/v4/leads", body=[{"id": lead_id, **patch}])
    await a.request("POST", f"/api/v4/leads/{lead_id}/notes", body=[{"note_type": "common", "params": {"text": "[AI-CONTROL] " + note}}])


# ---------------- чаты ----------------

async def chats() -> list[dict]:
    """Переписки строятся из примечаний n8n за последние 30 дней."""
    cfg = config.get_config()
    a = amocrm.client()
    params = {"filter[note_type]": "common", "order[id]": "desc", "filter[updated_at][from]": int(time.time()) - 30 * 86400}
    try:
        notes = await paged(a, "/api/v4/leads/notes", params, "notes", pages=4)
    except AmoError as e:
        if e.status != 400:
            raise
        notes = await paged(a, "/api/v4/leads/notes", {"filter[note_type]": "common"}, "notes", pages=4)
    by_lead: dict[int, list] = {}
    for n in notes:
        kind, body = N.kind_of(N.note_text(n))
        if kind in ("client", "bot", "manager", "state"):
            by_lead.setdefault(int(n["entity_id"]), []).append((n["id"], kind, body, n.get("created_at")))
    leads = await leads_by_ids(list(by_lead))
    contacts = await contacts_by_ids([main_contact_id(l) for l in leads.values()])
    seen = db.seen_map()
    out = []
    for lid, items in by_lead.items():
        items.sort()
        msgs = [x for x in items if x[1] != "state"]
        if not msgs or lid not in leads:
            continue
        last = msgs[-1]
        if lid in seen:
            unread = sum(1 for x in msgs if x[1] == "client" and x[0] > seen[lid])
        else:  # ещё не открывали: непрочитаны сообщения клиента после последнего ответа
            unread = 0
            for x in reversed(msgs):
                if x[1] != "client":
                    break
                unread += 1
        v = lead_view(cfg, leads[lid], contacts)
        out.append({"lead_id": lid, "lead_name": v["name"], "name": (v["contact"] or {}).get("name"),
                    "status_id": v["status_id"], "mode": v["ai_mode"], "temperature": v["temperature"],
                    "needs_human": v["needs_human"], "last_text": last[2], "last_role": last[1], "last_at": last[3],
                    "unread": unread})
    out.sort(key=lambda c: -(c["last_at"] or 0))
    return out


# ---------------- задачи ----------------

async def tasks() -> list[dict]:
    a = amocrm.client()
    items = await paged(a, "/api/v4/tasks", {"filter[is_completed]": 0}, "tasks", pages=3)
    leads = await leads_by_ids([t["entity_id"] for t in items if t.get("entity_type") == "leads"])
    for t in items:
        t["lead_name"] = (leads.get(t.get("entity_id")) or {}).get("name")
    return items


async def create_task(lead_id, text: str, complete_till: int, responsible_user_id=None) -> None:
    t: dict = {"text": text or "Связаться с клиентом", "complete_till": int(complete_till or time.time() + 3600), "task_type_id": 1}
    if lead_id:
        t.update(entity_id=int(lead_id), entity_type="leads")
    if responsible_user_id:
        t["responsible_user_id"] = int(responsible_user_id)
    await amocrm.client().request("POST", "/api/v4/tasks", body=[t])


async def complete_task(task_id: int, result: str) -> None:
    await amocrm.client().request("PATCH", "/api/v4/tasks", body=[{"id": task_id, "is_completed": True,
                                                                     "result": {"text": result or "Выполнено"}}])


# ---------------- рабочий стол ----------------

async def dashboard() -> dict:
    cfg = config.get_config()
    a = amocrm.client()
    now = int(time.time())
    week = now - 7 * 86400
    open_tasks, done, leads, m = await asyncio.gather(
        paged(a, "/api/v4/tasks", {"filter[is_completed]": 0}, "tasks", pages=3),
        _safe_list(paged(a, "/api/v4/tasks", {"filter[is_completed]": 1, "filter[updated_at][from]": week}, "tasks", pages=2)),
        list_leads(cfg["crm"].get("pipeline_id") or None),
        meta(),
    )
    active = [l for l in leads if l["status_id"] not in CLOSED]
    with_task = {t.get("entity_id") for t in open_tasks if t.get("entity_type") == "leads"}
    users = {u["id"]: u["name"] for u in m["users"]}
    by_mgr: dict = {}
    for l in active:
        k = users.get(l["responsible_user_id"], "—")
        d = by_mgr.setdefault(k, {"name": k, "count": 0, "sum": 0, "week": 0})
        d["count"] += 1
        d["sum"] += l["price"]
        d["week"] += int((l["created_at"] or 0) >= week)
    temps = {"hot": 0, "warm": 0, "cold": 0, "": 0}
    modes = {"auto": 0, "copilot": 0, "off": 0}
    stages: dict = {}
    for l in active:
        temps[l["temperature"]] += 1
        modes[l["ai_mode"]] += 1
        stages[l["status_id"]] = stages.get(l["status_id"], 0) + 1
    no_task = [l for l in active if l["id"] not in with_task]
    series = await activity_series(14)
    day0 = series["days"][0]
    new_by_day = [0] * 14
    for l in leads:
        i = ((l["created_at"] or 0) - day0) // 86400
        if 0 <= i < 14:
            new_by_day[i] += 1
    series["new_leads"] = new_by_day
    return {
        "series": series,
        "overdue": sum(1 for t in open_tasks if t["complete_till"] < now),
        "todo": len(open_tasks), "done_week": len(done),
        "leads_without_tasks": len(no_task), "leads_without_tasks_sum": sum(l["price"] for l in no_task),
        "active": len(active), "active_sum": sum(l["price"] for l in active),
        "new_week": sum(1 for l in leads if (l["created_at"] or 0) >= week),
        "by_manager": sorted(by_mgr.values(), key=lambda x: -x["count"]),
        "temperature": temps, "ai_modes": modes, "stages": stages,
        "needs_human": sum(1 for l in active if l["needs_human"]),
        "attention": [l for l in active if l["needs_human"] or l["temperature"] == "hot"][:8],
    }


async def activity_series(days: int) -> dict:
    """Сообщения в чатах по дням (по примечаниям n8n): клиенты и ответы (ИИ + менеджеры)."""
    lt = time.localtime()
    today = int(time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, 0, 0, 0, 0, 0, -1)))
    day0 = today - (days - 1) * 86400
    client, bot, manager = [0] * days, [0] * days, [0] * days
    try:
        notes = await paged(amocrm.client(), "/api/v4/leads/notes",
                            {"filter[note_type]": "common", "filter[updated_at][from]": day0}, "notes", pages=4)
    except AmoError:
        notes = []
    for n in notes:
        i = (int(n.get("created_at") or 0) - day0) // 86400
        if not 0 <= i < days:
            continue
        kind, _ = N.kind_of(N.note_text(n))
        if kind == "client":
            client[i] += 1
        elif kind == "bot":
            bot[i] += 1
        elif kind == "manager":
            manager[i] += 1
    return {"days": [day0 + i * 86400 for i in range(days)], "client": client, "bot": bot, "manager": manager}


async def _safe_list(coro):
    try:
        return await coro
    except AmoError:
        return []
