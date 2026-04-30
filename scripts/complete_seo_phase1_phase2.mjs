#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const STORE = "vzixet-tr.myshopify.com";
const ROOT = "/Users/nirmal/Desktop/Layer";
const SEED_PATH = path.join(ROOT, "tmp/seo_seed.json");
const APPLY = process.argv.includes("--apply");

const COMBO_META = {
  "Cotton Candy Luxe": {
    perfumes: "Baccarat Rouge 540 Eau de Parfum + Cloud Eau de Parfum",
    source: "TikTok viral layering, Marie Claire, and Who What Wear",
    vibe:
      "Cotton-candy amber warmth meets sweet coconut praline for a playful but expensive-smelling finish.",
  },
  "Dark Seduction": {
    perfumes: "Black Opium Eau de Parfum + La Nuit de L'Homme Eau de Toilette",
    source: "ScentWise same-house layering recommendation",
    vibe:
      "Coffee-vanilla richness meets cardamom and cedar for an intoxicating unisex date-night blend.",
  },
  "Date Night Power": {
    perfumes: "Bleu de Chanel Eau de Parfum + Tobacco Vanille Eau de Parfum",
    source: "ScentWise and multiple Reddit layering threads",
    vibe:
      "Fresh woods and mint are warmed by sweet tobacco for a polished, seductive evening profile.",
  },
  "Professional Powerhouse": {
    perfumes: "Aventus Eau de Parfum + Grey Vetiver Eau de Parfum",
    source: "FragranceLord expert curation",
    vibe:
      "Pineapple-smoke confidence meets crisp vetiver elegance for boardroom-ready authority.",
  },
  "Romantic Evening": {
    perfumes: "Delina Eau de Parfum + Baccarat Rouge 540 Eau de Parfum",
    source: "FragranceLord expert curation",
    vibe:
      "Fruity floral rose meets airy amber-vanilla warmth for a luxurious feminine layer.",
  },
  "Vanilla Sky": {
    perfumes: "Vanilla | 28 + Tobacco Vanille Eau de Parfum",
    source: "Elyon Dubai and Lemon8 layering posts",
    vibe:
      "Cozy golden vanilla, tobacco, and tonka create a plush gourmand cloud with real depth.",
  },
  "Coffee & Cream": {
    perfumes: "Khamrah Qahwa + Black Opium Le Parfum",
    source: "Nykylicious testing and Reddit layering community",
    vibe:
      "Coffee, vanilla, caramel, and chocolate stack into an amplified gourmand signature.",
  },
  "Sweet Smoke Symphony": {
    perfumes: "Grand Soir Eau de Parfum + Replica Jazz Club Eau de Toilette",
    source: "Elyon Dubai expert curation",
    vibe:
      "Refined amber deepens rum-soaked tobacco for a warm, bohemian, dressed-up trail.",
  },
  "Cozy Fireplace": {
    perfumes: "Replica By the Fireplace Eau de Toilette + Tobacco Vanille Eau de Parfum",
    source: "FragranceLord seasonal guide",
    vibe:
      "Smoky chestnut and vanilla wrap around sweet tobacco for pure winter comfort.",
  },
  "Dark & Delicious": {
    perfumes: "Oud Wood Eau de Parfum + Black Phantom Eau de Parfum",
    source: "FragranceLord expert curation",
    vibe:
      "Smooth woody oud is deepened by dark chocolate, rum, and coffee for a rich nocturnal blend.",
  },
  "Citrus Veil": {
    perfumes: "Jo Malone Wood Sage & Sea Salt Cologne + Le Labo Bergamote 22 Eau de Parfum",
    source: "Elyon Dubai expert curation",
    vibe:
      "Coastal freshness and crisp citrus create a polished white-linen-in-ocean-air effect.",
  },
  "Summer Vibes": {
    perfumes: "Acqua di Gio Eau de Parfum + Oud Wood Eau de Parfum",
    source: "ScentWise verified layering recommendation",
    vibe:
      "Fresh aquatic lightness is grounded by warm oud for an easy summer-evening signature.",
  },
  "Summer Citrus Kick": {
    perfumes:
      "Acqua di Parma Blu Mediterraneo - Fico di Amalfi Eau de Toilette + Creed Virgin Island Water Eau de Parfum",
    source: "FragranceLord seasonal guide",
    vibe:
      "Creamy fig, lime, and coconut create a sunny, breezy vacation scent profile.",
  },
  "Fresh Confidence": {
    perfumes: "Libre Eau de Parfum + Light Blue Eau de Toilette",
    source: "xochristine scent stacking guide",
    vibe:
      "Lavender and orange blossom sharpen into a cedar-lit clean finish that feels bold and bright.",
  },
  "Nautical Fresh": {
    perfumes: "Green Irish Tweed Eau de Parfum + Xerjoff Naxos Eau de Parfum",
    source: "FragranceLord expert curation",
    vibe:
      "Fresh green refinement meets honeyed tobacco-vanilla warmth for a cult-favorite contrast.",
  },
  "Effortless Elegance": {
    perfumes:
      "Jo Malone Wood Sage & Sea Salt Cologne + Delina La Rosée Eau de Parfum",
    source: "FragranceLord expert curation",
    vibe:
      "Dewy rose and salty mineral air create a clean, graceful, sophisticated layer.",
  },
  "Floral Bomb Supreme": {
    perfumes:
      "Prada Paradoxe Eau de Parfum + Gucci Flora Gorgeous Gardenia Eau de Parfum",
    source: "Lemon8 viral layering combos",
    vibe:
      "Modern white florals bloom into a fuller, brighter, more statement-making floral cloud.",
  },
  "Garden Party": {
    perfumes: "Gucci Bloom Eau de Parfum + Daisy Eau de Toilette",
    source: "Community layering favorite",
    vibe:
      "Tuberose and jasmine meet fresh daisy brightness for garden-fresh floral perfection.",
  },
  "Noir Serenity": {
    perfumes: "Dior Ambre Nuit Eau de Parfum + Molecule 01 Eau de Toilette",
    source: "Elyon Dubai expert curation",
    vibe:
      "Amber and rose are lifted by sheer radiant woods for minimalist seduction.",
  },
  "Sandalwood Glow": {
    perfumes: "Le Labo Santal 33 Eau de Parfum + Glossier You Eau de Parfum",
    source: "Elyon Dubai and Reddit layering community",
    vibe:
      "Creamy sandalwood and musky transparency create an intimate skin-scent effect.",
  },
  "Autumn Warmth": {
    perfumes: "Layton Eau de Parfum + Replica By the Fireplace Eau de Toilette",
    source: "FragranceLord seasonal guide",
    vibe:
      "Apple, vanilla, and cardamom melt into smoky chestnut for a cozy autumn signature.",
  },
  "Winter Richness": {
    perfumes: "Xerjoff Alexandria II + Black Phantom Eau de Parfum",
    source: "FragranceLord seasonal guide",
    vibe:
      "Lavender, oud, amber, dark chocolate, and coffee combine into a dense memorable winter blend.",
  },
  "Leather & Smoke": {
    perfumes: "Ombre Leather Eau de Parfum + Noir Extreme Eau de Parfum",
    source: "Community layering favorite",
    vibe:
      "Leather and violet are softened by nutmeg and vanilla for a dark sophisticated finish.",
  },
  "Sweet & Musky": {
    perfumes: "Club de Nuit Intense Woman + Khamrah Qahwa",
    source: "Nykylicious personal testing",
    vibe:
      "Dark musk is sweetened by coffee-vanilla richness into a unique, wearable statement.",
  },
  "Fruity Floral Heaven": {
    perfumes: "Club De Nuit Woman Perfume Oil + Lattafa Mayar Eau de Parfum",
    source: "Nykylicious personal testing",
    vibe:
      "Musky florals elevate juicy fruity density into a compliment-magnet layering combo.",
  },
  "The Million Dollar Eros": {
    perfumes: "1 Million Eau de Toilette + Eros Eau de Parfum",
    source: "Reddit and Fragrantica community favorite",
    vibe:
      "Sweet spice and minty vanilla collide in a high-energy clubbing combo.",
  },
  "Stronger Bad Boy": {
    perfumes: "Bad Boy Eau de Toilette + Stronger With You Intensely Eau de Parfum",
    source: "Community layering favorite",
    vibe:
      "Cocoa woods meet cinnamon-vanilla warmth for a sweet masculine powerhouse.",
  },
  "Sauvage Night": {
    perfumes: "Sauvage Eau de Parfum + La Nuit de L'Homme Eau de Toilette",
    source: "Reddit community favorite",
    vibe:
      "Ambroxan power is rounded by cardamom warmth for a dependable date-night layer.",
  },
  "Invictus Blue": {
    perfumes: "Invictus Eau de Toilette + Bleu de Chanel Eau de Parfum",
    source: "TikTok and Reddit layering discussions",
    vibe:
      "Fresh sporty energy meets refined woods for a blue-fragrance hybrid with polish.",
  },
  "Libre Bloom": {
    perfumes: "Libre Eau de Parfum + Gucci Bloom Eau de Parfum",
    source: "Community layering favorite",
    vibe:
      "Lavender-orange blossom and tuberose-jasmine build a powerful feminine floral profile.",
  },
  "Good Girl Fantasy": {
    perfumes: "Good Girl Eau de Parfum + Fantasy Eau de Parfum",
    source: "TikTok and Lemon8 viral combos",
    vibe:
      "Almond, tuberose, cocoa, and white chocolate create a sweet seductive crowd-pleaser.",
  },
  "Daisy Cloud Dream": {
    perfumes: "Daisy Eau de Toilette + Cloud Eau de Parfum",
    source: "Pinterest scent stacking and Lemon8",
    vibe:
      "Fresh florals and coconut praline create a youthful dreamy signature with softness.",
  },
  "Flowerbomb La Vie": {
    perfumes: "Flowerbomb Eau de Parfum + La Vie Est Belle Eau de Parfum",
    source: "Community layering favorite",
    vibe:
      "Rose and jasmine explode into iris-praline warmth for a feminine luxury blend.",
  },
};

