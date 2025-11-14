from __future__ import annotations
from typing import Optional
from datetime import datetime, timezone
from app.db.models import UserDataDoc


async def save_user_lesson_db(username: str, session_id: str, summary: dict) -> None:
    user = await UserDataDoc.find_one(UserDataDoc.username == username)
    if not user:
        user = UserDataDoc(username=username)

    for item in summary.get("items", []):
        obj = item["object"]
        obj_name = obj["source_name"]
        stats = user.objects.get(
            obj_name,
            {
                "correct": 0,
                "incorrect": 0,
                "last_correct": None,
                "last_user_said": None,
                "correct_word": obj.get("target_name"),
                "last_attempted": None,
            },
        )
        correct = bool(item.get("correct"))
        if correct:
            stats["correct"] += 1
        else:
            stats["incorrect"] += 1
        stats["last_correct"] = correct
        stats["last_user_said"] = item.get("user_said") or ""
        stats["correct_word"] = obj.get("target_name")
        stats["last_attempted"] = datetime.now(timezone.utc).isoformat()
        user.objects[obj_name] = stats

    user.sessions.append(
        {
            "session_id": session_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "summary": summary,
        }
    )
    await user.save()


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


