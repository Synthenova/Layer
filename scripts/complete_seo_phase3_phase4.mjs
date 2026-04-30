#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const STORE = "vzixet-tr.myshopify.com";
const ROOT = "/Users/nirmal/Desktop/Layer";
const APPLY = process.argv.includes("--apply");
const MARKER_START = "<!-- layer-internal-links:start -->";
const MARKER_END = "<!-- layer-internal-links:end -->";

const COMBO_META = {
  "Cotton Candy Luxe": ["Baccarat Rouge 540 Eau de Parfum", "Cloud Eau de Parfum"],
  "Dark Seduction": ["Black Opium Eau de Parfum", "La Nuit de L'Homme Eau de Toilette"],
  "Date Night Power": ["Bleu de Chanel Eau de Parfum", "Tobacco Vanille Eau de Parfum"],
  "Professional Powerhouse": ["Aventus Eau de Parfum", "Grey Vetiver Eau de Parfum"],
  "Romantic Evening": ["Delina Eau de Parfum", "Baccarat Rouge 540 Eau de Parfum"],
  "Vanilla Sky": ["Vanilla | 28", "Tobacco Vanille Eau de Parfum"],
  "Coffee & Cream": ["Khamrah Qahwa", "Black Opium Le Parfum"],
  "Sweet Smoke Symphony": ["Grand Soir Eau de Parfum", "Replica Jazz Club Eau de Toilette"],
  "Cozy Fireplace": ["Replica By the Fireplace Eau de Toilette", "Tobacco Vanille Eau de Parfum"],
  "Dark & Delicious": ["Oud Wood Eau de Parfum", "Black Phantom Eau de Parfum"],
  "Citrus Veil": ["Jo Malone Wood Sage & Sea Salt Cologne", "Le Labo Bergamote 22 Eau de Parfum"],
  "Summer Vibes": ["Acqua di Gio Eau de Parfum", "Oud Wood Eau de Parfum"],
  "Summer Citrus Kick": [
    "Acqua di Parma Blu Mediterraneo - Fico di Amalfi Eau de Toilette",
    "Creed Virgin Island Water Eau de Parfum",
  ],
  "Fresh Confidence": ["Libre Eau de Parfum", "Light Blue Eau de Toilette"],
  "Nautical Fresh": ["Green Irish Tweed Eau de Parfum", "Xerjoff Naxos Eau de Parfum"],
  "Effortless Elegance": [
    "Jo Malone Wood Sage & Sea Salt Cologne",
    "Delina La Rosée Eau de Parfum",
  ],
  "Floral Bomb Supreme": [
    "Prada Paradoxe Eau de Parfum",
    "Gucci Flora Gorgeous Gardenia Eau de Parfum",
  ],
  "Garden Party": ["Gucci Bloom Eau de Parfum", "Daisy Eau de Toilette"],
  "Noir Serenity": ["Dior Ambre Nuit Eau de Parfum", "Molecule 01 Eau de Toilette"],
  "Sandalwood Glow": ["Le Labo Santal 33 Eau de Parfum", "Glossier You Eau de Parfum"],
  "Autumn Warmth": ["Layton Eau de Parfum", "Replica By the Fireplace Eau de Toilette"],
  "Winter Richness": ["Xerjoff Alexandria II", "Black Phantom Eau de Parfum"],
  "Leather & Smoke": ["Ombre Leather Eau de Parfum", "Noir Extreme Eau de Parfum"],
  "Sweet & Musky": ["Club de Nuit Intense Woman", "Khamrah Qahwa"],
  "Fruity Floral Heaven": ["Club De Nuit Woman Perfume Oil", "Lattafa Mayar Eau de Parfum"],
  "The Million Dollar Eros": ["1 Million Eau de Toilette", "Eros Eau de Parfum"],
  "Stronger Bad Boy": ["Bad Boy Eau de Toilette", "Stronger With You Intensely Eau de Parfum"],
  "Sauvage Night": ["Sauvage Eau de Parfum", "La Nuit de L'Homme Eau de Toilette"],
  "Invictus Blue": ["Invictus Eau de Toilette", "Bleu de Chanel Eau de Parfum"],
  "Libre Bloom": ["Libre Eau de Parfum", "Gucci Bloom Eau de Parfum"],
  "Good Girl Fantasy": ["Good Girl Eau de Parfum", "Fantasy Eau de Parfum"],
  "Daisy Cloud Dream": ["Daisy Eau de Toilette", "Cloud Eau de Parfum"],
  "Flowerbomb La Vie": ["Flowerbomb Eau de Parfum", "La Vie Est Belle Eau de Parfum"],
};

