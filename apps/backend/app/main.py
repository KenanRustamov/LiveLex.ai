from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.db.init import init_db
from app.routers import audio, base

app = FastAPI(title="AI Glasses Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def on_startup():
    await init_db()

@app.get("/health")
async def health():
    return {"status": "ok", "env": settings.env}

app.include_router(audio.router, prefix="/v1")
app.include_router(base.router, prefix="/v1")
