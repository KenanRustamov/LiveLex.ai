#!/usr/bin/env bash
set -euo pipefail

BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

# Resolve paths so the script works from any cwd
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_DIR="${APPS_DIR}/backend"
FRONTEND_DIR="${APPS_DIR}/frontend"
TUNNEL_DIR="${APPS_DIR}/.tunnels"

# Ensure required tools are installed
if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared not found. Install with: brew install cloudflared"
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 not found. Please install Python 3."
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found. Please install Node.js (includes npm)."
  exit 1
fi

mkdir -p "${TUNNEL_DIR}"
BACKEND_LOG="${TUNNEL_DIR}/backend.log"
FRONTEND_LOG="${TUNNEL_DIR}/frontend.log"

# Truncate old logs each run so we don't pick up stale tunnel URLs
: > "${BACKEND_LOG}"
: > "${FRONTEND_LOG}"

echo "=== Starting backend (FastAPI) on port ${BACKEND_PORT} ==="
(
  cd "${BACKEND_DIR}"

  # Create venv + install deps on first run
  if [ ! -d ".venv" ]; then
    echo "[backend] Creating virtualenv..."
    python3 -m venv .venv
    # shellcheck disable=SC1091
    source .venv/bin/activate
    echo "[backend] Installing requirements..."
    pip install -r requirements.txt
  else
    # shellcheck disable=SC1091
    source .venv/bin/activate
  fi

  # Ensure .env exists
  if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    echo "[backend] Creating .env from .env.example"
    cp .env.example .env
  fi

  uvicorn app.main:app --reload --host 0.0.0.0 --port "${BACKEND_PORT}"
) &
BACKEND_DEV_PID=$!

echo "=== Starting Cloudflare tunnel for backend on port ${BACKEND_PORT} ==="
cloudflared tunnel --no-autoupdate --url "http://localhost:${BACKEND_PORT}" --logfile "${BACKEND_LOG}" &
BACKEND_TUNNEL_PID=$!

# Wait a bit for backend tunnel to print URL
sleep 6

# Grab the most recent backend URL from the log (not a stale one)
BACKEND_URL="$(grep -Eo 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "${BACKEND_LOG}" | tail -n1 || true)"
if [ -z "${BACKEND_URL}" ]; then
  echo "WARNING: Could not extract backend tunnel URL from ${BACKEND_LOG}"
  BACKEND_URL="http://localhost:${BACKEND_PORT}"
fi

echo "Backend tunnel URL: ${BACKEND_URL}"

echo "=== Starting frontend (Next.js) on port ${FRONTEND_PORT} ==="
(
  cd "${FRONTEND_DIR}"

  if [ ! -d "node_modules" ]; then
    echo "[frontend] Installing npm dependencies..."
    npm install
  fi

  echo "[frontend] Using NEXT_PUBLIC_BACKEND_URL=${BACKEND_URL}"
  NEXT_PUBLIC_BACKEND_URL="${BACKEND_URL}" npm run dev:host
) &
FRONTEND_DEV_PID=$!

echo "=== Starting Cloudflare tunnel for frontend on port ${FRONTEND_PORT} ==="
cloudflared tunnel --no-autoupdate --url "http://localhost:${FRONTEND_PORT}" --logfile "${FRONTEND_LOG}" &
FRONTEND_TUNNEL_PID=$!

# Give frontend tunnel a moment to start
sleep 6

# Grab the most recent frontend URL from the log (not a stale one)
FRONTEND_URL="$(grep -Eo 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "${FRONTEND_LOG}" | tail -n1 || true)"

echo
echo "Backend tunnel URL:  ${BACKEND_URL}"
echo "Frontend tunnel URL: ${FRONTEND_URL:-<not found>}"
echo
echo "Open this on your phone:"
echo "  ${FRONTEND_URL:-https://<frontend-tunnel>.trycloudflare.com}"
echo
echo "Backend dev PID:   ${BACKEND_DEV_PID}"
echo "Frontend dev PID:  ${FRONTEND_DEV_PID}"
echo "Backend tunnel PID:${BACKEND_TUNNEL_PID}"
echo "Frontend tunnel PID:${FRONTEND_TUNNEL_PID}"
echo
echo "Press Ctrl+C to stop servers and tunnels."

cleanup() {
  echo
  echo "Stopping tunnels and dev servers..."
  kill "${BACKEND_TUNNEL_PID}" "${FRONTEND_TUNNEL_PID}" "${BACKEND_DEV_PID}" "${FRONTEND_DEV_PID}" 2>/dev/null || true
}
trap cleanup INT TERM

wait "${BACKEND_DEV_PID}" "${FRONTEND_DEV_PID}" "${BACKEND_TUNNEL_PID}" "${FRONTEND_TUNNEL_PID}"