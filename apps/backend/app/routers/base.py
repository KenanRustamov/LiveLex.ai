from __future__ import annotations
import asyncio
import base64
import io
import json
import os
import warnings
from typing import Any, AsyncGenerator, Optional

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Query
from starlette.websockets import WebSocketState
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from openai import OpenAI
from pydub import AudioSegment

# Suppress pydub warnings about missing ffprobe (we handle this explicitly)
warnings.filterwarnings("ignore", category=RuntimeWarning, module="pydub")

from app.core.config import settings
from app.prompts.chat_prompts import generate_plan_prompt, prompt_next_object, evaluate_response_prompt, generate_hint_prompt, give_answer_with_memory_aid_prompt, detect_intent_prompt
from app.schemas.plan import Plan, Object
from app.schemas.evaluation import EvaluationResult
from app.utils.storage import append_dialogue_entry, save_session_data, load_session_data
from app.utils.performance import track_performance
from app.routers.lesson_graph import create_lesson_graph
from app.db.repository import (
    save_user_lesson_db,
    get_user_progress_db,
    get_user_object_stats_db,
)
import uuid
from datetime import datetime, timezone

from pydantic import BaseModel

import logging


router = APIRouter(tags=["base"])

# Lesson graph will be created per-request with WebSocket binding
# See invoke_lesson_graph helper function


def session_state_to_lesson_state(
    session_state: SessionState,
    ws: WebSocket,
    image_metadata: dict | None = None
) -> dict:
    """Convert SessionState to LessonState for graph invocation."""
    from app.routers.lesson_graph import LessonState
    
    # Extract image metadata if provided, otherwise use defaults
    if image_metadata:
        target_language = image_metadata.get("target_language", "Spanish")
        source_language = image_metadata.get("source_language", "English")
        location = image_metadata.get("location", "US")
        actions = image_metadata.get("actions", ["name", "describe", "compare"])
        proficiency_level = image_metadata.get("proficiency_level", 1)
    else:
        target_language = "Spanish"
        source_language = "English"
        location = "US"
        actions = ["name", "describe", "compare"]
        proficiency_level = 1
    
    lesson_state: dict = {
        "plan": session_state.plan,
        "current_object_index": session_state.current_object_index,
        "completed_objects": session_state.completed_objects.copy() if session_state.completed_objects else [],
        "item_attempts": session_state.item_attempts.copy() if session_state.item_attempts else {},
        "item_hints_used": session_state.item_hints_used.copy() if session_state.item_hints_used else {},
        "item_gave_up": session_state.item_gave_up.copy() if session_state.item_gave_up else {},
        "waiting_for_repeat": session_state.waiting_for_repeat,
        "lesson_state": "PROMPT_USER",  # Default starting state
        "target_language": target_language,
        "source_language": source_language,
        "location": location,
        "actions": actions,
        "proficiency_level": proficiency_level,
        "lesson_completed": session_state.lesson_saved,
        "session_id": session_state.session_id,
        "username": session_state.username,
        "image_metadata": image_metadata,
        "pending_transcription": session_state.pending_transcription,
        "pending_image": session_state.pending_image,
        "evaluation_result": None,
        "prompt_message": None,
    }
    
    return lesson_state


def lesson_state_to_session_state(
    lesson_state: dict,
    session_state: SessionState
) -> SessionState:
    """Update SessionState with values from LessonState after graph execution."""
    session_state.plan = lesson_state.get("plan")
    session_state.current_object_index = lesson_state.get("current_object_index", -1)
    session_state.completed_objects = lesson_state.get("completed_objects", []).copy()
    # Persist attempt counts and hint/gave_up tracking so retries are tracked across graph invocations
    session_state.item_attempts = lesson_state.get("item_attempts", {}).copy()
    session_state.item_hints_used = lesson_state.get("item_hints_used", {}).copy()
    session_state.item_gave_up = lesson_state.get("item_gave_up", {}).copy()
    session_state.waiting_for_repeat = lesson_state.get("waiting_for_repeat", False)
    # Track whether the lesson has been completed by the graph
    session_state.lesson_saved = bool(lesson_state.get("lesson_completed", session_state.lesson_saved))
    session_state.pending_transcription = lesson_state.get("pending_transcription")
    session_state.pending_image = lesson_state.get("pending_image")
    # Note: lesson_state, username, session_id are already in SessionState
    return session_state


