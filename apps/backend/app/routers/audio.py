from fastapi import APIRouter, UploadFile, File, HTTPException
from app.core.config import settings
from typing import Optional
from openai import OpenAI
import io

router = APIRouter(tags=["audio"])


@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...), language: Optional[str] = None):
    if not settings.openai_api_key:
        raise HTTPException(status_code=500, detail="Missing OPENAI_API_KEY")

    client = OpenAI(api_key=settings.openai_api_key)

    try:
        data = await file.read()
        filename = file.filename or "audio.webm"
        # Use a file-like object so the SDK detects format by name
        buf = io.BytesIO(data)
        buf.name = filename

        resp = client.audio.transcriptions.create(
            model="gpt-4o-mini-transcribe",
            file=buf,
            language=language,
        )
        # openai>=1.0 returns an object with .text
        text = getattr(resp, "text", None)
        if not text:
            raise HTTPException(status_code=502, detail="Transcription failed")
        return {"text": text}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription error: {e}")


