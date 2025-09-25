from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from typing import Any

router = APIRouter(tags=["vision"])

@router.post("/observe", status_code=501)
async def observe():
    # Placeholder for single-shot observation ingestion.
    raise HTTPException(status_code=501, detail="Observe not implemented yet.")

@router.websocket("/ws")
async def ws_stream(ws: WebSocket):
    await ws.accept()
    try:
        # Echo minimal handshake and then close (no logic yet).
        await ws.send_json({"status": "ok", "message": "WebSocket connected. Not implemented."})
    except WebSocketDisconnect:
        pass
    finally:
        await ws.close()
