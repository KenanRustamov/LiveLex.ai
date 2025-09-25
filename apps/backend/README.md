# Backend (FastAPI)

Placeholder API for chat and vision streaming.

## Dev

```bash
python -m venv .venv && source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

Visit http://localhost:8000/docs
