## Mobile Access (Dev) — Access the app from your phone

This sets up HTTPS tunnels for both frontend and backend so mobile browsers allow camera/mic.

Prereqs:
- macOS with Homebrew (or use your preferred install method)
- OpenAI API key in backend `.env`
- MongoDB connection (Atlas URI or local), or comment out DB init for quick smoke tests

### 1) Install tunnels (choose one)
- Cloudflare Tunnel (no account needed for quick tunnels):
  ```bash
  brew install cloudflared
  ```
- Or ngrok:
  ```bash
  brew install ngrok/ngrok/ngrok
  ngrok config add-authtoken <YOUR_TOKEN>
  ```

### 2) Start backend (FastAPI)
From `apps/backend`:
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Expose backend over HTTPS:
- Cloudflare:
  ```bash
  cloudflared tunnel --url http://localhost:8000
  ```
  Copy the printed `https://<random>.trycloudflare.com`
- Or ngrok:
  ```bash
  ngrok http 8000
  ```
  Copy the printed `https://<random>.ngrok-free.app`

Update backend CORS (if you’re using strict origins):
```
ALLOWED_ORIGINS=https://<your-frontend-domain>,http://localhost:3000
```
Restart backend if you changed `.env`.

### 3) Start frontend (Next.js)
From `apps/frontend`:
```bash
npm i
export NEXT_PUBLIC_BACKEND_URL="https://<your-backend-domain>"
npm run dev:host
```

Expose frontend over HTTPS:
- Cloudflare:
  ```bash
  cloudflared tunnel --url http://localhost:3000
  ```
- Or ngrok:
  ```bash
  ngrok http 3000
  ```

Open the frontend HTTPS URL on your phone.

### Notes and tips
- iOS Safari/Android Chrome require HTTPS for camera/mic.
- Tap “Start Camera” to grant permissions (user gesture is required).
- WebSocket endpoint is `wss://<backend-domain>/v1/ws`. The frontend uses `NEXT_PUBLIC_BACKEND_URL` to derive it.
- If using ephemeral tunnel URLs, update:
  - Frontend: `NEXT_PUBLIC_BACKEND_URL`
  - Backend: `ALLOWED_ORIGINS` (if strict CORS)


