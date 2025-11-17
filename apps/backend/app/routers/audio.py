from fastapi import APIRouter, UploadFile, File, HTTPException
from app.core.config import settings
from typing import Optional
from openai import OpenAI
import io
import logging
import warnings
from pydub import AudioSegment

# Suppress pydub warnings about missing ffprobe (we handle this explicitly)
warnings.filterwarnings("ignore", category=RuntimeWarning, module="pydub")

router = APIRouter(tags=["audio"])

@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...), language: Optional[str] = None):
    if not settings.openai_api_key:
        raise HTTPException(status_code=500, detail="Missing OPENAI_API_KEY")

    client = OpenAI(api_key=settings.openai_api_key)

    try:
        data = await file.read()
        filename = file.filename or "audio.webm"
        content_type = file.content_type or ""
        
        # Convert WebM to WAV (Firefox records in WebM, incompatible w/ OpenAI API)
        ext = "webm"
        if filename and "." in filename:
            ext = filename.split(".")[-1].lower()
        elif content_type and "/" in content_type:
            candidate = content_type.split("/")[-1].split(";")[0].strip()
            if candidate:
                ext = candidate
        
        is_webm = ext.lower() == "webm" or "webm" in content_type.lower()
        converted = False
        
        if is_webm:
            try:
                # Validate WebM file is not empty
                if len(data) < 100:  # WebM files should be at least a few hundred bytes
                    raise HTTPException(
                        status_code=400, 
                        detail="Audio file appears to be empty or incomplete. Please ensure the recording was properly stopped."
                    )
                
                # Load WebM audio and convert to WAV
                audio = AudioSegment.from_file(io.BytesIO(data), format="webm")
                # Export to WAV format in memory
                wav_buffer = io.BytesIO()
                audio.export(wav_buffer, format="wav")
                wav_buffer.seek(0)
                data = wav_buffer.read()
                filename = "audio.wav"
                ext = "wav"
                converted = True
            except HTTPException:
                raise
            except Exception as conv_e:
                # Check if error is due to missing ffmpeg/ffprobe
                error_str = str(conv_e).lower()
                if any(keyword in error_str for keyword in ["ffprobe", "ffmpeg", "no such file or directory: 'ffprobe'", "no such file or directory: 'ffmpeg'"]):
                    raise HTTPException(
                        status_code=500,
                        detail="Audio conversion requires ffmpeg to be installed. Please install ffmpeg (e.g., 'brew install ffmpeg' on macOS, 'apt-get install ffmpeg' on Ubuntu) to convert WebM audio files."
                    )
                # Check if error indicates corrupted/incomplete WebM
                if any(keyword in error_str for keyword in ["ebml", "parsing failed", "invalid data", "corrupted", "incomplete"]):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Audio file appears to be corrupted or incomplete. This can happen if the recording wasn't properly finalized. Error: {str(conv_e)[:200]}"
                    )
                # For other conversion errors, log and try original format (will likely fail)
                logging.warning(f"Failed to convert WebM to WAV: {conv_e}. Attempting with original format (may fail).")
            
        # Use a file-like object so the SDK detects format by name
        buf = io.BytesIO(data)
        buf.name = filename

        try:
            # Call for transcription
            resp = client.audio.transcriptions.create(
                model=settings.transcription_model,
                file=buf,
                language=language,
            )
            text = getattr(resp, "text", None)
            if not text:
                raise HTTPException(status_code=502, detail="Transcription failed")
            return {"text": text}
        except Exception as e:
            # If we tried original WebM and it failed
            if is_webm and not converted:
                raise HTTPException(
                    status_code=400,
                    detail=f"Failed to process WebM audio file. The file may be corrupted or incomplete. Please try recording again. Original error: {str(e)[:200]}"
                )
            # Re-raise other errors
            if isinstance(e, HTTPException):
                raise
            raise HTTPException(status_code=500, detail=f"Transcription error: {e}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription error: {e}")


