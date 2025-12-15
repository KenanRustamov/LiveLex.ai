import json, asyncio, os, time, subprocess, re
from pathlib import Path
import httpx
import jiwer
import unicodedata

SCRIPT_DIR = Path(__file__).resolve().parent
DATA_ROOT = SCRIPT_DIR / "Data" / "Voice_Transcription_Dataset"

BACKEND_URL = "http://localhost:8000/v1/transcribe"

TMP_AUDIO_DIR = Path("/eval/Data/.tmp_audio")
TMP_AUDIO_DIR.mkdir(exist_ok=True)


def find_audio_file(directory: Path, sample_id: str) -> Path | None:
    target = normalize_filename(sample_id)

    for p in directory.glob("*.m4a"):
        fname = normalize_filename(p.stem)
        if fname == target:
            return p

    return None

def normalize_filename(s: str) -> str:
    s = unicodedata.normalize("NFC", s)
    s = s.strip().rstrip(".")
    return s

def normalize_text(text: str) -> str:
    """
    Normalize text 
    - lowercase
    - remove punctuation
    - collapse whitespace
    """
    text = text.lower()

    # Replace Spanish punctuation with normal equivalents
    text = text.replace("¿", "").replace("¡", "")

    # Remove punctuation
    text = re.sub(r"[^\w\s]", "", text)

    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


# Audio conversion

def convert_to_webm(src_path: Path) -> Path | None:
    """
    Convert audio file to webm using ffmpeg.
    Returns path to converted file or None on failure.
    """
    out_path = TMP_AUDIO_DIR / (src_path.stem + ".webm")

    if out_path.exists():
        return out_path

    cmd = [
        "ffmpeg", "-y",
        "-i", str(src_path),
        "-vn",
        "-acodec", "libopus",
        str(out_path)
    ]

    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return out_path
    except Exception as e:
        print(f"[FFMPEG ERROR] {src_path.name}: {e}")
        return None


# Transcription call

async def transcribe(client, audio_path: Path, language=None):
    with open(audio_path, "rb") as f:
        files = {"file": (audio_path.name, f, "audio/webm")}
        data = {}
        if language:
            data["language"] = language

        resp = await client.post(BACKEND_URL, files=files, data=data)

    if resp.status_code != 200:
        return None, resp.status_code

    return resp.json().get("text", ""), resp.status_code


# Main eval

async def main():
    annotations_path = DATA_ROOT / "Annotations/transcriptions.json"
    with open(annotations_path, "r", encoding="utf-8") as f:
        annotations = json.load(f)

    total_samples = 0
    wer_scores = []
    cer_scores = []

    all_samples = []
    error_examples = []
    http_errors = []

    async with httpx.AsyncClient(timeout=60.0) as client:
        for subject in annotations:
            subject_audio_dir = Path(subject["audio_path"])

            for sample in subject["samples"]:
                sample_id = sample["sample_id"]

                raw_gold = sample["transcription"]
                gold = normalize_text(raw_gold)

                # Locate audio file (m4a)
                audio_dir = DATA_ROOT / subject_audio_dir
                audio_m4a = find_audio_file(audio_dir, sample_id)
                if not audio_m4a.exists():
                    print(f"[WARN] Missing audio for {sample_id}")
                    http_errors.append({
                        "sample_id": sample_id,
                        "error": "missing_audio",
                        "audio_path": str(audio_m4a)
                    })
                    continue

                # Convert to webm
                audio_webm = convert_to_webm(audio_m4a)
                if audio_webm is None:
                    http_errors.append({
                        "sample_id": sample_id,
                        "error": "ffmpeg_failed",
                        "audio_path": str(audio_m4a)
                    })
                    continue

                # Language mapping
                lang_raw = sample.get("language", "").lower()
                if lang_raw in ("english", "en"):
                    lang = "en"
                elif lang_raw in ("spanish", "es"):
                    lang = "es"
                else:
                    lang = None

                pred_raw, status = await transcribe(client, audio_webm, language=lang)

                if pred_raw is None:
                    print(f"[ERROR] {sample_id}: HTTP {status}")
                    http_errors.append({
                        "sample_id": sample_id,
                        "error": f"http_{status}",
                        "audio_path": str(audio_webm)
                    })
                    continue

                pred = normalize_text(pred_raw)

                wer = jiwer.wer(gold, pred)
                cer = jiwer.cer(gold, pred)

                total_samples += 1
                wer_scores.append(wer)
                cer_scores.append(cer)

                record = {
                    "sample_id": sample_id,
                    "language": lang,
                    "audio_path": str(audio_m4a),
                    "gold_raw": raw_gold,
                    "pred_raw": pred_raw,
                    "gold_norm": gold,
                    "pred_norm": pred,
                    "wer": wer,
                    "cer": cer,
                }

                all_samples.append(record)

                if gold != pred:
                    error_examples.append(record)

                print(
                    f"{sample_id} [{lang}]: "
                    f"WER={wer:.3f}, CER={cer:.3f}\n"
                    f"  gold='{gold}'\n"
                    f"  pred='{pred}'"
                )

    summary = {
        "total_samples": total_samples,
        "mean_WER": sum(wer_scores) / len(wer_scores) if wer_scores else None,
        "mean_CER": sum(cer_scores) / len(cer_scores) if cer_scores else None,
        "http_errors": http_errors,
        "errors": error_examples,
        "all_samples": all_samples,
    }

    ts = time.strftime("%Y%m%d_%H%M%S")
    out_path = f"eval/asr_eval_results_{ts}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    print(f"\n[saved] Results written to {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
