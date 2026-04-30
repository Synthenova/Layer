# Combo Worker Prompts

Use this doc to launch 3 independent workers. Each worker must own exactly 4 combos, work independently, and not touch any other combo. Use `shopify-admin-execution` for store reads/writes and `imagegen` for the generated hero image. Open a fresh ChatGPT/worker tab per combo if your workflow needs a browser tab, and do not reuse a tab across combos.

## Shared Workflow Template

Use this exact workflow for every assigned combo:

1. Use `shopify-admin-execution` to look up the combo product and the two source perfume products in `vzixet-tr.myshopify.com`.
2. Confirm the exact product titles and download all current source images locally.
3. Use the first image from source perfume A and the first image from source perfume B as the hero-image references.
4. Generate a new hero image with `imagegen`.
5. Save the generated hero image locally inside `output/combo-galleries/<combo-slug>/hero-generated.png`.
6. Verify the generated image before upload:
   - both bottles are present
   - white background only
   - no extra objects or text
   - bottle shapes and labels match the source references
7. Upload to Shopify in this order:
   - generated hero image first
   - then source perfume A images
   - then source perfume B images
8. Interleave the source galleries when attaching images:
   - A1, B1, A2, B2, and so on
   - append leftovers from the longer side at the end
9. Verify the final Shopify media count and order.

## Hero Image Prompt

Use this prompt for `imagegen` on every combo:

```text
Use case: product-mockup
Asset type: Shopify combo product hero image
Primary request: create a clean ecommerce product photo on a pure white background showing both perfume bottles together in one frame
Input images: source perfume A first image; source perfume B first image
Scene/backdrop: plain white studio background
Subject: the two exact perfume bottles from the reference images
Style/medium: realistic product photography
Composition/framing: both bottles upright, centered, fully visible, minimal premium catalog composition
Lighting/mood: soft studio lighting, crisp but natural reflections
Color palette: neutral white background; preserve the exact bottle colors from the references
Materials/textures: preserve glass, cap, label, and packaging details from the references
Constraints: keep the bottles accurate to the reference images; show both products clearly; no extra props; no flowers; no smoke; no decorative elements; no text; no watermark; no background color other than white
Avoid: merged bottles, extra products, floating objects, shadow-heavy scenes, stylized art, duplicate branding, or incorrect labels
```

## Worker 1 Prompt

```text
You are working on Shopify store vzixet-tr.myshopify.com.

Use these skills for the task:
- shopify-admin-execution
- imagegen

Rules:
- Work only on the 4 combos assigned to you.
- Do not touch any other combo.
- Use a fresh tab/session per combo if you need browser interaction.
- Do not reuse generation state from a previous combo.
- Save everything locally first under output/combo-galleries/<combo-slug>/.
- Upload the generated hero image first, then the source perfume images in interleaved order.

Assigned combos:
1. Date Night Power = Bleu de Chanel Eau de Parfum + Tobacco Vanille Eau de Parfum
2. Romantic Evening = Delina Eau de Parfum + Baccarat Rouge 540 Eau de Parfum
3. Vanilla Sky = Vanilla | 28 + Tobacco Vanille Eau de Parfum
4. Coffee & Cream = Khamrah Qahwa + Black Opium Le Parfum

E2E steps:
1. Use shopify-admin-execution to confirm the exact Shopify product titles and fetch the current media for both source perfumes.
2. Download the first image from each source perfume and keep the full source galleries locally.
3. Run imagegen with the shared hero-image prompt above.
4. Save the generated hero image as output/combo-galleries/<combo-slug>/hero-generated.png.
5. Visually verify the hero image before uploading.
6. Push to Shopify in this order: hero image first, then A/B source images interleaved.
7. Verify the final Shopify gallery media count and ordering.

Final report for each combo must include:
- combo name
- local folder path
- hero image path
- upload result
- verification result
```

## Worker 2 Prompt