const COLLECTION_META = {
  "All Fragrance Kits": {
    seoTitle: "Fragrance Layering Kits | Layer",
    seoDescription:
      "Shop all Layer fragrance kits featuring curated perfume pairings built for layering, gifting, and scent discovery.",
    descriptionHtml:
      "<p>Explore every Layer fragrance kit in one place. This collection brings together our curated perfume pairings so shoppers can discover proven scent combinations without guessing what works together.</p><p>From sweet gourmand stacks to clean fresh pairings and darker evening blends, each kit is built around a specific mood, profile, and wearing experience. Use this collection to browse all branded combo products and find a ready-made layering set for gifting, sampling, or daily wear.</p>",
  },
  "All Fragrances (Default)": {
    seoTitle: "All Fragrances and Layering Kits | Layer",
    seoDescription:
      "Browse the full Layer fragrance catalog including individual perfume decants and curated layering kits.",
    descriptionHtml:
      "<p>This is the full Layer fragrance catalog, combining individual perfume offerings with branded layering kits. It is the broadest view of the store and the best starting point if you want to compare standalone scents with combo-based layering options.</p><p>Browse by scent family, mood, season, or layering intent. Whether you are sampling a single fragrance or shopping for a complete layering experience, this collection gives you a complete view of the current assortment.</p>",
  },
  "Female Fragrance Kits": {
    seoTitle: "Female Fragrance Layering Kits | Layer",
    seoDescription:
      "Shop female-leaning fragrance layering kits from Layer, including floral, gourmand, musky, and romantic perfume pairings.",
    descriptionHtml:
      "<p>Discover female-leaning fragrance kits designed around floral, fruity, gourmand, and musky scent profiles. These combinations are curated to feel polished, expressive, and easy to wear while still giving shoppers something more dimensional than a single perfume alone.</p><p>Use this collection to explore romantic evening blends, sweet viral pairings, and modern floral stacks that work especially well for gifting and discovery-size fragrance shopping.</p>",
  },
  "For her": {
    seoTitle: "Women's Fragrance Decants | Layer",
    seoDescription:
      "Shop women's fragrance decants at Layer, from floral and fruity favorites to gourmand, musky, and luxury scents.",
    descriptionHtml:
      "<p>Shop women’s fragrance decants across floral, fruity, gourmand, musky, and luxury scent families. This collection is built for shoppers who want to discover standout fragrances without committing to full bottles.</p><p>From viral icons to niche favorites, each product is chosen for wearability, popularity, and layering potential. Use this collection to compare scent profiles, sample trending perfumes, and build your own fragrance wardrobe.</p>",
  },
  "For Him": {
    seoTitle: "Men's Fragrance Decants | Layer",
    seoDescription:
      "Shop men's fragrance decants at Layer, including fresh, woody, spicy, blue, gourmand, and niche perfume favorites.",
    descriptionHtml:
      "<p>Shop men’s fragrance decants across fresh, woody, spicy, blue, gourmand, and niche scent profiles. This collection is designed for shoppers who want access to bestselling men’s fragrances in a flexible, sample-friendly format.</p><p>Whether you want a clean office scent, a date-night signature, or a high-impact niche fragrance, this collection helps you explore the strongest options in the Layer catalog without overcommitting on bottle size.</p>",
  },
  Fragrances: {
    seoTitle: "Fragrance Decants | Layer",
    seoDescription:
      "Browse individual fragrance decants at Layer, featuring bestselling designer perfumes, niche scents, and everyday favorites.",
    descriptionHtml:
      "<p>Browse individual fragrance decants only in this collection. It excludes combo kits and focuses entirely on standalone perfume products so shoppers can discover each scent on its own merits.</p><p>You will find bestselling designer fragrances, niche standouts, and layering-friendly staples across multiple scent families. This is the best collection for one-bottle discovery, signature-scent testing, and comparing fragrances before buying larger sizes elsewhere.</p>",
  },
  "Home page": {
    seoTitle: "Featured Fragrances | Layer",
    seoDescription:
      "Explore featured fragrances and bestsellers from Layer, including perfume decants and curated layering kits.",
    descriptionHtml:
      "<p>This featured collection supports the storefront homepage and highlights core Layer products. It includes bestselling fragrances, discovery-friendly perfume decants, and curated kits that represent the current direction of the catalog.</p><p>Use it as an at-a-glance entry point for top products, popular sampling picks, and fragrance combinations that define the Layer shopping experience.</p>",
  },
  "Male Fragrance Kits": {
    seoTitle: "Male Fragrance Layering Kits | Layer",
    seoDescription:
      "Shop male-leaning fragrance layering kits from Layer, including woody, spicy, fresh, smoky, and evening-focused pairings.",
    descriptionHtml:
      "<p>Browse male-leaning fragrance layering kits built around woody, spicy, fresh, smoky, and evening-focused scent directions. These pairings are designed for shoppers who want more depth and personality than a single fragrance often delivers by itself.</p><p>From office-ready blends to nightlife-heavy signatures, this collection showcases combo products with clear mood positioning and strong layering logic for easy selection.</p>",
  },
};

