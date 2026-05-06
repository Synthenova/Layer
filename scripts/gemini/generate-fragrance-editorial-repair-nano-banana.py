#!/usr/bin/env python3

import argparse
import asyncio
import base64
import json
import mimetypes
import os
import random
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from google import genai
from google.genai import types


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENV = ROOT / ".env"
DEFAULT_PRODUCTS_FILE = ROOT / "perfect_product" / "individual-products.jsonl"
DEFAULT_QA_FILE = ROOT / "perfect_product" / "image-qa-gemini.jsonl"
DEFAULT_PRODUCTS_DIR = ROOT / "perfect_product" / "products"
DEFAULT_BACKGROUND = ROOT / "perfect_product" / "background.png"
DEFAULT_LOG_DIR = ROOT / "perfect_product" / "logs"
DEFAULT_MODEL = "gemini-3.1-flash-image-preview"
DEFAULT_CONCURRENCY = 5
DEFAULT_MAX_RETRIES = 6
DEFAULT_MIN_REQUEST_INTERVAL = 2.0

SLOTS = {
    "hero": {"filename": "bottle-with-ingredients.png", "label": "hero image"},
    "top": {"filename": "top-notes.png", "label": "top notes image"},
    "heart": {"filename": "heart-notes.png", "label": "heart notes image"},
    "base": {"filename": "base-notes.png", "label": "base notes image"},
}

REFERENCE_IMAGES = {
    "bottle": {"filename": "bottle-only-rembg.png", "role": "strict bottle identity reference"},
    "hero": {"filename": "bottle-with-ingredients.png", "role": "QA-correct hero and set-style reference"},
    "top": {"filename": "top-notes.png", "role": "QA-correct top-notes and set-style reference"},
    "heart": {"filename": "heart-notes.png", "role": "QA-correct heart-notes and set-style reference"},
    "base": {"filename": "base-notes.png", "role": "QA-correct base-notes and set-style reference"},
}


@dataclass
class Product:
    handle: str
    title: str
    notes: dict[str, list[str]]
    product_dir: Path
    shopify_dir: Path
    download_dir: Path


@dataclass
class RepairSlot:
    key: str
    filename: str
    label: str
    qa_status: str
    qa_reason: str


class JsonlLogger:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.started = time.time()

    def init(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(f"\n=== gemini nano banana repair run {now_iso()} ===\n")

    def write(self, event: str, **data: Any) -> None:
        line = {
            "ts": now_iso(),
            "elapsedSec": round(time.time() - self.started, 1),
            "event": event,
            **data,
        }
        text = json.dumps(line, ensure_ascii=True)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(text + "\n")
        print(text, flush=True)


class AsyncRateLimiter:
    def __init__(self, min_interval: float) -> None:
        self.min_interval = max(0.0, min_interval)
        self._lock = asyncio.Lock()
        self._last = 0.0

    async def wait(self) -> None:
        if self.min_interval <= 0:
            return
        async with self._lock:
            now = time.monotonic()
            wait_for = self._last + self.min_interval - now
            if wait_for > 0:
                await asyncio.sleep(wait_for)
            self._last = time.monotonic()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Regenerate non-correct fragrance editorial images with Gemini Nano Banana 2."
    )
    parser.add_argument("handles", nargs="*", help="Optional product handles to process.")
    parser.add_argument("--products-file", default=str(DEFAULT_PRODUCTS_FILE))
    parser.add_argument("--qa-file", default=str(DEFAULT_QA_FILE))
    parser.add_argument("--products-dir", default=str(DEFAULT_PRODUCTS_DIR))
    parser.add_argument("--background", default=str(DEFAULT_BACKGROUND))
    parser.add_argument("--env-file", default=str(DEFAULT_ENV))
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY)
    parser.add_argument("--max-retries", type=int, default=DEFAULT_MAX_RETRIES)
    parser.add_argument("--min-request-interval", type=float, default=DEFAULT_MIN_REQUEST_INTERVAL)
    parser.add_argument("--slot", choices=sorted(SLOTS), action="append", help="Limit to one or more slots.")
    parser.add_argument("--force", action="store_true", help="Regenerate even if this script already saved the slot.")
    parser.add_argument("--dry-run", action="store_true", help="Plan only; do not call Gemini.")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of products after filtering.")
    parser.add_argument("--api-key", default=None)
    parser.add_argument(
        "--log-file",
        default=None,
        help="Default: perfect_product/logs/gemini-nano-banana-repair-<timestamp>.log",
    )
    return parser.parse_args()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def clean_note_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    cleaned: list[str] = []
    for item in value:
        text = str(item).replace("&amp;", "&").strip().rstrip(".").strip()
        if text:
            cleaned.append(text)
    return cleaned


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for index, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not raw.strip():
            continue
        try:
            rows.append(json.loads(raw))
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid JSON in {path}:{index}: {exc}") from exc
    return rows


