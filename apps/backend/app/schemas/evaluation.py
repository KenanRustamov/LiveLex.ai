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
    error_category: str | None = None  # "wrong_word_actual", "wrong_word_nonsense", "mispronunciation", "wrong_tense", "wrong_person", etc.
    attempt_number: int = 1
    grammar_person: str | None = None  # Grammatical person used for grammar mode (e.g., "first_singular", "third_plural")

