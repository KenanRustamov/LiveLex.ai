from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from app.db.models import UserDataDoc
from app.db.repository import save_user_lesson_db
import logging

router = APIRouter(tags=["auth"])

class UserSyncRequest(BaseModel):
    email: Optional[str] = None
    name: Optional[str] = None
    profile_image: Optional[str] = None

@router.post("/auth/sync")
async def sync_user(user: UserSyncRequest):
    """
    Sync user data from frontend (NextAuth) to backend (MongoDB).
    Create user if not exists, update if exists.
    Using email as the primary key for now since we trust Google Auth.
    """
    if not user.email:
         raise HTTPException(status_code=400, detail="Email is required")
    
    # Check if user exists
    # We are using email as the unique identifier for simplicity with Google Auth
    # Ideally we'd map Google ID, but email works for this scope.
    # Note: UserDataDoc defined username as primary index. 
    # We will use email as username or map email to username.
    # For now, let's use email as username to keep it simple and consistent.
    
    username = user.email
    
    existing_user = await UserDataDoc.find_one(UserDataDoc.username == username)
    
    if existing_user:
        # Update fields if changed
        update_data = {}
        if user.name and existing_user.name != user.name:
            update_data["name"] = user.name
        if user.profile_image and existing_user.profile_image != user.profile_image:
            update_data["profile_image"] = user.profile_image
        if user.email and existing_user.email != user.email:
             update_data["email"] = user.email
            
        if update_data:
            await existing_user.update({"$set": update_data})
            logging.info(f"Updated user {username}")
    else:
        # Create new user
        new_user = UserDataDoc(
            username=username,
            email=user.email,
            name=user.name,
            profile_image=user.profile_image
        )
        await new_user.insert()
        logging.info(f"Created new user {username}")
import secrets
import string

@router.post("/auth/role")
async def set_user_role(request: dict):
    """Set the user's role (teacher/student)."""
    email = request.get("email")
    role = request.get("role")
    
    if not email or not role:
        raise HTTPException(status_code=400, detail="Email and role are required")

    if role not in ["teacher", "student"]:
        raise HTTPException(status_code=400, detail="Invalid role")

    user = await UserDataDoc.find_one(UserDataDoc.email == email)
    if not user:
         raise HTTPException(status_code=404, detail="User not found")
    
    update_data = {"role": role}
    
    if role == "teacher" and not user.teacher_code:
        # Generate a 6-character random code
        chars = string.ascii_uppercase + string.digits
        code = ''.join(secrets.choice(chars) for _ in range(6))
        update_data["teacher_code"] = code
        
    await user.update({"$set": update_data})
    return {"status": "success", "role": role, "teacher_code": update_data.get("teacher_code")}

@router.get("/auth/me")
async def get_current_user(email: str):
    """Get current user profile."""
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
        
    user = await UserDataDoc.find_one(UserDataDoc.email == email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    return {
        "username": user.username,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "teacher_code": user.teacher_code,
        "enrolled_class_code": user.enrolled_class_code
    }
