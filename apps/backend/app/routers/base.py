import base64
import io
import json
from typing import Any, AsyncGenerator, Optional

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from openai import OpenAI

from app.core.config import settings
from app.prompts.chat_prompts import generate_plan_prompt
from app.schemas.plan import Plan


router = APIRouter(tags=["base"])


class SessionState:
    """Per-connection state for streaming session."""

    def __init__(self) -> None:
        self.session_id: Optional[str] = None
        self.audio_chunks: list[bytes] = []
        self.audio_mime: Optional[str] = None


async def stream_llm_tokens(prompt_text: str) -> AsyncGenerator[str, None]:
    """Stream tokens from the LLM for a given text prompt."""
    llm = ChatOpenAI(
        model=settings.llm_model,
        api_key=settings.openai_api_key,
        streaming=True,
    )
    async for chunk in llm.astream([HumanMessage(content=prompt_text)]):
        content = getattr(chunk, "content", None)
        if content:
            yield content


def transcribe_audio_bytes(audio_bytes: bytes, mime: Optional[str]) -> str:
    """Transcribe buffered audio bytes using OpenAI transcription API."""
    if not settings.openai_api_key:
        raise HTTPException(status_code=500, detail="Missing OPENAI_API_KEY")

    client = OpenAI(api_key=settings.openai_api_key)

    # Heuristic: pick filename extension based on mime if provided, default to .webm
    ext = "webm"
    if mime and "/" in mime:
        candidate = mime.split("/")[-1].split(";")[0].strip()
        if candidate:
            ext = candidate

    buf = io.BytesIO(audio_bytes)
    buf.name = f"audio.{ext}"

    resp = client.audio.transcriptions.create(
        model=settings.transcription_model,
        file=buf,
    )
    text = getattr(resp, "text", None)
    if not text:
        raise HTTPException(status_code=502, detail="Transcription failed")
    return text


async def generate_plan_from_data_url(image_data_url: str, target_language: str, source_language: str, location: str, actions: list[str]) -> Plan:
    """Invoke the structured Plan generator using the image data URL as a multimodal input."""
    if not settings.openai_api_key:
        raise HTTPException(status_code=500, detail="Missing OPENAI_API_KEY")

    prompt_value = generate_plan_prompt.invoke({
        "target_language": target_language,
        "source_language": source_language,
        "location": location,
        "actions": actions,
    })
    system_msg = prompt_value.to_messages()[0]

    user_msg = HumanMessage(content=[
        {"type": "text", "text": "Analyze this image and follow the instructions."},
        {"type": "image_url", "image_url": {"url": image_data_url}},
    ])

    llm = ChatOpenAI(model=settings.llm_model, api_key=settings.openai_api_key)
    structured = llm.with_structured_output(Plan)
    return structured.invoke([system_msg, user_msg])


@router.websocket("/ws")
async def ws_stream(ws: WebSocket):
    await ws.accept()

    state = SessionState()

    async def send_status(message: str, code: str = "ok") -> None:
        await ws.send_json({"type": "status", "payload": {"code": code, "message": message}})

    try:
        await send_status("WebSocket connected")
        while True:
            # Expect JSON frames from client for control and data envelope; for raw binary, base64 in JSON is simpler
            raw = await ws.receive_text()
            try:
                msg: dict[str, Any] = json.loads(raw)
            except json.JSONDecodeError:
                await send_status("Invalid JSON", code="error")
                continue

            msg_type = msg.get("type")
            payload = msg.get("payload", {}) or {}
            state.session_id = msg.get("session_id") or state.session_id

            if msg_type == "control":
                action = payload.get("action")
                await send_status(f"control:{action or 'noop'}")

            elif msg_type == "audio_chunk":
                data_b64 = payload.get("data_b64")
                mime = payload.get("mime")
                if not data_b64:
                    await send_status("Missing data_b64 in audio_chunk", code="error")
                    continue
                try:
                    chunk = base64.b64decode(data_b64)
                except Exception:
                    await send_status("Invalid base64 in audio_chunk", code="error")
                    continue
                state.audio_chunks.append(chunk)
                state.audio_mime = mime or state.audio_mime

            elif msg_type == "audio_end":
                if not state.audio_chunks:
                    await send_status("No audio buffered", code="warn")
                    continue
                audio_bytes = b"".join(state.audio_chunks)
                # reset buffer early to avoid growth
                state.audio_chunks.clear()
                try:
                    text = transcribe_audio_bytes(audio_bytes, state.audio_mime)
                except HTTPException as he:
                    await send_status(f"Transcription error: {he.detail}", code="error")
                    continue
                await ws.send_json({"type": "asr_final", "payload": {"text": text}})

            elif msg_type == "text":
                text = payload.get("text")
                if not text:
                    await send_status("Missing text", code="error")
                    continue
                final_text_parts: list[str] = []
                try:
                    async for token in stream_llm_tokens(text):
                        final_text_parts.append(token)
                        await ws.send_json({"type": "llm_token", "payload": {"token": token}})
                except Exception as e:
                    await send_status(f"LLM stream error: {e}", code="error")
                    continue
                await ws.send_json({"type": "llm_final", "payload": {"text": "".join(final_text_parts)}})

            elif msg_type == "image":
                data_url = payload.get("data_url")
                if not data_url:
                    await send_status("Missing data_url in image", code="error")
                    continue
                # optional metadata for plan generation
                target_language = payload.get("target_language", "Spanish")
                source_language = payload.get("source_language", "English")
                location = payload.get("location", "US")
                actions = payload.get("actions") or ["name", "describe", "compare"]
                try:
                    # TODO: generating a plan isn't the only thing to do here
                    # want to handle object checks, 
                    plan = await generate_plan_from_data_url(
                        image_data_url=data_url,
                        target_language=target_language,
                        source_language=source_language,
                        location=location,
                        actions=actions,
                    )
                except HTTPException as he:
                    await send_status(f"Plan generation error: {he.detail}", code="error")
                    continue
                await ws.send_json({"type": "plan", "payload": plan.model_dump()})

            else:
                await send_status(f"Unknown message type: {msg_type}", code="error")

    except WebSocketDisconnect:
        # client disconnected
        pass
    finally:
        # Close only if still connected to avoid double-close RuntimeError
        try:
            if getattr(ws, "client_state", None) not in (WebSocketState.DISCONNECTED, None):
                await ws.close()
        except Exception:
            # Safely ignore any close errors
            pass


