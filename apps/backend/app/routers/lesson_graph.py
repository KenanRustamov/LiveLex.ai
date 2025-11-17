"""LangGraph state machine for lesson flow."""
from typing import TypedDict, Literal, Optional
from fastapi import WebSocket
from starlette.websockets import WebSocketState
from langgraph.graph import StateGraph, END
from app.schemas.plan import Plan, Object
from app.schemas.evaluation import EvaluationResult
import logging


class LessonState(TypedDict, total=False):
    """State for the lesson graph."""
    plan: Plan | None
    current_object_index: int
    completed_objects: list[tuple[int, bool]]  # (index, correct)
    item_attempts: dict[int, int]  # tracks attempts per item index
    item_hints_used: dict[int, int]  # tracks hints used per item (max 2)
    item_gave_up: dict[int, int]  # tracks "don't know" count per item (max 2)
    waiting_for_repeat: bool  # flag when waiting for user to repeat after being given answer
    lesson_state: Literal["PROMPT_USER", "AWAIT_RESPONSE", "EVALUATE", "FEEDBACK", "COMPLETE"]
    target_language: str
    source_language: str
    location: str
    actions: list[str]
    proficiency_level: int  # user's proficiency level
    # Additional fields for graph operations
    session_id: str | None
    username: str | None
    image_metadata: dict | None  # target_language, source_language, location, actions, proficiency_level
    pending_transcription: tuple[str, str] | None  # (utterance_id, text)
    pending_image: tuple[str, str, dict] | None  # (utterance_id, data_url, metadata)
    evaluation_result: EvaluationResult | None
    prompt_message: str | None


async def prompt_user_node(state: LessonState, ws: WebSocket) -> LessonState:
    """Prompt user to interact with next object."""
    # TODO: Refactor circular dependencies to a utils file
    from app.routers.base import generate_prompt_message, get_next_object_index, generate_tts_audio
    from app.utils.storage import append_dialogue_entry
    
    plan = state.get("plan")
    if not plan:
        # No plan available, can't prompt
        logging.warning("prompt_user_node: No plan available")
        return {**state, "lesson_state": "AWAIT_RESPONSE"}
    
    # Get next object index
    completed_objects = state.get("completed_objects", [])
    next_idx = get_next_object_index(plan, completed_objects)
    
    if next_idx < 0:
        # No more objects, should have been handled in feedback node
        logging.warning("prompt_user_node: No more objects to prompt")
        return {**state, "lesson_state": "AWAIT_RESPONSE"}
    
    if next_idx >= len(plan.objects):
        # Invalid object index
        logging.error(f"prompt_user_node: Invalid object index {next_idx} for plan with {len(plan.objects)} objects")
        return {**state, "lesson_state": "AWAIT_RESPONSE"}
    
    current_object = plan.objects[next_idx]
    target_language = state.get("target_language", "Spanish")
    
    # Extract proficiency_level from state or image_metadata
    proficiency_level = state.get("proficiency_level")
    if proficiency_level is None:
        image_metadata = state.get("image_metadata")
        if image_metadata:
            proficiency_level = image_metadata.get("proficiency_level", 1)
        else:
            proficiency_level = 1  # Default to 1 if not found
    
    # Get attempt count for this object
    attempt_counts = state.get("attempt_counts", {}) or {}
    current_attempt = attempt_counts.get(next_idx, 0) + 1  # This will be attempt number
    max_attempts = 3
    
    # Generate prompt message with attempt context
    try:
        prompt_msg = await generate_prompt_message(
            current_object, 
            target_language, 
            proficiency_level, 
            attempt_number=current_attempt,
            max_attempts=max_attempts,
            state=None
        )
        if not prompt_msg:
            logging.warning("prompt_user_node: Generated empty prompt message")
            prompt_msg = f"Please hold up or point to the {current_object.source_name} and say '{current_object.target_name}' in {target_language}."
    except Exception as e:
        # If prompt generation fails, create a fallback prompt
        logging.error(f"prompt_user_node: Prompt generation failed: {e}", exc_info=True)
        prompt_msg = f"Please hold up or point to the {current_object.source_name} and say '{current_object.target_name}' in {target_language}."
    
    # Generate TTS audio for prompt
    prompt_audio = None
    try:
        prompt_audio = await generate_tts_audio(prompt_msg, state=None)
    except Exception as e:
        # TTS generation failed, but continue without audio
        logging.warning(f"prompt_user_node: TTS generation failed: {e}")
    
    # Send WebSocket message
    try:
        if ws and ws.client_state != WebSocketState.DISCONNECTED:
            payload = {
                "text": prompt_msg,
                "object_index": next_idx
            }
            if prompt_audio:
                payload["audio"] = prompt_audio
            
            await ws.send_json({
                "type": "prompt_next",
                "payload": payload
            })
        else:
            logging.warning("prompt_user_node: WebSocket disconnected, cannot send prompt")
    except Exception as e:
        # WebSocket send failed, but continue with state update
        logging.error(f"prompt_user_node: WebSocket send failed: {e}", exc_info=True)
    
    # Save prompt to dialogue
    session_id = state.get("session_id")
    if session_id:
        try:
            append_dialogue_entry(session_id, {
                "speaker": "system",
                "text": prompt_msg,
            })
        except Exception as e:
            # Dialogue save failed, but continue
            logging.error(f"prompt_user_node: Dialogue save failed: {e}", exc_info=True)
    
    # Update state
    return {
        **state,
        "current_object_index": next_idx,
        "prompt_message": prompt_msg,
        "lesson_state": "AWAIT_RESPONSE"
    }


