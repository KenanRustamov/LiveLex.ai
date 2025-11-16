# Backend (FastAPI)

Placeholder API for chat and vision streaming.

## Dev

```bash
python -m venv .venv && source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Visit http://localhost:8000/docs

## Mobile access (dev via Cloudflare Tunnel)

1) Run the server bound to all interfaces:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

2) Expose HTTPS tunnel:
- Cloudflare Tunnel:
  ```bash
  cloudflared tunnel --url http://localhost:8000
  ```
- Or ngrok:
  ```bash
  ngrok http 8000
  ```

3) CORS:
- Set `ALLOWED_ORIGINS` in `.env` to include your frontend tunnel origin, for example:
  ```
  ALLOWED_ORIGINS=https://<frontend-domain>,http://localhost:3000
  ```
  Restart the server after changing `.env`.
