import json
import os
import base64
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional


# base directory for storing dialogue data
DATA_DIR = Path("data")
DIALOGUES_DIR = DATA_DIR / "dialogues"


def ensure_directories():
    """Ensure data directories exist."""
    DIALOGUES_DIR.mkdir(parents=True, exist_ok=True)


def get_session_images_dir(session_id: str) -> Path:
    """Get the images directory for a session."""
    return DIALOGUES_DIR / session_id / "images"


def save_image_from_data_url(session_id: str, utterance_id: str, image_data_url: str) -> Optional[str]:
    """Save an image from a data URL to a file. Returns the relative file path or None."""
    if not image_data_url or not image_data_url.startswith("data:image/"):
        return None
    
    try:
        # data URL: data:image/jpeg;base64,<data>
        header, data = image_data_url.split(",", 1)
        # extract image format from header ("data:image/jpeg;base64" -> "jpeg")
        format_part = header.split("/")[1].split(";")[0] if "/" in header else "jpg"
        ext = format_part if format_part in ["jpeg", "jpg", "png", "gif", "webp"] else "jpg"
        
        image_bytes = base64.b64decode(data)
        
        images_dir = get_session_images_dir(session_id)
        images_dir.mkdir(parents=True, exist_ok=True)
        
        image_filename = f"{utterance_id}.{ext}"
        image_path = images_dir / image_filename
        
        with open(image_path, "wb") as f:
            f.write(image_bytes)
        
        # return relative path from dialogues directory
        return f"{session_id}/images/{image_filename}"
    except Exception as e:
        # log errors but don't crash
        print(f"Error saving image for utterance {utterance_id}: {e}")
        return None


def get_session_file(session_id: str) -> Path:
    """Get the file path for a session."""
    return DIALOGUES_DIR / f"{session_id}.json"


def load_session_data(session_id: str) -> Optional[Dict[str, Any]]:
    """Load existing session data from JSON file."""
    ensure_directories()
    session_file = get_session_file(session_id)
    if session_file.exists():
        try:
            with open(session_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None
    return None


def save_session_data(session_id: str, data: Dict[str, Any]) -> None:
    """Save/update session data to JSON file."""
    ensure_directories()
    session_file = get_session_file(session_id)
    
    # load existing data if it exists
    existing_data = load_session_data(session_id) or {}
    
    merged_data = {**existing_data, **data}
    
    # timestamps
    if "started_at" not in merged_data:
        merged_data["started_at"] = datetime.now().isoformat()
    if data.get("completed_at") or data.get("summary"):
        merged_data["completed_at"] = datetime.now().isoformat()
    
    merged_data["session_id"] = session_id
    
    with open(session_file, "w", encoding="utf-8") as f:
        json.dump(merged_data, f, indent=2, ensure_ascii=False)


def append_dialogue_entry(session_id: str, entry: Dict[str, Any]) -> None:
    """Append a dialogue entry to the session. If entry contains image_data_url, save image separately."""
    ensure_directories()
    session_file = get_session_file(session_id)
    
    # if entry has image_data_url, save image and replace with file path
    if "image_data_url" in entry:
        utterance_id = entry.get("utterance_id", f"img_{datetime.now().timestamp()}")
        image_path = save_image_from_data_url(session_id, utterance_id, entry["image_data_url"])
        if image_path:
            entry["image_path"] = image_path
        # remove the data URL from the entry
        del entry["image_data_url"]
    
    # load existing session or create new
    session_data = load_session_data(session_id) or {
        "session_id": session_id,
        "started_at": datetime.now().isoformat(),
        "entries": [],
        "plan": None,
    }
    
    if "entries" not in session_data:
        session_data["entries"] = []
    
    if "timestamp" not in entry:
        entry["timestamp"] = datetime.now().isoformat()
    
    session_data["entries"].append(entry)
    
    save_session_data(session_id, session_data)

