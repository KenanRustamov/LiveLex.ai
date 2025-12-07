from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List, Dict, Any
import json



THIS_DIR = Path(__file__).resolve().parent
ANNOTATIONS_DIR = THIS_DIR / "Action Object Dataset" / "Annotations"

@dataclass
class SceneObject:
    object_id: str
    labels_en: List[str]
    actionable: bool


@dataclass
class Scene:
    scene_id: str
    image_path: str              # path as stored in JSON
    objects: List[SceneObject]


@dataclass
class ActionExample:
    example_id: str
    scene_id: str
    scene_image_path: str
    action_image_path: str
    target_object_id: str
    prompt_en: str
    correct: bool

def _load_json(filename: str) -> Any:
    path = ANNOTATIONS_DIR / filename
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def load_scenes() -> List[Scene]:
    raw = _load_json("scenes.json")
    scenes: List[Scene] = []

    for scene_entry in raw:
        scene_id = scene_entry["scene_id"]
        image_path = scene_entry["image_path"]
        objects: List[SceneObject] = []

        for obj in scene_entry.get("objects", []):
            objects.append(
                SceneObject(
                    object_id=obj["object_id"],
                    labels_en=[lbl.lower() for lbl in obj.get("labels_en", [])],
                    actionable=bool(obj.get("actionable", False)),
                )
            )

        scenes.append(
            Scene(
                scene_id=scene_id,
                image_path=image_path,
                objects=objects,
            )
        )

    return scenes


def load_action_examples() -> List[ActionExample]:
    raw = _load_json("actions.json")
    actions: List[ActionExample] = []

    for ex in raw:
        actions.append(
            ActionExample(
                example_id=ex["example_id"],
                scene_id=ex["scene_id"],
                scene_image_path=ex["scene_image"],
                action_image_path=ex["action_image"],
                target_object_id=ex["target_object_id"],
                prompt_en=ex["prompt_en"],
                correct=bool(ex.get("correct", True)),
            )
        )

    return actions