async def invoke_lesson_graph(
    state: dict,
    ws: WebSocket,
    entry_node: str | None = None
) -> dict:
    """Invoke the lesson graph with current state and WebSocket context.
    
    Args:
        state: LessonState dictionary
        ws: WebSocket connection for sending messages
        entry_node: Optional node to start from (defaults to graph entry point)
        - "prompt_user": Start from prompt_user node (default entry point)
        - "evaluate": Manually execute evaluate -> feedback -> (prompt_user or complete)
    
    Returns:
        Updated LessonState dictionary
    """
    from app.routers.lesson_graph import create_lesson_graph, evaluate_node, feedback_node, prompt_user_node
    
    try:
        if entry_node == "evaluate":
            # For evaluate, manually execute the nodes
            # (LangGraph doesn't support starting from arbitrary nodes)
            # Execute: evaluate -> feedback -> (prompt_user if more objects, else done)
            
            state = await evaluate_node(state, ws)
            
            state = await feedback_node(state, ws)
            
            # If feedback node set lesson_state to PROMPT_USER, execute prompt_user
            if state.get("lesson_state") == "PROMPT_USER":
                state = await prompt_user_node(state, ws)
            
            return state
        else:
            # Default: use graph starting from entry point (prompt_user)
            graph = create_lesson_graph(ws=ws)
            result = await graph.ainvoke(state)
            return result
    except Exception as e:
        # Log error and return state as-is w/ error indicator
        logging.error(f"Graph invocation error: {e}", exc_info=True)
        return {**state, "lesson_state": "FEEDBACK", "_error": str(e)}


def get_next_object_index(plan: Plan, completed_objects: list[tuple[int, bool]]) -> int:
    """Get the next untested object index."""
    completed_indices = {idx for idx, _ in completed_objects}
    for i, obj in enumerate(plan.objects):
        if i not in completed_indices:
            return i
    return -1  # all objects tested


