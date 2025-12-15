import json
import asyncio
import time
from pathlib import Path
import httpx


EVAL_ROOT = Path(__file__).resolve().parent
REPO_ROOT = EVAL_ROOT.parent
DATA_ROOT = EVAL_ROOT / "Data"
GRAMMAR_PATH = DATA_ROOT / "Grammar Evaluation Dataset"/"grammar.json"
BACKEND_URL = "http://localhost:8000/v1/chat"


def save_results(results: dict, prefix="grammar_eval_results"):
    ts = time.strftime("%Y%m%d_%H%M%S")
    out = f"eval/{prefix}_{ts}.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"[saved] {out}")


async def judge_sentence(client, example_id, sentence):
    payload = {
        "task": "grammar_judgment",
        "example_id": example_id,
        "sentence": sentence,
    }
    r = await client.post(BACKEND_URL, json=payload, timeout=60)
    if r.status_code != 200:
        return None, r.status_code
    return r.json(), 200


async def main():
    with open(GRAMMAR_PATH, "r", encoding="utf-8") as f:
        examples = json.load(f)

    total = 0
    correct_sentence_hits = 0
    error_type_hits = 0

    all_results = []
    errors = []

    async with httpx.AsyncClient() as client:
        for ex in examples:
            ex_id = ex["example_id"]
            gold_error = ex["error_type"]

            res, status = await judge_sentence(
                client,
                ex_id + "_correct",
                ex["correct_sentence"],
            )

            total += 1
            if res and res["is_correct"] is True:
                correct_sentence_hits += 1
            else:
                errors.append({
                    "example_id": ex_id,
                    "case": "correct_sentence",
                    "expected": "correct",
                    "model_output": res,
                })

            all_results.append(res)

            res, status = await judge_sentence(
                client,
                ex_id + "_incorrect",
                ex["incorrect_sentence"],
            )

            total += 1
            if res and res["is_correct"] is False:
                correct_sentence_hits += 1
                if res.get("error_type") == gold_error:
                    error_type_hits += 1
                else:
                    errors.append({
                        "example_id": ex_id,
                        "case": "error_type_mismatch",
                        "expected": gold_error,
                        "predicted": res.get("error_type"),
                    })
            else:
                errors.append({
                    "example_id": ex_id,
                    "case": "incorrect_sentence_missed",
                    "expected": gold_error,
                    "model_output": res,
                })

            all_results.append(res)

    summary = {
        "total_cases": total,
        "sentence_accuracy": correct_sentence_hits / total,
        "error_type_accuracy": error_type_hits / len(examples),
        "num_examples": len(examples),
        "errors": errors,
        "results": all_results,
    }

    print(json.dumps(summary, indent=2, ensure_ascii=False))
    save_results(summary)


if __name__ == "__main__":
    asyncio.run(main())
