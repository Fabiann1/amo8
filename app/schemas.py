"""Модели запросов API."""
from typing import Literal

from pydantic import BaseModel, Field


class Password(BaseModel):
    password: str


class PasswordChange(BaseModel):
    old: str
    new: str = Field(min_length=6)


class LeadCreate(BaseModel):
    name: str = ""
    price: int = 0
    status_id: int | None = None
    pipeline_id: int | None = None
    contact_name: str = ""
    phone: str = ""


class LeadPatch(BaseModel):
    name: str | None = None
    price: int | None = None
    status_id: int | None = None
    pipeline_id: int | None = None
    responsible_user_id: int | None = None


class Text(BaseModel):
    text: str = ""


class Assistant(BaseModel):
    action: str
    text: str = ""


class AiMode(BaseModel):
    mode: Literal["auto", "copilot", "off"]


class TaskCreate(BaseModel):
    lead_id: int | None = None
    text: str = ""
    complete_till: int | None = None
    responsible_user_id: int | None = None


class TaskComplete(BaseModel):
    result: str = ""


class OAuthCode(BaseModel):
    code: str
