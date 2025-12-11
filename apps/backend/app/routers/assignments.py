from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from app.db.models import AssignmentDoc, UserDataDoc
from app.dependencies import get_current_teacher

router = APIRouter()


class VocabItem(BaseModel):
    source_name: str
    target_name: str


class CreateAssignmentRequest(BaseModel):
    email: str
    title: str
    vocab: List[VocabItem] = []
    scene_id: Optional[str] = None
    include_discovered_count: int = 0
    include_grammar: bool = False
    grammar_tense: Optional[str] = None

@router.post("/assignments", response_model=dict)
async def create_assignment(req: CreateAssignmentRequest):
    """Create a new assignment for a teacher."""
    teacher = await get_current_teacher(req.email)

    # Convert VocabItem objects to dicts for storage
    vocab_dicts = [{"source_name": v.source_name, "target_name": v.target_name} for v in (req.vocab or [])]

    new_assignment = AssignmentDoc(
        title=req.title,
        vocab=vocab_dicts,
        teacher_id=str(teacher.id),
        scene_id=req.scene_id,
        include_discovered_count=req.include_discovered_count,
        include_grammar=req.include_grammar,
        grammar_tense=req.grammar_tense
    )
    await new_assignment.insert()
    
    return {
        "id": str(new_assignment.id),
        "title": new_assignment.title,
        "vocab": new_assignment.vocab,
        "created_at": new_assignment.created_at,
        "scene_id": new_assignment.scene_id,
        "include_discovered_count": new_assignment.include_discovered_count,
        "include_grammar": new_assignment.include_grammar,
        "grammar_tense": new_assignment.grammar_tense
    }

@router.get("/assignments", response_model=List[dict])
async def get_assignments(email: str):
    """Get assignments. For teacher: created by them. For student: created by their teacher."""
    # Logic: If teacher, show their assignments.
    # If student, show assignments for their enrolled class.
    
    user = await UserDataDoc.find_one(UserDataDoc.email == email)
    if not user:
        return []
    
    target_teacher_id = None
    if user.role == "teacher":
        target_teacher_id = str(user.id)
    elif user.role == "student":
        # UPDATED: Use enrolled_class_code to find the teacher
        if user.class_code:
             teacher = await UserDataDoc.find_one(UserDataDoc.teacher_code == user.class_code)
             if teacher:
                 target_teacher_id = str(teacher.id)
        # Fallback to teacher_id if enrolled_class_code didn't work (legacy)
        if not target_teacher_id and user.teacher_id:
            target_teacher_id = user.teacher_id

    if not target_teacher_id:
        return []

    assignments = await AssignmentDoc.find(AssignmentDoc.teacher_id == target_teacher_id).sort("-created_at").to_list()
    
    # Return with additional info if needed
    result = []
    for a in assignments:
        assignment_data = {
            "id": str(a.id),
            "title": a.title,
            "vocab": getattr(a, 'vocab', []),
            "created_at": a.created_at,
            "scene_id": a.scene_id,
            "scene_name": None,
            "include_discovered_count": a.include_discovered_count,
            "include_grammar": a.include_grammar or False,
            "grammar_tense": a.grammar_tense
        }
        
        # Fetch scene name if scene_id exists
        if a.scene_id:
            from app.db.models import SceneDoc
            scene = await SceneDoc.get(a.scene_id)
            if scene:
                assignment_data["scene_name"] = scene.name
        
        result.append(assignment_data)
    
    return result

@router.delete("/assignments/{assignment_id}")
async def delete_assignment(assignment_id: str, email: str):
    """Delete an assignment."""
    teacher = await get_current_teacher(email)
    
    assignment = await AssignmentDoc.get(assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
        
    if assignment.teacher_id != str(teacher.id):
        raise HTTPException(status_code=403, detail="Not your assignment")
        
    await assignment.delete()
    return {"status": "success"}

@router.put("/assignments/{assignment_id}")
async def update_assignment(assignment_id: str, req: CreateAssignmentRequest):
    """Update an assignment."""
    teacher = await get_current_teacher(req.email)
         
    assignment = await AssignmentDoc.get(assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
        
    if assignment.teacher_id != str(teacher.id):
        raise HTTPException(status_code=403, detail="Not your assignment")
    
    # Convert VocabItem objects to dicts for storage
    vocab_dicts = [{"source_name": v.source_name, "target_name": v.target_name} for v in (req.vocab or [])]
    
    assignment.title = req.title
    assignment.vocab = vocab_dicts
    assignment.scene_id = req.scene_id
    assignment.include_discovered_count = req.include_discovered_count
    assignment.include_grammar = req.include_grammar
    assignment.grammar_tense = req.grammar_tense
    
    await assignment.save()
    return {
        "id": str(assignment.id),
        "title": assignment.title,
        "vocab": assignment.vocab,
        "created_at": assignment.created_at,
        "scene_id": assignment.scene_id,
        "include_discovered_count": assignment.include_discovered_count,
        "include_grammar": assignment.include_grammar,
        "grammar_tense": assignment.grammar_tense
    }
