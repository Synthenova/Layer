# Instructions

- Keep all future `perfect_product` work notes in this folder.
- For catalog text pulls, use Shopify Storefront GraphQL against the live store rather than reading repo theme files.
- Export raw product text in machine-friendly formats first so description normalization can be audited before edits.
- Use `docs/layer-combinations-report.md` as the strong-signal source of truth for combo product identification instead of inferring combo status from descriptions alone.
- Keep `JSONL` as the canonical working dataset. Do not maintain a duplicate CSV during info-collection stage.
- Split the catalog into `combo-products.jsonl` and `individual-products.jsonl` before enrichment.
- For perfume notes, normalize into structured `top`, `heart`, and `base` arrays.
- For combo products, store the source perfume links and each perfume's structured notes under `shop_individual_fragrances`.
- For remaining individual-product enrichment, use `descriptionHtml` first, keep `short_description` under 50 words, and only use official brand/retailer pages when the HTML does not expose a clean note pyramid.
- For the next individual-product Shopify media refresh, the target gallery order is: `bottle-only-rembg`, `packaged-bottle-rembg`, `bottle-with-ingredients`, `top-notes`, `heart-notes`, `base-notes`.
- Remove existing Shopify media first, then upload only the local `shopify-images` set in that exact order.
- `packaged-bottle-rembg` is optional during upload; all other files in the ordered set are required.
