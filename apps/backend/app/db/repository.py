from __future__ import annotations
from typing import Optional
from datetime import datetime, timezone
from app.db.models import UserDataDoc
import logging


async def save_user_lesson_db(username: str, session_id: str, summary: dict):
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
        for item in summary.get("items", []):
            obj_name = item["object"]["source_name"]
            correct_word = item["object"]["target_name"]
            user_said = item.get("user_said") or ""
            correct = item.get("correct", False)
            attempts = item.get("attempts", 1)
            hints_used = item.get("hints_used", 0)
            gave_up = item.get("gave_up", False)

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
            "summary": summary
        })

        # Save user document
        await user.save()
        
        print(f"Saved lesson data for user '{username}' to database")
        
    except Exception as e:
        logging.error(f"Error saving user lesson to database: {e}", exc_info=True)
        raise


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