def load_products(products_file: Path, products_dir: Path, requested: set[str]) -> dict[str, Product]:
    products: dict[str, Product] = {}
    for obj in load_jsonl(products_file):
        handle = obj["handle"]
        if requested and handle not in requested:
            continue
        product_dir = products_dir / handle
        products[handle] = Product(
            handle=handle,
            title=obj.get("title", handle),
            notes={
                "top": clean_note_list(obj.get("notes", {}).get("top")),
                "heart": clean_note_list(obj.get("notes", {}).get("heart")),
                "base": clean_note_list(obj.get("notes", {}).get("base")),
            },
            product_dir=product_dir,
            shopify_dir=product_dir / "shopify-images",
            download_dir=product_dir / "download-images",
        )
    return products


def load_qa_rows(qa_file: Path, requested: set[str]) -> dict[str, dict[str, Any]]:
    rows: dict[str, dict[str, Any]] = {}
    for obj in load_jsonl(qa_file):
        handle = obj.get("handle")
        if not handle:
            continue
        if requested and handle not in requested:
            continue
        rows[handle] = obj
    return rows


def manifest_path(product: Product) -> Path:
    return product.download_dir / ".gemini-nano-banana-repair.json"


def load_manifest(product: Product) -> dict[str, Any]:
    path = manifest_path(product)
    if not path.exists():
        return {"slots": {}}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"slots": {}}


def save_manifest(product: Product, manifest: dict[str, Any]) -> None:
    product.download_dir.mkdir(parents=True, exist_ok=True)
    manifest_path(product).write_text(json.dumps(manifest, indent=2, ensure_ascii=True), encoding="utf-8")


def slot_outputs(product: Product, slot: RepairSlot) -> tuple[Path, Path]:
    return product.download_dir / slot.filename, product.shopify_dir / slot.filename


def is_slot_already_generated(product: Product, slot: RepairSlot, model: str) -> bool:
    download_path, shopify_path = slot_outputs(product, slot)
    if not download_path.exists() or not shopify_path.exists():
        return False
    entry = load_manifest(product).get("slots", {}).get(slot.key)
    return bool(entry and entry.get("model") == model and entry.get("filename") == slot.filename)


def repair_slots_for(row: dict[str, Any], allowed_slots: set[str]) -> list[RepairSlot]:
    result: list[RepairSlot] = []
    for key, spec in SLOTS.items():
        if allowed_slots and key not in allowed_slots:
            continue
        check = row.get("checks", {}).get(key, {})
        status = check.get("status", "missing")
        if status == "correct":
            continue
        result.append(
            RepairSlot(
                key=key,
                filename=spec["filename"],
                label=spec["label"],
                qa_status=status,
                qa_reason=check.get("reason", ""),
            )
        )
    return result


def image_part(path: Path) -> types.Part:
    mime_type, _ = mimetypes.guess_type(str(path))
    if not mime_type:
        mime_type = "image/png"
    return types.Part.from_bytes(data=path.read_bytes(), mime_type=mime_type)


def collect_input_images(product: Product, qa_row: dict[str, Any], background: Path) -> list[dict[str, Path | str]]:
    images: list[dict[str, Path | str]] = [
        {
            "key": "background",
            "path": background,
            "filename": background.name,
            "role": "required exact off-white textured plaster/paper background style reference",
        }
    ]
    bottle = product.shopify_dir / REFERENCE_IMAGES["bottle"]["filename"]
    if bottle.exists():
        images.append({**REFERENCE_IMAGES["bottle"], "key": "bottle", "path": bottle})

    for key in ("hero", "top", "heart", "base"):
        if qa_row.get("checks", {}).get(key, {}).get("status") != "correct":
            continue
        spec = REFERENCE_IMAGES[key]
        path = product.shopify_dir / spec["filename"]
        if path.exists():
            images.append({**spec, "key": key, "path": path})
    return images


def format_notes(items: list[str]) -> str:
    return ", ".join(items) if items else "the visible fragrance notes described for this perfume"