function runShopify(query, variables = {}, allowMutations = false) {
  const args = [
    "store",
    "execute",
    "--store",
    STORE,
    "--query",
    query,
    "--variables",
    JSON.stringify(variables),
  ];
  if (allowMutations) args.splice(4, 0, "--allow-mutations");
  const raw = execFileSync("shopify", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  const jsonStart = raw.indexOf("{");
  return JSON.parse(raw.slice(jsonStart));
}

function stripHtml(input) {
  return String(input || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function squeeze(input) {
  return String(input || "").replace(/\s+/g, " ").trim();
}

function truncate(input, max) {
  const text = squeeze(input);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function firstMeaningfulSentence(text) {
  const clean = stripHtml(text);
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences[0] || clean;
}

function buildIndividualSeo(product) {
  const title = truncate(`${product.title} Decant | Layer`, 70);
  const excerpt = firstMeaningfulSentence(product.descriptionHtml);
  const desc = truncate(
    `Shop ${product.title} decants at Layer. ${excerpt} Explore notes, character, and sample before buying a full bottle.`,
    160,
  );
  return { title, description: desc };
}

function buildComboSeo(title, meta) {
  return {
    title: truncate(`${title} Layering Kit | Layer`, 70),
    description: truncate(
      `${title} pairs ${meta.perfumes}. ${meta.vibe} Shop this fragrance layering kit at Layer.`,
      160,
    ),
  };
}

function buildComboDescription(title, meta) {
  const pair = meta.perfumes.split(/\s+\+\s+/);
  const bullets = pair
    .map((item) => `<li>${item}</li>`)
    .join("");
  return [
    `<h3>${title} Fragrance Layering Kit</h3>`,
    `<p><strong>${title}</strong> combines ${meta.perfumes} for a layered scent profile that feels more dimensional, intentional, and memorable than either fragrance alone. ${meta.vibe}</p>`,
    `<p>Inspired by ${meta.source}, this kit gives shoppers a ready-made pairing instead of forcing them to guess what to mix. Wear one fragrance as the base and the other as the topper to create contrast, depth, and a fuller dry down.</p>`,
    `<h4>Included Layering Pair</h4>`,
    `<ul>${bullets}</ul>`,
    `<h4>Scent Profile</h4>`,
    `<p>${meta.vibe}</p>`,
  ].join("");
}

function loadSeed() {
  return JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));
}

function ensureKnownCollection(title) {
  if (!COLLECTION_META[title]) {
    throw new Error(`Missing collection metadata for ${title}`);
  }
}

function buildPlan(data) {
  const productUpdates = data.products.nodes.map((product) => {
    const comboMeta = COMBO_META[product.title];
    const seo = comboMeta
      ? buildComboSeo(product.title, comboMeta)
      : buildIndividualSeo(product);
    const next = {
      id: product.id,
      title: product.title,
      seo,
    };
    if (comboMeta) {
      next.descriptionHtml = buildComboDescription(product.title, comboMeta);
    }
    return next;
  });

  const collectionUpdates = data.collections.nodes.map((collection) => {
    ensureKnownCollection(collection.title);
    const meta = COLLECTION_META[collection.title];
    return {
      id: collection.id,
      title: collection.title,
      seo: {
        title: meta.seoTitle,
        description: meta.seoDescription,
      },
      descriptionHtml: meta.descriptionHtml,
    };
  });

  return { productUpdates, collectionUpdates };
}

function updateProduct(product) {
  const mutation = `
    mutation UpdateProductSeoAndDescription($product: ProductUpdateInput!) {
      productUpdate(product: $product) {
        product {
          id
          title
          seo {
            title
            description
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  const response = runShopify(mutation, { product }, true);
  const payload = response.productUpdate;
  if (payload.userErrors.length) {
    throw new Error(`${product.title}: ${JSON.stringify(payload.userErrors)}`);
  }
}

function updateCollection(collection) {
  const mutation = `
    mutation UpdateCollectionSeoAndDescription($input: CollectionInput!) {
      collectionUpdate(input: $input) {
        collection {
          id
          title
          seo {
            title
            description
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  const response = runShopify(mutation, { input: collection }, true);
  const payload = response.collectionUpdate;
  if (payload.userErrors.length) {
    throw new Error(`${collection.title}: ${JSON.stringify(payload.userErrors)}`);
  }
}

function main() {
  const seed = loadSeed();
  const plan = buildPlan(seed);
  const reportPath = path.join(ROOT, "tmp/seo_phase1_phase2_plan.json");
  fs.writeFileSync(reportPath, JSON.stringify(plan, null, 2));

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        productUpdates: plan.productUpdates.length,
        comboDescriptionsUpdated: plan.productUpdates.filter((p) => p.descriptionHtml).length,
        collectionUpdates: plan.collectionUpdates.length,
        reportPath,
      },
      null,
      2,
    ),
  );

  if (!APPLY) return;

  for (const product of plan.productUpdates) {
    updateProduct(product);
    console.log(`updated product: ${product.title}`);
  }

  for (const collection of plan.collectionUpdates) {
    updateCollection(collection);
    console.log(`updated collection: ${collection.title}`);
  }
}

main();
