from fastapi import HTTPException
from app.db.models import UserDataDoc

async def get_current_teacher(email: str) -> UserDataDoc:
    """
    Verifies that a user exists and has the 'teacher' role.
    Returns the user document if valid, raises HTTPException otherwise.
    """
    user = await UserDataDoc.find_one(UserDataDoc.email == email)
    if not user or user.role != "teacher":
        raise HTTPException(status_code=403, detail="Access denied: Teachers only")
    return user