def prelude(product: Product, inputs: list[dict[str, Any]], repair_slots: list[RepairSlot]) -> str:
    input_lines = [
        f"Input image {index + 1}: {item['filename']} - {item['role']}."
        for index, item in enumerate(inputs)
    ]
    repair_lines = [
        f"- {slot.label} ({slot.filename}) is marked {slot.qa_status}. QA reason: {slot.qa_reason or 'not provided'}"
        for slot in repair_slots
    ]
    return f"""{product.title}

We are repairing a luxury editorial fragrance image set for this product. This is a deterministic repair pass based on QA results.

Provided input images:
{chr(10).join(input_lines)}

Reference integrity:
Only QA-correct existing set images are provided as style references. Any image that QA marked wrong, missing, or uncertain has deliberately been excluded and must not be inferred or recreated from memory.

Background reference rule:
Use the provided background image as the exact background style for every regenerated image. It is a square off-white textured plaster/paper surface with subtle grey mottling and shallow fibrous relief. Match this clean tactile white surface, soft natural studio lighting, and generous negative space. Do not replace it with marble, fabric, wood, colored paper, gradients, table props, or a plain flat white void.

Images that must be regenerated in this chat:
{chr(10).join(repair_lines)}

Global visual direction for all regenerated images:
Luxury editorial flat-lay fragrance photography.
Clean, premium, minimal, high-end composition.
Soft natural studio lighting.
Square 1:1 composition.
Same refined visual language as the provided correct set images.
No added captions, no added typography, no borders, no packaging, no unrelated props.
For hero images only: preserve real text, logo marks, label typography, engravings, and brand/product identity that are physically part of the bottle reference.
For note-only images: no text or labels of any kind.

Important product identity rule:
Always preserve the real bottle identity from the bottle-only reference when the target image includes a bottle. The bottle-only reference outranks every other image for product identity. If the target image is a note-only image, do not include any bottle or packaging."""


def slot_prompt(product: Product, slot: RepairSlot) -> str:
    top = product.notes["top"]
    heart = product.notes["heart"]
    base = product.notes["base"]
    if slot.key == "hero":
        return f"""Regenerate the hero image only.

Target output file: {slot.filename}

Requirements:
- Use the real {product.title} bottle as the central hero object.
- Treat the bottle-only input image as the strict product identity source.
- Keep the bottle accurate to the bottle-only reference: exact silhouette, shape, cap, color, material finish, emblem/details, label placement, label text/marks when visible, proportions, and front identity.
- Preserve real bottle text, logo marks, label typography, engravings, and any visible brand/product wording from the bottle-only reference. Do not remove, blur, simplify, hallucinate, or replace bottle text.
- Do not invent a different brand bottle, different logo, different label geometry, different cap, different colorway, or different product name.
- If existing correct note images are provided, use them only for ingredient styling, composition language, lighting, and background continuity. Never use them to override the bottle identity.
- Place the bottle on the exact provided off-white textured plaster/paper background style.
- Surround the bottle with elegant ingredient elements representing the fragrance notes.
- Use only visually relevant ingredients from this perfume's note profile.
- Keep ingredient styling premium, restrained, balanced, and not cluttered.

Notes for ingredient inspiration:
Top notes: {format_notes(top)}
Heart notes: {format_notes(heart)}
Base notes: {format_notes(base)}

Generate the corrected hero image only.
Make the aspect ratio 1:1."""

    configs = {
        "top": {
            "label": "TOP NOTES",
            "notes": top,
            "mood": "fresh, bright, aromatic, premium, minimal, balanced, and clean",
            "extra": f"Make {format_notes(top)} clearly readable as the note story.",
        },
        "heart": {
            "label": "HEART NOTES",
            "notes": heart,
            "mood": "resinous, warm, mysterious, refined, premium, minimal, balanced, and clean",
            "extra": "Use elegant botanical/resin/material styling where relevant without making it messy or smoky in an uncontrolled way.",
        },
        "base": {
            "label": "BASE NOTES",
            "notes": base,
            "mood": "dark, woody, luxurious, refined, premium, minimal, balanced, and clean",
            "extra": "Use elegant base-note material styling where relevant while keeping the composition restrained.",
        },
    }[slot.key]
    return f"""Regenerate the {slot.label} only.

Target output file: {slot.filename}

This image is for the {configs['label']} only:
{{{format_notes(configs['notes'])}}}

Requirements:
- No bottle.
- No packaging.
- Show only ingredients/material elements representing these notes.
- The composition should feel {configs['mood']}.
- {configs['extra']}
- Match the same luxury editorial flat-lay style as the provided correct set images.
- Keep generous negative space and the exact provided off-white textured plaster/paper background feel.

Generate the corrected {slot.label} only.
Make the aspect ratio 1:1."""


