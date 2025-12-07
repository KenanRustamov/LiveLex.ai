import os
import json
import yaml
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "Data" / "Action Object Dataset"
ANNOTATIONS_DIR = DATA_DIR / "Annotations"

SCENES_PATH = ANNOTATIONS_DIR / "scenes.json"
ACTIONS_PATH = ANNOTATIONS_DIR / "actions.json"

CASES_OUT = BASE_DIR / "cases" / "action_object.yaml"


def load_json(path: Path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def build_scene_index(scenes):
    """
    scenes: list from scenes.json
    returns: dict[scene_id] -> scene_dict
    """
    return {scene["scene_id"]: scene for scene in scenes}


def build_object_index(scene):
    """
    For a single scene, index objects by object_id
    """
    return {obj["object_id"]: obj for obj in scene.get("objects", [])}


def build_cases(scenes, actions):
    """
    Turn your actions.json + scenes.json into eval 'cases'
    for run_eval.py. These are backend-agnostic: they just
    specify what a test example looks like.
    """
    scene_index = build_scene_index(scenes)
    cases = []

    for ex in actions:
        example_id = ex["example_id"]
        scene_id = ex["scene_id"]
        scene = scene_index.get(scene_id)
        if not scene:
            # Skip if inconsistent
            continue

        scene_image = ex["scene_image"]
        action_image = ex["action_image"]
        target_object_id = ex["target_object_id"]
        prompt_en = ex["prompt_en"]
        correct = ex["correct"]

        obj_index = build_object_index(scene)
        target_obj = obj_index.get(target_object_id)

        # If label is inconsistent, skip
        if not target_obj:
            continue

        # Ground-truth labels for this example
        labels_en = target_obj.get("labels_en", [])
        primary_label = labels_en[0] if labels_en else None

        cases.append({
            "id": f"{example_id}_gold",
            "input": {
                "mode": "action_object_eval",
                "scene_id": scene_id,
                "example_id": example_id,
                "scene_image": scene_image,
                "action_image": action_image,
                # what the system should understand
                "target_object_id": target_object_id,
                "target_labels_en": labels_en,
                "transcription_en": primary_label,
                "prompt_en": prompt_en,
                "expected_correct": True,
            },
        })

        # NEGATIVE CASE
        # shuffle labels from the same scene and treat that as the 'expected' target; but keep the same action_image.
        other_objs = [
            o for oid, o in obj_index.items()
            if oid != target_object_id and o.get("actionable", False)
        ]

        if other_objs:
            wrong_obj = other_objs[0]  # simple deterministic pick
            wrong_labels = wrong_obj.get("labels_en", [])
            wrong_label = wrong_labels[0] if wrong_labels else None

            cases.append({
                "id": f"{example_id}_neg_wrong_object",
                "input": {
                    "mode": "action_object_eval",
                    "scene_id": scene_id,
                    "example_id": example_id,
                    "scene_image": scene_image,
                    "action_image": action_image,
                    "target_object_id": wrong_obj.get("object_id"),
                    "target_labels_en": wrong_labels,
                    "transcription_en": primary_label,
                    "prompt_en": prompt_en,
                    "expected_correct": False,
                    "negative_type": "wrong_object",
                },
            })
    return cases


def main():
    scenes = load_json(SCENES_PATH)
    actions = load_json(ACTIONS_PATH)

    cases = build_cases(scenes, actions)

    CASES_OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(CASES_OUT, "w", encoding="utf-8") as f:
        yaml.safe_dump(cases, f, sort_keys=False, allow_unicode=True)

    print(f"Wrote {len(cases)} cases to {CASES_OUT}")


if __name__ == "__main__":
    main()
