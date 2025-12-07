from fastapi import APIRouter, HTTPException, Query
from app.db.models import SceneDoc, UserDataDoc
from typing import List, Optional
from pydantic import BaseModel

router = APIRouter()

class CreateSceneRequest(BaseModel):
    email: str
    name: str
    description: str
    teacher_words: Optional[List[str]] = []

@router.post("/scenes", response_model=SceneDoc)
async def create_scene(req: CreateSceneRequest):
    # Find teacher
    teacher = await UserDataDoc.find_one(UserDataDoc.email == req.email, UserDataDoc.role == "teacher")
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    new_scene = SceneDoc(
        name=req.name,
        description=req.description,
        teacher_id=str(teacher.id),
        teacher_words=req.teacher_words or []
    )
    await new_scene.insert()
    return new_scene

@router.get("/scenes", response_model=List[SceneDoc])
async def get_scenes(email: str):
    # Find teacher
    teacher = await UserDataDoc.find_one(UserDataDoc.email == email, UserDataDoc.role == "teacher")
    if not teacher:
        return []

    scenes = await SceneDoc.find(SceneDoc.teacher_id == str(teacher.id)).to_list()
    return scenes