def build_turn_prompt(product: Product, inputs: list[dict[str, Any]], repair_slots: list[RepairSlot], slot: RepairSlot, first_turn: bool) -> str:
    parts: list[str] = []
    if first_turn:
        parts.append(prelude(product, inputs, repair_slots))
    parts.append(slot_prompt(product, slot))
    return "\n\n".join(parts)


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


def extract_image_bytes(response: Any) -> tuple[bytes, str]:
    parts = getattr(response, "parts", None)
    if not parts:
        candidates = getattr(response, "candidates", None) or []
        if candidates:
            content = getattr(candidates[0], "content", None)
            parts = getattr(content, "parts", None)
    for part in parts or []:
        inline_data = getattr(part, "inline_data", None) or getattr(part, "inlineData", None)
        if not inline_data:
            continue
        data = getattr(inline_data, "data", None)
        mime_type = getattr(inline_data, "mime_type", None) or getattr(inline_data, "mimeType", None) or "image/png"
        if isinstance(data, bytes):
            return data, mime_type
        if isinstance(data, str):
            return base64.b64decode(data), mime_type
    text = getattr(response, "text", "") or ""
    raise RuntimeError(f"Gemini response did not contain an image. text={text[:500]!r}")


def generate_one_turn_sync(
    chat: Any,
    contents: list[Any],
    config: types.GenerateContentConfig,
    max_retries: int,
) -> tuple[bytes, str, int]:
    last_exc: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            response = chat.send_message(contents, config=config)
            image_bytes, mime_type = extract_image_bytes(response)
            return image_bytes, mime_type, attempt
        except Exception as exc:
            last_exc = exc
            if attempt >= max_retries or not is_retryable_quota_error(exc):
                raise
            delay = retry_delay_seconds(exc, attempt)
            time.sleep(delay + random.uniform(0, 1.0))
    raise last_exc if last_exc else RuntimeError("unknown Gemini image generation failure")


async def generate_one_turn(
    chat: Any,
    contents: list[Any],
    config: types.GenerateContentConfig,
    max_retries: int,
    limiter: AsyncRateLimiter,
) -> tuple[bytes, str, int]:
    await limiter.wait()
    return await asyncio.to_thread(generate_one_turn_sync, chat, contents, config, max_retries)


def write_image_outputs(product: Product, slot: RepairSlot, image_bytes: bytes, model: str, mime_type: str) -> None:
    download_path, shopify_path = slot_outputs(product, slot)
    product.download_dir.mkdir(parents=True, exist_ok=True)
    product.shopify_dir.mkdir(parents=True, exist_ok=True)
    download_path.write_bytes(image_bytes)
    shopify_path.write_bytes(image_bytes)
    manifest = load_manifest(product)
    manifest.setdefault("slots", {})[slot.key] = {
        "filename": slot.filename,
        "model": model,
        "mimeType": mime_type,
        "generatedAt": now_iso(),
        "downloadOutput": str(download_path),
        "shopifyOutput": str(shopify_path),
    }
    save_manifest(product, manifest)