const COLLECTION_LINKS = {
  "All Fragrance Kits": [
    ["Shop all individual fragrances", "/collections/fragrances"],
    ["Browse women's fragrances", "/collections/for-her"],
    ["Browse men's fragrances", "/collections/for-him"],
  ],
  "All Fragrances (Default)": [
    ["Shop fragrance decants", "/collections/fragrances"],
    ["Shop layering kits", "/collections/all-fragrance-kits"],
    ["Browse women's fragrances", "/collections/for-her"],
    ["Browse men's fragrances", "/collections/for-him"],
  ],
  "Female Fragrance Kits": [
    ["Browse women's fragrances", "/collections/for-her"],
    ["Shop all fragrance kits", "/collections/all-fragrance-kits"],
    ["Shop fragrance decants", "/collections/fragrances"],
  ],
  "For her": [
    ["Shop female fragrance kits", "/collections/female-fragrance-kits"],
    ["Shop all fragrance kits", "/collections/all-fragrance-kits"],
    ["Browse all fragrances", "/collections/fragrances"],
  ],
  "For Him": [
    ["Shop male fragrance kits", "/collections/male-fragrance-kits"],
    ["Shop all fragrance kits", "/collections/all-fragrance-kits"],
    ["Browse all fragrances", "/collections/fragrances"],
  ],
  Fragrances: [
    ["Shop all fragrance kits", "/collections/all-fragrance-kits"],
    ["Browse women's fragrances", "/collections/for-her"],
    ["Browse men's fragrances", "/collections/for-him"],
  ],
  "Home page": [
    ["Shop fragrance decants", "/collections/fragrances"],
    ["Shop all layering kits", "/collections/all-fragrance-kits"],
    ["Browse women's fragrances", "/collections/for-her"],
  ],
  "Male Fragrance Kits": [
    ["Browse men's fragrances", "/collections/for-him"],
    ["Shop all fragrance kits", "/collections/all-fragrance-kits"],
    ["Shop fragrance decants", "/collections/fragrances"],
  ],
};

