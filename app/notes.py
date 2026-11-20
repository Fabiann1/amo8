"""Чтение примечаний, которые пишет n8n: [CLIENT], [BOT], [MANAGER], [AI-STATE], [AI DRAFT], [AI-CONTROL].

Сайт только читает результат работы n8n — сам ИИ здесь не вызывается.
"""

PREFIXES = (
    ("[CLIENT] ", "client"), ("[BOT] ", "bot"), ("[MANAGER] ", "manager"),
    ("[AI-STATE] ", "state"), ("[AI DRAFT] ", "draft"), ("[AI-CONTROL] ", "control"),
)


def note_text(n: dict) -> str:
    return str((n.get("params") or {}).get("text") or "")


def kind_of(text: str) -> tuple[str, str]:
    for prefix, kind in PREFIXES:
        if text.startswith(prefix):
            return kind, text[len(prefix):]
    return "note", text


def parse_state(head: str) -> dict:
    """'state=qualified; temp=hot; score=72; ...' → dict."""
    out = {}
    for part in head.split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def timeline(notes: list[dict]) -> list[dict]:
    out = []
    for n in sorted(notes, key=lambda x: x["id"]):
        kind, body = kind_of(note_text(n))
        item = {"id": n["id"], "kind": kind, "text": body, "at": n.get("created_at"),
                "created_by": n.get("created_by"), "note_type": n.get("note_type")}
        if kind == "state":
            lines = body.split("\n")
            item["state"] = parse_state(lines[0])
            item["text"] = "\n".join(lines[1:])
        out.append(item)
    return out


def last_state(tl: list[dict]) -> tuple[dict | None, str]:
    """Последняя оценка клиента от n8n: (поля, текст без строки 📊)."""
    for item in reversed(tl):
        if item["kind"] == "state":
            s = item["state"]
            st = {"state": s.get("state"), "temperature": s.get("temp"), "segment": s.get("segment"),
                  "score": s.get("score"), "needs_human": s.get("needs_human") == "yes"}
            text = "\n".join(x for x in item["text"].split("\n") if not x.startswith("📊"))
            return st, text
    return None, ""


def lead_tags(lead: dict) -> list[str]:
    return [str(t.get("name") or "").strip() for t in ((lead.get("_embedded") or {}).get("tags") or [])]


def has_tag(tags: list[str], name: str) -> bool:
    return bool(name) and any(t.lower() == str(name).lower() for t in tags)


def ai_mode(cfg: dict, tags: list[str]) -> str:
    """Режим ИИ в n8n определяется тегами сделки."""
    T = cfg["crm"]["tags"]
    if has_tag(tags, T["stop"]):
        return "off"
    if has_tag(tags, T["draft"]):
        return "copilot"
    return "auto"


def temperature(cfg: dict, tags: list[str]) -> str:
    T = cfg["crm"]["tags"]
    for k in ("hot", "warm", "cold"):
        if has_tag(tags, T[k]):
            return k
    return ""
