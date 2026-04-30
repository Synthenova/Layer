#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const STORE = "vzixet-tr.myshopify.com";
const ROOT = process.cwd();

const QUERY_PRODUCTS = `
query OneImageProducts {
  products(first: 250) {
    edges {
      node {
        title
        media(first: 100, query: "media_type:IMAGE") {
          nodes { id }
        }
      }
    }
  }
}
`;

function parseArgs(argv) {
  const args = {
    excludeTitle: null,
    output: path.join(ROOT, "tmp", "single-image-individual-prompts.json"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--exclude-title") {
      args.excludeTitle = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (value === "--output") {
      args.output = path.resolve(ROOT, argv[index + 1] ?? "");
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${value}`);
  }
  return args;
}

function runShopifyQuery(query) {
  const result = spawnSync(
    "shopify",
    ["store", "execute", "--store", STORE, "--json", "--query", query],
    { cwd: ROOT, encoding: "utf8", env: process.env },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `shopify exited ${result.status}`);
  }
  const cleaned = result.stdout
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
    .split("\n")
    .filter(line => !line.includes("Loading stored store auth") && !line.includes("Executing GraphQL operation"))
    .join("\n")
    .trim();
  return JSON.parse(cleaned);
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");
}

function buildPrompt(productTitle) {
  const productSlug = slugify(productTitle);
  return `You are working in /Users/nirmal/Desktop/Layer.

Use these skills explicitly:
- $pinchtab
- $imagegen
- $shopify-admin-execution

How to use them briefly:
- Use PinchTab through the HTTP API at http://localhost:9868/, not the CLI.
- Send Authorization: Bearer c3a437cec25ec826a5dd278edc80d6a2cbaccf5ef439e4e9.
- Use the PinchTab profile named "Me" in headless mode.
- Use normal Google search only. Never use site: filters.
- Use imagegen only if the chosen listing page does not provide a clean white-background representative image.
- Use Shopify Admin execution for reads and the local helper script for delete/upload.
- For every Shopify CLI call, explicitly pass --store ${STORE}.

Target Shopify store:
- ${STORE}

Target product:
- ${productTitle}

Task:
This product currently has exactly one image in Shopify. Replace that single-image gallery with a better gallery sourced from one reputable listing page.

Requirements:
1. Confirm the Shopify product exists and still has exactly one image before mutating anything.
2. In PinchTab, open one new browser tab dedicated to this product only.
3. Use only that dedicated tab for the entire product workflow. Do not reuse a shared tab from another product.
4. In that dedicated tab, use the "Me" headless profile and do a normal Google search for the exact perfume name.
5. From those Google results, choose one reputable listing page such as Sephora, Macy's, Nordstrom, the brand official site, FragranceNet, or another strong retailer result.
6. Stay on one listing page only for this product. Do not mix multiple listing pages for one product.
7. Extract as many valid product images as the page provides for that same product.
8. If the page has at least one clean white-background representative bottle image, keep it as image 1.
9. If the page does not have a clean white-background representative image, use imagegen to create one image that shows only this perfume bottle on a pure white background, visually accurate to the references. Then keep that generated image as image 1.
10. Save all gathered local files under:
   output/individual-image-refresh/${productSlug}/
11. Before uploading new images, delete the current single Shopify image for this product.
12. Upload the new local files using:
   node scripts/refresh_individual_product_media.mjs --title ${JSON.stringify(productTitle)} --exact <ordered image paths>
13. Verify the final Shopify product has the expected image count and READY media.
14. Close the dedicated browser tab for this product when the work is complete.

Notes:
- Do not touch any other product.
- Never run shopify auth, shopify store auth, logout, login, or any auth-reset flow. Shopify auth is already done.
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
- verification result`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const response = runShopifyQuery(QUERY_PRODUCTS);
  const titles = response.products.edges
    .map(edge => edge.node)
    .filter(node => node.media.nodes.length === 1)
    .map(node => node.title)
    .filter(title => title !== args.excludeTitle)
    .sort((a, b) => a.localeCompare(b));

  const prompts = titles.map(buildPrompt);
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, JSON.stringify(prompts, null, 2));
  process.stdout.write(JSON.stringify({
    output: args.output,
    promptCount: prompts.length,
    titles,
  }, null, 2) + "\n");
}

main();
