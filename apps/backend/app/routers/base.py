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
from app.prompts.chat_prompts import generate_plan_prompt, prompt_next_object, evaluate_response_prompt
from app.schemas.plan import Plan, Object
from app.schemas.evaluation import EvaluationResult
from app.utils.storage import append_dialogue_entry, save_session_data, load_session_data
from app.routers.lesson_graph import create_lesson_graph
import uuid
from datetime import datetime

from pydantic import BaseModel


router = APIRouter(tags=["base"])

# create lesson graph instance
lesson_graph = create_lesson_graph()


def get_next_object_index(plan: Plan, completed_objects: list[tuple[int, bool]]) -> int:
    """Get the next untested object index."""
    completed_indices = {idx for idx, _ in completed_objects}
    for i, obj in enumerate(plan.objects):
        if i not in completed_indices:
            return i
    return -1  # all objects tested


async def generate_prompt_message(object: Object, target_language: str) -> str:
    """Generate a prompt message asking user to interact with an object."""
    prompt_value = prompt_next_object.invoke({
        "source_name": object.source_name,
        "target_name": object.target_name,
        "target_language": target_language,
    })
    llm = ChatOpenAI(model=settings.llm_model, api_key=settings.openai_api_key)
    messages = prompt_value.to_messages()
    response = llm.invoke(messages)
    return response.content if hasattr(response, 'content') else str(response)


async def process_audio_image_pair(
    ws: WebSocket,
    state: SessionState,
    transcription: str,
    image_data_url: str,
    utterance_id: str,
    image_metadata: dict,
) -> None:
    """Process paired audio transcription and image for evaluation."""
    if not state.plan or state.current_object_index < 0:
        await ws.send_json({"type": "status", "payload": {"code": "error", "message": "No active lesson"}})
        return
    
    current_object = state.plan.objects[state.current_object_index]
    
    # evaluate response
    try:
        eval_result = await evaluate_response(
            transcription=transcription,
            image_data_url=image_data_url,
            plan=state.plan,
            current_object=current_object,
            target_language=image_metadata["target_language"],
            source_language=image_metadata["source_language"],
        )
    except Exception as e:
        await ws.send_json({"type": "status", "payload": {"code": "error", "message": f"Evaluation error: {e}"}})
        return
    
    # mark object as completed
    state.completed_objects.append((state.current_object_index, eval_result.correct))
    
    # save user entry with image and evaluation
    # storing this locally for debugging purposes - TBD if/how to store this long term
    if state.session_id:
        append_dialogue_entry(state.session_id, {
            "speaker": "user",
            "text": transcription,
            "utterance_id": utterance_id,
            "image_data_url": image_data_url,
            "evaluation": {
                "correct": eval_result.correct,
                "object_tested": eval_result.object_tested.model_dump(),
                "correct_word": eval_result.correct_word,
            },
        })
    
    # send evaluation result
    await ws.send_json({
        "type": "evaluation_result",
        "payload": {
            "correct": eval_result.correct,
            "feedback": eval_result.feedback_message,
            "object_index": state.current_object_index,
            "object": current_object.model_dump(),
            "correct_word": eval_result.correct_word,
        },
    })
    
    # save system feedback
    if state.session_id:
        append_dialogue_entry(state.session_id, {
            "speaker": "system",
            "text": eval_result.feedback_message,
        })
    
    # check if there are more objects
    next_idx = get_next_object_index(state.plan, state.completed_objects)
    
    if next_idx >= 0:
        # more objects to test -> prompt next
        state.current_object_index = next_idx
        prompt_msg = await generate_prompt_message(state.plan.objects[next_idx], image_metadata["target_language"])
        await ws.send_json({"type": "prompt_next", "payload": {"text": prompt_msg, "object_index": next_idx}})
        
        if state.session_id:
            append_dialogue_entry(state.session_id, {
                "speaker": "system",
                "text": prompt_msg,
            })
    else:
        # all objects tested -> generate summary
        dialogue_entries = []
        if state.session_id:
            session_data = load_session_data(state.session_id)
            if session_data:
                dialogue_entries = session_data.get("entries", [])
        
        summary = generate_summary(state.plan, state.completed_objects, dialogue_entries)
        
        if state.session_id:
            save_session_data(state.session_id, {
                "summary": summary,
            })
        
        await ws.send_json({
            "type": "lesson_complete",
            "payload": summary,
        })


def generate_summary(plan: Plan, completed_objects: list[tuple[int, bool]], dialogue_entries: list[dict]) -> dict:
    """Generate lesson summary from completed objects and dialogue history."""
    summary_items = []
    for idx, correct in completed_objects:
        if idx < len(plan.objects):
            obj = plan.objects[idx]
            # find the evaluation entry for this object
            user_text = ""
            for entry in dialogue_entries:
                if entry.get("speaker") == "user" and entry.get("evaluation"):
                    eval_obj = entry.get("evaluation", {}).get("object_tested", {})
                    if isinstance(eval_obj, dict) and eval_obj.get("source_name") == obj.source_name:
                        user_text = entry.get("text", "")
                        break
            
            summary_items.append({
                "object": {
                    "source_name": obj.source_name,
                    "target_name": obj.target_name,
                    "action": obj.action,
                },
                "correct": correct,
                "user_said": user_text,
                "correct_word": obj.target_name,
            })
    
    return {
        "items": summary_items,
        "total": len(summary_items),
        "correct_count": sum(1 for _, correct in completed_objects if correct),
        "incorrect_count": sum(1 for _, correct in completed_objects if not correct),
    }


