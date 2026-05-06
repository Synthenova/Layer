# Learnings

- The live storefront exposes a Storefront access token in `shopify-features` on the public HTML, which is enough to read textual product data.
- A paginated `products` Storefront query with `id`, `handle`, `title`, `description`, and `descriptionHtml` is sufficient for the product-description normalization pass.
- Dumping both CSV and JSONL is useful here: CSV for quick review, JSONL for scripted downstream formatting work.
- The combinations doc is a stronger signal than storefront descriptions for identifying combo products. In the current state, the doc lists 35 combos while the local JSONL contains 33 of them; the missing doc combos are `Rose Oud Opulence` and `Bold Statement`.
- For this workflow, CSV was unnecessary duplication; `JSONL` is the better canonical format because it can hold arrays like `featured_in_layering_kits` and nested `shop_individual_fragrances` note objects.
- The first successful enrichment target was `Dark Seduction`, using existing structured notes already present in the source perfume descriptions rather than needing web search.
- The remaining 22 individual perfumes were recoverable locally by parsing `descriptionHtml` for note pyramids, with official brand-page fallback only for `J'adore Eau de Parfum` and `Amouage Interlude Man`.
- After the final individual pass, all `74/74` individual records have `short_description`, structured `notes`, and `featured_in_layering_kits`, and all `33/33` combo records still have `shop_individual_fragrances`.
- The local final image set for individual perfumes now lives under each product's `shopify-images` folder and the intended Shopify order is fixed to six slots: bottle-only, packaged, bottle with ingredients, top notes, heart notes, base notes.
- A remove-only media pass should target the individual product handles from `perfect_product/products/*`, not combo products, before any ordered re-upload.
- The individual-product uploader should be driven entirely from local `shopify-images` assets, not by recycling current Shopify media. `packaged-bottle-rembg` can be skipped when absent, but `bottle-only-rembg`, `bottle-with-ingredients`, `top-notes`, `heart-notes`, and `base-notes` should be treated as required.
