# LiveLex.ai

LiveLex is a dual-interface language learning platform:
1.  **Student View (PWA):** An AI AR-glasses emulator that runs on mobile devices. It captures real-time video, identifies objects, and provides vocabulary lessons via audio.
<p align="center">
  <img width="292" height="553" alt="image" src="https://github.com/user-attachments/assets/6b47862f-cd2f-43e3-87b7-992d614ebcee" />
</p>

3.  **Teacher Dashboard:** A web portal for teachers to create assignments, manage students, and view real-time analytics.
<p align="center">
  <img width="660" height="406" alt="image" src="https://github.com/user-attachments/assets/938de60c-846c-468d-bb2d-982fff4c4f2f" />
</p>

## Features

### Student App (Mobile PWA)
- **AI Vision:** Real-time object detection via WebSocket streaming.
- **Voice Interaction:** VAD (Voice Activity Detection) and TTS (Text-to-Speech) for conversational learning.
- **Progressive Web App:** Installable on mobile devices (iOS/Android) with "app-like" fullscreen experience.
- **Role-Based Auth:** Secure login for students linked to specific classes.

### Teacher Dashboard
- **Class Management:** Create classes and generate join codes for students.
- **Assignment Builder:** Create custom vocabulary lists, optional grammar exercises, and scene-based tasks.
- **Real-Time Analytics:** Monitor student progress, words learned, and scene interaction metrics.
- **Scene Management:** Curate specific visual contexts for students to explore.

## Tech Stack

- **Frontend:** Next.js 14 (App Router), TailwindCSS, ShadcnUI, `@ducanh2912/next-pwa`.
- **Backend:** FastAPI (Python 3.12).
- **Database:** MongoDB (Motor async driver).
- **Communication:** WebSockets (Real-time video/audio), REST API.
- **Infrastructure:** Docker & Docker Compose.

---

## Prerequisites

- **Node.js** ≥ 18
- **npm** (or yarn/pnpm)
- **Python** ≥ 3.11
- **MongoDB** (Local or Atlas URI)
- **Docker** (Optional)

---

## Running Locally

### 1. Database
Ensure you have a MongoDB instance running.
- **Connection String:** Update `apps/backend/.env` with your `MONGODB_URL`.

### 2. Backend (FastAPI)
```bash
cd apps/backend
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\Activate.ps1 on Windows
pip install -r requirements.txt
cp .env.example .env
# Edit .env to set MONGODB_URL and OPENAI_API_KEY
uvicorn app.main:app --reload --port 8000
```
- API Docs: [http://localhost:8000/docs](http://localhost:8000/docs)

### 3. Frontend (Next.js PWA)
```bash
cd apps/frontend
npm install
cp .env.local.example .env.local
# Edit .env.local if backend URL differs
npm run dev
```
- App: [http://localhost:3000](http://localhost:3000)

**Note on PWA:** Service workers are disabled in development mode by default. To test PWA features (installation, offline), run a production build:
```bash
npm run build
npm start
```

---

## Project Structure

```
LiveLex/
  apps/
    frontend/             # Next.js Consumer App & Teacher Dashboard
      app/                # App Router (pages)
        student/          # Student PWA Interface
        teacher/          # Teacher Dashboard Interface
      components/         # Shared UI components
      public/             # Static assets & Manifest
      next.config.mjs     # PWA Configuration
    backend/              # FastAPI Server
      app/
        routers/          # Auth, Assignments, Scenes, Vision (WS)
        db/               # MongoDB Models (Beanie/Pydantic)
  docker-compose.yml
```

## Environment Variables

### Frontend (`apps/frontend/.env.local`)
```
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_secret
```

### Backend (`apps/backend/.env`)
```
MONGODB_URL=mongodb://localhost:27017
DB_NAME=livelex
OPENAI_API_KEY=sk-...
ALLOWED_ORIGINS=http://localhost:3000
```

## License
MIT
