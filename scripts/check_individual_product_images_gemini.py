#!/usr/bin/env python3

import argparse
import asyncio
import json
import mimetypes
import os
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from google import genai
from google.genai import types


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PRODUCTS_FILE = ROOT / "perfect_product" / "individual-products.jsonl"
DEFAULT_PRODUCTS_DIR = ROOT / "perfect_product" / "products"
DEFAULT_OUTPUT = ROOT / "perfect_product" / "image-qa-gemini.jsonl"
DEFAULT_MODEL = "gemini-3-flash-preview"
DEFAULT_CONCURRENCY = 2
DEFAULT_MAX_RETRIES = 6

PACKAGE_SLOT = "packaged-bottle-rembg.png"
SLOTS = {
    "bottle_only": "bottle-only-rembg.png",
    "packaged": "packaged-bottle-rembg.png",
    "hero": "bottle-with-ingredients.png",
    "top": "top-notes.png",
    "heart": "heart-notes.png",
    "base": "base-notes.png",
}


@dataclass
class Product:
    handle: str
    title: str
    notes: dict[str, list[str]]
    shopify_dir: Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check individual perfume image slots with Gemini using one fresh chat per slot check."
    )
    parser.add_argument("handles", nargs="*", help="Optional product handles to limit the run.")
    parser.add_argument("--products-file", default=str(DEFAULT_PRODUCTS_FILE))
    parser.add_argument("--products-dir", default=str(DEFAULT_PRODUCTS_DIR))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    parser.add_argument("--max-retries", type=int, default=DEFAULT_MAX_RETRIES)
    parser.add_argument("--api-key", default=None)
    return parser.parse_args()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def clean_note_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    cleaned: list[str] = []
    for item in value:
        text = str(item).replace("&amp;", "&").strip()
        text = text.rstrip(".").strip()
        if text:
            cleaned.append(text)
    return cleaned


def load_products(products_file: Path, products_dir: Path, requested_handles: set[str]) -> list[Product]:
    products: list[Product] = []
    for raw_line in products_file.read_text().splitlines():
        line = raw_line.strip()
        if not line:
            continue
        obj = json.loads(line)
        handle = obj["handle"]
        if requested_handles and handle not in requested_handles:
            continue
        products.append(
            Product(
                handle=handle,
                title=obj.get("title", handle),
                notes={
                    "top": clean_note_list(obj.get("notes", {}).get("top")),
                    "heart": clean_note_list(obj.get("notes", {}).get("heart")),
                    "base": clean_note_list(obj.get("notes", {}).get("base")),
                },
                shopify_dir=products_dir / handle / "shopify-images",
            )
        )
    products.sort(key=lambda product: product.handle)
    return products


def image_part(image_path: Path) -> types.Part:
    mime_type, _ = mimetypes.guess_type(str(image_path))
    if not mime_type:
      mime_type = "image/png"
    return types.Part.from_bytes(data=image_path.read_bytes(), mime_type=mime_type)


def parse_json_response(text: str) -> dict[str, Any]:
    text = text.strip()
    if not text:
        raise ValueError("empty model response")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        return json.loads(text[start : end + 1])


def is_retryable_quota_error(exc: Exception) -> bool:
    text = str(exc)
    return "429" in text or "RESOURCE_EXHAUSTED" in text or "quota" in text.lower()


