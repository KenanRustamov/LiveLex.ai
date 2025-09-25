import argparse, asyncio, os, yaml, json
import httpx

DEFAULT_BACKEND = os.getenv("EVAL_BACKEND_URL", "http://localhost:8000")

async def evaluate_case(client: httpx.AsyncClient, case: dict) -> dict:
    # Send the case to the chat endpoint (which is intentionally 501 for now).
    try:
        resp = await client.post(f"{DEFAULT_BACKEND}/v1/chat", json=case.get("input", {}), timeout=20)
        ok = resp.status_code == 200
        data = resp.json() if resp.content else {}
        return {
            "id": case.get("id"),
            "status_code": resp.status_code,
            "ok": ok,
            "response": data,
        }
    except Exception as e:
        return {"id": case.get("id"), "ok": False, "error": str(e)}

async def main(path: str):
    with open(path, "r") as f:
        cases = yaml.safe_load(f)

    async with httpx.AsyncClient() as client:
        results = []
        for c in cases:
            results.append(await evaluate_case(client, c))

    print(json.dumps({"backend": DEFAULT_BACKEND, "results": results}, indent=2))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cases", default="cases/sample.yaml")
    args = parser.parse_args()
    asyncio.run(main(args.cases))
