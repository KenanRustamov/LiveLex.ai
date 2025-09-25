import os
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseModel):
    env: str = os.getenv("ENV", "development")
    port: int = int(os.getenv("PORT", "8000"))
    allowed_origins: list[str] = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
    openai_api_key: str | None = os.getenv("OPENAI_API_KEY")

settings = Settings()
