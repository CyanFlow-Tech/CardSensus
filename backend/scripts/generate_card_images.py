from __future__ import annotations

import argparse
import concurrent.futures
import json
import re
import shutil
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


def fetch_json(url: str, payload: dict[str, Any], timeout_s: float) -> dict[str, Any]:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout_s) as resp:
        body = resp.read().decode("utf-8")
    data = json.loads(body)
    if not isinstance(data, dict):
        raise ValueError("image service response is not a JSON object")
    return data


def clamp_to_max_sentences(text: str, max_sentences: int = 4) -> str:
    cleaned = " ".join(text.strip().split())
    if not cleaned:
        return ""
    sentences = re.split(r"(?<=[.!?])\s+", cleaned)
    kept = [item.strip() for item in sentences if item.strip()][:max_sentences]
    return " ".join(kept).strip()


def extract_message_text(message: dict[str, Any]) -> str:
    content = message.get("content", "")
    if isinstance(content, str) and content.strip():
        return content.strip()
    if isinstance(content, list):
        chunks: list[str] = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str) and text.strip():
                    chunks.append(text.strip())
        if chunks:
            return "\n".join(chunks).strip()

    # Ollama/Gemma variants may put generated text in reasoning fields.
    reasoning = message.get("reasoning", "")
    if isinstance(reasoning, str) and reasoning.strip():
        return reasoning.strip()
    if isinstance(reasoning, list):
        chunks = []
        for item in reasoning:
            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str) and text.strip():
                    chunks.append(text.strip())
        if chunks:
            return "\n".join(chunks).strip()
    return ""


def sanitize_visual_prompt(text: str) -> str:
    lines = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        line = re.sub(r"^[\-\*\d\.\)\s]+", "", line).strip()
        if line:
            lines.append(line)
    return " ".join(lines).strip()


def fallback_visual_prompt(title: str) -> str:
    return (
        f"A bold flat vector scene centered on {title}, with iconic objects and dynamic composition. "
        "Use clean thick outlines and exaggerated perspective to create strong visual tension. "
        "Keep a minimal all-over graphic style with only 3-4 colors and no gradients. "
        "Fill the full frame with clear shapes and no text."
    )


def generate_visual_prompt(
    llm_url: str,
    llm_model: str,
    title: str,
    timeout_s: float,
) -> str:
    system_prompt = (
        "You are a visual prompt writer for card art generation. "
        "Always reply in English only."
    )
    user_prompt = (
        "Write a short visual prompt for image generation around this card title: "
        f"{title!r}. Do not repeat the title in the prompt. Description Only."
        "Requirements: max 4 sentences; describe visible objects/composition and style; "
        "no markdown; no bullet points; no quotation marks."
    )
    payload = {
        "model": llm_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 512,
        "stream": False,
    }
    data = fetch_json(
        llm_url.rstrip("/") + "/chat/completions",
        payload,
        timeout_s=timeout_s,
    )
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ValueError("LLM response has no choices")
    message = choices[0].get("message", {})
    if not isinstance(message, dict):
        raise ValueError("LLM response message is invalid")
    text = extract_message_text(message)
    if not text:
        return fallback_visual_prompt(title)
    text = sanitize_visual_prompt(text)
    visual_prompt = clamp_to_max_sentences(text, max_sentences=4)
    if not visual_prompt:
        return fallback_visual_prompt(title)
    return visual_prompt


def download_file(url: str, target: Path, timeout_s: float) -> None:
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=timeout_s) as resp:
        target.write_bytes(resp.read())