class SessionState:
    """Per-connection state for streaming session."""

    def __init__(self) -> None:
        self.session_id: Optional[str] = None
        self.audio_chunks: list[bytes] = []
        self.audio_mime: Optional[str] = None
        # lesson state
        self.plan: Optional[Plan] = None
        self.current_object_index: int = -1
        self.completed_objects: list[tuple[int, bool]] = []  # List of (index, correct) tuples
        self.dialogue_history: list[dict[str, Any]] = []
        # pending audio/image pairing
        self.pending_transcription: Optional[tuple[str, str]] = None  # (utterance_id, transcription)
        self.pending_image: Optional[tuple[str, str, dict]] = None  # (utterance_id, data_url, metadata)


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


async def evaluate_response(
    transcription: str,
    image_data_url: str,
    plan: Plan,
    current_object: Object,
    target_language: str,
    source_language: str,
) -> EvaluationResult:
    """Evaluate if the user's transcription matches the expected object and word."""
    if not settings.openai_api_key:
        raise HTTPException(status_code=500, detail="Missing OPENAI_API_KEY")

    prompt_value = evaluate_response_prompt.invoke({
        "object_source_name": current_object.source_name,
        "object_target_name": current_object.target_name,
        "transcription": transcription,
        "target_language": target_language,
        "source_language": source_language,
    })
    system_msg = prompt_value.to_messages()[0]
    user_msg = prompt_value.to_messages()[1]

    # replace the placeholder in user message with actual image
    user_content = user_msg.content
    if isinstance(user_content, str):
        # find the [provided as image_url] placeholder and replace it
        user_content = user_content.replace(
            "[provided as image_url]",
            ""
        )
        user_msg_content = [
            {"type": "text", "text": user_content},
            {"type": "image_url", "image_url": {"url": image_data_url}},
        ]
    else:
        user_msg_content = user_content

    user_msg_final = HumanMessage(content=user_msg_content)

    llm = ChatOpenAI(model=settings.llm_model, api_key=settings.openai_api_key)
    
    # use structured output for evaluation
    
    
    class EvaluationCheck(BaseModel):
        correct: bool
        object_matches: bool
        word_correct: bool
        feedback_message: str
    
    structured = llm.with_structured_output(EvaluationCheck)
    result = structured.invoke([system_msg, user_msg_final])
    
    return EvaluationResult(
        correct=result.correct,
        object_tested=current_object,
        correct_word=current_object.target_name,
        feedback_message=result.feedback_message,
        transcription=transcription,
    )


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
                utterance_id = payload.get("utterance_id") or str(uuid.uuid4())
                
                try:
                    text = transcribe_audio_bytes(audio_bytes, state.audio_mime)
                except HTTPException as he:
                    await send_status(f"Transcription error: {he.detail}", code="error")
                    continue
                
                # store transcription, waiting for image to pair
                state.pending_transcription = (utterance_id, text)
                await ws.send_json({"type": "asr_final", "payload": {"text": text, "utterance_id": utterance_id}})
                
                # check if we have both transcription and image for this utterance_id
                if state.pending_image and state.pending_image[0] == utterance_id:
                    # process together
                    image_data_url, image_metadata = state.pending_image[1], state.pending_image[2]
                    await process_audio_image_pair(ws, state, text, image_data_url, utterance_id, image_metadata)
                    state.pending_transcription = None
                    state.pending_image = None

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
                
                utterance_id = payload.get("utterance_id")
                target_language = payload.get("target_language", "Spanish")
                source_language = payload.get("source_language", "English")
                location = payload.get("location", "US")
                actions = payload.get("actions") or ["name", "describe", "compare"]
                
                image_metadata = {
                    "target_language": target_language,
                    "source_language": source_language,
                    "location": location,
                    "actions": actions,
                }
                
                # if this is initial plan (no utterance_id or no plan exists)
                if not utterance_id or not state.plan:
                    try:
                        plan = await generate_plan_from_data_url(
                            image_data_url=data_url,
                            target_language=target_language,
                            source_language=source_language,
                            location=location,
                            actions=actions,
                        )
                        state.plan = plan
                        state.current_object_index = -1
                        state.completed_objects = []
                        state.session_id = state.session_id or str(uuid.uuid4())
                        
                        # save initial plan to dialogue
                        if state.session_id:
                            save_session_data(state.session_id, {
                                "plan": plan.model_dump(),
                                "entries": [],
                            })
                            append_dialogue_entry(state.session_id, {
                                "speaker": "system",
                                "text": plan.scene_message,
                            })
                        
                        await ws.send_json({"type": "plan", "payload": plan.model_dump()})
                        
                        # move to prompt user for first object
                        next_idx = get_next_object_index(plan, state.completed_objects)
                        if next_idx >= 0:
                            state.current_object_index = next_idx
                            prompt_msg = await generate_prompt_message(plan.objects[next_idx], target_language)
                            await ws.send_json({"type": "prompt_next", "payload": {"text": prompt_msg, "object_index": next_idx}})
                            
                            # save prompt to dialogue
                            if state.session_id:
                                append_dialogue_entry(state.session_id, {
                                    "speaker": "system",
                                    "text": prompt_msg,
                                })
                    except HTTPException as he:
                        await send_status(f"Plan generation error: {he.detail}", code="error")
                        continue
                else:
                    # this is a response image - store for pairing with audio
                    state.pending_image = (utterance_id, data_url, image_metadata)
                    
                    # check if we have both transcription and image for this utterance_id
                    if state.pending_transcription and state.pending_transcription[0] == utterance_id:
                        # process together
                        transcription = state.pending_transcription[1]
                        await process_audio_image_pair(ws, state, transcription, data_url, utterance_id, image_metadata)
                        state.pending_transcription = None
                        state.pending_image = None

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