async def process_product(
    product: Product,
    qa_row: dict[str, Any],
    slots: list[RepairSlot],
    args: argparse.Namespace,
    client: genai.Client,
    limiter: AsyncRateLimiter,
    logger: JsonlLogger,
) -> None:
    background = Path(args.background)
    inputs = collect_input_images(product, qa_row, background)
    if not background.exists():
        raise FileNotFoundError(f"Missing background reference: {background}")
    if not any(item["key"] == "bottle" for item in inputs):
        raise FileNotFoundError(f"Missing bottle-only-rembg.png for {product.handle}")

    todo = [slot for slot in slots if args.force or not is_slot_already_generated(product, slot, args.model)]
    if not todo:
        logger.write("product.skip", handle=product.handle, reason="all target slots already generated by this script")
        return

    logger.write(
        "product.start",
        handle=product.handle,
        title=product.title,
        repairSlots=[f"{slot.key}:{slot.qa_status}" for slot in todo],
        inputImages=[str(Path(item["path"]).relative_to(ROOT)) for item in inputs],
    )
    if args.dry_run:
        for index, slot in enumerate(todo):
            prompt = build_turn_prompt(product, inputs, todo, slot, index == 0)
            logger.write("dry_run.turn", handle=product.handle, slotKey=slot.key, prompt=prompt)
        return

    config = types.GenerateContentConfig(
        response_modalities=["TEXT", "IMAGE"],
        image_config=types.ImageConfig(aspect_ratio="1:1"),
    )
    chat = client.chats.create(model=args.model)

    for index, slot in enumerate(todo):
        prompt = build_turn_prompt(product, inputs, todo, slot, index == 0)
        prompt_path = product.download_dir / f".gemini-nano-banana-prompt-{slot.key}.txt"
        product.download_dir.mkdir(parents=True, exist_ok=True)
        prompt_path.write_text(prompt, encoding="utf-8")
        contents: list[Any] = [prompt]
        if index == 0:
            contents.extend(image_part(Path(item["path"])) for item in inputs)
        logger.write(
            "turn.start",
            handle=product.handle,
            slotKey=slot.key,
            qaStatus=slot.qa_status,
            qaReason=slot.qa_reason,
            promptFile=str(prompt_path),
            inputImageCount=len(inputs) if index == 0 else 0,
        )
        image_bytes, mime_type, attempts = await generate_one_turn(chat, contents, config, args.max_retries, limiter)
        write_image_outputs(product, slot, image_bytes, args.model, mime_type)
        download_path, shopify_path = slot_outputs(product, slot)
        logger.write(
            "turn.saved",
            handle=product.handle,
            slotKey=slot.key,
            attempts=attempts,
            bytes=len(image_bytes),
            mimeType=mime_type,
            downloadOutput=str(download_path),
            shopifyOutput=str(shopify_path),
        )

    logger.write("product.done", handle=product.handle, title=product.title)


async def worker(
    name: str,
    queue: asyncio.Queue[tuple[Product, dict[str, Any], list[RepairSlot]]],
    args: argparse.Namespace,
    client: genai.Client,
    limiter: AsyncRateLimiter,
    logger: JsonlLogger,
) -> None:
    while True:
        product, qa_row, slots = await queue.get()
        try:
            await process_product(product, qa_row, slots, args, client, limiter, logger)
        except Exception as exc:
            logger.write("product.failed", worker=name, handle=product.handle, error=str(exc))
        finally:
            queue.task_done()


async def main_async(args: argparse.Namespace) -> None:
    if args.concurrency < 1:
        raise SystemExit("--concurrency must be >= 1")
    env = load_env_file(Path(args.env_file))
    api_key = args.api_key or env.get("GEMINI_API_KEY") or env.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise SystemExit("Missing Gemini API key. Put GEMINI_API_KEY in .env or pass --api-key.")

    requested = set(args.handles)
    products = load_products(Path(args.products_file), Path(args.products_dir), requested)
    qa_rows = load_qa_rows(Path(args.qa_file), requested)
    allowed_slots = set(args.slot or [])

    jobs: list[tuple[Product, dict[str, Any], list[RepairSlot]]] = []
    for handle in sorted(qa_rows):
        product = products.get(handle)
        if not product:
            continue
        slots = repair_slots_for(qa_rows[handle], allowed_slots)
        if slots:
            jobs.append((product, qa_rows[handle], slots))
    if args.limit and args.limit > 0:
        jobs = jobs[: args.limit]

    log_file = Path(args.log_file) if args.log_file else DEFAULT_LOG_DIR / f"gemini-nano-banana-repair-{datetime.now(timezone.utc).isoformat().replace(':', '-').replace('.', '-')}.log"
    logger = JsonlLogger(log_file)
    logger.init()
    logger.write(
        "run.start",
        model=args.model,
        concurrency=args.concurrency,
        products=len(jobs),
        dryRun=args.dry_run,
        force=args.force,
        minRequestInterval=args.min_request_interval,
    )

    client = genai.Client(api_key=api_key)
    limiter = AsyncRateLimiter(args.min_request_interval)
    queue: asyncio.Queue[tuple[Product, dict[str, Any], list[RepairSlot]]] = asyncio.Queue()
    for job in jobs:
        queue.put_nowait(job)

    tasks = [
        asyncio.create_task(worker(f"worker-{index + 1}", queue, args, client, limiter, logger))
        for index in range(min(args.concurrency, max(len(jobs), 1)))
    ]
    await queue.join()
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    logger.write("run.done", products=len(jobs), logFile=str(log_file))


def main() -> None:
    asyncio.run(main_async(parse_args()))


if __name__ == "__main__":
    main()