def await_response_node(state: LessonState) -> LessonState:
    """Waiting for user response - no state change, external trigger needed."""
    return state


async def evaluate_node(state: LessonState, ws: WebSocket) -> LessonState:
    """Evaluate user's response, handle hints and 'don't know', then move to feedback."""
    from app.routers.base import evaluate_response, generate_tts_audio, detect_user_intent, generate_hint, give_answer_with_memory_aid
    from app.utils.storage import append_dialogue_entry, load_session_data
    
    plan = state.get("plan")
    pending_transcription = state.get("pending_transcription")
    pending_image = state.get("pending_image")
    current_object_index = state.get("current_object_index", -1)
    item_attempts = state.get("item_attempts", {})
    item_hints_used = state.get("item_hints_used", {})
    item_gave_up = state.get("item_gave_up", {})
    waiting_for_repeat = state.get("waiting_for_repeat", False)
    
    if not plan:
        logging.warning("evaluate_node: No plan available")
        return {**state, "lesson_state": "FEEDBACK"}
    
    if current_object_index < 0:
        logging.warning("evaluate_node: Invalid current_object_index")
        return {**state, "lesson_state": "FEEDBACK"}
    
    if not pending_transcription:
        logging.warning("evaluate_node: No pending transcription")
        return {**state, "lesson_state": "FEEDBACK"}
    
    if not pending_image:
        logging.warning("evaluate_node: No pending image")
        return {**state, "lesson_state": "FEEDBACK"}
    
    # Extract data
    try:
        utterance_id, transcription = pending_transcription
    except (ValueError, TypeError) as e:
        logging.error(f"evaluate_node: Invalid pending_transcription format: {e}")
        return {**state, "lesson_state": "FEEDBACK"}
    
    try:
        _, image_data_url, image_metadata = pending_image
    except (ValueError, TypeError) as e:
        logging.error(f"evaluate_node: Invalid pending_image format: {e}")
        return {**state, "lesson_state": "FEEDBACK"}
    
    if current_object_index >= len(plan.objects):
        # Invalid object index
        logging.error(f"evaluate_node: Invalid object index {current_object_index} for plan with {len(plan.objects)} objects")
        return {**state, "lesson_state": "FEEDBACK"}
    
    current_object = plan.objects[current_object_index]
    target_language = image_metadata.get("target_language", state.get("target_language", "Spanish"))
    source_language = image_metadata.get("source_language", state.get("source_language", "English"))
    
    # Extract proficiency_level from image_metadata or state
    proficiency_level = image_metadata.get("proficiency_level")
    if proficiency_level is None:
        proficiency_level = state.get("proficiency_level", 1)  # Default to 1 if not found

    # Get current attempt number (default to 1 if not tracked yet)
    current_attempt = item_attempts.get(current_object_index, 0) + 1
    max_attempts = 3
    
    session_id = state.get("session_id")
    
    # Special case: waiting for repeat after being given the answer
    if waiting_for_repeat:
        # User is repeating after being given answer - just mark as completed (incorrect)
        completed_objects = state.get("completed_objects", [])
        completed_objects.append((current_object_index, False))
        
        # Save dialogue entry
        if session_id:
            try:
                append_dialogue_entry(session_id, {
                    "speaker": "user",
                    "text": transcription,
                    "utterance_id": utterance_id,
                })
            except Exception:
                pass
        
        # Move on without feedback
        return {
            **state,
            "completed_objects": completed_objects,
            "waiting_for_repeat": False,
            "lesson_state": "FEEDBACK",
            "pending_transcription": None,
            "pending_image": None,
        }
    
    # Retrieve last system message from dialogue for context
    last_system_message = None
    if session_id:
        try:
            session_data = load_session_data(session_id)
            if session_data and "entries" in session_data:
                # Find the last system message before the current user response
                for entry in reversed(session_data["entries"]):
                    if entry.get("speaker") == "system" and entry.get("text"):
                        last_system_message = entry["text"]
                        break
        except Exception as e:
            logging.warning(f"evaluate_node: Failed to retrieve dialogue context: {e}")
    
    # Detect user intent (with context for LLM fallback)
    intent = await detect_user_intent(transcription, context_message=last_system_message, state=None)
    
    # Handle hint request
    if intent == "hint_request":
        # Save user's hint request to dialogue (with image)
        if session_id:
            try:
                _, image_data_url, _ = pending_image
                append_dialogue_entry(session_id, {
                    "speaker": "user",
                    "text": transcription,
                    "utterance_id": utterance_id,
                    "image_data_url": image_data_url,
                })
            except Exception as e:
                logging.warning(f"evaluate_node: Failed to save hint request to dialogue: {e}")
        
        hints_used = item_hints_used.get(current_object_index, 0)
        
        if hints_used >= 2:
            # No more hints available
            hint_msg = "You've already used your 2 hints for this word. Give it a try!"
        else:
            # Generate hint
            hint_number = hints_used + 1
            try:
                hint_msg = await generate_hint(
                    current_object,
                    target_language,
                    source_language,
                    proficiency_level,
                    hint_number,
                    state=None
                )
                item_hints_used[current_object_index] = hint_number
            except Exception as e:
                logging.error(f"evaluate_node: Hint generation failed: {e}", exc_info=True)
                hint_msg = f"Hint: The word starts with '{current_object.target_name[0]}'."
                item_hints_used[current_object_index] = hint_number
        
        # Generate TTS for hint
        hint_audio = None
        try:
            hint_audio = await generate_tts_audio(hint_msg, state=None)
        except Exception as e:
            logging.warning(f"evaluate_node: TTS generation failed for hint: {e}")
        
        # Send hint via WebSocket
        try:
            if ws and ws.client_state != WebSocketState.DISCONNECTED:
                payload = {"text": hint_msg}
                if hint_audio:
                    payload["audio"] = hint_audio
                await ws.send_json({
                    "type": "hint",
                    "payload": payload
                })
        except Exception as e:
            logging.error(f"evaluate_node: WebSocket send failed: {e}", exc_info=True)
        
        # Save hint to dialogue
        if session_id:
            try:
                append_dialogue_entry(session_id, {
                    "speaker": "system",
                    "text": hint_msg,
                })
            except Exception:
                pass
        
        # Stay in AWAIT_RESPONSE state
        return {
            **state,
            "item_hints_used": item_hints_used,
            "lesson_state": "AWAIT_RESPONSE",
            "pending_transcription": None,
            "pending_image": None,
        }
    
    # Handle "don't know" / give up
    if intent == "dont_know":
        # Save user's "don't know" statement to dialogue (with image)
        if session_id:
            try:
                _, image_data_url, _ = pending_image
                append_dialogue_entry(session_id, {
                    "speaker": "user",
                    "text": transcription,
                    "utterance_id": utterance_id,
                    "image_data_url": image_data_url,
                })
            except Exception as e:
                logging.warning(f"evaluate_node: Failed to save 'don't know' to dialogue: {e}")
        
        gave_up_count = item_gave_up.get(current_object_index, 0)
        hints_used = item_hints_used.get(current_object_index, 0)
        
        # Check if we should give answer (if hints used OR second don't know)
        if hints_used > 0 or gave_up_count >= 1:
            # Give answer with memory aid
            try:
                answer_msg = await give_answer_with_memory_aid(
                    current_object,
                    target_language,
                    source_language,
                    proficiency_level,
                    state=None
                )
                item_gave_up[current_object_index] = gave_up_count + 1
            except Exception as e:
                logging.error(f"evaluate_node: Answer generation failed: {e}", exc_info=True)
                answer_msg = f"The correct answer is '{current_object.target_name}'. Please repeat: {current_object.target_name}"
                item_gave_up[current_object_index] = gave_up_count + 1
            
            # Generate TTS for answer
            answer_audio = None
            try:
                answer_audio = await generate_tts_audio(answer_msg, state=None)
            except Exception as e:
                logging.warning(f"evaluate_node: TTS generation failed for answer: {e}")
            
            # Send answer via WebSocket
            try:
                if ws and ws.client_state != WebSocketState.DISCONNECTED:
                    payload = {"text": answer_msg}
                    if answer_audio:
                        payload["audio"] = answer_audio
                    await ws.send_json({
                        "type": "answer_given",
                        "payload": payload
                    })
            except Exception as e:
                logging.error(f"evaluate_node: WebSocket send failed: {e}", exc_info=True)
            
            # Save answer to dialogue
            if session_id:
                try:
                    append_dialogue_entry(session_id, {
                        "speaker": "system",
                        "text": answer_msg,
                    })
                except Exception:
                    pass
            
            # Set waiting_for_repeat flag
            return {
                **state,
                "item_gave_up": item_gave_up,
                "waiting_for_repeat": True,
                "lesson_state": "AWAIT_RESPONSE",
                "pending_transcription": None,
                "pending_image": None,
            }
        else:
            # First don't know and no hints used - give a hint
            try:
                hint_msg = await generate_hint(
                    current_object,
                    target_language,
                    source_language,
                    proficiency_level,
                    1,
                    state=None
                )
                hint_msg += " If you still don't know, you can ask again and I'll tell you the answer."
                item_gave_up[current_object_index] = 1
                item_hints_used[current_object_index] = 1
            except Exception as e:
                logging.error(f"evaluate_node: Hint generation failed: {e}", exc_info=True)
                hint_msg = f"Hint: The word starts with '{current_object.target_name[0]}'. If you still don't know, you can ask again and I'll tell you the answer."
                item_gave_up[current_object_index] = 1
                item_hints_used[current_object_index] = 1
            
            # Generate TTS for hint
            hint_audio = None
            try:
                hint_audio = await generate_tts_audio(hint_msg, state=None)
            except Exception as e:
                logging.warning(f"evaluate_node: TTS generation failed for hint: {e}")
            
            # Send hint via WebSocket
            try:
                if ws and ws.client_state != WebSocketState.DISCONNECTED:
                    payload = {"text": hint_msg}
                    if hint_audio:
                        payload["audio"] = hint_audio
                    await ws.send_json({
                        "type": "hint",
                        "payload": payload
                    })
            except Exception as e:
                logging.error(f"evaluate_node: WebSocket send failed: {e}", exc_info=True)
            
            # Save hint to dialogue
            if session_id:
                try:
                    append_dialogue_entry(session_id, {
                        "speaker": "system",
                        "text": hint_msg,
                    })
                except Exception:
                    pass
            
            # Stay in AWAIT_RESPONSE state
            return {
                **state,
                "item_gave_up": item_gave_up,
                "item_hints_used": item_hints_used,
                "lesson_state": "AWAIT_RESPONSE",
                "pending_transcription": None,
                "pending_image": None,
            }
    
    # Normal evaluation flow (answer_attempt intent)

    # Evaluate response with attempt context
    try:
        eval_result = await evaluate_response(
            transcription=transcription,
            image_data_url=image_data_url,
            plan=plan,
            current_object=current_object,
            target_language=target_language,
            source_language=source_language,
            proficiency_level=proficiency_level,
            attempt_number=current_attempt,
            max_attempts=max_attempts,
            state=None,
        )
    except Exception as e:
        # Evaluation failed, create a default result
        logging.error(f"evaluate_node: Evaluation failed: {e}", exc_info=True)
        from app.schemas.evaluation import EvaluationResult
        eval_result = EvaluationResult(
            correct=False,
            object_tested=current_object,
            correct_word=current_object.target_name,
            feedback_message=f"Sorry, I had trouble evaluating your response. Please try again.",
            transcription=transcription,
            attempt_number=current_attempt,
        )
    
    # Update attempt count for this object (increment after evaluation)
    item_attempts[current_object_index] = current_attempt

    # Save user entry with image and evaluation
    session_id = state.get("session_id")
    if session_id:
        try:
            append_dialogue_entry(session_id, {
                "speaker": "user",
                "text": transcription,
                "utterance_id": utterance_id,
                "image_data_url": image_data_url,
                "evaluation": {
                    "correct": eval_result.correct,
                    "object_tested": eval_result.object_tested.model_dump(),
                    "correct_word": eval_result.correct_word,
                    "error_category": eval_result.error_category,
                    "attempt_number": eval_result.attempt_number,
                },
            })
        except Exception:
            # Dialogue save failed, but continue
            pass
    
    # Generate TTS audio for feedback
    feedback_audio = None
    if eval_result.feedback_message:
        try:
            feedback_audio = await generate_tts_audio(eval_result.feedback_message, state=None)
        except Exception as e:
            # TTS generation failed, but continue without audio
            logging.warning(f"evaluate_node: TTS generation failed: {e}")
    
    # Send evaluation result via WebSocket
    try:
        if ws and ws.client_state != WebSocketState.DISCONNECTED:
            payload = {
                    "correct": eval_result.correct,
                    "feedback": eval_result.feedback_message,
                    "object_index": current_object_index,
                    "object": current_object.model_dump(),
                    "correct_word": eval_result.correct_word,
                    "attempt_number": eval_result.attempt_number,
                    "error_category": eval_result.error_category,
            }
            if feedback_audio:
                payload["audio"] = feedback_audio
            
            await ws.send_json({
                "type": "evaluation_result",
                "payload": payload,
            })
        else:
            logging.warning("evaluate_node: WebSocket disconnected, cannot send evaluation result")
    except Exception as e:
        # WebSocket send failed, but continue
        logging.error(f"evaluate_node: WebSocket send failed: {e}", exc_info=True)
    
    # Save system feedback
    if session_id:
        try:
            append_dialogue_entry(session_id, {
                "speaker": "system",
                "text": eval_result.feedback_message,
            })
        except Exception:
            # Dialogue save failed, but continue
            pass
    
    # Determine if we should mark as completed or allow retry
    completed_objects = state.get("completed_objects", [])

    if eval_result.correct or current_attempt >= max_attempts:
        # Mark as completed if correct or if this was the last attempt
        # Remove any existing entry for this object so the latest result wins
        completed_objects = [
            (idx, was_correct)
            for idx, was_correct in completed_objects
            if idx != current_object_index
        ]
        completed_objects.append((current_object_index, eval_result.correct))

        # Update state and move to feedback
        return {
            **state,
            "completed_objects": completed_objects,
            "item_attempts": item_attempts,
            "item_hints_used": item_hints_used,
            "item_gave_up": item_gave_up,
            "waiting_for_repeat": False,
            "evaluation_result": eval_result,
            "lesson_state": "FEEDBACK",
            # Clear pending data
            "pending_transcription": None,
            "pending_image": None,
        }
    else:
        # First attempt and incorrect -> allow retry
        # Return to AWAIT_RESPONSE state (don't mark as completed yet)
        return {
            **state,
            "item_attempts": item_attempts,
            "item_hints_used": item_hints_used,
            "item_gave_up": item_gave_up,
            "evaluation_result": eval_result,
            "lesson_state": "AWAIT_RESPONSE",
            # Clear pending data so user can try again
            "pending_transcription": None,
            "pending_image": None,
        }


