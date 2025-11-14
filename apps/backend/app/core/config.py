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

    # MongoDB Atlas configuration
    mongodb_db: str = os.getenv("MONGO_DB", "livelex")
    _mongo_user: str | None = os.getenv("MONGO_USER")
    _mongo_pass: str | None = os.getenv("MONGO_PASS")
    _mongo_host: str = os.getenv("MONGO_HOST", "livelex.1w4lrr5.mongodb.net")
    _mongo_app: str = os.getenv("MONGO_APP", "LiveLex")
    mongodb_uri: str | None = os.getenv("MONGODB_URI") or (
        f"mongodb+srv://{_mongo_user}:{_mongo_pass}@{_mongo_host}/?retryWrites=true&w=majority&appName={_mongo_app}"
        if _mongo_user and _mongo_pass else None
    )

settings = Settings()
