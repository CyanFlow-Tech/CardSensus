from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from typing import Any


def post_json(url: str, payload: dict[str, Any], timeout_s: float) -> tuple[int, dict[str, Any], str]:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout_s) as resp:
        body = resp.read().decode("utf-8")
        status = int(getattr(resp, "status", 200))
    data = json.loads(body)
    if not isinstance(data, dict):
        raise ValueError("response is not a JSON object")
    return status, data, body


def get_json(url: str, timeout_s: float) -> tuple[int, dict[str, Any], str]:
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=timeout_s) as resp:
        body = resp.read().decode("utf-8")
        status = int(getattr(resp, "status", 200))
    data = json.loads(body)
    if not isinstance(data, dict):
        raise ValueError("response is not a JSON object")
    return status, data, body


def extract_content(resp: dict[str, Any]) -> str:
    choices = resp.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    first = choices[0]
    if not isinstance(first, dict):
        return ""
    message = first.get("message")
    if not isinstance(message, dict):
        return ""
    content = message.get("content", "")
    if isinstance(content, str):
        return content.strip()
    # Some providers may return segmented content.
    if isinstance(content, list):
        chunks: list[str] = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str) and text.strip():
                    chunks.append(text.strip())
        return "\n".join(chunks).strip()
    return ""


def main() -> int:
    parser = argparse.ArgumentParser(description="Diagnose Ollama OpenAI-compatible LLM service.")
    parser.add_argument("--llm-url", default="http://192.168.1.172:11434/v1", help="LLM API base URL")
    parser.add_argument("--model", default="gemma4:31b", help="Model name used in chat/completions")
    parser.add_argument(
        "--prompt",
        default="Write up to 3 short English sentences describing a fantasy card artwork for title: Arcane Forge.",
        help="User prompt to send",
    )
    parser.add_argument("--timeout", type=float, default=60.0, help="HTTP timeout seconds")
    parser.add_argument("--max-tokens", type=int, default=220, help="max_tokens for completion")
    parser.add_argument("--temperature", type=float, default=0.7, help="temperature for completion")
    parser.add_argument(
        "--raw-limit",
        type=int,
        default=4000,
        help="Max number of raw response characters to print",
    )
    args = parser.parse_args()

    base_url = args.llm_url.rstrip("/")
    models_url = f"{base_url}/models"
    chat_url = f"{base_url}/chat/completions"

    print(f"[info] base_url={base_url}")
    print(f"[info] model={args.model}")

    try:
        status, models_data, _ = get_json(models_url, timeout_s=args.timeout)
        model_ids: list[str] = []
        data = models_data.get("data")
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    mid = item.get("id")
                    if isinstance(mid, str):
                        model_ids.append(mid)
        print(f"[ok] GET /models status={status}, count={len(model_ids)}")
        if model_ids:
            print("[models] " + ", ".join(model_ids))
            if args.model not in model_ids:
                print(f"[warn] model {args.model!r} is not in /models list.", file=sys.stderr)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError) as err:
        print(f"[fail] GET /models: {err}", file=sys.stderr)
        return 2

    payload = {
        "model": args.model,
        "messages": [
            {"role": "system", "content": "Reply in English only."},
            {"role": "user", "content": args.prompt},
        ],
        "temperature": args.temperature,
        "max_tokens": args.max_tokens,
        "stream": False,
    }

    try:
        status, resp, raw = post_json(chat_url, payload=payload, timeout_s=args.timeout)
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        print(f"[fail] POST /chat/completions status={err.code}", file=sys.stderr)
        print(body[: args.raw_limit], file=sys.stderr)
        return 3
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError) as err:
        print(f"[fail] POST /chat/completions: {err}", file=sys.stderr)
        return 3

    print(f"[ok] POST /chat/completions status={status}")
    content = extract_content(resp)
    finish_reason = None
    choices = resp.get("choices")
    if isinstance(choices, list) and choices and isinstance(choices[0], dict):
        finish_reason = choices[0].get("finish_reason")
    usage = resp.get("usage")

    if content:
        print("[content]")
        print(content)
    else:
        print("[warn] extracted content is empty")
        print("[hint] inspect raw response below; common causes: wrong model name, provider-specific content format, or refusal/tool-calls only.")

    print(f"[meta] finish_reason={finish_reason!r}")
    print(f"[meta] usage={usage!r}")
    print("[raw]")
    print(raw[: args.raw_limit])
    if len(raw) > args.raw_limit:
        print(f"...(truncated, total={len(raw)} chars)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
