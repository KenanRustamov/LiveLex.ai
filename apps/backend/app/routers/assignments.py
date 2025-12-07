from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from app.db.models import AssignmentDoc, UserDataDoc

router = APIRouter(tags=["assignments"])

class CreateAssignmentRequest(BaseModel):
    email: str
    title: str
    words: List[str]
    include_discovered_count: Optional[int] = 0
    include_grammar: Optional[bool] = False
    grammar_tense: Optional[str] = None     # "present" or "past"
    scene_id: Optional[str] = None

@router.post("/assignments")
async def create_assignment(req: CreateAssignmentRequest):
    """Create a new assignment for a teacher."""
    # Find teacher
    teacher = await UserDataDoc.find_one(UserDataDoc.email == req.email)
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
        
    if teacher.role != "teacher":
        raise HTTPException(status_code=403, detail="Only teachers can create assignments")
        
    assignment = AssignmentDoc(
        title=req.title,
        words=req.words,
        teacher_id=str(teacher.id),
        scene_id=req.scene_id,
        include_discovered_count=req.include_discovered_count,
        include_grammar=req.include_grammar,
        grammar_tense=req.grammar_tense
    )
    await assignment.insert()
    
    return {"status": "success", "id": str(assignment.id)}

@router.get("/assignments")
async def get_assignments(email: str):
    """Get assignments. For teacher: created by them. For student: created by their teacher."""
    user = await UserDataDoc.find_one(UserDataDoc.email == email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user.role == "teacher":
        teacher_id = str(user.id)
    elif user.role == "student":
        if not user.teacher_id:
             return [] # No teacher linked yet
        teacher_id = user.teacher_id
    else:
        return []

    assignments = await AssignmentDoc.find(AssignmentDoc.teacher_id == teacher_id).sort("-created_at").to_list()
    
    return [
        {
            "id": str(a.id),
            "title": a.title,
            "words": a.words,
            "created_at": a.created_at,
            "scene_id": getattr(a, "scene_id", None),
            "include_discovered_count": getattr(a, "include_discovered_count", 0),
            "include_grammar": getattr(a, "include_grammar", False),
            "grammar_tense": getattr(a, "grammar_tense", None),
        }
        for a in assignments
    ]
