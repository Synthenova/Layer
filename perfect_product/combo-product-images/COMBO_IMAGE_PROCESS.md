# Combo Image Process

This document is the source of truth for creating combo-product image sets under:

- `perfect_product/combo-product-images/<combo-handle>/`

Each combo gets exactly `3` files:

1. `hero-generated.png`
2. `<source-a-handle>-bottle-with-ingredients.png`
3. `<source-b-handle>-bottle-with-ingredients.png`

Keep the process deterministic. Do not invent extra gallery images. Do not use packaged images. Do not use note-card images.

## Goal

For every combo product:

1. Generate one combo hero from the two source perfumes' `bottle-only-rembg.png` files.
2. Remove the chroma background from the generated hero.
3. Copy the `bottle-with-ingredients.png` file from each of the two source perfumes into the combo folder.

Final output for each combo must be exactly:

- `hero-generated.png`
- `<source-a-handle>-bottle-with-ingredients.png`
- `<source-b-handle>-bottle-with-ingredients.png`

## Folder Rules

For combo handle `<combo-handle>`, work inside:

- `perfect_product/combo-product-images/<combo-handle>/`

Required intermediate file:

- `hero-generated-chroma.png`

Required final files:

- `hero-generated.png`
- `<source-a-handle>-bottle-with-ingredients.png`
- `<source-b-handle>-bottle-with-ingredients.png`

Do not rename source handles.

## Input Source Rules

Hero generation inputs must be:

- `perfect_product/products/<source-a-handle>/shopify-images/bottle-only-rembg.png`
- `perfect_product/products/<source-b-handle>/shopify-images/bottle-only-rembg.png`

Copied supporting images must be:

- `perfect_product/products/<source-a-handle>/shopify-images/bottle-with-ingredients.png`
- `perfect_product/products/<source-b-handle>/shopify-images/bottle-with-ingredients.png`

Do not use:

- `packaged-bottle-rembg.png`
- `top-notes.png`
- `heart-notes.png`
- `base-notes.png`
- `shopify-images-annotated/*`

## Hero Prompt

Use this exact prompt pattern, replacing only the perfume names:

```text
Use case: product-mockup
Asset type: combo product hero image
Primary request: create a clean ecommerce combo image featuring both uploaded perfume bottles together as a single pairing hero
Input images: Image 1 is the <SOURCE_A_TITLE> bottle-only reference; Image 2 is the <SOURCE_B_TITLE> bottle-only reference
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for later background removal
Subject: both real perfume bottles together, fully visible, upright, visually accurate to the references, with <SOURCE_A_TITLE> and <SOURCE_B_TITLE> shown as a premium pairing
Style/medium: photorealistic studio product photography
Composition/framing: square composition, centered pair, balanced spacing, both bottles large and clearly separated, no cropping
Lighting/mood: soft clean studio lighting, premium ecommerce look, minimal shadowing
Color palette: true-to-product colors only
Materials/textures: preserve exact bottle silhouette, cap shape, label appearance, glass reflections, and packaging identity from the references
Constraints: no text, no watermark, no props, no flowers, no smoke, no background texture, no pedestal, no packaging boxes, no extra objects, no collage layout
Avoid: any bottle redesign, any label distortion, any missing bottle parts, any overlapping that hides key details, any use of #00ff00 inside the bottles, any cast shadow or contact shadow on the background
```

## Generation Steps

For each combo:

1. Create the combo folder:
   - `perfect_product/combo-product-images/<combo-handle>/`
2. Load both source `bottle-only-rembg.png` reference images.
3. Generate the combo hero with the prompt above.
4. Save the generated chroma image as:
   - `perfect_product/combo-product-images/<combo-handle>/hero-generated-chroma.png`
5. Remove the chroma background and save:
   - `perfect_product/combo-product-images/<combo-handle>/hero-generated.png`
6. Copy source A ingredients image into the combo folder as:
   - `perfect_product/combo-product-images/<combo-handle>/<source-a-handle>-bottle-with-ingredients.png`
7. Copy source B ingredients image into the combo folder as:
   - `perfect_product/combo-product-images/<combo-handle>/<source-b-handle>-bottle-with-ingredients.png`
8. Verify the combo folder contains exactly the expected files.

## Background Removal

The chroma removal helper path is:

- `${CODEX_HOME:-$HOME/.codex}/skills/.system/imagegen/scripts/remove_chroma_key.py`

Run it against `hero-generated-chroma.png` and write `hero-generated.png`.

Validate that:

- `hero-generated.png` is RGBA
- background is transparent
- bottle edges are intact

## Quality Rules

The generated hero must:

- show both source bottles clearly
- preserve bottle identity
- keep both bottles fully visible
- avoid weird overlap
- avoid props and styling clutter
- look like a clean ecommerce pairing image

If the hero is obviously wrong, regenerate before copying the final files.

## Completion Rule

A combo is complete only when all `3` final deliverables exist:

- `hero-generated.png`
- `<source-a-handle>-bottle-with-ingredients.png`
- `<source-b-handle>-bottle-with-ingredients.png`

The intermediate `hero-generated-chroma.png` may also remain in the folder.

## Combo List

1. `daisy-cloud-dream`
   - source A: `daisy-eau-de-toilette`
   - source B: `cloud-eau-de-parfum`
2. `cotton-candy-luxe`
   - source A: `baccarat-rouge-540-eau-de-parfum`
   - source B: `cloud-eau-de-parfum`
3. `dark-seduction`
   - source A: `black-opium-eau-de-parfum`
   - source B: `la-nuit-de-lhomme-eau-de-toilette`
