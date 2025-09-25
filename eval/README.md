# Evaluation Harness (Placeholder)

Minimal runner that sends cases to the backend `/v1/chat` endpoint.
The backend currently returns 501 (Not Implemented), which is expected for this starter.

## Dev

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export EVAL_BACKEND_URL=http://localhost:8000   # optional
python run_eval.py --cases cases/sample.yaml
```
