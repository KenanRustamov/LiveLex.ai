from fastapi import APIRouter, HTTPException
from app.schemas.messages import ChatRequest, ChatResponse

router = APIRouter(tags=["chat"])

@router.post("/chat", response_model=ChatResponse, status_code=501)
async def chat(req: ChatRequest):
    # Placeholder — wire in your orchestrator (e.g., LangChain) later.
    raise HTTPException(status_code=501, detail="Chat not implemented yet.")
