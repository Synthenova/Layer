# Individual Product Image Refresh Worker Template

Use this prompt template for each one-image individual perfume product. The only per-worker variable is the exact Shopify product title.

## Template

```text
You are working in /Users/nirmal/Desktop/Layer.

Use these skills explicitly:
- $pinchtab
- $imagegen
- $shopify-admin-execution

How to use them briefly:
- Use PinchTab through the HTTP API at http://localhost:9868/, not the CLI.
- Send Authorization: Bearer c3a437cec25ec826a5dd278edc80d6a2cbaccf5ef439e4e9.
- Use the PinchTab profile named "Me" in headless mode.
- Use normal Google search only. Never use site: filters.
- Use imagegen only if the retailer/brand listing page does not provide at least one clean representative white-background perfume image.
- Use Shopify Admin execution for product reads and the local helper script for delete/upload.
- For every Shopify CLI call, explicitly pass `--store vzixet-tr.myshopify.com`.

Target Shopify store:
- vzixet-tr.myshopify.com

Target product:
- {{PRODUCT_TITLE}}

Task:
This product currently has exactly one image in Shopify. Replace that single-image gallery with a better gallery sourced from one reputable listing page.

Requirements:
1. Confirm the Shopify product exists and still has exactly one image before mutating anything.
2. In PinchTab, start by opening one new browser tab dedicated to this product only.
3. Use only that dedicated tab for the entire product workflow. Do not reuse a shared tab from another product.
4. In that dedicated tab, use the "Me" headless profile and do a normal Google search for the exact perfume name.
5. From those Google results, choose one reputable listing page such as Sephora, Macy's, Nordstrom, brand official site, FragranceNet, or another strong retailer result.
6. Stay on one listing page only for this product. Do not mix multiple listing pages for one product.
7. Extract as many valid product images as the page provides for that same product.
8. If the page has at least one clean white-background representative bottle image, keep it as image 1.
9. If the page does not have a clean white-background representative image, use imagegen to create one image that shows only this perfume bottle on a pure white background, visually accurate to the references. Then keep that generated image as image 1.
10. Save all gathered local files under:
   output/individual-image-refresh/{{PRODUCT_SLUG}}/
11. Before uploading new images, delete the current single Shopify image for this product.
12. Upload the new local files using:
   node scripts/refresh_individual_product_media.mjs --title "{{PRODUCT_TITLE}}" --exact <ordered image paths>
13. Verify the final Shopify product has the expected image count and READY media.
14. Close the dedicated browser tab for this product when the work is complete.

Notes:
- Do not touch any other product.
- Never run `shopify auth`, `shopify store auth`, logout, login, or any auth-reset flow. Shopify auth is already done.
- Assume Shopify is already logged in and authenticated.
- Do not use Safari.
- Do not use PinchTab CLI.
- If write_products/delete permission is missing, stop and report that exact blocker instead of guessing.

Final report format:
- product title
- chosen listing page URL
- local folder path
- whether imagegen was used
- uploaded image count
- verification result
```

## Local helper

Use this helper for the delete-and-reupload step:

```bash
node scripts/refresh_individual_product_media.mjs --title "{{PRODUCT_TITLE}}" --exact <ordered image paths>
```
