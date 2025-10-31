"""LangGraph state machine for lesson flow."""
from typing import TypedDict, Literal
from langgraph.graph import StateGraph, END
from app.schemas.plan import Plan, Object


class LessonState(TypedDict):
    """State for the lesson graph."""
    plan: Plan | None
    current_object_index: int
    completed_objects: list[tuple[int, bool]]  # (index, correct)
    lesson_state: Literal["INITIAL_PLAN", "PROMPT_USER", "AWAIT_RESPONSE", "EVALUATE", "FEEDBACK", "COMPLETE"]
    target_language: str
    source_language: str
    location: str
    actions: list[str]


def initial_plan_node(state: LessonState) -> LessonState:
    """After plan is generated, move to prompt user."""
    return {**state, "lesson_state": "PROMPT_USER"}


def prompt_user_node(state: LessonState) -> LessonState:
    """Prompt user to interact with next object."""
    # The prompting logic will be handled in the WebSocket handler
    # This just marks the state transition
    return {**state, "lesson_state": "AWAIT_RESPONSE"}


def await_response_node(state: LessonState) -> LessonState:
    """Waiting for user response - no state change, external trigger needed."""
    return state


def evaluate_node(state: LessonState) -> LessonState:
    """After evaluation, move to feedback."""
    return {**state, "lesson_state": "FEEDBACK"}


def feedback_node(state: LessonState) -> LessonState:
    """After feedback, check if there are more objects or complete."""
    plan = state["plan"]
    completed_indices = {idx for idx, _ in state["completed_objects"]}
    
    if plan and len(completed_indices) >= len(plan.objects):
        # All objects tested
        return {**state, "lesson_state": "COMPLETE"}
    else:
        # Move to prompt next object
        return {**state, "lesson_state": "PROMPT_USER"}


def create_lesson_graph() -> StateGraph:
    """Create the lesson state graph."""
    graph = StateGraph(LessonState)
    
    # Add nodes
    graph.add_node("initial_plan", initial_plan_node)
    graph.add_node("prompt_user", prompt_user_node)
    graph.add_node("await_response", await_response_node)
    graph.add_node("evaluate", evaluate_node)
    graph.add_node("feedback", feedback_node)
    
    # Add edges
    graph.add_edge("initial_plan", "prompt_user")
    graph.add_edge("prompt_user", "await_response")
    graph.add_edge("evaluate", "feedback")
    
    # Conditional edge from feedback
    def should_complete(state: LessonState) -> Literal["complete", "prompt_user"]:
        plan = state["plan"]
        completed_indices = {idx for idx, _ in state["completed_objects"]}
        if plan and len(completed_indices) >= len(plan.objects):
            return "complete"
        return "prompt_user"
    
    graph.add_conditional_edges("feedback", should_complete, {
        "complete": END,
        "prompt_user": "prompt_user",
    })
    
    # Set entry point
    graph.set_entry_point("initial_plan")
    
    return graph.compile()

