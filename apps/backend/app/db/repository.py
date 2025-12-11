from __future__ import annotations
from typing import Optional
from datetime import datetime, timezone
from app.db.models import UserDataDoc
import logging


async def save_user_lesson_db(username: str, session_id: str, summary: dict, assignment_id: Optional[str] = None):
    """Save user lesson data to database."""
    try:
        # Find or create user
        user = await UserDataDoc.find_one(UserDataDoc.username == username)
        
        if not user:
            user = UserDataDoc(
                username=username,
                objects={},
                sessions=[]  # Initialize sessions list
            )
            await user.insert()
        
        # Ensure sessions attribute exists (for backward compatibility)
        if not hasattr(user, 'sessions') or user.sessions is None:
            user.sessions = []
        
        # Process each item in the summary
        total_items = 0
        correct_items = 0
        for item in summary.get("items", []):
            obj_name = item["object"]["source_name"]
            correct_word = item["object"]["target_name"]
            user_said = item.get("user_said") or ""
            correct = item.get("correct", False)
            attempts = item.get("attempts", 1)
            hints_used = item.get("hints_used", 0)
            gave_up = item.get("gave_up", False)

            total_items += 1
            if correct:
                correct_items += 1

            # Initialize object if not exists
            if obj_name not in user.objects:
                user.objects[obj_name] = {
                    "correct": 0,
                    "incorrect": 0,
                    "total_attempts": 0,
                    "last_correct": None,
                    "last_user_said": None,
                    "correct_word": correct_word,
                    "last_attempted": None,
                    "last_attempts": None,
                    "hints_used": 0,
                    "gave_up_count": 0,
                }

            obj = user.objects[obj_name]

            # Increment counts
            if correct:
                obj["correct"] = obj.get("correct", 0) + 1
            else:
                obj["incorrect"] = obj.get("incorrect", 0) + 1
            
            # Track total attempts across all sessions
            obj["total_attempts"] = obj.get("total_attempts", 0) + attempts
            obj["hints_used"] = obj.get("hints_used", 0) + hints_used
            if gave_up:
                obj["gave_up_count"] = obj.get("gave_up_count", 0) + 1

            # Update last attempt details
            obj["last_correct"] = correct
            obj["last_user_said"] = user_said
            obj["correct_word"] = correct_word
            obj["last_attempted"] = datetime.now(timezone.utc).isoformat()
            obj["last_attempts"] = attempts

        # Append session summary
        user.sessions.append({
            "session_id": session_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "summary": summary,
            "assignment_id": assignment_id
        })

        # Save user document
        await user.save()
        
        print(f"Saved lesson data for user '{username}' to database")
        
        # If this session was for an assignment, mark it as complete
        if assignment_id:
            score = correct_items / total_items if total_items > 0 else 0.0
            await mark_assignment_complete(
                assignment_id=assignment_id,
                student_username=username,
                session_id=session_id,
                score=score,
                total_items=total_items,
                correct_items=correct_items
            )
            print(f"Marked assignment {assignment_id} as complete for user '{username}'")
        
    except Exception as e:
        logging.error(f"Error saving user lesson to database: {e}", exc_info=True)
        raise


async def add_discovered_words(username: str, scene_id: str, vocab_objects: list[dict]):
    """
    Add discovered words to user profile.
    vocab_objects: list of dicts with keys 'source_name', 'target_name'
    - Adds to discovered_scene_words (with both source_name and target_name) for scene tracking.
    - Adds to objects list (keyed by source_name) with origin="scanned".
    """
    try:
        user = await UserDataDoc.find_one(UserDataDoc.username == username)
        if not user:
            user = UserDataDoc(
                username=username,
                objects={},
                discovered_scene_words={}
            )
            await user.insert()
        
        # Ensure dict exists
        if not user.discovered_scene_words:
            user.discovered_scene_words = {}
            
        # Update discovered_scene_words
        if scene_id not in user.discovered_scene_words:
            user.discovered_scene_words[scene_id] = []
        
        # Build a set of existing target words for deduplication
        existing_target_words = set()
        for item in user.discovered_scene_words[scene_id]:
            if isinstance(item, dict):
                existing_target_words.add(item.get("target_name", "").lower())
        
        for obj in vocab_objects:
            source_word = obj.get("source_name")
            target_word = obj.get("target_name")
            if source_word and target_word and target_word.lower() not in existing_target_words:
                user.discovered_scene_words[scene_id].append({
                    "source_name": source_word,
                    "target_name": target_word
                })
                existing_target_words.add(target_word.lower())
                
        # Update objects with origin using source names as key
        for obj in vocab_objects:
            source = obj.get("source_name")
            target = obj.get("target_name")
            
            if not source or not target:
                continue
                
            if source not in user.objects:
                user.objects[source] = {
                    "correct": 0,
                    "incorrect": 0,
                    "total_attempts": 0,
                    "correct_word": target,
                    "origins": ["scanned"], # New field
                    "discovered_at": datetime.now(timezone.utc).isoformat() # New field
                }
            else:
                obj_data = user.objects[source]
                # Add origin if not present
                origins = obj_data.get("origins", [])
                if "scanned" not in origins:
                    origins.append("scanned")
                    obj_data["origins"] = origins
                    
                # Set discovered_at if not present
                if "discovered_at" not in obj_data:
                    obj_data["discovered_at"] = datetime.now(timezone.utc).isoformat()
                
                # Ensure correct_word is set/updated
                obj_data["correct_word"] = target

        await user.save()
        print(f"Saved discovered words for user '{username}' in scene '{scene_id}'")
        
    except Exception as e:
        logging.error(f"Error adding discovered words: {e}", exc_info=True)
        # Don't raise, just log to prevent connection closure issues


