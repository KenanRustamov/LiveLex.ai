import json, asyncio, os, time
from pathlib import Path
import httpx
import jiwer  # for WER/CER

DATA_ROOT = Path("Data/Voice_Transcription_Dataset")

def save_results(results: dict, prefix: str = "asr_eval_results"):
    ts = time.strftime("%Y%m%d_%H%M%S")
    out_path = f"{prefix}_{ts}.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"[saved] Results written to {out_path}")


async def transcribe(client, audio_path, language=None):
    with open(audio_path, "rb") as f:
        files = {"file": (audio_path.name, f, "audio/wav")}
        data = {}
        if language:
            data["language"] = language
        resp = await client.post("http://localhost:8000/transcribe", files=files, data=data)
    if resp.status_code != 200:
        return None, resp.status_code
    return resp.json().get("text", ""), resp.status_code



async def main():
    annotations_path = DATA_ROOT / "Annotations/annotations.json"
    with open(annotations_path, "r") as f:
        annotations = json.load(f)

    total_samples = 0
    wer_scores = []
    cer_scores = []

    all_samples: list[dict] = []
    error_examples: list[dict] = []
    http_errors: list[dict] = []

    async with httpx.AsyncClient() as client:
        for subject in annotations:
            subject_audio_dir = Path(subject["audio_path"])

            for sample in subject["samples"]:
                sample_id = sample["sample_id"]
                gold = sample["transcription"].strip().lower()

                audio_file = subject_audio_dir / f"{sample_id}.wav"
                if not audio_file.exists():
                    print(f"[WARN] Missing audio file for {sample_id}")
                    http_errors.append({
                        "sample_id": sample_id,
                        "error": "missing_audio",
                        "audio_path": str(audio_file)
                    })
                    continue

                lang_raw = sample.get("language", "").lower()
                if lang_raw in ("english", "en"):
                    lang = "en"
                elif lang_raw in ("spanish", "es"):
                    lang = "es"
                else:
                    lang = None 

                pred, status = await transcribe(client, audio_file, language=lang)

                if pred is None:
                    print(f"[ERROR] {sample_id}: HTTP {status}")
                    http_errors.append({
                        "sample_id": sample_id,
                        "error": f"http_{status}",
                        "audio_path": str(audio_file)
                    })
                    continue

                pred = pred.strip().lower()

                wer = jiwer.wer(gold, pred)
                cer = jiwer.cer(gold, pred)

                wer_scores.append(wer)
                cer_scores.append(cer)
                total_samples += 1

                sample_record = {
                    "sample_id": sample_id,
                    "audio_path": str(audio_file),
                    "gold": gold,
                    "predicted": pred,
                    "wer": wer,
                    "cer": cer,
                }
                all_samples.append(sample_record)

                if pred != gold:
                    error_examples.append(sample_record)

                print(f"{sample_id}: gold='{gold}', pred='{pred}', WER={wer:.3f}, CER={cer:.3f}")

    summary = {
        "total_samples": total_samples,
        "mean_WER": sum(wer_scores) / len(wer_scores) if wer_scores else None,
        "mean_CER": sum(cer_scores) / len(cer_scores) if cer_scores else None,
        "http_errors": http_errors,
        "all_samples": all_samples,
        "errors": error_examples,
    }

    print("\n===== ASR EVALUATION SUMMARY =====")
    print(json.dumps(summary, indent=2))
    save_results(summary)


if __name__ == "__main__":
    asyncio.run(main())