function runShopify(query, variables = {}, allowMutations = false) {
  const args = ["store", "execute", "--store", STORE];
  if (allowMutations) args.push("--allow-mutations");
  args.push("--query", query, "--variables", JSON.stringify(variables));
  const raw = execFileSync("shopify", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  const jsonStart = raw.indexOf("{");
  return JSON.parse(raw.slice(jsonStart));
}

function slugify(input) {
  return String(input)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function stripGeneratedBlock(html) {
  const source = String(html || "");
  const start = source.indexOf(MARKER_START);
  const end = source.indexOf(MARKER_END);
  if (start === -1 || end === -1 || end < start) return source;
  return `${source.slice(0, start).trim()} ${source.slice(end + MARKER_END.length).trim()}`.trim();
}

function appendGeneratedBlock(html, block) {
  const cleaned = stripGeneratedBlock(html);
  return `${cleaned}${cleaned ? "\n" : ""}${MARKER_START}${block}${MARKER_END}`;
}

function buildLinkList(items) {
  return `<ul>${items
    .map(([label, href]) => `<li><a href="${href}">${label}</a></li>`)
    .join("")}</ul>`;
}

function fetchCatalog() {
  const query = `
    query Catalog($productCount: Int!, $collectionCount: Int!) {
      products(first: $productCount, sortKey: TITLE) {
        nodes {
          id
          title
          handle
          descriptionHtml
        }
      }
      collections(first: $collectionCount, sortKey: TITLE) {
        nodes {
          id
          title
          handle
          descriptionHtml
        }
      }
    }
  `;
  return runShopify(query, { productCount: 250, collectionCount: 250 }, false);
}

function buildPlan(data) {
  const products = data.products.nodes;
  const collections = data.collections.nodes;
  const byTitle = new Map(products.map((p) => [p.title, p]));

  const comboHandleTargets = new Map(
    Object.keys(COMBO_META).map((title) => [title, slugify(title)]),
  );

  const productToCombos = new Map();
  for (const [comboTitle, pair] of Object.entries(COMBO_META)) {
    for (const perfume of pair) {
      if (!productToCombos.has(perfume)) productToCombos.set(perfume, []);
      productToCombos.get(perfume).push(comboTitle);
    }
  }

  const comboUpdates = [];
  const individualLinkUpdates = [];

  for (const product of products) {
    if (COMBO_META[product.title]) {
      const pair = COMBO_META[product.title];
      const linkItems = pair.map((perfume) => {
        const linkedProduct = byTitle.get(perfume);
        if (!linkedProduct) throw new Error(`Missing source perfume product: ${perfume}`);
        return [perfume, `/products/${linkedProduct.handle}`];
      });
      const relatedBlock = [
        `<h4>Shop the Individual Fragrances</h4>`,
        `<p>Each kit is built from two individual perfumes that can also be sampled on their own.</p>`,
        buildLinkList(linkItems),
      ].join("");
      comboUpdates.push({
        id: product.id,
        title: product.title,
        currentHandle: product.handle,
        targetHandle: comboHandleTargets.get(product.title),
        descriptionHtml: appendGeneratedBlock(product.descriptionHtml, relatedBlock),
      });
      continue;
    }

    const combos = productToCombos.get(product.title) || [];
    if (!combos.length) continue;
    const comboLinks = combos
      .sort()
      .map((comboTitle) => [comboTitle, `/products/${comboHandleTargets.get(comboTitle)}`]);
    const block = [
      `<h4>Featured in Layering Kits</h4>`,
      `<p>This fragrance is used in curated Layer combo products for shoppers who want a ready-made pairing.</p>`,
      buildLinkList(comboLinks),
    ].join("");
    individualLinkUpdates.push({
      id: product.id,
      title: product.title,
      descriptionHtml: appendGeneratedBlock(product.descriptionHtml, block),
    });
  }

  const collectionUpdates = collections.map((collection) => {
    const links = COLLECTION_LINKS[collection.title];
    if (!links) throw new Error(`Missing collection link map for ${collection.title}`);
    const block = [
      `<h4>Explore Related Collections</h4>`,
      `<p>Use these collection shortcuts to move between standalone decants, layering kits, and gender-led discovery pages.</p>`,
      buildLinkList(links),
    ].join("");
    return {
      id: collection.id,
      title: collection.title,
      descriptionHtml: appendGeneratedBlock(collection.descriptionHtml, block),
    };
  });

  return { comboUpdates, individualLinkUpdates, collectionUpdates };
}

function updateProduct(product) {
  const mutation = `
    mutation UpdateProductPhase34($product: ProductUpdateInput!) {
      productUpdate(product: $product) {
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
  `;
  const payload = runShopify(mutation, { product }, true).productUpdate;
  if (payload.userErrors.length) {
    throw new Error(`${product.title || product.id}: ${JSON.stringify(payload.userErrors)}`);
  }
}

function updateCollection(collection) {
  const mutation = `
    mutation UpdateCollectionPhase34($input: CollectionInput!) {
      collectionUpdate(input: $input) {
        collection {
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
  `;
  const payload = runShopify(mutation, { input: collection }, true).collectionUpdate;
  if (payload.userErrors.length) {
    throw new Error(`${collection.title || collection.id}: ${JSON.stringify(payload.userErrors)}`);
  }
}

function main() {
  const data = fetchCatalog();
  const plan = buildPlan(data);
  const reportPath = path.join(ROOT, "tmp/seo_phase3_phase4_plan.json");
  fs.writeFileSync(reportPath, JSON.stringify(plan, null, 2));

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        comboHandleUpdates: plan.comboUpdates.filter((p) => p.currentHandle !== p.targetHandle).length,
        comboInternalLinkUpdates: plan.comboUpdates.length,
        individualInternalLinkUpdates: plan.individualLinkUpdates.length,
        collectionInternalLinkUpdates: plan.collectionUpdates.length,
        reportPath,
      },
      null,
      2,
    ),
  );

  if (!APPLY) return;

  for (const combo of plan.comboUpdates) {
    updateProduct({
      id: combo.id,
      handle: combo.targetHandle,
      redirectNewHandle: true,
      descriptionHtml: combo.descriptionHtml,
    });
    console.log(`updated combo: ${combo.title} -> ${combo.targetHandle}`);
  }

  for (const product of plan.individualLinkUpdates) {
    updateProduct({
      id: product.id,
      descriptionHtml: product.descriptionHtml,
    });
    console.log(`updated product links: ${product.title}`);
  }

  for (const collection of plan.collectionUpdates) {
    updateCollection({
      id: collection.id,
      descriptionHtml: collection.descriptionHtml,
    });
    console.log(`updated collection links: ${collection.title}`);
  }
}

main();
