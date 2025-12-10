from fastapi import APIRouter, HTTPException, Query
from app.db.models import SceneDoc, UserDataDoc
from typing import List, Optional
from pydantic import BaseModel
from app.dependencies import get_current_teacher

router = APIRouter()

class CreateSceneRequest(BaseModel):
    email: str
    name: str
    description: str
    teacher_words: Optional[List[str]] = []

@router.post("/teacher/scenes", response_model=dict)
async def create_scene(req: CreateSceneRequest):
    teacher = await get_current_teacher(req.email)

    new_scene = SceneDoc(
        name=req.name,
        description=req.description,
        teacher_id=str(teacher.id),
        teacher_words=req.teacher_words or []
    )
    await new_scene.insert()
    
    return {
        "id": str(new_scene.id),
        "name": new_scene.name,
        "description": new_scene.description,
        "teacher_id": new_scene.teacher_id,
        "teacher_words": new_scene.teacher_words,
        "image_url": new_scene.image_url
    }

@router.get("/teacher/scenes", response_model=List[dict])
async def get_scenes(email: str):
    teacher = await get_current_teacher(email)
    scenes = await SceneDoc.find(SceneDoc.teacher_id == str(teacher.id)).to_list()
    
    return [
        {
            "id": str(s.id),
            "name": s.name,
            "description": s.description,
            "teacher_id": s.teacher_id,
            "teacher_words": s.teacher_words,
            "image_url": s.image_url
        }
        for s in scenes
    ]

@router.delete("/teacher/scenes/{scene_id}")
async def delete_scene(scene_id: str, email: str):
    """Delete a scene."""
    teacher = await get_current_teacher(email)

    scene = await SceneDoc.get(scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    if scene.teacher_id != str(teacher.id):
        raise HTTPException(status_code=403, detail="Not your scene")

    await scene.delete()
    return {"status": "success"}

@router.put("/teacher/scenes/{scene_id}")
async def update_scene(scene_id: str, req: CreateSceneRequest):
    """Update a scene."""
    teacher = await get_current_teacher(req.email)

    scene = await SceneDoc.get(scene_id)
    if not scene:
        raise HTTPException(status_code=404, detail="Scene not found")

    if scene.teacher_id != str(teacher.id):
        raise HTTPException(status_code=403, detail="Not your scene")

    scene.name = req.name
    scene.description = req.description
    scene.teacher_words = req.teacher_words or []
    
    await scene.save()
    return {"status": "success"}


@router.get("/student/scenes", response_model=List[dict])
async def get_student_scenes(email: str):
    """Get scenes for a student's enrolled class (teacher-created scenes)."""
    user = await UserDataDoc.find_one(UserDataDoc.email == email)
    if not user:
        return []
    
    # Find the teacher ID - either directly or via class code
    teacher_id = user.teacher_id
    if not teacher_id and user.class_code:
        teacher = await UserDataDoc.find_one(UserDataDoc.teacher_code == user.class_code)
        if teacher:
            teacher_id = str(teacher.id)
    
    if not teacher_id:
        return []
    
    # Get scenes created by the teacher
    scenes = await SceneDoc.find(SceneDoc.teacher_id == teacher_id).to_list()
    
    return [
        {
            "id": str(s.id),
            "name": s.name,
            "description": s.description,
            "teacher_words": s.teacher_words,
        }
        for s in scenes
    ]