async def get_user_progress_db(username: str) -> dict:
    user = await UserDataDoc.find_one(UserDataDoc.username == username)
    if not user:
        return {"objects": {}, "sessions": []}
    return {"objects": user.objects, "sessions": user.sessions}


async def get_user_object_stats_db(username: str, object_name: str) -> Optional[dict]:
    user = await UserDataDoc.find_one(UserDataDoc.username == username)
    if not user:
        return None
    return user.objects.get(object_name)


async def mark_assignment_complete(
    assignment_id: str,
    student_username: str,
    session_id: Optional[str] = None,
    score: Optional[float] = None,
    total_items: int = 0,
    correct_items: int = 0
) -> dict:
    """Mark an assignment as completed by a student."""
    from app.db.models import AssignmentCompletionDoc
    
    try:
        # Get student data
        user = await UserDataDoc.find_one(UserDataDoc.username == student_username)
        if not user:
            raise ValueError(f"Student not found: {student_username}")
        
        # Check if already completed
        existing = await AssignmentCompletionDoc.find_one(
            AssignmentCompletionDoc.assignment_id == assignment_id,
            AssignmentCompletionDoc.student_id == str(user.id)
        )
        
        if existing:
            # Update existing completion
            existing.completed_at = datetime.now(timezone.utc)
            existing.session_id = session_id
            existing.score = score
            existing.total_items = total_items
            existing.correct_items = correct_items
            await existing.save()
            completion = existing
        else:
            # Create new completion record
            completion = AssignmentCompletionDoc(
                assignment_id=assignment_id,
                student_id=str(user.id),
                student_username=student_username,
                session_id=session_id,
                score=score,
                total_items=total_items,
                correct_items=correct_items
            )
            await completion.insert()
        
        return {
            "id": str(completion.id),
            "assignment_id": completion.assignment_id,
            "student_username": completion.student_username,
            "completed_at": completion.completed_at,
            "score": completion.score,
            "total_items": completion.total_items,
            "correct_items": completion.correct_items
        }
        
    except Exception as e:
        logging.error(f"Error marking assignment complete: {e}", exc_info=True)
        raise


async def get_assignment_completion_status(assignment_id: str, student_username: str) -> Optional[dict]:
    """Get completion status for a specific assignment and student."""
    from app.db.models import AssignmentCompletionDoc
    
    try:
        user = await UserDataDoc.find_one(UserDataDoc.username == student_username)
        if not user:
            return None
        
        completion = await AssignmentCompletionDoc.find_one(
            AssignmentCompletionDoc.assignment_id == assignment_id,
            AssignmentCompletionDoc.student_id == str(user.id)
        )
        
        if not completion:
            return None
        
        return {
            "completed": True,
            "completed_at": completion.completed_at,
            "score": completion.score,
            "total_items": completion.total_items,
            "correct_items": completion.correct_items
        }
    except Exception as e:
        logging.error(f"Error getting assignment completion status: {e}", exc_info=True)
        return None


async def get_assignment_progress(assignment_id: str, teacher_id: str) -> dict:
    """Get progress for all students on a specific assignment."""
    from app.db.models import AssignmentCompletionDoc
    
    try:
        # Get all students enrolled with this teacher
        students = await UserDataDoc.find(
            UserDataDoc.teacher_id == teacher_id,
            UserDataDoc.role == "student"
        ).to_list()
        
        # Get all completions for this assignment
        completions = await AssignmentCompletionDoc.find(
            AssignmentCompletionDoc.assignment_id == assignment_id
        ).to_list()
        
        # Build completion map
        completion_map = {c.student_username: c for c in completions}
        
        # Build progress data
        progress = []
        for student in students:
            completion = completion_map.get(student.username)
            progress.append({
                "student_username": student.username,
                "student_name": student.name or student.username,
                "completed": completion is not None,
                "completed_at": completion.completed_at if completion else None,
                "score": completion.score if completion else None,
                "total_items": completion.total_items if completion else 0,
                "correct_items": completion.correct_items if completion else 0
            })
        
        return {
            "assignment_id": assignment_id,
            "total_students": len(students),
            "completed_count": len([p for p in progress if p["completed"]]),
            "students": progress
        }
    except Exception as e:
        logging.error(f"Error getting assignment progress: {e}", exc_info=True)
        return {
            "assignment_id": assignment_id,
            "total_students": 0,
            "completed_count": 0,
            "students": []
        }