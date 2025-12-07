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
    email: Optional[str] = None
    name: Optional[str] = None
    profile_image: Optional[str] = None
    role: Optional[str] = None  # "teacher" or "student"
    teacher_code: Optional[str] = None
    enrolled_class_code: Optional[str] = None
    objects: dict[str, dict[str, Any]] = Field(default_factory=dict)
    sessions: list[dict[str, Any]] = Field(default_factory=list)

    class Settings:
        name = "user_data"
        indexes = ["username"]


class PerformanceMetricDoc(Document):
    """Store performance metrics for analysis and reporting."""
    session_id: str
    username: Optional[str] = None
    operation_type: str  # e.g., "transcription", "evaluation", "tts", "plan_generation"
    operation_name: str  # e.g., "transcribe_audio_bytes", "evaluate_response"
    duration_ms: float
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)  # Additional context

    class Settings:
        name = "performance_metrics"
        indexes = ["session_id", "username", "operation_type", "timestamp"]


