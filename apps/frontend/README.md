# Frontend (Next.js + Tailwind)

Mobile-style shell for the AI Glasses language learning app. Nothing is wired up yet.

## Dev

```bash
npm i
cp .env.local.example .env.local
npm run dev
```

Visit http://localhost:3000

## Mobile access (dev via Cloudflare Tunnel)

1) Start backend (in `apps/backend`):
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

2) Expose backend over HTTPS (choose one):
- Cloudflare Tunnel (recommended for quick dev):
  ```bash
  cloudflared tunnel --url http://localhost:8000
  ```
  Copy the printed `https://*.trycloudflare.com` URL.
- Or ngrok:
  ```bash
  ngrok http 8000
  ```
  Copy the printed `https://*.ngrok-free.app` URL.

3) Start frontend (in `apps/frontend`) with backend URL:
```bash
export NEXT_PUBLIC_BACKEND_URL="https://<your-backend-domain>"
npm run dev:host
```

4) Expose frontend over HTTPS:
- Cloudflare Tunnel:
  ```bash
  cloudflared tunnel --url http://localhost:3000
  ```
- Or ngrok:
  ```bash
  ngrok http 3000
  ```
Copy the printed frontend URL.

5) Open the frontend HTTPS URL on your phone. When prompted, tap “Start Camera” to grant camera/mic.

Notes:
- If using `ALLOWED_ORIGINS` on the backend, include your frontend tunnel origin (e.g., `https://<frontend-domain>`).
- iOS requires HTTPS to access camera/mic; tunnels provide valid HTTPS.
