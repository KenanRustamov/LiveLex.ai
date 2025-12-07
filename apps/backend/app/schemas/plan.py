from pydantic import BaseModel
import json

class Object(BaseModel):
    source_name: str
    target_name: str
    action: str

class Plan(BaseModel):
    scene_message: str
    objects: list[Object]


class SceneObject(BaseModel):
    """Vocab object for scene capture"""
    source_name: str
    target_name: str


class SceneVocab(BaseModel):
    """List of scene vocabulary extraction results."""
    objects: list[SceneObject]