async def generate_prompt_message(
    object: Object, 
    target_language: str, 
    proficiency_level: int, 
    attempt_number: int = 1,
    max_attempts: int = 3,
    state: Optional[SessionState] = None
) -> str:
    """Generate a prompt message asking user to interact with an object.
    
    Args:
        object: The object to prompt for
        target_language: Target language for learning
        proficiency_level: User's proficiency level (1-5)
        attempt_number: Current attempt number (1-based)
        max_attempts: Maximum attempts allowed (default 3)
        state: Optional session state for tracking
    """
    session_id = state.session_id if state else None
    username = state.username if state else None
    is_retry = attempt_number > 1
    
    async with track_performance(
        operation_type="prompt_generation",
        operation_name="generate_prompt_message",
        session_id=session_id,
        username=username,
        metadata={
            "model": settings.llm_model, 
            "target_language": target_language, 
            "proficiency_level": proficiency_level,
            "attempt_number": attempt_number,
            "max_attempts": max_attempts
        }
    ):
        prompt_value = prompt_next_object.invoke({
            "source_name": object.source_name,
            "target_name": object.target_name,
            "target_language": target_language,
            "proficiency_level": proficiency_level,
            "attempt_number": attempt_number,
            "max_attempts": max_attempts,
            "is_retry": is_retry,
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
    """
    Process paired audio transcription and image for evaluation.
    No longer used - logic integrated into LangGraph nodes (TODO: remove later)
    """
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
            proficiency_level=image_metadata["proficiency_level"],
            state=state,
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
    
    # generate TTS audio for feedback
    feedback_audio = None
    if eval_result.feedback_message:
        feedback_audio = await generate_tts_audio(eval_result.feedback_message, state=state)
    
    # send evaluation result
    payload = {
        "correct": eval_result.correct,
        "feedback": eval_result.feedback_message,
        "object_index": state.current_object_index,
        "object": current_object.model_dump(),
        "correct_word": eval_result.correct_word,
    }
    if feedback_audio:
        payload["audio"] = feedback_audio
    
    await ws.send_json({
        "type": "evaluation_result",
        "payload": payload,
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
        prompt_msg = await generate_prompt_message(
            state.plan.objects[next_idx], 
            image_metadata["target_language"], 
            image_metadata["proficiency_level"], 
            attempt_number=1,
            max_attempts=3,
            state=state
        )
        
        # generate TTS audio for prompt
        prompt_audio = None
        if prompt_msg:
            prompt_audio = await generate_tts_audio(prompt_msg, state=state)
        
        payload = {"text": prompt_msg, "object_index": next_idx}
        if prompt_audio:
            payload["audio"] = prompt_audio
        
        await ws.send_json({"type": "prompt_next", "payload": payload})
        
        if state.session_id:
            append_dialogue_entry(state.session_id, {
                "speaker": "system",
                "text": prompt_msg,
            })
    else:
        # all objects tested -> generate summary
        if not state.lesson_saved:
            dialogue_entries = []
            if state.session_id:
                session_data = load_session_data(state.session_id)
                if session_data:
                    dialogue_entries = session_data.get("entries", [])
            
            summary = generate_summary(state.plan, state.completed_objects, dialogue_entries, state.item_attempts, state.item_hints_used, state.item_gave_up)
            
            if state.session_id:
                save_session_data(state.session_id, {
                    "summary": summary,
                })

            if state.username:
                await save_user_lesson_db(
                    username=state.username,
                    session_id=state.session_id,
                    summary=summary,
                )
            
            state.lesson_saved = True
        
            await ws.send_json({
                "type": "lesson_complete",
                "payload": summary,
            })


def generate_summary(
    plan: Plan, 
    completed_objects: list[tuple[int, bool]], 
    dialogue_entries: list[dict], 
    item_attempts: dict[int, int] = None,
    item_hints_used: dict[int, int] = None,
    item_gave_up: dict[int, int] = None
) -> dict:
    """Generate lesson summary from completed objects and dialogue history."""
    if item_attempts is None:
        item_attempts = {}
    if item_hints_used is None:
        item_hints_used = {}
    if item_gave_up is None:
        item_gave_up = {}
    
    summary_items = []
    for idx, correct in completed_objects:
        if idx < len(plan.objects):
            obj = plan.objects[idx]
            # collect all attempts for this object
            attempts: list[dict] = []
            for entry in dialogue_entries:
                if entry.get("speaker") == "user" and entry.get("evaluation"):
                    eval_obj = entry.get("evaluation", {}).get("object_tested", {})
                    if isinstance(eval_obj, dict) and eval_obj.get("source_name") == obj.source_name:
                        attempts.append({
                            "text": entry.get("text", ""),
                            "correct": bool(entry.get("evaluation", {}).get("correct", False)),
                        })

            # choose a representative "user_said" string for backwards compatibility
            user_text = attempts[-1]["text"] if attempts else ""
            
            # Get attempt count for this item (default to 1 if not tracked)
            attempt_count = item_attempts.get(idx, 1)
            hints_used = item_hints_used.get(idx, 0)
            gave_up = item_gave_up.get(idx, 0) > 0  # Convert to boolean
            
            summary_items.append({
                "object": {
                    "source_name": obj.source_name,
                    "target_name": obj.target_name,
                    "action": obj.action,
                },
                "correct": correct,
                "user_said": user_text,
                "correct_word": obj.target_name,
                "attempts": attempt_count,
                "hints_used": hints_used,
                "gave_up": gave_up,
            })
    
    return {
        "items": summary_items,
        "total": len(summary_items),
        "correct_count": sum(1 for _, correct in completed_objects if correct),
        "incorrect_count": sum(1 for _, correct in completed_objects if not correct),
    }

def save_user_lesson(username: str, session_id: str, summary: dict, output_path: str = "data/user_data/user_lessons.json"):
    """Update JSON file with per-user progress and append session summaries."""
    
    # Ensure directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    # Load existing data
    if os.path.exists(output_path):
        with open(output_path, "r", encoding="utf-8") as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError:
                data = {}
    else:
        data = {}

    # Ensure user entry exists
    if username not in data:
        data[username] = {"objects": {}, "sessions": []}

    user_data = data[username]
    objects = user_data["objects"]

    # Process each item in the summary
    for item in summary.get("items", []):
        obj_name = item["object"]["source_name"]
        correct_word = item["object"]["target_name"]
        user_said = item.get("user_said") or ""
        correct = item.get("correct", False)
        attempts = item.get("attempts", 1)

        # Initialize object if not exists
        if obj_name not in objects:
            objects[obj_name] = {
                "correct": 0,
                "incorrect": 0,
                "total_attempts": 0,
                "last_correct": None,
                "last_user_said": None,
                "correct_word": correct_word,
                "last_attempted": None,
                "last_attempts": None,
            }

        obj = objects[obj_name]

        # Increment counts
        if correct:
            obj["correct"] += 1
        else:
            obj["incorrect"] += 1
        
        # Track total attempts across all sessions
        obj["total_attempts"] = obj.get("total_attempts", 0) + attempts

        # Update last attempt details
        obj["last_correct"] = correct
        obj["last_user_said"] = user_said
        obj["correct_word"] = correct_word
        obj["last_attempted"] = datetime.now(timezone.utc).isoformat()
        obj["last_attempts"] = attempts

    # Append session summary
    user_data["sessions"].append({
        "session_id": session_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "summary": summary
    })

    # Save back to file with proper formatting
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"Saved lesson data for user '{username}' to {output_path}")

def get_user_progress(username: str, output_path: str = "data/all_users/all_users.json") -> dict:
    """Retrieve progress data for a specific user."""
    if not os.path.exists(output_path):
        return {"objects": {}, "sessions": []}
    
    try:
        with open(output_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get(username, {"objects": {}, "sessions": []})
    except (json.JSONDecodeError, IOError):
        return {"objects": {}, "sessions": []}


def get_user_object_stats(username: str, object_name: str, output_path: str = "data/all_users/all_users.json") -> dict | None:
    """Retrieve stats for a specific object for a user."""
    user_data = get_user_progress(username, output_path)
    return user_data["objects"].get(object_name)

class SessionState:
    """Per-connection state for streaming session."""

    def __init__(self) -> None:
        self.session_id: Optional[str] = None
        self.audio_chunks: list[bytes] = []
        self.audio_mime: Optional[str] = None
        self.username: Optional[str] = None # Subject to change if creating user accounts later
        # lesson state
        self.plan: Optional[Plan] = None
        self.current_object_index: int = -1
        self.completed_objects: list[tuple[int, bool]] = []  # List of (index, correct) tuples
        self.item_attempts: dict[int, int] = {}  # tracks attempts per item index
        self.item_hints_used: dict[int, int] = {}  # tracks hints used per item (max 2)
        self.item_gave_up: dict[int, int] = {}  # tracks "don't know" count per item (max 2)
        self.waiting_for_repeat: bool = False  # flag when waiting for user to repeat after being given answer
        self.dialogue_history: list[dict[str, Any]] = []
        self.lesson_saved: bool = False
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


async def generate_tts_audio(text: str, voice: str = None, state: Optional[SessionState] = None) -> Optional[str]:
    """Generate TTS audio from text using OpenAI TTS API. Returns base64-encoded audio data."""
    if not settings.openai_api_key:
        return None
    
    if not text or not text.strip():
        return None
    
    session_id = state.session_id if state else None
    username = state.username if state else None
    
    try:
        async with track_performance(
            operation_type="tts",
            operation_name="generate_tts_audio",
            session_id=session_id,
            username=username,
            metadata={"text_length": len(text), "model": settings.speech_synthesis_model}
        ):
            client = OpenAI(api_key=settings.openai_api_key)
            voice_to_use = voice or settings.tts_voice
            
            response = client.audio.speech.create(
                model=settings.speech_synthesis_model,
                voice=voice_to_use,
                input=text,
            )
            
            # Read audio bytes
            audio_bytes = response.content
            
            # Encode to base64 for JSON transmission
            audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
            return audio_base64
    except Exception as e:
        # Log error but don't fail the request if TTS fails
        print(f"TTS generation error: {e}")
        return None


async def transcribe_audio_bytes(audio_bytes: bytes, mime: Optional[str], state: Optional[SessionState] = None) -> str:
    """Transcribe buffered audio bytes using OpenAI transcription API."""
    if not settings.openai_api_key:
        raise HTTPException(status_code=500, detail="Missing OPENAI_API_KEY")

    session_id = state.session_id if state else None
    username = state.username if state else None

    # Heuristic: pick filename extension based on mime if provided, default to .webm
    ext = "webm"
    if mime and "/" in mime:
        candidate = mime.split("/")[-1].split(";")[0].strip()
        if candidate:
            ext = candidate

    original_audio_bytes = audio_bytes
    converted = False
    is_webm = ext.lower() == "webm" or (mime and "webm" in mime.lower())

    # Convert WebM to WAV (Firefox records in WebM, incompatible w/ OpenAI API)
    if is_webm:
        try:
            # Validate WebM file is not empty
            if len(audio_bytes) < 100:  # WebM files should be at least a few hundred bytes
                raise HTTPException(
                    status_code=400, 
                    detail="Audio file appears to be empty or incomplete. Please ensure the recording was properly stopped."
                )
            
            # Load WebM audio and convert to WAV
            audio = AudioSegment.from_file(io.BytesIO(original_audio_bytes), format="webm")
            # Export to WAV format in memory
            wav_buffer = io.BytesIO()
            audio.export(wav_buffer, format="wav")
            wav_buffer.seek(0)
            audio_bytes = wav_buffer.read()
            ext = "wav"
            converted = True
        except HTTPException:
            raise
        except Exception as e:
            # Check if error is due to missing ffmpeg/ffprobe
            error_str = str(e).lower()
            if any(keyword in error_str for keyword in ["ffprobe", "ffmpeg", "no such file or directory: 'ffprobe'", "no such file or directory: 'ffmpeg'"]):
                raise HTTPException(
                    status_code=500,
                    detail="Audio conversion requires ffmpeg to be installed. Please install ffmpeg (e.g., 'brew install ffmpeg' on macOS, 'apt-get install ffmpeg' on Ubuntu) to convert WebM audio files."
                )
            # Check if error indicates corrupted/incomplete WebM
            if any(keyword in error_str for keyword in ["ebml", "parsing failed", "invalid data", "corrupted", "incomplete"]):
                raise HTTPException(
                    status_code=400,
                    detail=f"Audio file appears to be corrupted or incomplete. This can happen if the recording wasn't properly finalized. Error: {str(e)[:200]}"
                )
            # For other conversion errors, log and try original format (will likely fail)
            logging.warning(f"Failed to convert WebM to WAV: {e}. Attempting with original format (may fail).")
            

    buf = io.BytesIO(audio_bytes)
    buf.name = f"audio.{ext}"

    async with track_performance(
        operation_type="transcription",
        operation_name="transcribe_audio_bytes",
        session_id=session_id,
        username=username,
        metadata={"audio_size_bytes": len(audio_bytes), "mime_type": mime, "model": settings.transcription_model}
    ):
        client = OpenAI(api_key=settings.openai_api_key)
        try:
            # Run synchronous OpenAI call in thread to avoid blocking
            resp = await asyncio.to_thread(
                client.audio.transcriptions.create,
                model=settings.transcription_model,
                file=buf,
            )
            text = getattr(resp, "text", None)
            if not text:
                raise HTTPException(status_code=502, detail="Transcription failed")
            return text
        except Exception as e:
            # If we tried original WebM and it failed
            if is_webm and not converted:
                raise HTTPException(
                    status_code=400,
                    detail=f"Failed to process WebM audio file. The file may be corrupted or incomplete. Please try recording again. Original error: {str(e)[:200]}"
                )
            # Re-raise other errors
            if isinstance(e, HTTPException):
                raise
            logging.error(f"Transcription error: {e}")
            raise HTTPException(status_code=500, detail=f"Transcription error: {e}")


async def detect_user_intent(
    transcription: str,
    context_message: Optional[str] = None,
    state: Optional[SessionState] = None
) -> str:
    """Detect user intent from transcription.
    
    Returns:
        "hint_request": User is asking for a hint
        "dont_know": User doesn't know the answer or wants the answer
        "answer_attempt": User is attempting to say the word
    """
    if not transcription:
        return "answer_attempt"
    
    text_lower = transcription.lower().strip()
    
    # Check for hint requests
    hint_keywords = [
        "hint", "help", "clue", "give me a hint", "can you help", "i need help",
        "what's a hint", "ayuda", "pista", "ayúdame"
    ]

    if any(keyword in text_lower for keyword in hint_keywords):
        return "hint_request"
    
    # Check for "don't know" / give up
    dont_know_keywords = [
        "don't know", "dont know", "no se", "no sé", "i give up", "give up",
        "tell me", "what is it", "what's the answer", "show me", "i can't",
        "i dont know", "i don't know", "skip", "pass"
    ]

    if any(keyword in text_lower for keyword in dont_know_keywords):
        return "dont_know"
    
    # LLM fallback
    if context_message and settings.openai_api_key:
        return await detect_user_intent_with_llm(transcription, context_message, state)
    
    # Default to answer attempt
    return "answer_attempt"


async def detect_user_intent_with_llm(
    transcription: str,
    context_message: str,
    state: Optional[SessionState] = None
) -> str:
    """Detect user intent using LLM with conversation context.

    Returns:
        "hint_request", "dont_know", or "answer_attempt"
    """
    if not settings.openai_api_key:
        logging.warning("OpenAI API key not available for LLM intent detection, defaulting to answer_attempt")
        return "answer_attempt"
    
    try:
        llm = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0.0,
            api_key=settings.openai_api_key
        )
        
        prompt = detect_intent_prompt.invoke({
            "context_message": context_message or "No previous context",
            "transcription": transcription
        })
        
        # Track performance if state is available
        if state and state.session_id:
            with track_performance("detect_intent_llm", state.session_id):
                response = await llm.ainvoke(prompt.messages)
        else:
            response = await llm.ainvoke(prompt.messages)
        
        intent = response.content.strip().lower()
        
        # Ensure it's one of the valid intents
        if intent in ["hint_request", "dont_know", "answer_attempt"]:
            return intent
        else:
            logging.warning(f"LLM returned invalid intent '{intent}', defaulting to answer_attempt")
            return "answer_attempt"
            
    except Exception as e:
        logging.error(f"Error in LLM intent detection: {e}")
        # Fallback to answer_attempt on error
        return "answer_attempt"


async def generate_hint(
    object: Object,
    target_language: str,
    source_language: str,
    proficiency_level: int,
    hint_number: int,
    state: Optional[SessionState] = None
) -> str:
    """Generate a hint for a word using LLM."""
    
    if not settings.openai_api_key:
        return f"Hint: The word starts with '{object.target_name[0]}'."
    
    session_id = state.session_id if state else None
    username = state.username if state else None
    
    try:
        async with track_performance(
            operation_type="hint_generation",
            operation_name="generate_hint",
            session_id=session_id,
            username=username,
            metadata={"model": settings.llm_model, "hint_number": hint_number}
        ):
            prompt_value = generate_hint_prompt.invoke({
                "target_word": object.target_name,
                "source_name": object.source_name,
                "target_language": target_language,
                "source_language": source_language,
                "proficiency_level": proficiency_level,
                "hint_number": hint_number,
            })
            
            llm = ChatOpenAI(model=settings.llm_model, api_key=settings.openai_api_key)
            messages = prompt_value.to_messages()
            response = llm.invoke(messages)
            return response.content if hasattr(response, 'content') else str(response)
    except Exception as e:
        logging.error(f"Hint generation error: {e}", exc_info=True)
        # Fallback hint
        if hint_number == 1:
            return f"Hint: The word starts with '{object.target_name[0]}'."
        else:
            return f"Hint: The word starts with '{object.target_name[:min(3, len(object.target_name))]}'..."


async def give_answer_with_memory_aid(
    object: Object,
    target_language: str,
    source_language: str,
    proficiency_level: int,
    state: Optional[SessionState] = None
) -> str:
    """Give the answer with a memory aid to help student remember.
    
    Args:
        object: The object being tested
        target_language: Target language
        source_language: Source language
        proficiency_level: User's proficiency level (1-5)
        state: Optional session state for tracking
        
    Returns:
        Message with answer and memory aid
    """
    if not settings.openai_api_key:
        return f"The correct answer is '{object.target_name}'. Please repeat: {object.target_name}"
    
    session_id = state.session_id if state else None
    username = state.username if state else None
    
    try:
        async with track_performance(
            operation_type="answer_with_memory_aid",
            operation_name="give_answer_with_memory_aid",
            session_id=session_id,
            username=username,
            metadata={"model": settings.llm_model}
        ):
            prompt_value = give_answer_with_memory_aid_prompt.invoke({
                "target_word": object.target_name,
                "source_name": object.source_name,
                "target_language": target_language,
                "source_language": source_language,
                "proficiency_level": proficiency_level,
            })
            
            llm = ChatOpenAI(model=settings.llm_model, api_key=settings.openai_api_key)
            messages = prompt_value.to_messages()
            response = llm.invoke(messages)
            return response.content if hasattr(response, 'content') else str(response)
    except Exception as e:
        logging.error(f"Answer with memory aid generation error: {e}", exc_info=True)
        # Fallback answer
        return f"The correct answer is '{object.target_name}'. Please repeat: {object.target_name}"


async def evaluate_response(
    transcription: str,
    image_data_url: str,
    plan: Plan,
    current_object: Object,
    target_language: str,
    source_language: str,
    proficiency_level: int,
    attempt_number: int = 1,
    max_attempts: int = 3,
    state: Optional[SessionState] = None,
) -> EvaluationResult:
    """Evaluate if the user's transcription matches the expected object and word.
    
    Args:
        transcription: User's spoken response
        image_data_url: Image showing what user is holding/pointing at
        plan: Lesson plan
        current_object: Object being tested
        target_language: Target language
        source_language: Source language
        proficiency_level: User's proficiency level (1-5)
        attempt_number: Current attempt number (1-based)
        max_attempts: Maximum attempts allowed (default 3)
        state: Optional session state for tracking
    """
    if not settings.openai_api_key:
        raise HTTPException(status_code=500, detail="Missing OPENAI_API_KEY")

    session_id = state.session_id if state else None
    username = state.username if state else None

    prompt_value = evaluate_response_prompt.invoke({
        "object_source_name": current_object.source_name,
        "object_target_name": current_object.target_name,
        "transcription": transcription,
        "target_language": target_language,
        "source_language": source_language,
        "proficiency_level": proficiency_level,
        "attempt_number": attempt_number,
        "max_attempts": max_attempts,
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

    async with track_performance(
        operation_type="evaluation",
        operation_name="evaluate_response",
        session_id=session_id,
        username=username,
        metadata={"model": settings.llm_model, "transcription_length": len(transcription)}
    ):
        llm = ChatOpenAI(model=settings.llm_model, api_key=settings.openai_api_key)
        
        # use structured output for evaluation
        class EvaluationCheck(BaseModel):
            correct: bool
            object_matches: bool
            word_correct: bool
            error_category: str | None = None
            feedback_message: str
        
        structured = llm.with_structured_output(EvaluationCheck)
        result = structured.invoke([system_msg, user_msg_final])
    
    # If error_category is set, ensure correct is False (safeguard against inconsistent LLM responses)
    correct_result = result.correct
    if result.error_category is not None:
        correct_result = False
        if result.correct:
            # Log inconsistency for debugging
            logging.warning(
                f"LLM returned inconsistent evaluation: correct=True but error_category='{result.error_category}'. "
                f"Forcing correct=False. Transcription: '{transcription}', Expected: '{current_object.target_name}'"
            )
    
    return EvaluationResult(
        correct=correct_result,
        object_tested=current_object,
        correct_word=current_object.target_name,
        feedback_message=result.feedback_message,
        transcription=transcription,
        error_category=result.error_category,
        attempt_number=attempt_number,
    )


async def generate_plan_from_data_url(image_data_url: str, target_language: str, source_language: str, location: str, actions: list[str], state: Optional[SessionState] = None) -> Plan:
    """Invoke the structured Plan generator using the image data URL as a multimodal input."""
    if not settings.openai_api_key:
        raise HTTPException(status_code=500, detail="Missing OPENAI_API_KEY")

    session_id = state.session_id if state else None
    username = state.username if state else None

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

    async with track_performance(
        operation_type="plan_generation",
        operation_name="generate_plan_from_data_url",
        session_id=session_id,
        username=username,
        metadata={"model": settings.llm_model, "target_language": target_language, "source_language": source_language}
    ):
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
                
                if action == "set_username":
                    username = payload.get("username")
                    if username:
                        state.username = username
                        await send_status(f"Username set to: {username}")
                elif action == "end_session":
                    # Gracefully finalize current session: build summary from current progress and dialogue
                    if state.plan:
                        dialogue_entries = []
                        if state.session_id:
                            session_data = load_session_data(state.session_id)
                            if session_data:
                                dialogue_entries = session_data.get("entries", [])

                        summary = generate_summary(state.plan, state.completed_objects, dialogue_entries, state.item_attempts, state.item_hints_used, state.item_gave_up)

                        if state.session_id:
                            save_session_data(state.session_id, {
                                "summary": summary,
                            })

                        if state.username:
                            await save_user_lesson_db(
                                username=state.username,
                                session_id=state.session_id or "",
                                summary=summary,
                            )

                        state.lesson_saved = True

                        await ws.send_json({
                            "type": "lesson_complete",
                            "payload": summary,
                        })

                    # Reset lesson state
                    state.plan = None
                    state.current_object_index = -1
                    state.completed_objects = []
                    state.pending_transcription = None
                    state.pending_image = None
                    await send_status("Session ended")
                elif action == "reset_lesson":
                    # Reset lesson state but keep connection alive
                    state.plan = None
                    state.current_object_index = -1
                    state.completed_objects = []
                    state.pending_transcription = None
                    state.pending_image = None
                    state.lesson_saved = False
                    await send_status("Lesson state reset, ready for new session")
                else:
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
                # If the lesson has already been completed, ignore further audio
                if state.lesson_saved:
                    await send_status("Lesson already complete. Please start a new lesson to continue practicing.", code="warn")
                    # Clear any buffered audio just in case
                    state.audio_chunks.clear()
                    continue
                if not state.audio_chunks:
                    await send_status("No audio buffered", code="warn")
                    continue
                audio_bytes = b"".join(state.audio_chunks)
                # reset buffer early to avoid growth
                state.audio_chunks.clear()
                utterance_id = payload.get("utterance_id") or str(uuid.uuid4())
                
                try:
                    text = await transcribe_audio_bytes(audio_bytes, state.audio_mime, state=state)
                except HTTPException as he:
                    await send_status(f"Transcription error: {he.detail}", code="error")
                    continue
                
                # store transcription, waiting for image to pair
                state.pending_transcription = (utterance_id, text)
                await ws.send_json({"type": "asr_final", "payload": {"text": text, "utterance_id": utterance_id}})
                
                # check if we have both transcription and image for this utterance_id
                if state.pending_image and state.pending_image[0] == utterance_id:
                    # process together using graph
                    image_data_url, image_metadata = state.pending_image[1], state.pending_image[2]
                    
                    # Convert SessionState to LessonState and invoke graph at evaluate node
                    lesson_state = session_state_to_lesson_state(state, ws, image_metadata)
                    lesson_state["pending_transcription"] = (utterance_id, text)
                    lesson_state["pending_image"] = state.pending_image
                    lesson_state["lesson_state"] = "EVALUATE"
                    
                    # Invoke graph starting at evaluate node
                    updated_lesson_state = await invoke_lesson_graph(lesson_state, ws, entry_node="evaluate")
                    
                    # Check for errors in the returned state
                    if "_error" in updated_lesson_state:
                        # Error already logged in invoke_lesson_graph
                        await send_status(f"Graph error: {updated_lesson_state['_error']}", code="error")
                        # State is already updated to FEEDBACK, continue with current state
                    else:
                        # Update SessionState from graph result
                        lesson_state_to_session_state(updated_lesson_state, state)
                        # Clear pending data (should be cleared by graph, but keep redundancy)
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
                
                # If the lesson has already been completed, ignore further images until reset
                if state.lesson_saved:
                    await send_status("Lesson already complete. Please start a new lesson before sending a new image.", code="warn")
                    continue
                
                utterance_id = payload.get("utterance_id")
                target_language = payload.get("target_language", "Spanish")
                source_language = payload.get("source_language", "English")
                location = payload.get("location", "US")
                actions = payload.get("actions") or ["name", "describe", "compare"]
                proficiency_level = payload.get("proficiency_level", 1)
                
                image_metadata = {
                    "target_language": target_language,
                    "source_language": source_language,
                    "location": location,
                    "actions": actions,
                    "proficiency_level": proficiency_level,
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
                            state=state,
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
                        
                        # Convert SessionState to LessonState and invoke graph
                        image_metadata = {
                            "target_language": target_language,
                            "source_language": source_language,
                            "location": location,
                            "actions": actions,
                            "proficiency_level": proficiency_level,
                        }
                        lesson_state = session_state_to_lesson_state(state, ws, image_metadata)
                        lesson_state["plan"] = plan
                        lesson_state["lesson_state"] = "PROMPT_USER"
                        
                        # Invoke graph starting at prompt_user node
                        try:
                            updated_lesson_state = await invoke_lesson_graph(lesson_state, ws, entry_node="prompt_user")
                            # Update SessionState from graph result
                            lesson_state_to_session_state(updated_lesson_state, state)
                        except Exception as e:
                            # Graph invocation failed, fallback to manual flow
                            await send_status(f"Graph error: {str(e)}", code="error")
                            # Fallback: manually prompt first object
                            next_idx = get_next_object_index(plan, state.completed_objects)
                            if next_idx >= 0:
                                state.current_object_index = next_idx
                                prompt_msg = await generate_prompt_message(
                                    plan.objects[next_idx], 
                                    target_language, 
                                    proficiency_level, 
                                    attempt_number=1,
                                    max_attempts=3,
                                    state=state
                                )
                                
                                # generate TTS audio for prompt
                                prompt_audio = None
                                if prompt_msg:
                                    prompt_audio = await generate_tts_audio(prompt_msg, state=state)
                                
                                payload = {"text": prompt_msg, "object_index": next_idx}
                                if prompt_audio:
                                    payload["audio"] = prompt_audio
                                
                                await ws.send_json({"type": "prompt_next", "payload": payload})
                                
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
                        # process together using graph
                        transcription = state.pending_transcription[1]
                        
                        # Convert SessionState to LessonState and invoke graph at evaluate node
                        lesson_state = session_state_to_lesson_state(state, ws, image_metadata)
                        lesson_state["pending_transcription"] = state.pending_transcription
                        lesson_state["pending_image"] = (utterance_id, data_url, image_metadata)
                        lesson_state["lesson_state"] = "EVALUATE"
                        
                        # Invoke graph starting at evaluate node
                        updated_lesson_state = await invoke_lesson_graph(lesson_state, ws, entry_node="evaluate")
                        
                        # Check for errors in the returned state
                        if "_error" in updated_lesson_state:
                            # Error already logged in invoke_lesson_graph
                            await send_status(f"Graph error: {updated_lesson_state['_error']}", code="error")
                            # State is already updated to FEEDBACK, continue with current state
                        else:
                            # Update SessionState from graph result
                            lesson_state_to_session_state(updated_lesson_state, state)
                            # Clear pending data (should be cleared by graph, but ensure it)
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

@router.get("/user/{username}/progress")
async def get_user_progress_api(username: str):
    """Get progress data for a specific user."""
    return await get_user_progress_db(username)


@router.get("/user/{username}/objects")
async def get_user_objects_api(username: str):
    """Get all objects a user has attempted with stats."""
    progress = await get_user_progress_db(username)
    return {"username": username, "objects": progress.get("objects", {})}


@router.get("/user/{username}/sessions")
async def get_user_sessions_api(
    username: str, 
    limit: int = Query(default=10, ge=1, le=100)
):
    """Get recent sessions for a user."""
    progress = await get_user_progress_db(username)
    sessions = progress.get("sessions", [])
    # Return most recent sessions first
    return {
        "username": username, 
        "sessions": list(reversed(sessions[-limit:]))
    }


@router.get("/user/{username}/object/{object_name}")
async def get_user_object_stats_api(username: str, object_name: str):
    """Get stats for a specific object for a user."""
    stats = await get_user_object_stats_db(username, object_name)
    if stats is None:
        raise HTTPException(status_code=404, detail=f"No data found for object '{object_name}'")
    return {"username": username, "object_name": object_name, "stats": stats}
