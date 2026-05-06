#!/usr/bin/env python3

import html
import json
import math
import subprocess
import tempfile
from pathlib import Path


STORE = "vzixet-tr.myshopify.com"
ROOT = Path("/Users/nirmal/Desktop/Layer")
INDIVIDUALS_PATH = ROOT / "perfect_product" / "individual-products.jsonl"
COMBOS_PATH = ROOT / "perfect_product" / "combo-products.jsonl"
CHUNK_SIZE = 20


MUTATION = """
mutation UpdateProductDescriptions($input: ProductUpdateInput!) {
  productUpdate(product: $input) {
    product {
      id
      title
      handle
    }
    userErrors {
      field
      message
    }
  }
}
""".strip()


def load_jsonl(path: Path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def paragraph_html(text: str) -> str:
    return f"<p>{html.escape(text, quote=False)}</p>"


def combo_description(row: dict) -> str:
    pair = " + ".join(item["title"] for item in row["shop_individual_fragrances"])
    summary = (row.get("short_description") or "").strip()
    if summary:
        return f"{row['title']} pairs {pair}. {summary}"
    return f"{row['title']} pairs {pair} for a layered fragrance experience."


def individual_description(row: dict) -> str:
    summary = (row.get("short_description") or row.get("description") or "").strip()
    if not summary:
        raise ValueError(f"Missing description text for {row['title']}")
    return summary


def build_updates():
    updates = []
    for row in load_jsonl(INDIVIDUALS_PATH):
        updates.append(
            {
                "id": row["id"],
                "title": row["title"],
                "handle": row["handle"],
                "descriptionHtml": paragraph_html(individual_description(row)),
            }
        )

    for row in load_jsonl(COMBOS_PATH):
        updates.append(
            {
                "id": row["id"],
                "title": row["title"],
                "handle": row["handle"],
                "descriptionHtml": paragraph_html(combo_description(row)),
            }
        )

    return updates


def run_update(index: int, total: int, update: dict):
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        query_file = tmp / "mutation.graphql"
        variable_file = tmp / "variables.json"
        query_file.write_text(MUTATION)
        variable_file.write_text(json.dumps({"input": update}))
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
            raise RuntimeError(f"No JSON returned for {update['title']}")
        data = json.loads(stdout[json_start:])
        errors = data["productUpdate"]["userErrors"]
        if errors:
            raise RuntimeError(f"{update['title']}: {errors}")
        print(f"{index}/{total}: updated {update['title']}")


def main():
    updates = build_updates()
    total = len(updates)
    print(f"Prepared {total} product description updates")
    for index, update in enumerate(updates, start=1):
        run_update(index, total, update)
    print("Done")


if __name__ == "__main__":
    main()
