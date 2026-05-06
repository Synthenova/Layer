#!/usr/bin/env python3

import json
import math
import subprocess
import tempfile
from pathlib import Path


STORE = "vzixet-tr.myshopify.com"
CHUNK_SIZE = 25
ROOT = Path("/Users/nirmal/Desktop/Layer")
INDIVIDUALS_PATH = ROOT / "perfect_product" / "individual-products.jsonl"
COMBOS_PATH = ROOT / "perfect_product" / "combo-products.jsonl"


NOTE_OVERRIDES = {
    "Black Opium Eau de Parfum": {
        "top": ["Pear accord", "Mandarin essence"],
        "heart": ["Vanilla", "Orange blossom", "White flowers"],
        "base": ["Black coffee accord", "Cedarwood essence", "White musk", "Patchouli"],
    },
    "Delina Eau de Parfum": {
        "top": ["Bergamot", "Lychee", "Rhubarb"],
        "heart": ["Damascena Rose", "Nutmeg"],
        "base": ["Cashmeran", "Musks", "Vetiver"],
    },
}


MUTATION = """
mutation SetMetafields($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields {
      ownerType
      namespace
      key
      type
    }
    userErrors {
      field
      message
      code
    }
  }
}
""".strip()


def load_jsonl(path: Path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def text_node(value: str, *, bold: bool = False):
    node = {"type": "text", "value": value}
    if bold:
        node["bold"] = True
    return node


def paragraph(label: str, values):
    return {
        "type": "paragraph",
        "children": [
            text_node(f"{label}: ", bold=True),
            text_node(", ".join(values)),
        ],
    }


def heading(level: int, text: str):
    return {"type": "heading", "level": level, "children": [text_node(text)]}


def normalize_notes(title: str, notes: dict | None):
    base = notes or {}
    merged = {
        "top": list(base.get("top") or []),
        "heart": list(base.get("heart") or []),
        "base": list(base.get("base") or []),
    }
    if title in NOTE_OVERRIDES:
        merged = NOTE_OVERRIDES[title]
    return merged


def individual_notes_doc(title: str, notes: dict):
    normalized = normalize_notes(title, notes)
    children = []
    for label, key in (("Top Notes", "top"), ("Heart Notes", "heart"), ("Base Notes", "base")):
        values = [value.strip().rstrip(".") for value in normalized.get(key, []) if value and value.strip()]
        if values:
            children.append(paragraph(label, values))
    if not children:
        raise ValueError(f"No note data for individual product: {title}")
    return {"type": "root", "children": children}


def combo_notes_doc(row: dict):
    children = [
        {
            "type": "paragraph",
            "children": [
                text_node("Layering Pair: ", bold=True),
                text_node(" + ".join(item["title"] for item in row["shop_individual_fragrances"])),
            ],
        }
    ]
    for item in row["shop_individual_fragrances"]:
        notes = normalize_notes(item["title"], item.get("notes"))
        children.append(heading(3, item["title"]))
        has_any = False
        for label, key in (("Top Notes", "top"), ("Heart Notes", "heart"), ("Base Notes", "base")):
            values = [value.strip().rstrip(".") for value in notes.get(key, []) if value and value.strip()]
            if values:
                children.append(paragraph(label, values))
                has_any = True
        if not has_any:
            raise ValueError(f"No note data for combo component: {row['title']} -> {item['title']}")
    return {"type": "root", "children": children}


def product_ref_value(items):
    ids = [item["id"] for item in items]
    return json.dumps(ids, separators=(",", ":"))


def metafield(owner_id: str, key: str, field_type: str, value: str):
    return {
        "ownerId": owner_id,
        "namespace": "custom",
        "key": key,
        "type": field_type,
        "value": value,
    }


def build_payload():
    individuals = load_jsonl(INDIVIDUALS_PATH)
    combos = load_jsonl(COMBOS_PATH)

    handle_to_individual = {row["handle"]: row for row in individuals}
    handle_to_combo = {row["handle"]: row for row in combos}

    payload = []

    for row in individuals:
        featured = []
        for item in row.get("featured_in_layering_kits") or []:
            combo = handle_to_combo.get(item["handle"])
            if combo:
                featured.append({"id": combo["id"], "title": combo["title"]})
        payload.extend(
            [
                metafield(
                    row["id"],
                    "notes",
                    "rich_text_field",
                    json.dumps(individual_notes_doc(row["title"], row.get("notes")), separators=(",", ":")),
                ),
                metafield(
                    row["id"],
                    "featured_in_layering_kits",
                    "list.product_reference",
                    product_ref_value(featured),
                ),
                metafield(
                    row["id"],
                    "shop_individual_fragrances",
                    "list.product_reference",
                    "[]",
                ),
            ]
        )

    for row in combos:
        refs = []
        for item in row.get("shop_individual_fragrances") or []:
            individual = handle_to_individual.get(item["handle"])
            if individual:
                refs.append({"id": individual["id"], "title": individual["title"]})
        payload.extend(
            [
                metafield(
                    row["id"],
                    "notes",
                    "rich_text_field",
                    json.dumps(combo_notes_doc(row), separators=(",", ":")),
                ),
                metafield(
                    row["id"],
                    "shop_individual_fragrances",
                    "list.product_reference",
                    product_ref_value(refs),
                ),
                metafield(
                    row["id"],
                    "featured_in_layering_kits",
                    "list.product_reference",
                    "[]",
                ),
            ]
        )

    return payload


def run_chunk(chunk_index: int, total_chunks: int, metafields: list[dict]):
    variables = {"metafields": metafields}
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir_path = Path(tmpdir)
        query_file = tmpdir_path / "mutation.graphql"
        variable_file = tmpdir_path / "variables.json"
        query_file.write_text(MUTATION)
        variable_file.write_text(json.dumps(variables))

        cmd = [
            "shopify",
            "store",
            "execute",
            "--store",
            STORE,
            "--query-file",
            str(query_file),
            "--variable-file",
            str(variable_file),
            "--allow-mutations",
            "--json",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        stdout = result.stdout.strip()
        json_start = stdout.find("{")
        if json_start == -1:
            raise RuntimeError(
                f"Chunk {chunk_index}/{total_chunks} returned no JSON. stdout={result.stdout!r} stderr={result.stderr!r}"
            )
        data = json.loads(stdout[json_start:])
        user_errors = data["metafieldsSet"]["userErrors"]
        if user_errors:
            raise RuntimeError(f"Chunk {chunk_index}/{total_chunks} failed: {user_errors}")
        print(f"Chunk {chunk_index}/{total_chunks}: wrote {len(metafields)} metafields")


def main():
    payload = build_payload()
    total_chunks = math.ceil(len(payload) / CHUNK_SIZE)
    print(f"Prepared {len(payload)} metafields across {total_chunks} chunks")
    for chunk_number, start in enumerate(range(0, len(payload), CHUNK_SIZE), start=1):
        run_chunk(chunk_number, total_chunks, payload[start : start + CHUNK_SIZE])
    print("Done")


if __name__ == "__main__":
    main()
