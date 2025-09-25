# AI Glasses – Run the App

A minimal full-stack starter for an AI-powered, live language learning app that mimics “smart-glasses” on the web.

- **Frontend:** Next.js 14 + Tailwind (mobile-style shell)
- **Backend:** FastAPI (REST + WebSocket stubs, CORS, env config)
- **Eval:** Tiny evaluation harness (expects stubbed 501 responses)
- **Docker:** Dockerfiles + `docker-compose.yml`

---

## Prerequisites

- **Node.js** ≥ 18
- **npm** (or yarn/pnpm if you prefer)
- **Python** ≥ 3.11
- **Docker** & **Docker Compose** (optional, for containerized runs)

---

## Monorepo Layout

```
ai-glasses-starter/
  apps/
    frontend/             # Next.js + Tailwind shell
      app/                # App Router: layout + page
      components/         # MobileShell, CameraView (placeholder)
      styles/             # Tailwind globals
      public/manifest.json
      tailwind.config.ts, postcss.config.js, next.config.ts
      .env.local.example, Dockerfile
    backend/              # FastAPI
      app/
        core/config.py    # env + CORS
        routers/chat.py   # POST /v1/chat -> 501
        routers/vision.py # POST /v1/observe -> 501, WS /v1/ws
        main.py           # /health + router mounts
        schemas/messages.py
      requirements.txt, .env.example, Dockerfile
  eval/
    cases/sample.yaml     # sample scenarios
    run_eval.py           # sends cases to backend (expects 501)
    requirements.txt
  docker-compose.yml
  README.md
```

## Running Locally (no Docker)

### 1) Start the backend (FastAPI)
```bash
cd apps/backend
python -m venv .venv
# macOS/Linux
source .venv/bin/activate
# Windows (PowerShell)
# .venv\Scripts\Activate.ps1

pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

- Health check: http://localhost:8000/health  
- OpenAPI docs: http://localhost:8000/docs

### 2) Start the frontend (Next.js)
Open a new terminal:
```bash
cd apps/frontend
npm i
cp .env.local.example .env.local
npm run dev
```

- App: http://localhost:3000  
- The frontend reads the backend URL from `NEXT_PUBLIC_BACKEND_URL` (defaults to `http://localhost:8000` as set in `.env.local.example`).

---

## Running with Docker

From the repo root:
```bash
docker compose up --build
```

- Frontend: http://localhost:3000  
- Backend: http://localhost:8000  
- `docker-compose.yml` uses `apps/backend/.env.example` for backend env defaults.

> Tip: To pass real secrets in Docker, create and reference a proper `.env` file instead of the example.

---

## Environment Variables

### Frontend (`apps/frontend/.env.local`)
```
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

### Backend (`apps/backend/.env`)
```
ENV=development
OPENAI_API_KEY=
ALLOWED_ORIGINS=http://localhost:3000
PORT=8000
```

- **CORS:** Update `ALLOWED_ORIGINS` if your frontend runs on a different host/port.
- **OPENAI_API_KEY:** Not used by the stubbed endpoints yet, but wired for future use.

---

## Scripts & Common Tasks

### Frontend
```bash
npm run dev        # start Next.js dev server
npm run build      # build for production
npm start          # start production server
npm run lint       # ESLint
npm run typecheck  # TypeScript type check
```

### Backend
```bash
uvicorn app.main:app --reload --port 8000  # dev server
```

#### Backend tests (optional)
We include a simple healthcheck test:
```bash
pip install -r requirements.txt pytest
pytest
```

---

## Evaluation Harness (Optional)

A tiny runner that hits the stubbed `/v1/chat` endpoint and records responses (501 expected for now).

```bash
cd eval
python -m venv .venv
# macOS/Linux
source .venv/bin/activate
# Windows (PowerShell)
# .venv\Scripts\Activate.ps1

pip install -r requirements.txt
export EVAL_BACKEND_URL=http://localhost:8000   # optional; defaults to this value
python run_eval.py --cases cases/sample.yaml
```

Output is printed as JSON.

---

## Ports & Endpoints

- **Frontend:** `http://localhost:3000`
- **Backend:** `http://localhost:8000`
  - `GET /health` → `{ "status": "ok", ... }`
  - `POST /v1/chat` → 501 Not Implemented (stub)
  - `POST /v1/observe` → 501 Not Implemented (stub)
  - `WS /v1/ws` → Accepts and echoes a basic handshake (stub)

---

## Troubleshooting

- **CORS errors:**  
  Ensure `ALLOWED_ORIGINS` in `apps/backend/.env` includes your frontend origin (e.g., `http://localhost:3000`).

- **Port in use:**  
  Change the `PORT` in backend `.env` and/or update `NEXT_PUBLIC_BACKEND_URL` in frontend `.env.local`.

- **Node/Python version issues:**  
  Use Node 18+ and Python 3.11+. Clear installs (`rm -rf node_modules && npm i`, recreate venv).

- **501 Not Implemented:**  
  This is by design. Implement your logic in:
  - Frontend camera: `apps/frontend/components/CameraView.tsx`
  - Backend chat: `apps/backend/app/routers/chat.py`
  - Backend streaming: `apps/backend/app/routers/vision.py`

---

## License

MIT (or your preferred license)
