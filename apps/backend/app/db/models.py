from datetime import datetime
from pydantic import Field, BaseModel
from beanie import Document
from app.schemas.plan import Plan
from typing import Optional, Any, List, Dict


class SessionDoc(Document):
    session_id: str
    username: Optional[str] = None
    plan: Optional[Plan] = None
    entries: list[dict[str, Any]] = Field(default_factory=list)
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    
    # Practice mode fields
    grammar_mode: str = "vocab"  # "vocab" or "grammar"
    grammar_tense: Optional[str] = None  # "present indicative" or "preterite" (Spanish tenses, only used when grammar_mode="grammar")
    
    # Assignment tracking
    assignment_id: Optional[str] = None  # Link to AssignmentDoc if this session is for an assignment

    class Settings:
        name = "sessions"
        indexes = ["session_id", "assignment_id"]


class UserDataDoc(Document):
    username: str
    email: Optional[str] = None
    name: Optional[str] = None
    profile_image: Optional[str] = None
    role: Optional[str] = None
    
    # Teacher/Class fields
    teacher_id: Optional[str] = None  # Reference to the teacher's UserDataDoc.id
    class_code: Optional[str] = None  # For students: the code they joined
    teacher_code: Optional[str] = None # For teachers: the code they own
    
    # Scene Progress: { "scene_id": [{"source_name": "apple", "target_name": "manzana"}, ...] }
    # Vocab items discovered by the student in a specific scene
    # Using List[Any] to handle legacy string format and new dict format
    discovered_scene_words: Dict[str, List[Any]] = {}

    sessions: list[dict[str, Any]] = []  # List of session summaries
    objects: dict[str, Any] = {}

    class Settings:
        name = "user_data"
        indexes = ["username", "email", "teacher_code", "teacher_id"]


class VocabItem(BaseModel):
    source_name: str
    target_name: str


class SceneDoc(Document):
    name: str
    description: str
    teacher_id: str
    image_url: Optional[str] = None
    
    # Vocabulary items with source/target language pairs
    vocab: List[Dict[str, str]] = []  # [{"source_name": "apple", "target_name": "manzana"}, ...]
    
    # Language settings (defaults for this scene)
    source_language: str = "English"
    target_language: str = "Spanish"
    
    class Settings:
        name = "scenes"


class AssignmentDoc(Document):
    teacher_id: str
    email: Optional[str] = None # Keeping for backward compatibility
    title: str
    vocab: List[Dict[str, str]] = []  # [{"source_name": "apple", "target_name": "manzana"}, ...]
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Grammar practice fields
    include_grammar: bool = False
    grammar_tense: Optional[str] = None  # "present", "past"    
    # Optional link to a scene
    scene_id: Optional[str] = None
    
    # Dynamic Content
    # "Practice these words + 3 of your own discoveries"
    include_discovered_count: int = 0
    
    class Settings:
        name = "assignments"
        indexes = ["username"]


class AssignmentCompletionDoc(Document):
    """Track student completion of assignments."""
    assignment_id: str
    student_id: str  # UserDataDoc.id
    student_username: str
    completed_at: datetime = Field(default_factory=datetime.utcnow)
    session_id: Optional[str] = None  # Link to the session that completed it
    score: Optional[float] = None  # Overall score (0.0 - 1.0)
    total_items: int = 0
    correct_items: int = 0
    
    class Settings:
        name = "assignment_completions"
        indexes = ["assignment_id", "student_id", "student_username"]


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