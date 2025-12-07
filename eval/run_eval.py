import argparse
import asyncio
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Tuple
import time
import httpx

from Data import dataset_loader

# Backend URL for FastAPI app
DEFAULT_BACKEND = os.getenv("EVAL_BACKEND_URL", "http://localhost:8000")

# Paths
EVAL_ROOT = Path(__file__).resolve().parent
REPO_ROOT = EVAL_ROOT.parent
DATA_ROOT = EVAL_ROOT / "Data"

def save_results(results: dict, prefix: str = "eval_results"):
    ts = time.strftime("%Y%m%d_%H%M%S")
    out_path = f"{prefix}_{ts}.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"[saved] Results written to {out_path}")

def safe_get_attr(obj: Any, *names: str) -> Any:
    """
    Try multiple attribute / key names on obj.
    Returns first non-None value, or None if nothing works.
    """
    for name in names:
        # dataclass or simple object
        if hasattr(obj, name):
            val = getattr(obj, name)
            if val is not None:
                return val
        # dict-like
        if isinstance(obj, dict) and name in obj and obj[name] is not None:
            return obj[name]
    return None


async def call_chat(client: httpx.AsyncClient, payload: Dict[str, Any]) -> httpx.Response:
    resp = await client.post(f"{DEFAULT_BACKEND}/v1/chat", json=payload, timeout=60.0)
    return resp


async def evaluate_scene_objects(
    client: httpx.AsyncClient,
    scenes: List[Any],
    max_scenes: int | None = None,
) -> Dict[str, Any]:
    """
    Evaluate 'scene_objects' task:
    - Model must list actionable objects from each scene image.
    - We compare predicted labels against ground-truth actionable objects.
    """
    if max_scenes is not None:
        scenes = scenes[:max_scenes]

    tp = fp = fn = 0
    num_scenes = len(scenes)
    exact_match_count = 0

    per_scene_errors: List[Dict[str, Any]] = []

    for scene in scenes:
        scene_id = safe_get_attr(scene, "scene_id") or "<unknown_scene>"
        image_rel = safe_get_attr(scene, "image_path")
        if not image_rel:
            print(f"[scene_objects] WARNING: scene {scene_id} missing image_path; skipping")
            continue

        scene_image_path = (EVAL_ROOT / image_rel).resolve()

        # Build ground-truth canonical labels + alias mapping
        actionable_objs = [
            obj for obj in getattr(scene, "objects", [])
            if getattr(obj, "actionable", False)
        ]

        alias_to_canonical: Dict[str, str] = {}
        canonical_set: set[str] = set()

        for obj in actionable_objs:
            labels = getattr(obj, "labels_en", []) or []
            if not labels:
                continue
            canonical = labels[0].strip().lower()
            canonical_set.add(canonical)
            for lab in labels:
                alias_to_canonical[lab.strip().lower()] = canonical

        payload = {
            "task": "scene_objects",
            "scene_id": scene_id,
            "scene_image_path": str(scene_image_path),
        }

        try:
            resp = await call_chat(client, payload)
        except Exception as e:
            print(f"[scene_objects] ERROR for {scene_id}: {e}")
            # All ground-truth are missed
            fn += len(canonical_set)
            per_scene_errors.append({
                "scene_id": scene_id,
                "error": f"request_failed: {e}",
                "gt_actionable": sorted(list(canonical_set)),
                "predicted": [],
                "matched": [],
                "extra": [],
                "missing": sorted(list(canonical_set)),
            })
            continue

        if resp.status_code != 200:
            print(f"[scene_objects] ERROR for {scene_id}: HTTP {resp.status_code}: {resp.text}")
            fn += len(canonical_set)
            per_scene_errors.append({
                "scene_id": scene_id,
                "error": f"http_{resp.status_code}",
                "gt_actionable": sorted(list(canonical_set)),
                "predicted": [],
                "matched": [],
                "extra": [],
                "missing": sorted(list(canonical_set)),
            })
            continue

        data = resp.json()
        predicted_raw: List[str] = []

        if isinstance(data, dict):
            if "predicted_objects" in data and isinstance(data["predicted_objects"], list):
                for obj in data["predicted_objects"]:
                    if isinstance(obj, dict):
                        lbl = obj.get("label")
                        if lbl:
                            predicted_raw.append(str(lbl))
                    elif isinstance(obj, str):
                        predicted_raw.append(obj)
            elif "objects" in data and isinstance(data["objects"], list):
                # fall back to generic "objects" key if you ever change the schema
                for obj in data["objects"]:
                    if isinstance(obj, dict):
                        lbl = obj.get("label") or obj.get("source_name") or obj.get("name")
                        if lbl:
                            predicted_raw.append(str(lbl))
                    elif isinstance(obj, str):
                        predicted_raw.append(obj)

        matched_canonical: set[str] = set()
        extras: List[str] = []

        for lbl in predicted_raw:
            norm = lbl.strip().lower()
            canonical = alias_to_canonical.get(norm)
            if not canonical:
                # predicted something that is not a known actionable label → FP
                fp += 1
                extras.append(lbl)
                continue

            if canonical not in matched_canonical:
                matched_canonical.add(canonical)
                tp += 1
            else:
                # duplicate prediction counts as another FP
                fp += 1
                extras.append(lbl + " (duplicate)")

        missing = canonical_set - matched_canonical
        fn += len(missing)

        if not extras and not missing:
            exact_match_count += 1
        else:
            per_scene_errors.append({
                "scene_id": scene_id,
                "gt_actionable": sorted(list(canonical_set)),
                "predicted": predicted_raw,
                "matched": sorted(list(matched_canonical)),
                "extra": extras,
                "missing": sorted(list(missing)),
            })

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (
        2 * precision * recall / (precision + recall)
        if (precision + recall) > 0
        else 0.0
    )
    scene_exact = exact_match_count / num_scenes if num_scenes > 0 else 0.0

    # Limit error examples a bit so JSON isn't gigantic
    example_errors = per_scene_errors[:10]

    return {
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "scene_exact_match": scene_exact,
        "num_scenes": num_scenes,
        "example_errors": example_errors,
        "all_errors": per_scene_errors
    }


