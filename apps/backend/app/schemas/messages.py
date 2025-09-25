from pydantic import BaseModel, Field
from typing import Any, List, Optional, Dict

class Observation(BaseModel):
    """A single sensor observation placeholder (e.g., vision frame metadata)."""
    kind: str = Field(default="image")  # 'image', 'speech', 'text'
    payload: Dict[str, Any] = Field(default_factory=dict)

class ChatRequest(BaseModel):
    """Chat request with optional observations attached."""
    messages: List[dict] = Field(default_factory=list)
    observations: Optional[List[Observation]] = None
    trace_id: Optional[str] = None

class ChatResponse(BaseModel):
    message: str = "Not implemented"
    trace_id: Optional[str] = None
