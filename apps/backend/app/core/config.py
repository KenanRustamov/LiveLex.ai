import os
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseModel):
    env: str = os.getenv("ENV", "development")
    port: int = int(os.getenv("PORT", "8000"))
    allowed_origins: list[str] = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    openai_api_key: str | None = os.getenv("OPENAI_API_KEY")
    transcription_model: str = os.getenv("TRANSCRIPTION_MODEL", "gpt-4o-mini-transcribe")
    llm_model: str = os.getenv("LLM_MODEL", "gpt-4o-mini")
    speech_synthesis_model: str = os.getenv("SPEECH_SYNTHESIS_MODEL", "gpt-4o-mini-tts")

settings = Settings()