async def feedback_node(state: LessonState, ws: WebSocket) -> LessonState:
    """After feedback, check if there are more objects or complete."""
    from app.routers.base import get_next_object_index, generate_summary
    from app.utils.storage import load_session_data, save_session_data
    from app.db.repository import save_user_lesson_db
    
    plan = state.get("plan")
    completed_objects = state.get("completed_objects", [])
    
    if not plan:
        logging.warning("feedback_node: No plan available")
        return {**state, "lesson_state": "COMPLETE"}
    
    completed_indices = {idx for idx, _ in completed_objects}
    
    # Check if more objects remain
    next_idx = get_next_object_index(plan, completed_objects)
    
    # If no next index or we've completed all objects, end the lesson
    if next_idx < 0 or len(completed_indices) >= len(plan.objects):
        # All objects tested - generate summary and complete
        session_id = state.get("session_id")
        dialogue_entries = []
        
        if session_id:
            try:
                session_data = load_session_data(session_id)
                if session_data:
                    dialogue_entries = session_data.get("entries", [])
            except Exception:
                # Failed to load session data, continue with empty entries
                pass
        
        # Generate summary
        try:
            item_attempts = state.get("item_attempts", {})
            item_hints_used = state.get("item_hints_used", {})
            item_gave_up = state.get("item_gave_up", {})
            summary = generate_summary(plan, completed_objects, dialogue_entries, item_attempts, item_hints_used, item_gave_up)
        except Exception as e:
            # Summary generation failed, create minimal summary
            summary = {
                "items": [],
                "total": len(completed_objects),
                "correct_count": sum(1 for _, correct in completed_objects if correct),
                "incorrect_count": sum(1 for _, correct in completed_objects if not correct),
            }
        
        # Save summary to session
        if session_id:
            try:
                save_session_data(session_id, {
                    "summary": summary,
                })
            except Exception:
                # Save failed, but continue
                pass
        
        # Save to database
        username = state.get("username")
        if username and session_id:
            try:
                await save_user_lesson_db(
                    username=username,
                    session_id=session_id,
                    summary=summary,
                )
            except Exception:
                # DB save failed, but continue
                pass
        
        # Send completion message
        try:
            if ws and ws.client_state != WebSocketState.DISCONNECTED:
                await ws.send_json({
                    "type": "lesson_complete",
                    "payload": summary,
                })
            else:
                logging.warning("feedback_node: WebSocket disconnected, cannot send completion message")
        except Exception as e:
            # WebSocket send failed, but continue
            logging.error(f"feedback_node: WebSocket send failed: {e}", exc_info=True)
        
        # Mark lesson as completed so the outer session can stop processing new attempts
        return {**state, "lesson_state": "COMPLETE", "lesson_completed": True}
    else:
        # If the current object is not yet in completed_objects, we are still retrying it.
        # In that case, do NOT send a new prompt; just wait for the next response.
        current_index = state.get("current_object_index", -1)
        if current_index not in completed_indices:
            # Stay on the same object and wait for another attempt
            return {**state, "lesson_state": "AWAIT_RESPONSE"}
        # Otherwise, we have completed the current object, so move on to prompt the next one.
        return {**state, "lesson_state": "PROMPT_USER"}


