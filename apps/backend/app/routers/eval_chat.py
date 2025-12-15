import base64
import json
import logging
import mimetypes
import os
import re
from typing import Literal, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from openai import OpenAI

from app.core.config import settings

router = APIRouter(tags=["eval"])


class SceneObjectsRequest(BaseModel):
    task: Literal["scene_objects"]
    scene_id: str
    scene_image_path: str


class ActionJudgmentRequest(BaseModel):
    task: Literal["action_judgment"]
    example_id: str
    scene_image_path: str
    action_image_path: str
    prompt_en: str


class PredictedObject(BaseModel):
    label: str


class SceneObjectsResponse(BaseModel):
    task: Literal["scene_objects"]
    scene_id: str
    predicted_objects: List[PredictedObject]


class ActionJudgmentResponse(BaseModel):
    task: Literal["action_judgment"]
    example_id: str
    predicted_correct: bool

class ChatEvalRequest(BaseModel):
    task: Literal["scene_objects", "action_judgment", "grammar_judgment"]

    # shared
    example_id: Optional[str] = None

    # scene_objects
    scene_id: Optional[str] = None
    scene_image_path: Optional[str] = None

    # action_judgment
    action_image_path: Optional[str] = None
    prompt_en: Optional[str] = None

    # grammar_judgment
    sentence: Optional[str] = None


def _ensure_openai_client() -> OpenAI:
    if not settings.openai_api_key:
        raise HTTPException(status_code=500, detail="Missing OPENAI_API_KEY")
    return OpenAI(api_key=settings.openai_api_key)


def _encode_image_to_data_url(path: str) -> str:
    if not path:
        raise HTTPException(status_code=400, detail="Missing image path")
    if not os.path.exists(path):
        raise HTTPException(
            status_code=400, detail=f"Image not found at path: {path}"
        )

    mime, _ = mimetypes.guess_type(path)
    if mime is None:
        mime = "image/png"

    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("utf-8")
    return f"data:{mime};base64,{b64}"


def _parse_json_text(text: str) -> dict:
    # Strip leading/trailing whitespace
    cleaned = text.strip()

    # If it looks like ```json ... ``` or ``` ... ``` then strip the fences
    if cleaned.startswith("```"):
        # Remove leading ```json or ``` plus newline
        cleaned = re.sub(r"^```[a-zA-Z0-9]*\n", "", cleaned)
        # Remove trailing ```
        cleaned = re.sub(r"\n```$", "", cleaned).strip()

    # As a fallback, grab the first {...} block
    if "{" in cleaned and "}" in cleaned:
        start = cleaned.find("{")
        end = cleaned.rfind("}") + 1
        cleaned = cleaned[start:end]

    try:
        return json.loads(cleaned)
    except Exception:
        logging.error("Failed to parse JSON from model output:\n%s", text)
        raise HTTPException(
            status_code=500,
            detail="Model did not return valid JSON; see backend logs for details.",
        )

