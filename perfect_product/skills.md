# Skills

- `shopify-storefront-graphql`
  - Used to validate the live Storefront GraphQL query shape before execution.
- Storefront execution pattern
  - Public storefront token sourced from the live storefront page, then used with `X-Shopify-Storefront-Access-Token` against `/api/2026-04/graphql.json`.
- Product classification
  - Combo-vs-individual classification should anchor on `docs/layer-combinations-report.md`, then be cross-checked against the local JSONL export.
- Enrichment workflow
  - First update individual perfume records with `short_description`, structured `notes`, and `featured_in_layering_kits`.
  - Then update combo records with `short_description` and `shop_individual_fragrances` containing links plus notes for each source perfume.
- Individual-note fallback
  - Most perfumes can be parsed from `descriptionHtml`; J'adore Eau de Parfum and Amouage Interlude Man needed official brand-page fallback for a clean top/heart/base pyramid.