4. `professional-powerhouse`
   - source A: `aventus-eau-de-parfum`
   - source B: `grey-vetiver-eau-de-parfum`
5. `sweet-smoke-symphony`
   - source A: `grand-soir-eau-de-parfum`
   - source B: `replica-jazz-club-eau-de-toilette`
6. `fresh-confidence`
   - source A: `libre-eau-de-parfum`
   - source B: `light-blue-eau-de-toilette`
7. `garden-party`
   - source A: `gucci-bloom-eau-de-parfum`
   - source B: `daisy-eau-de-toilette`
8. `autumn-warmth`
   - source A: `layton-eau-de-parfum`
   - source B: `replica-by-the-fireplace-eau-de-toilette`
9. `leather-and-smoke`
   - source A: `ombre-leather-eau-de-parfum`
   - source B: `noir-extreme-eau-de-parfum`
10. `the-million-dollar-eros`
   - source A: `1-million-eau-de-toilette`
   - source B: `eros-eau-de-parfum`
11. `stronger-bad-boy`
   - source A: `bad-boy-eau-de-toilette`
   - source B: `stronger-with-you-intensely-eau-de-parfum`
12. `sauvage-night`
   - source A: `sauvage-eau-de-parfum`
   - source B: `la-nuit-de-lhomme-eau-de-toilette`
13. `invictus-blue`
   - source A: `invictus-eau-de-toilette`
   - source B: `bleu-de-chanel-eau-de-parfum`
14. `libre-bloom`
   - source A: `libre-eau-de-parfum`
   - source B: `gucci-bloom-eau-de-parfum`
15. `good-girl-fantasy`
   - source A: `good-girl-eau-de-parfum`
   - source B: `fantasy-eau-de-parfum`
16. `flowerbomb-la-vie`
   - source A: `flowerbomb-eau-de-parfum`
   - source B: `la-vie-est-belle-eau-de-parfum`
17. `date-night-power`
   - source A: `bleu-de-chanel-eau-de-parfum`
   - source B: `tobacco-vanille-eau-de-parfum`
18. `romantic-evening`
   - source A: `delina-eau-de-parfum`
   - source B: `baccarat-rouge-540-eau-de-parfum`
19. `vanilla-sky`
   - source A: `vanilla-28`
   - source B: `tobacco-vanille-eau-de-parfum`
20. `coffee-and-cream`
   - source A: `khamrah-qahwa`
   - source B: `black-opium-le-parfum`
21. `cozy-fireplace`
   - source A: `replica-by-the-fireplace-eau-de-toilette`
   - source B: `tobacco-vanille-eau-de-parfum`
22. `citrus-veil`
   - source A: `jo-malone-wood-sage-sea-salt-cologne`
   - source B: `le-labo-bergamote-22`
23. `summer-citrus-kick`
   - source A: `acqua-di-parma-blu-mediterraneo-fico-di-amalfi-eau-de-toilette`
   - source B: `creed-virgin-island-water-eau-de-parfum`
24. `nautical-fresh`
   - source A: `green-irish-tweed-eau-de-parfum`
   - source B: `xerjoff-naxos-eau-de-parfum`
25. `effortless-elegance`
   - source A: `jo-malone-wood-sage-sea-salt-cologne`
   - source B: `delina-la-rosee-eau-de-parfum`
26. `floral-bomb-supreme`
   - source A: `prada-paradoxe-eau-de-parfum`
   - source B: `gucci-flora-gorgeous-gardenia-eau-de-parfum`
27. `noir-serenity`
   - source A: `dior-ambre-nuit-eau-de-parfum`
   - source B: `molecule-01-eau-de-toilette`
28. `sandalwood-glow`
   - source A: `le-labo-santal-33-eau-de-parfum`
   - source B: `glossier-you-eau-de-parfum`
29. `winter-richness`
   - source A: `xerjoff-alexandria-ii`
   - source B: `black-phantom-eau-de-parfum`
30. `sweet-and-musky`
   - source A: `club-de-nuit-intense-woman`
   - source B: `khamrah-qahwa`
31. `fruity-floral-heaven`
   - source A: `club-de-nuit-woman-perfume-oil`
   - source B: `lattafa-mayar-eau-de-parfum`
32. `dark-and-delicious`
   - source A: `oud-wood-eau-de-parfum`
   - source B: `black-phantom-eau-de-parfum`
33. `summer-vibes`
   - source A: `acqua-di-gio-eau-de-parfum`
   - source B: `oud-wood-eau-de-parfum`

## Worker Assignment

Worker 1:

- `daisy-cloud-dream`
- `cotton-candy-luxe`
- `dark-seduction`
- `professional-powerhouse`
- `sweet-smoke-symphony`
- `fresh-confidence`
- `garden-party`
- `autumn-warmth`
- `leather-and-smoke`

Worker 2:

- `the-million-dollar-eros`
- `stronger-bad-boy`
- `sauvage-night`
- `invictus-blue`
- `libre-bloom`
- `good-girl-fantasy`
- `flowerbomb-la-vie`
- `date-night-power`

Worker 3:

- `romantic-evening`
- `vanilla-sky`
- `coffee-and-cream`
- `cozy-fireplace`
- `citrus-veil`
- `summer-citrus-kick`
- `nautical-fresh`
- `effortless-elegance`

Worker 4:

- `floral-bomb-supreme`
- `noir-serenity`
- `sandalwood-glow`
- `winter-richness`
- `sweet-and-musky`
- `fruity-floral-heaven`
- `dark-and-delicious`
- `summer-vibes`