@router.post("/chat")
async def chat_eval(body: ChatEvalRequest):
    client = _ensure_openai_client()

    if body.task == "scene_objects":
        if not body.scene_id or not body.scene_image_path:
            raise HTTPException(
                status_code=400,
                detail="scene_id and scene_image_path are required for task=scene_objects",
            )

        image_url = _encode_image_to_data_url(body.scene_image_path)

        user_text = (
            "You are assisting an AI system that teaches language using real-world scenes.\n"
            "You are given a single image.\n\n"
            "Identify all SAFE, manipulable objects that a student could reasonably pick up or hold "
            "for a language exercise (for example: 'thermometer', 'chips', 'wallet', 'headphones').\n"
            "- Exclude people, animals, sharp objects, hot surfaces, electrical outlets, cleaning chemicals,\n"
            "  heavy gym equipment, vehicles, or anything dangerous.\n"
            "- Exclude large furniture or fixed objects like tables unless they are small and easily held.\n"
            "- Try to generalize words (ex: 'chips' instead of 'potato chips').\n\n"
            "- Use short English noun phrases for labels.\n\n"
            "Respond ONLY with a JSON object of the form:\n"
            '{\n'
            '  "scene_id": "<scene_id>",\n'
            '  "predicted_objects": [\n'
            '    { "label": "<object_name_1>" },\n'
            '    { "label": "<object_name_2>" },\n'
            '    ...\n'
            '  ]\n'
            '}\n'
        )

        resp = client.responses.create(
            model=settings.llm_model,
            input=[
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": user_text},
                        {"type": "input_image", "image_url": image_url},
                    ],
                }
            ],
        )

        try:
            text_out = resp.output[0].content[0].text
        except Exception as e:
            logging.error("Unexpected response structure for scene_objects: %s", e, exc_info=True)
            raise HTTPException(
                status_code=500,
                detail="Unexpected model response structure; see backend logs.",
            )

        data = _parse_json_text(text_out)
        predicted_objects_raw = data.get("predicted_objects", [])
        predicted_objects: List[PredictedObject] = []

        if isinstance(predicted_objects_raw, list):
            for obj in predicted_objects_raw:
                if isinstance(obj, dict) and "label" in obj and isinstance(
                    obj["label"], str
                ):
                    predicted_objects.append(PredictedObject(label=obj["label"].strip()))
                elif isinstance(obj, str):
                    predicted_objects.append(PredictedObject(label=obj.strip()))

        return SceneObjectsResponse(
            task="scene_objects",
            scene_id=body.scene_id,
            predicted_objects=predicted_objects,
        )

    elif body.task == "action_judgment":
        if (
            not body.example_id
            or not body.scene_image_path
            or not body.action_image_path
            or not body.prompt_en
        ):
            raise HTTPException(
                status_code=400,
                detail=(
                    "example_id, scene_image_path, action_image_path, and prompt_en "
                    "are required for task=action_judgment"
                ),
            )

        scene_image_url = _encode_image_to_data_url(body.scene_image_path)
        action_image_url = _encode_image_to_data_url(body.action_image_path)

        user_text = (
            "You are evaluating whether a student correctly followed an instruction in a language-learning task.\n"
            "You are given:\n"
            "1) A SCENE image showing multiple objects.\n"
            "2) An ACTION image showing what the student actually did.\n"
            "3) A natural-language prompt describing what the student was *supposed* to do.\n\n"
            "Your job: Decide if the ACTION image correctly satisfies the prompt with respect to the SCENE.\n"
            "Examples of 'correct':\n"
            "- Prompt: 'Pick up the metal fork.' → Action image shows the student holding the metal fork.\n"
            "- Prompt: 'Pick up the headphones.' → Action image shows the student holding the headphones.\n\n"
            "Examples of 'incorrect':\n"
            "- Prompt: 'Pick up the fork.' → Action image shows the spoon.\n"
            "- Prompt: 'Pick up the red notebook.' → Action image shows a different object.\n\n"
            "Return ONLY a JSON object of the form:\n"
            '{\n'
            '  "task": "action_judgment",\n'
            '  "example_id": "<example_id>",\n'
            '  "predicted_correct": true or false\n'
            '}\n'
        )

        resp = client.responses.create(
            model=settings.llm_model,
            input=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": (
                                user_text
                                + "\n\nPrompt: \""
                                + body.prompt_en
                                + "\"\n\n"
                                "First image (SCENE): overall environment.\n"
                                "Second image (ACTION): what the student actually did.\n"
                            ),
                        },
                        {"type": "input_image", "image_url": scene_image_url},
                        {"type": "input_image", "image_url": action_image_url},
                    ],
                }
            ],
        )

        try:
            text_out = resp.output[0].content[0].text
        except Exception as e:
            logging.error("Unexpected response structure for action_judgment: %s", e, exc_info=True)
            raise HTTPException(
                status_code=500,
                detail="Unexpected model response structure; see backend logs.",
            )

        data = _parse_json_text(text_out)
        predicted_correct = bool(data.get("predicted_correct"))

        return ActionJudgmentResponse(
            task="action_judgment",
            example_id=body.example_id,
            predicted_correct=predicted_correct,
        )
    
    elif body.task == "grammar_judgment":
        if not body.example_id or not body.sentence:
            raise HTTPException(
                status_code=400,
                detail="example_id and sentence are required for task=grammar_judgment",
            )

        user_text = (
            "You are evaluating Spanish grammar in a language-learning task.\n\n"
            "You are given ONE sentence.\n\n"
            "Your job:\n"
            "1) Decide whether the sentence is grammatically correct Spanish.\n"
            "2) If it is incorrect, identify the SINGLE best error type.\n\n"
            "Valid error_type values (use EXACTLY one of these, lowercase):\n"
            "- article_gender\n"
            "- tense_mismatch\n"
            "- incorrect_conjugation\n"
            "- wrong_person\n"
            "- infinitive_instead_of_conjugated\n"
            "- wrong_person_tense\n"
            "- subjunctive_instead_of_indicative\n"
            "- unmotivated_plural\n\n"
            "If the sentence is correct, set error_type to null.\n\n"
            "Return ONLY a JSON object of the form:\n"
            "{\n"
            '  "task": "grammar_judgment",\n'
            '  "example_id": "<example_id>",\n'
            '  "is_correct": true or false,\n'
            '  "error_type": "<one_of_the_list_above>" or null\n'
            "}\n"
        )

        resp = client.responses.create(
            model=settings.llm_model,
            input=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": user_text + "\n\nSentence:\n" + body.sentence,
                        }
                    ],
                }
            ],
        )

        try:
            text_out = resp.output[0].content[0].text
        except Exception as e:
            logging.error("Unexpected response structure for grammar_judgment: %s", e, exc_info=True)
            raise HTTPException(
                status_code=500,
                detail="Unexpected model response structure; see backend logs.",
            )

        data = _parse_json_text(text_out)

        return {
            "task": "grammar_judgment",
            "example_id": body.example_id,
            "is_correct": bool(data.get("is_correct")),
            "error_type": data.get("error_type"),
        }

    else:
        raise HTTPException(status_code=400, detail=f"Unknown task: {body.task}")