```text
You are working on Shopify store vzixet-tr.myshopify.com.

Use these skills for the task:
- shopify-admin-execution
- imagegen

Rules:
- Work only on the 4 combos assigned to you.
- Do not touch any other combo.
- Use a fresh tab/session per combo if you need browser interaction.
- Do not reuse generation state from a previous combo.
- Save everything locally first under output/combo-galleries/<combo-slug>/.
- Upload the generated hero image first, then the source perfume images in interleaved order.

Assigned combos:
1. Cozy Fireplace = Replica By the Fireplace Eau de Toilette + Tobacco Vanille Eau de Parfum
2. Dark & Delicious = Oud Wood Eau de Parfum + Black Phantom Eau de Parfum
3. Citrus Veil = Jo Malone Wood Sage & Sea Salt Cologne + Le Labo Bergamote 22 Eau de Parfum
4. Summer Vibes = Acqua di Gio Eau de Parfum + Oud Wood Eau de Parfum

E2E steps:
1. Use shopify-admin-execution to confirm the exact Shopify product titles and fetch the current media for both source perfumes.
2. Download the first image from each source perfume and keep the full source galleries locally.
3. Run imagegen with the shared hero-image prompt above.
4. Save the generated hero image as output/combo-galleries/<combo-slug>/hero-generated.png.
5. Visually verify the hero image before uploading.
6. Push to Shopify in this order: hero image first, then A/B source images interleaved.
7. Verify the final Shopify gallery media count and ordering.

Final report for each combo must include:
- combo name
- local folder path
- hero image path
- upload result
- verification result
```

## Worker 3 Prompt

```text
You are working on Shopify store vzixet-tr.myshopify.com.

Use these skills for the task:
- shopify-admin-execution
- imagegen

Rules:
- Work only on the 4 combos assigned to you.
- Do not touch any other combo.
- Use a fresh tab/session per combo if you need browser interaction.
- Do not reuse generation state from a previous combo.
- Save everything locally first under output/combo-galleries/<combo-slug>/.
- Upload the generated hero image first, then the source perfume images in interleaved order.

Assigned combos:
1. Summer Citrus Kick = Acqua di Parma Blu Mediterraneo - Fico di Amalfi Eau de Toilette + Creed Virgin Island Water Eau de Parfum
2. Nautical Fresh = Green Irish Tweed Eau de Parfum + Xerjoff Naxos Eau de Parfum
3. Effortless Elegance = Jo Malone Wood Sage & Sea Salt Cologne + Delina La Rosée Eau de Parfum
4. Floral Bomb Supreme = Prada Paradoxe Eau de Parfum + Gucci Flora Gorgeous Gardenia Eau de Parfum

E2E steps:
1. Use shopify-admin-execution to confirm the exact Shopify product titles and fetch the current media for both source perfumes.
2. Download the first image from each source perfume and keep the full source galleries locally.
3. Run imagegen with the shared hero-image prompt above.
4. Save the generated hero image as output/combo-galleries/<combo-slug>/hero-generated.png.
5. Visually verify the hero image before uploading.
6. Push to Shopify in this order: hero image first, then A/B source images interleaved.
7. Verify the final Shopify gallery media count and ordering.

Final report for each combo must include:
- combo name
- local folder path
- hero image path
- upload result
- verification result
```

## Remaining 6 Combos For Us

After the 3 workers finish, handle these 6 combos locally:

1. Noir Serenity = Dior Ambre Nuit Eau de Parfum + Molecule 01 Eau de Toilette
2. Sandalwood Glow = Le Labo Santal 33 Eau de Parfum + Glossier You Eau de Parfum
3. Bold Statement = Amouage Interlude Man + Arabian Oud
4. Winter Richness = Xerjoff Alexandria II + Black Phantom Eau de Parfum
5. Sweet & Musky = Club de Nuit Intense Woman + Khamrah Qahwa
6. Fruity Floral Heaven = Club De Nuit Woman Perfume Oil + Lattafa Mayar Eau de Parfum

Note:
- `Rose Oud Opulence` is not included in this batch because Shopify currently does not show a matching product record for it.
