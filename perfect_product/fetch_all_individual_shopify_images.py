#!/usr/bin/env python3

import json
import subprocess
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen, Request


ROOT = Path("/Users/nirmal/Desktop/Layer")
PERFECT = ROOT / "perfect_product"
INDIVIDUALS = PERFECT / "individual-products.jsonl"
STORE = "vzixet-tr.myshopify.com"
QUERY_FILE = Path("/tmp/layer_individual_media_query.graphql")


QUERY = """query ProductsPage($after: String) {
  products(first: 250, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      title
      handle
      media(first: 3) {
        nodes {
          ... on MediaImage {
            image {
              url
              altText
            }
          }
        }
      }
    }
  }
}
"""


def load_individuals():
    rows = []
    with INDIVIDUALS.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            rows.append({"title": obj["title"], "handle": obj["handle"]})
    return rows


def run_shopify_query(variables=None):
    QUERY_FILE.write_text(QUERY)
    cmd = [
        "shopify",
        "store",
        "execute",
        "--store",
        STORE,
        "--query-file",
        str(QUERY_FILE),
        "--json",
    ]
    if variables:
        cmd.extend(["--variables", json.dumps(variables)])
    result = subprocess.run(cmd, check=True, capture_output=True, text=True)
    stdout = result.stdout.strip()
    start = stdout.find("{")
    if start == -1:
        raise RuntimeError(f"Unexpected Shopify output: {stdout[:500]}")
    return json.loads(stdout[start:])


def fetch_all_products():
    nodes = []
    after = None
    while True:
        payload = run_shopify_query({"after": after} if after else None)
        page = payload["products"]
        nodes.extend(page["nodes"])
        if not page["pageInfo"]["hasNextPage"]:
            break
        after = page["pageInfo"]["endCursor"]
    return nodes


def extension_from_url(url):
    path = urlparse(url).path.lower()
    if path.endswith(".png"):
        return ".png"
    if path.endswith(".webp"):
        return ".webp"
    if path.endswith(".jpeg"):
        return ".jpeg"
    return ".jpg"


def download(url, dest):
    req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(req, timeout=60) as resp:
        dest.write_bytes(resp.read())


def main():
    individuals = load_individuals()
    handle_set = {row["handle"] for row in individuals}
    all_products = fetch_all_products()
    by_handle = {node["handle"]: node for node in all_products if node["handle"] in handle_set}

    missing = []
    summary = []

    for row in sorted(individuals, key=lambda x: (x["title"].lower(), x["handle"])):
        handle = row["handle"]
        node = by_handle.get(handle)
        if not node:
            missing.append({"handle": handle, "title": row["title"], "reason": "product-not-found"})
            continue

        folder = PERFECT / "products" / handle / "current-shopify-images"
        folder.mkdir(parents=True, exist_ok=True)
        for existing in folder.iterdir():
            if existing.is_file():
                existing.unlink()

        downloaded = []
        errors = []
        for idx, media in enumerate(node.get("media", {}).get("nodes", []), start=1):
            image = media.get("image") if media else None
            if not image or not image.get("url"):
                continue
            ext = extension_from_url(image["url"])
            dest = folder / f"image-{idx}{ext}"
            try:
                download(image["url"], dest)
                downloaded.append(
                    {
                        "index": idx,
                        "file": str(dest),
                        "url": image["url"],
                        "alt": image.get("altText"),
                    }
                )
            except Exception as exc:
                errors.append(
                    {
                        "index": idx,
                        "url": image["url"],
                        "error": str(exc),
                    }
                )

        summary.append(
            {
                "title": row["title"],
                "handle": handle,
                "downloaded_count": len(downloaded),
                "files": downloaded,
                "errors": errors,
            }
        )

    out = PERFECT / "all-individual-current-shopify-images-summary.json"
    out.write_text(json.dumps({"products": summary, "missing": missing}, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"products_processed": len(summary), "missing": len(missing), "summary_file": str(out)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
