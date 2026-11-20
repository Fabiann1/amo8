"""SQLite: сессии входа и отметки «прочитано» по чатам."""
import sqlite3
import threading
import time

from .config import DATA

DB_PATH = DATA / "app.db"
_local = threading.local()


def conn() -> sqlite3.Connection:
    c = getattr(_local, "c", None)
    if c is None:
        c = sqlite3.connect(DB_PATH, timeout=15)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        _local.c = c
    return c


def init() -> None:
    c = conn()
    c.executescript(
        """
        CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, created INTEGER);
        CREATE TABLE IF NOT EXISTS seen (lead_id INTEGER PRIMARY KEY, note_id INTEGER NOT NULL);
        DROP TABLE IF EXISTS log;
        DROP TABLE IF EXISTS chats;
        """
    )
    c.commit()


def add_session(token: str) -> None:
    conn().execute("INSERT INTO sessions(token, created) VALUES (?, ?)", (token, int(time.time())))
    conn().commit()


def session_ok(token: str | None) -> bool:
    if not token:
        return False
    r = conn().execute("SELECT created FROM sessions WHERE token=?", (token,)).fetchone()
    return bool(r and time.time() - r["created"] < 30 * 86400)


def drop_session(token: str | None) -> None:
    conn().execute("DELETE FROM sessions WHERE token=?", (token or "",))
    conn().commit()


def seen_map() -> dict[int, int]:
    return {r["lead_id"]: r["note_id"] for r in conn().execute("SELECT lead_id, note_id FROM seen")}


def mark_seen(lead_id: int, note_id: int) -> None:
    conn().execute(
        "INSERT INTO seen(lead_id, note_id) VALUES (?, ?) ON CONFLICT(lead_id) DO UPDATE SET note_id=MAX(note_id, excluded.note_id)",
        (lead_id, note_id),
    )
    conn().commit()
