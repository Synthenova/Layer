# Individual Perfume Image Revamp Task

This task is for revamping **individual perfume product images only**.

## Goal

For each individual perfume product:

1. inspect the first up to `3` current Shopify product images already saved locally
2. determine the product status **before generating anything**
3. write the status note immediately
4. generate only the image outputs that the status supports
5. save the generated outputs locally

This is a **triage-first asset-generation workflow**. The product status is decided from the local reference images first, not after generation.

## Product Scope

- work on **individual perfumes only**
- do **not** do combo products in this workflow
- do **one product at a time**

## Local Folder Structure

For each product handle:

```text
perfect_product/products/<product-handle>/
  current-shopify-images/
  generated-images/
```

Save:

- reference images under `current-shopify-images/`
- generated outputs under `generated-images/`

## Reference Images

For each product:

- use only the first up to `3` saved Shopify images already present in `current-shopify-images/`
- if fewer than `3` exist, use whatever is present
- inspect those images directly before doing any generation work

## Required Order Of Operations

Follow this order exactly:

1. inspect the local reference images
2. determine the product status
3. write `generated-images/status.txt`
4. if the status allows generation, create the needed image outputs
5. validate the outputs
6. save the final files

Do not generate turn 1 first and decide the status later. Status comes first.

## Reference Triage Rule

Before generating anything, inspect the saved local reference images and classify the product as exactly one of these:

1. `turn1-and-turn2`
   - at least one image clearly shows the bottle by itself
   - and at least one image clearly shows the bottle together with its retail packaging / box
   - generate both turn 1 and turn 2

2. `turn1-only`
   - at least one image clearly shows the bottle by itself
   - but no image clearly shows the bottle together with its retail packaging / box
   - generate only turn 1

3. `none`
   - there is no clear bottle-only reference in the first saved images
   - do not generate any image for that product

This triage decision must be made by viewing the saved images directly.

## Existing Output Skip Rule

Before doing new work on a product, check `generated-images/`.

If:

- `generated-images/status.txt` already exists
- and the files required by that status already exist

then skip the product and do not regenerate it.

Required file sets:

- `turn1-and-turn2`
  - `generated-images/status.txt`
  - `generated-images/bottle-only.png`
  - `generated-images/packaged-bottle.png`

- `turn1-only`
  - `generated-images/status.txt`
  - `generated-images/bottle-only.png`

- `none`
  - `generated-images/status.txt`

If a product is skipped for this reason, report it as:

```text
already_complete
```

Do not overwrite existing finished outputs unless regeneration was explicitly requested.

## Status Note Rule

As soon as triage is complete, write:

```text
generated-images/status.txt
```

Allowed values:

- `turn1-and-turn2`
- `turn1-only`
- `none`

If the result is `turn1-only`, include the reason:

```text
turn1-only
reason: bottle reference exists, but no clear packaged bottle / retail box reference in the first Shopify images
```

If the result is `none`, include the reason:

```text
none
reason: no clear bottle-only reference image in the first Shopify images
```

Write this status note before generation starts.

## Generation Tooling

Use the `$imagegen` skill for asset generation.

Generate from the local reference images already saved for that product.

## Turn Rules

### Turn 1

Generate:

- `generated-images/bottle-only.png`

Only if status is:

- `turn1-and-turn2`
- `turn1-only`

### Turn 2

Generate:

- `generated-images/packaged-bottle.png`

Only if status is:

- `turn1-and-turn2`

Turn 2 must use the same product’s local reference images and specifically preserve both the bottle and the matching retail box.

## Prompt Intent

### Turn 1 intent

Create a clean ecommerce image showing:

- exactly one perfume bottle
- no box
- no props
- no extra objects
- centered
- fully visible
- faithful to the real reference bottle

### Turn 2 intent

Create a clean ecommerce image showing:

- exactly one perfume bottle
- its matching retail box
- no props
- no extra objects
- both centered
- both fully visible
- faithful to the real reference bottle and box

## Image Fidelity Requirements

The generated images must:

- match the real bottle shape
- match the real cap shape
- preserve branding and label placement
- preserve bottle color
- preserve packaging color for turn 2
- preserve proportions
- show only the requested product
- avoid hallucinated props, extra boxes, extra bottles, or background scenes

Do not beautify, redesign, or stylize the product beyond a clean ecommerce presentation.

## Completion Checks

After each generated image:

1. confirm the correct perfume identity
2. confirm the bottle shape is correct
3. confirm the cap is correct
4. confirm branding placement is correct
5. confirm no unrelated objects were added
6. confirm turn 2 uses the correct matching box if turn 2 was generated

If a result is wrong, regenerate that single output only.

## Output Naming

Use exactly:

- `generated-images/bottle-only.png`
- `generated-images/packaged-bottle.png`

## Final Summary

For each product, finish with a concise plaintext summary saying:

- the final status
- which files were created
- whether any turn was skipped due to reference limitations
