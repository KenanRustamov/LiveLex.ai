from pydantic import BaseModel
from typing import Optional
from app.schemas.plan import Object


class EvaluationResult(BaseModel):
    """Result of evaluating a user's audio response against an object in an image."""
    correct: bool
    object_tested: Object
    correct_word: str
    feedback_message: str
    transcription: str

