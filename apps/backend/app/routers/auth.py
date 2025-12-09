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
        # Generate a unique 8-character random code
        chars = string.ascii_uppercase + string.digits
        while True:
            code = ''.join(secrets.choice(chars) for _ in range(8))
            # Check if code exists
            existing_code = await UserDataDoc.find_one(UserDataDoc.teacher_code == code)
            if not existing_code:
                update_data["teacher_code"] = code
                break
        
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
        "enrolled_class_code": user.class_code,
        "teacher_id": user.teacher_id
    }

@router.post("/auth/join-class")
async def join_class(request: dict):
    """Link a student to a teacher via class code."""
    email = request.get("email")
    code = request.get("code")
    
    if not email or not code:
        raise HTTPException(status_code=400, detail="Email and code are required")
        
    # Find student
    student = await UserDataDoc.find_one(UserDataDoc.email == email)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
        
    # Find teacher by code
    teacher = await UserDataDoc.find_one(UserDataDoc.teacher_code == code)
    if not teacher:
        raise HTTPException(status_code=404, detail="Invalid class code")
        
    # Link them
    await student.update({"$set": {
        "teacher_id": str(teacher.id),
        "class_code": code
    }})
    
    return {"status": "success", "teacher_name": teacher.name}

@router.get("/auth/teacher/students")
async def get_teacher_students(email: str):
    """Get all students enrolled in the teacher's class."""
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
        
    teacher = await UserDataDoc.find_one(UserDataDoc.email == email)
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
        
    # Find students linked to this teacher
    import time
    start_time = time.time()
    students = await UserDataDoc.find(UserDataDoc.teacher_id == str(teacher.id)).to_list()
    logging.info(f"Finding students took {time.time() - start_time:.4f}s. Found {len(students)} students.")
    
    response = []
    for s in students:
        # Calculate stats
        # Stats temporarily disabled as 'objects' field is deprecated
        # objects = s.objects or {}
        total_correct = 0
        total_incorrect = 0
        words_practiced = 0 # len(objects)
        
        # for stats in objects.values():
        #     total_correct += int(stats.get("correct", 0))
        #     total_incorrect += int(stats.get("incorrect", 0))
            
        total_attempts = total_correct + total_incorrect
        accuracy = 0
        if total_attempts > 0:
            accuracy = round((total_correct / total_attempts) * 100, 1)
            
        response.append({
            "name": s.name,
            "username": s.username,
            "email": s.email,
            "profile_image": s.profile_image,
            "average_score": accuracy,
            "words_practiced": words_practiced,
            "total_attempts": total_attempts
        })
    
    logging.info(f"Processing students took {time.time() - start_time:.4f}s total.")
    return response

@router.get("/auth/teacher/analytics")
async def get_class_analytics(email: str):
    """Get aggregate analytics for the teacher's class."""
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
        
    teacher = await UserDataDoc.find_one(UserDataDoc.email == email)
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
        
    # Get all students
    students = await UserDataDoc.find(UserDataDoc.teacher_id == str(teacher.id)).to_list()
    
    total_correct = 0
    total_incorrect = 0
    word_stats = {}  # {word: {correct: 0, incorrect: 0}}
    
    for student in students:
        # Placeholder: 'objects' or specific word stats are not currently on UserDataDoc.
        # We can implement real analytics aggregation from PerformanceMetricDoc later.
        pass

        # For now, we can count discovered words as "practiced"
        # for scene_id, words in student.discovered_scene_words.items():
        #     total_correct += len(words) 

            # correct_word = stats.get("correct_word", obj_name)
            # if correct_word not in word_stats:
            #     word_stats[correct_word] = {"correct": 0, "incorrect": 0}
            # word_stats[correct_word]["correct"] += correct
            # word_stats[correct_word]["incorrect"] += incorrect
            
    # Calculate overall accuracy
    total_attempts = total_correct + total_incorrect
    overall_accuracy = 0
    if total_attempts > 0:
        overall_accuracy = round((total_correct / total_attempts) * 100, 1)
        
    # Find difficult words (min 3 attempts to be significant)
    words_list = []
    for word, stats in word_stats.items():
        w_correct = stats["correct"]
        w_incorrect = stats["incorrect"]
        w_total = w_correct + w_incorrect
        
        if w_total >= 3:
            w_accuracy = (w_correct / w_total) * 100
            words_list.append({
                "word": word,
                "accuracy": round(w_accuracy, 1),
                "attempts": w_total
            })
            
    # Sort by accuracy ascending (lowest first)
    words_list.sort(key=lambda x: x["accuracy"])
    
    return {
        "overall_accuracy": overall_accuracy,
        "total_words_practiced": len(word_stats),
        "total_attempts": total_attempts,
        "struggling_words": words_list[:5]  # Top 5 hardest
    }