async def evaluate_action_judgment(
    client: httpx.AsyncClient,
    scenes: List[Any],
    max_examples: int | None = None,
) -> Dict[str, Any]:
    """
    Evaluate 'action_judgment' task:
    - Each example: (scene_image, action_image, prompt_en, correct label True/False).
    - The model says predicted_correct True/False.
    """
    scene_by_id = {safe_get_attr(s, "scene_id"): s for s in scenes}
    examples = dataset_loader.load_action_examples()

    if max_examples is not None:
        examples = examples[:max_examples]

    tp = fp = tn = fn = 0
    skipped = 0

    fp_examples: List[Dict[str, Any]] = []
    fn_examples: List[Dict[str, Any]] = []

    for ex in examples:
        example_id = safe_get_attr(ex, "example_id") or "<unknown_example>"
        scene_id = safe_get_attr(ex, "scene_id")

        # Try multiple possible field names → fixes the NoneType crash
        scene_image_rel = safe_get_attr(ex, "scene_image", "scene_image_path")
        action_image_rel = safe_get_attr(ex, "action_image", "action_image_path")

        # Fallback: infer scene image from scenes.json if missing
        if not scene_image_rel and scene_id and scene_id in scene_by_id:
            scene = scene_by_id[scene_id]
            scene_image_rel = safe_get_attr(scene, "image_path")

        if not scene_image_rel or not action_image_rel:
            print(
                f"[action_judgment] WARNING: {example_id} missing scene_image/action_image; skipping"
            )
            skipped += 1
            continue

        scene_image = (EVAL_ROOT / scene_image_rel).resolve()
        action_image = (EVAL_ROOT / action_image_rel).resolve()

        prompt_en = safe_get_attr(ex, "prompt_en") or ""
        gt_correct = bool(safe_get_attr(ex, "correct"))

        payload = {
            "task": "action_judgment",
            "example_id": example_id,
            "scene_image_path": str(scene_image),
            "action_image_path": str(action_image),
            "prompt_en": prompt_en,
        }

        try:
            resp = await call_chat(client, payload)
        except Exception as e:
            print(f"[action_judgment] ERROR for {example_id}: {e}")
            skipped += 1
            continue

        if resp.status_code != 200:
            print(
                f"[action_judgment] ERROR for {example_id}: "
                f"HTTP {resp.status_code}: {resp.text}"
            )
            skipped += 1
            continue

        data = resp.json()
        if not isinstance(data, dict) or "predicted_correct" not in data:
            print(f"[action_judgment] ERROR for {example_id}: missing predicted_correct")
            skipped += 1
            continue

        pred_correct = bool(data["predicted_correct"])

        # Confusion-matrix bookkeeping (positive = 'correct action')
        if gt_correct and pred_correct:
            tp += 1
        elif gt_correct and not pred_correct:
            fn += 1
            if len(fn_examples) < 10:
                fn_examples.append(
                    {
                        "example_id": example_id,
                        "scene_image": str(scene_image),
                        "action_image": str(action_image),
                        "prompt_en": prompt_en,
                        "ground_truth_correct": gt_correct,
                        "predicted_correct": pred_correct,
                    }
                )
        elif (not gt_correct) and pred_correct:
            fp += 1
            if len(fp_examples) < 10:
                fp_examples.append(
                    {
                        "example_id": example_id,
                        "scene_image": str(scene_image),
                        "action_image": str(action_image),
                        "prompt_en": prompt_en,
                        "ground_truth_correct": gt_correct,
                        "predicted_correct": pred_correct,
                    }
                )
        else:
            tn += 1

    total_used = tp + fp + tn + fn
    accuracy = (tp + tn) / total_used if total_used > 0 else 0.0
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (
        2 * precision * recall / (precision + recall)
        if (precision + recall) > 0
        else 0.0
    )

    return {
        "num_examples": total_used,
        "skipped_examples": skipped,
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "tp": tp,
        "fp": fp,
        "fn": fn,
        "tn": tn,
        "error_examples": {
            "false_positives": fp_examples,
            "false_negatives": fn_examples,
        },
        "all_false_positives": fp_examples,
        "all_false_negatives": fn_examples,
    }


async def main(args: argparse.Namespace):
    async with httpx.AsyncClient() as client:
        scenes = dataset_loader.load_scenes()

        scene_metrics = await evaluate_scene_objects(
            client,
            scenes,
            max_scenes=args.max_scenes,
        )

        action_metrics = await evaluate_action_judgment(
            client,
            scenes,
            max_examples=args.max_actions,
        )

    # Combine final results
    final_results = {
        "backend": DEFAULT_BACKEND,
        "scene_objects": scene_metrics,
        "action_judgment": action_metrics,

        "scene_errors": scene_metrics.get("all_errors", []),
        "action_errors": {
            "false_positives": action_metrics.get("all_false_positives", []),
            "false_negatives": action_metrics.get("all_false_negatives", []),
        },
    }


    # Print to console
    print(json.dumps(final_results, indent=2))

    # Save to timestamped JSON file
    save_results(final_results)




if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--max_scenes",
        type=int,
        default=None,
        help="Limit number of scenes evaluated (default: all)",
    )
    parser.add_argument(
        "--max_actions",
        type=int,
        default=None,
        help="Limit number of action examples evaluated (default: all)",
    )
    args = parser.parse_args()
    asyncio.run(main(args))