def retry_delay_seconds(exc: Exception, attempt: int) -> float:
    text = str(exc)
    patterns = [
        r"retry in ([0-9]+(?:\.[0-9]+)?)s",
        r"'retryDelay': '([0-9]+)s'",
        r'"retryDelay": "([0-9]+)s"',
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            try:
                return max(float(match.group(1)) + 1.0, 1.0)
            except ValueError:
                pass
    return min(10.0 * attempt, 60.0)


def chat_prompt_packaged(product: Product) -> str:
    return f"""You are checking perfume product image consistency.

Product title: {product.title}
Check type: packaged image identity match

Input image 1 is the trusted reference bottle-only image for this product.
Input image 2 is the packaged bottle image for this product.

Task:
Decide whether image 2 shows the same perfume bottle identity as image 1, and whether the packaging in image 2 matches that same product.

Rules:
- Treat image 1 as the ground-truth bottle identity.
- Ignore background quality.
- Focus on bottle shape, cap shape, label/branding, overall silhouette, and packaging identity.
- If image 2 is clearly a different perfume, mark it wrong.
- If image 2 is close but not reliable, mark it uncertain.

Return strict JSON only:
{{
  "status": "correct" | "wrong" | "uncertain",
  "reason": "short concrete reason"
}}"""


def chat_prompt_hero(product: Product) -> str:
    top = ", ".join(product.notes["top"]) or "none"
    heart = ", ".join(product.notes["heart"]) or "none"
    base = ", ".join(product.notes["base"]) or "none"
    return f"""You are checking perfume product image consistency.

Product title: {product.title}
Check type: hero image identity match

Input image 1 is the trusted reference bottle-only image for this product.
Input image 2 is the hero image with bottle and ingredients.

Task:
Decide whether image 2 uses the same perfume bottle identity as image 1.

Expected note families for this product:
- Top: {top}
- Heart: {heart}
- Base: {base}

Rules:
- Treat image 1 as the ground-truth bottle identity.
- Focus mainly on whether the bottle in image 2 is the same perfume.
- Ignore whether the ingredients are perfect in this call.
- If image 2 contains a different perfume bottle, mark it wrong.

Return strict JSON only:
{{
  "status": "correct" | "wrong" | "uncertain",
  "reason": "short concrete reason"
}}"""


def chat_prompt_notes(product: Product, slot_name: str, expected_notes: list[str]) -> str:
    notes_text = ", ".join(expected_notes) or "none"
    other_top = ", ".join(product.notes["top"]) or "none"
    other_heart = ", ".join(product.notes["heart"]) or "none"
    other_base = ", ".join(product.notes["base"]) or "none"
    return f"""You are checking perfume note illustration correctness.

Product title: {product.title}
Check type: {slot_name} note image

Input image 1 is the {slot_name} note image for this product.

Expected notes for this slot:
- {slot_name}: {notes_text}

Full note pyramid for reference:
- Top: {other_top}
- Heart: {other_heart}
- Base: {other_base}

Task:
Decide whether this image is a correct visual representation of the expected {slot_name} notes.

Rules:
- There should be no perfume bottle or packaging in this slot image.
- The ingredients/materials should plausibly match the expected notes.
- If the image clearly shows another perfume, packaging, or the wrong ingredient family, mark it wrong.
- If the match is partial or too ambiguous, mark it uncertain.

Return strict JSON only:
{{
  "status": "correct" | "wrong" | "uncertain",
  "reason": "short concrete reason"
}}"""


def build_messages(product: Product) -> list[tuple[str, list[types.Part | str], str | None]]:
    bottle_path = product.shopify_dir / SLOTS["bottle_only"]
    packaged_path = product.shopify_dir / SLOTS["packaged"]
    hero_path = product.shopify_dir / SLOTS["hero"]
    top_path = product.shopify_dir / SLOTS["top"]
    heart_path = product.shopify_dir / SLOTS["heart"]
    base_path = product.shopify_dir / SLOTS["base"]

    checks: list[tuple[str, list[types.Part | str], str | None]] = []

    if packaged_path.exists():
        checks.append(
            (
                "packaged",
                [image_part(bottle_path), image_part(packaged_path), chat_prompt_packaged(product)],
                None,
            )
        )
    else:
        checks.append(("packaged", [], "missing"))

    checks.append(
        (
            "hero",
            [image_part(bottle_path), image_part(hero_path), chat_prompt_hero(product)],
            None,
        )
    )
    checks.append(
        (
            "top",
            [image_part(top_path), chat_prompt_notes(product, "top", product.notes["top"])],
            None,
        )
    )
    checks.append(
        (
            "heart",
            [image_part(heart_path), chat_prompt_notes(product, "heart", product.notes["heart"])],
            None,
        )
    )
    checks.append(
        (
            "base",
            [image_part(base_path), chat_prompt_notes(product, "base", product.notes["base"])],
            None,
        )
    )
    return checks


def require_paths(product: Product) -> list[str]:
    missing: list[str] = []
    for key in ("bottle_only", "hero", "top", "heart", "base"):
        path = product.shopify_dir / SLOTS[key]
        if not path.exists():
            missing.append(SLOTS[key])
    return missing


def run_single_check(
    client: genai.Client,
    model: str,
    message_parts: list[types.Part | str],
    max_retries: int,
) -> dict[str, Any]:
    last_exc: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            chat = client.chats.create(model=model)
            response = chat.send_message(message_parts)
            parsed = parse_json_response(response.text or "")
            result = {
                "status": parsed.get("status", "uncertain"),
                "reason": parsed.get("reason", "").strip(),
                "raw_text": response.text or "",
            }
            if attempt > 1:
                result["attempts"] = attempt
            return result
        except Exception as exc:
            last_exc = exc
            if attempt >= max_retries or not is_retryable_quota_error(exc):
                raise
            delay = retry_delay_seconds(exc, attempt)
            time.sleep(delay)
    raise last_exc if last_exc else RuntimeError("unknown Gemini check failure")


async def evaluate_product(
    product: Product,
    client: genai.Client,
    model: str,
    max_retries: int,
) -> dict[str, Any]:
    missing_required = require_paths(product)
    result: dict[str, Any] = {
        "handle": product.handle,
        "title": product.title,
        "model": model,
        "checked_at": now_iso(),
        "checks": {},
    }
    if missing_required:
        result["error"] = {
            "type": "missing_required_images",
            "missing": missing_required,
        }
        return result

    checks = build_messages(product)
    for check_name, parts, missing_status in checks:
        if missing_status == "missing":
            result["checks"][check_name] = {
                "status": "missing",
                "reason": f"{PACKAGE_SLOT} is not present for this product",
                "raw_text": "",
            }
            continue
        result["checks"][check_name] = await asyncio.to_thread(
            run_single_check,
            client,
            model,
            parts,
            max_retries,
        )
    return result


async def worker(
    name: str,
    queue: asyncio.Queue[Product],
    results: list[dict[str, Any]],
    client: genai.Client,
    model: str,
    max_retries: int,
) -> None:
    while True:
        product = await queue.get()
        try:
            result = await evaluate_product(product, client, model, max_retries)
            results.append(result)
            packaged = result["checks"].get("packaged", {}).get("status", "na")
            hero = result["checks"].get("hero", {}).get("status", "na")
            top = result["checks"].get("top", {}).get("status", "na")
            heart = result["checks"].get("heart", {}).get("status", "na")
            base = result["checks"].get("base", {}).get("status", "na")
            print(
                f"{product.handle}: packaged={packaged} hero={hero} top={top} heart={heart} base={base}",
                flush=True,
            )
        except Exception as exc:
            results.append(
                {
                    "handle": product.handle,
                    "title": product.title,
                    "model": model,
                    "checked_at": now_iso(),
                    "error": {
                        "type": "exception",
                        "message": str(exc),
                    },
                    "checks": {},
                }
            )
            print(f"{product.handle}: error={exc}", flush=True)
        finally:
            queue.task_done()


async def main_async(args: argparse.Namespace) -> None:
    api_key = args.api_key or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise SystemExit("Missing API key. Pass --api-key or set GEMINI_API_KEY / GOOGLE_API_KEY.")
    if args.concurrency < 1:
        raise SystemExit("--concurrency must be >= 1")

    products = load_products(Path(args.products_file), Path(args.products_dir), set(args.handles))
    client = genai.Client(api_key=api_key)

    queue: asyncio.Queue[Product] = asyncio.Queue()
    results: list[dict[str, Any]] = []
    for product in products:
        queue.put_nowait(product)

    workers = [
        asyncio.create_task(worker(f"worker-{index+1}", queue, results, client, args.model, args.max_retries))
        for index in range(min(args.concurrency, max(len(products), 1)))
    ]

    await queue.join()
    for task in workers:
        task.cancel()
    await asyncio.gather(*workers, return_exceptions=True)

    ordered = sorted(results, key=lambda item: item["handle"])
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        for item in ordered:
            handle.write(json.dumps(item, ensure_ascii=True) + "\n")


def main() -> None:
    args = parse_args()
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