def create_lesson_graph(ws: WebSocket | None = None) -> StateGraph:
    """Create the lesson state graph with optional WebSocket binding.
    
    If ws is provided, nodes will be wrapped to receive WebSocket.
    Otherwise, nodes expect WebSocket to be passed via state or context.
    """
    graph = StateGraph(LessonState)
    
    # Create wrapper functions that bind WebSocket to async nodes
    def create_node_wrapper(node_func, ws_param: WebSocket | None):
        if ws_param is not None:
            # Bind WebSocket to node function
            async def wrapped_node(state: LessonState) -> LessonState:
                return await node_func(state, ws_param)
            return wrapped_node
        else:
            # Return node that expects ws in state or will be bound later
            async def wrapped_node(state: LessonState) -> LessonState:
                # Try to get ws from state (won't be there, but handle gracefully)
                # In practice, ws will be bound when graph is invoked
                ws_from_context = None  # Will be set via closure in invocation helper
                return await node_func(state, ws_from_context or state.get("_ws"))
            return wrapped_node
    
    # Add nodes - use wrappers if ws provided, otherwise create placeholders
    graph.add_node("prompt_user", create_node_wrapper(prompt_user_node, ws))
    graph.add_node("await_response", await_response_node)
    graph.add_node("evaluate", create_node_wrapper(evaluate_node, ws))
    graph.add_node("feedback", create_node_wrapper(feedback_node, ws))
    
    # Add edges
    graph.add_edge("prompt_user", "await_response")
    graph.add_edge("evaluate", "feedback")
    
    # Conditional edge from feedback
    def should_continue(state: LessonState) -> Literal["complete", "prompt_user", "retry"]:
        lesson_state = state.get("lesson_state", "FEEDBACK")
        if lesson_state == "COMPLETE":
            return "complete"
        
        plan = state.get("plan")
        completed_objects = state.get("completed_objects", [])
        if not plan:
            return "complete"
        
        completed_indices = {idx for idx, _ in completed_objects}
        if len(completed_indices) >= len(plan.objects):
            return "complete"
        
        current_index = state.get("current_object_index", -1)
        # If the current object index is not yet completed, we are still retrying it.
        if current_index not in completed_indices:
            return "retry"
        # Otherwise, move on to prompting the next object.
        return "prompt_user"
    
    graph.add_conditional_edges("feedback", should_continue, {
        "complete": END,
        "retry": "await_response",
        "prompt_user": "prompt_user",
    })
    
    # Set entry point to prompt_user (plan generation happens before graph invocation)
    graph.set_entry_point("prompt_user")
    
    return graph.compile()

