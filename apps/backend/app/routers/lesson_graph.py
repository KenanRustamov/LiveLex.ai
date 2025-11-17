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
    lesson_state: Literal["PROMPT_USER", "AWAIT_RESPONSE", "EVALUATE", "FEEDBACK", "COMPLETE"]
    target_language: str
    source_language: str
    location: str
    actions: list[str]
    proficiency_level: int  # User's proficiency level
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
    """Evaluate user's response and move to feedback."""
    from app.routers.base import evaluate_response, generate_tts_audio
    from app.utils.storage import append_dialogue_entry
    
    plan = state.get("plan")
    pending_transcription = state.get("pending_transcription")
    pending_image = state.get("pending_image")
    current_object_index = state.get("current_object_index", -1)
    item_attempts = state.get("item_attempts", {})
    
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

    if eval_result.correct or current_attempt >= 2:
        # Mark as completed if correct or if this was the second (last) attempt
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
            summary = generate_summary(plan, completed_objects, dialogue_entries, item_attempts)
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