def process_one_card(
    row: dict[str, Any],
    service_url: str,
    llm_url: str,
    llm_model: str,
    timeout_s: float,
    files_dir: Path,
) -> dict[str, Any]:
    tech_id = str(row.get("id", "")).strip()
    title = str(row.get("name", "")).strip()
    target = files_dir / f"{tech_id}.png"
    image_url = f"/files/cards/{target.name}"

    if title.strip().startswith("新卡牌"):
        file_path = "/files/cards/new_card.png"
        file_url = ""
    else:
        visual_prompt = generate_visual_prompt(
            llm_url=llm_url,
            llm_model=llm_model,
            title=title,
            timeout_s=timeout_s,
        )
        request_payload = {
            "title": visual_prompt,
            "theme_colors": ["cyan", "dark gray", "gold"],
            "extra_prompt": "no text",
        }
        resp = fetch_json(service_url, request_payload, timeout_s=timeout_s)
        file_url = str(resp.get("file_url", "")).strip()
        file_path = str(resp.get("file_path", "")).strip()
    if file_url:
        if file_url.startswith("/"):
            parsed = urllib.parse.urlparse(service_url)
            file_url = f"{parsed.scheme}://{parsed.netloc}{file_url}"
        download_file(file_url, target, timeout_s=timeout_s)
    elif file_path:
        source = Path(file_path)
        if not source.exists():
            raise FileNotFoundError(f"image file_path not found: {file_path}")
        shutil.copyfile(source, target)
    else:
        raise ValueError("image service returned neither file_url nor file_path")

    return {
        "row": row,
        "title": title,
        "image_url": image_url,
        "visual_prompt": visual_prompt,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch generate card images and write image_url into seed.json")
    parser.add_argument(
        "--seed",
        default="backend/data/seed.json",
        help="Path to seed.json",
    )
    parser.add_argument(
        "--service-url",
        default="http://127.0.0.1:9001/generate",
        help="Image generation endpoint",
    )
    parser.add_argument(
        "--llm-url",
        default="http://192.168.1.172:11434/v1",
        help="OpenAI-compatible LLM API base URL",
    )
    parser.add_argument(
        "--llm-model",
        default="gemma4:31b",
        help="LLM model name served by Ollama",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=120.0,
        help="HTTP timeout seconds for each request",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Regenerate even if image_url already exists and file exists",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=4,
        help="Number of cards generated in parallel per batch",
    )
    args = parser.parse_args()
    if args.batch_size < 1:
        print("[error] --batch-size must be >= 1", file=sys.stderr)
        return 1

    repo_root = Path(__file__).resolve().parents[2]
    seed_path = (repo_root / args.seed).resolve()
    if not seed_path.exists():
        print(f"[error] seed file not found: {seed_path}", file=sys.stderr)
        return 1

    files_dir = seed_path.parent / "files" / "cards"
    files_dir.mkdir(parents=True, exist_ok=True)

    payload = json.loads(seed_path.read_text(encoding="utf-8"))
    technologies = payload.get("technologies", [])
    if not isinstance(technologies, list):
        print("[error] invalid seed format: technologies should be a list", file=sys.stderr)
        return 1

    generated = 0
    skipped = 0
    failed = 0

    pending_rows: list[dict[str, Any]] = []
    for row in technologies:
        if not isinstance(row, dict):
            continue
        tech_id = str(row.get("id", "")).strip()
        title = str(row.get("name", "")).strip()
        if not tech_id or not title:
            skipped += 1
            continue

        target = files_dir / f"{tech_id}.png"
        image_url = f"/files/cards/{target.name}"
        has_existing = bool(str(row.get("image_url", "")).strip()) and target.exists()
        if has_existing and not args.overwrite:
            skipped += 1
            continue
        pending_rows.append(row)

    total = len(pending_rows)
    for start in range(0, total, args.batch_size):
        batch = pending_rows[start : start + args.batch_size]
        print(f"[batch] {start + 1}-{start + len(batch)}/{total} (parallel={len(batch)})")

        with concurrent.futures.ThreadPoolExecutor(max_workers=len(batch)) as pool:
            futures = {
                pool.submit(
                    process_one_card,
                    row,
                    args.service_url,
                    args.llm_url,
                    args.llm_model,
                    args.timeout,
                    files_dir,
                ): row
                for row in batch
            }
            for future in concurrent.futures.as_completed(futures):
                row = futures[future]
                title = str(row.get("name", "")).strip()
                try:
                    result = future.result()
                    result_row = result["row"]
                    result_row["image_url"] = str(result["image_url"])
                    generated += 1
                    print(f"[ok] {result['title']} -> {result['image_url']}")
                    print(f"     visual_prompt: {result['visual_prompt']}")
                except (
                    urllib.error.URLError,
                    TimeoutError,
                    ValueError,
                    FileNotFoundError,
                    json.JSONDecodeError,
                ) as err:
                    failed += 1
                    print(f"[fail] {title}: {err}", file=sys.stderr)

    seed_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[done] generated={generated} skipped={skipped} failed={failed}")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
