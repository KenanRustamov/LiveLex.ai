from __future__ import annotations
from typing import Optional, Any
from datetime import datetime
from pydantic import Field
from beanie import Document
from app.schemas.plan import Plan


class SessionDoc(Document):
    session_id: str
    username: Optional[str] = None
    plan: Optional[Plan] = None
    entries: list[dict[str, Any]] = Field(default_factory=list)
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None

    class Settings:
        name = "sessions"
        indexes = ["session_id"]


class UserDataDoc(Document):
    username: str
    objects: dict[str, dict[str, Any]] = Field(default_factory=dict)
    sessions: list[dict[str, Any]] = Field(default_factory=list)

    class Settings:
        name = "user_data"
        indexes = ["username"]


