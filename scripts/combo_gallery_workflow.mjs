#!/usr/bin/env node

import { mkdir, readFile, writeFile, access, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { basename } from "node:path";
import { spawn } from "node:child_process";

const STORE = "vzixet-tr.myshopify.com";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_ROOT = path.join(ROOT, "output", "combo-galleries");
const REPORT_PATH = path.join(OUTPUT_ROOT, "combo-gallery-report.md");
const PHASE = process.argv[2];
const TARGET_ARGS = process.argv.slice(3);

const COMBOS = [
  {
    combo: "Cotton Candy Luxe",
    sourceA: "Baccarat Rouge 540 Eau de Parfum",
    sourceB: "Cloud Eau de Parfum",
  },
  {
    combo: "Dark Seduction",
    sourceA: "Black Opium Eau de Parfum",
    sourceB: "La Nuit de L'Homme Eau de Toilette",
  },
  {
    combo: "Professional Powerhouse",
    sourceA: "Aventus Eau de Parfum",
    sourceB: "Grey Vetiver Eau de Parfum",
  },
  {
    combo: "Sweet Smoke Symphony",
    sourceA: "Grand Soir Eau de Parfum",
    sourceB: "Replica Jazz Club Eau de Toilette",
  },
  {
    combo: "Fresh Confidence",
    sourceA: "Libre Eau de Parfum",
    sourceB: "Light Blue Eau de Toilette",
  },
  {
    combo: "Garden Party",
    sourceA: "Gucci Bloom Eau de Parfum",
    sourceB: "Daisy Eau de Toilette",
  },
  {
    combo: "Autumn Warmth",
    sourceA: "Layton Eau de Parfum",
    sourceB: "Replica By the Fireplace Eau de Toilette",
  },
  {
    combo: "Sauvage Night",
    sourceA: "Sauvage Eau de Parfum",
    sourceB: "La Nuit de L'Homme Eau de Toilette",
  },
  {
    combo: "Invictus Blue",
    sourceA: "Invictus Eau de Toilette",
    sourceB: "Bleu de Chanel Eau de Parfum",
  },
  {
    combo: "Libre Bloom",
    sourceA: "Libre Eau de Parfum",
    sourceB: "Gucci Bloom Eau de Parfum",
  },
  {
    combo: "Good Girl Fantasy",
    sourceA: "Good Girl Eau de Parfum",
    sourceB: "Fantasy Eau de Parfum",
  },
  {
    combo: "Daisy Cloud Dream",
    sourceA: "Daisy Eau de Toilette",
    sourceB: "Cloud Eau de Parfum",
  },
  {
    combo: "Leather & Smoke",
    sourceA: "Ombre Leather Eau de Parfum",
    sourceB: "Noir Extreme Eau de Parfum",
  },
  {
    combo: "The Million Dollar Eros",
    sourceA: "1 Million Eau de Toilette",
    sourceB: "Eros Eau de Parfum",
  },
  {
    combo: "Stronger Bad Boy",
    sourceA: "Bad Boy Eau de Toilette",
    sourceB: "Stronger With You Intensely Eau de Parfum",
  },
  {
    combo: "Noir Serenity",
    sourceA: "Dior Ambre Nuit Eau de Parfum",
    sourceB: "Molecule 01 Eau de Toilette",
  },
  {
    combo: "Sandalwood Glow",
    sourceA: "Le Labo Santal 33 Eau de Parfum",
    sourceB: "Glossier You Eau de Parfum",
  },
  {
    combo: "Winter Richness",
    sourceA: "Xerjoff Alexandria II",
    sourceB: "Black Phantom Eau de Parfum",
  },
  {
    combo: "Sweet & Musky",
    sourceA: "Club de Nuit Intense Woman",
    sourceB: "Khamrah Qahwa",
  },
  {
    combo: "Fruity Floral Heaven",
    sourceA: "Club De Nuit Woman Perfume Oil",
    sourceB: "Lattafa Mayar Eau de Parfum",
  },
];

const QUERY_FIND_PRODUCT = `
query FindProductByTitle($query: String!) {
  products(first: 5, query: $query) {
    nodes {
      id
      title
      handle
      media(first: 50, query: "media_type:IMAGE", sortKey: POSITION) {
        nodes {
          id
          alt
          mediaContentType
          status
          ... on MediaImage {
            image {
              url
              width
              height
            }
          }
        }
      }
    }
  }
}
`;

const QUERY_PRODUCT_BY_ID = `
query ProductById($id: ID!) {
  product(id: $id) {
    id
    title
    handle
    media(first: 100, query: "media_type:IMAGE", sortKey: POSITION) {
      nodes {
        id
        alt
        mediaContentType
        status
        ... on MediaImage {
          image {
            url
            width
            height
          }
        }
      }
    }
  }
}
`;

const MUTATION_DELETE_MEDIA = `
mutation DeleteProductMedia($productId: ID!, $mediaIds: [ID!]!) {
  productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
    deletedMediaIds
    mediaUserErrors {
      field
      message
      code
    }
  }
}
`;

const MUTATION_STAGED_UPLOADS = `
mutation CreateStagedUploads($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) {
    stagedTargets {
      url
      resourceUrl
      parameters {
        name
        value
      }
    }
    userErrors {
      field
      message
    }
  }
}
`;

const MUTATION_ATTACH_MEDIA = `
mutation AttachProductMedia($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
  productUpdate(product: $product, media: $media) {
    product {
      id
      title
      media(first: 100, query: "media_type:IMAGE", sortKey: POSITION) {
        nodes {
          id
          status
          mediaContentType
          ... on MediaImage {
            image {
              url
            }
          }
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}
`;

const MUTATION_REORDER_MEDIA = `
mutation ReorderProductMedia($id: ID!, $moves: [MoveInput!]!) {
  productReorderMedia(id: $id, moves: $moves) {
    job {
      id
    }
    mediaUserErrors {
      field
      message
      code
    }
  }
}
`;

const QUERY_JOB_STATUS = `
query JobStatus($id: ID!) {
  job(id: $id) {
    id
    done
  }
}
`;

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleQuery(title) {
  return `title:"${title.replace(/"/g, '\\"')}"`;
}

function comboDir(comboName) {
  return path.join(OUTPUT_ROOT, slugify(comboName));
}

function interleavePaths(pathsA, pathsB) {
  const result = [];
  const maxLen = Math.max(pathsA.length, pathsB.length);
  for (let index = 0; index < maxLen; index += 1) {
    if (index < pathsA.length) result.push(pathsA[index]);
    if (index < pathsB.length) result.push(pathsB[index]);
  }
  return result;
}

function targetCombos() {
  if (TARGET_ARGS.length === 0) return COMBOS;
  const requested = new Set(TARGET_ARGS.map(value => value.toLowerCase()));
  const selected = COMBOS.filter(combo => {
    const title = combo.combo.toLowerCase();
    const slug = slugify(combo.combo);
    return requested.has(title) || requested.has(slug);
  });
  if (selected.length !== TARGET_ARGS.length) {
    const matched = new Set(selected.flatMap(combo => [combo.combo.toLowerCase(), slugify(combo.combo)]));
    const missing = TARGET_ARGS.filter(value => !matched.has(value.toLowerCase()));
    throw new Error(`Unknown combo targets: ${missing.join(", ")}`);
  }
  return selected;
}

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", code => {
      if (code !== 0) {
        reject(new Error(`${command} exited ${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function shopifyExecute({ query, variables = {}, allowMutations = false }) {
  const args = [
    "store",
    "execute",
    "--store",
    STORE,
    "--json",
    "--query",
    query,
    "--variables",
    JSON.stringify(variables),
  ];
  if (allowMutations) args.push("--allow-mutations");
  const { stdout } = await run("shopify", args);
  const cleaned = stdout
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
    .split("\n")
    .filter(line => !line.includes("Loading stored store auth") && !line.includes("Executing GraphQL operation"))
    .join("\n")
    .trim();
  return JSON.parse(cleaned);
}

async function findExactProduct(title) {
  const response = await shopifyExecute({
    query: QUERY_FIND_PRODUCT,
    variables: { query: titleQuery(title) },
  });
  const matches = response.products.nodes.filter(node => node.title === title);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one product for "${title}", found ${matches.length}`);
  }
  return matches[0];
}

async function readProductById(id) {
  const response = await shopifyExecute({
    query: QUERY_PRODUCT_BY_ID,
    variables: { id },
  });
  if (!response.product) {
    throw new Error(`Product not found for id ${id}`);
  }
  return response.product;
}

async function downloadFile(url, filePath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(filePath, buffer);
}

function extFromUrl(url) {
  const clean = new URL(url).pathname;
  const ext = path.extname(clean);
  return ext || ".jpg";
}

function relativeToRoot(targetPath) {
  return path.relative(ROOT, targetPath);
}

async function prepareCombo(combo) {
  const dir = comboDir(combo.combo);
  const sourceADir = path.join(dir, "source-a");
  const sourceBDir = path.join(dir, "source-b");
  await ensureDir(sourceADir);
  await ensureDir(sourceBDir);

  const [comboProduct, sourceAProduct, sourceBProduct] = await Promise.all([
    findExactProduct(combo.combo),
    findExactProduct(combo.sourceA),
    findExactProduct(combo.sourceB),
  ]);

  const downloadProductMedia = async (product, targetDir) => {
    const images = product.media.nodes.filter(node => node.image?.url);
    if (images.length === 0) {
      throw new Error(`No image media found for "${product.title}"`);
    }
    const downloaded = [];
    for (let index = 0; index < images.length; index += 1) {
      const node = images[index];
      const ext = extFromUrl(node.image.url);
      const filename = `${String(index + 1).padStart(2, "0")}${ext}`;
      const destination = path.join(targetDir, filename);
      await downloadFile(node.image.url, destination);
      downloaded.push({
        mediaId: node.id,
        url: node.image.url,
        localPath: destination,
        filename,
      });
    }
    return downloaded;
  };

  const [sourceAImages, sourceBImages] = await Promise.all([
    downloadProductMedia(sourceAProduct, sourceADir),
    downloadProductMedia(sourceBProduct, sourceBDir),
  ]);

  const metadata = {
    combo,
    comboProduct,
    sourceAProduct,
    sourceBProduct,
    sourceAImages,
    sourceBImages,
    heroPrompt:
      "Create a clean ecommerce product photo on a pure white background. Show both uploaded perfume bottles together in one frame, upright, fully visible, and visually accurate to their real packaging. Keep the composition minimal and premium, like a catalog listing image. Do not add text, props, dramatic shadows, decorative elements, flowers, smoke, splashes, or background color. Preserve the bottle shapes, cap details, label styling, and brand appearance from the reference images. Output a single realistic studio product image with both perfumes side by side.",
    heroImagePath: path.join(dir, "hero-generated.png"),
    report: {
      uploadResult: "pending",
      verificationResult: "pending",
    },
  };

  await writeFile(path.join(dir, "metadata.json"), JSON.stringify(metadata, null, 2));
  return metadata;
}

async function mimeTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

async function stageAndUploadFile(filePath) {
  const stats = await stat(filePath);
  const filename = basename(filePath);
  const mimeType = await mimeTypeFor(filePath);
  const staged = await shopifyExecute({
    query: MUTATION_STAGED_UPLOADS,
    variables: {
      input: [
        {
          filename,
          mimeType,
          httpMethod: "POST",
          resource: "PRODUCT_IMAGE",
        },
      ],
    },
    allowMutations: true,
  });

  if (staged.stagedUploadsCreate.userErrors.length > 0) {
    throw new Error(`stagedUploadsCreate failed for ${filename}: ${JSON.stringify(staged.stagedUploadsCreate.userErrors)}`);
  }

  const target = staged.stagedUploadsCreate.stagedTargets[0];
  const form = new FormData();
  for (const parameter of target.parameters) {
    form.append(parameter.name, parameter.value);
  }
  form.append("file", new Blob([await readFile(filePath)], { type: mimeType }), filename);

  const response = await fetch(target.url, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    throw new Error(`Raw file upload failed for ${filename}: ${response.status} ${await response.text()}`);
  }

  return {
    originalSource: target.resourceUrl,
    alt: path.parse(filename).name,
    mediaContentType: "IMAGE",
    filePath,
    size: stats.size,
  };
}

async function deleteExistingComboMedia(product) {
  const mediaIds = product.media.nodes.map(node => node.id);
  if (mediaIds.length === 0) return [];
  const response = await shopifyExecute({
    query: MUTATION_DELETE_MEDIA,
    variables: {
      productId: product.id,
      mediaIds,
    },
    allowMutations: true,
  });
  const payload = response.productDeleteMedia;
  if (payload.mediaUserErrors.length > 0) {
    throw new Error(`productDeleteMedia failed: ${JSON.stringify(payload.mediaUserErrors)}`);
  }
  return payload.deletedMediaIds;
}

async function waitForMediaReady(productId, expectedCount) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const product = await readProductById(productId);
    const media = product.media.nodes;
    if (
      media.length >= expectedCount &&
      media.every(item => item.status === "READY" || item.status === "UPLOADED")
    ) {
      return product;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error(`Timed out waiting for media on ${productId}`);
}

async function waitForJob(jobId) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await shopifyExecute({
      query: QUERY_JOB_STATUS,
      variables: { id: jobId },
    });
    if (result.job?.done) return;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error(`Timed out waiting for job ${jobId}`);
}

async function uploadCombo(combo) {
  const dir = comboDir(combo.combo);
  const metadataPath = path.join(dir, "metadata.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));

  await access(metadata.heroImagePath, fsConstants.R_OK);

  const latestCombo = await findExactProduct(combo.combo);
  const deletedMediaIds = await deleteExistingComboMedia(latestCombo);

  const desiredFilePaths = [
    metadata.heroImagePath,
    ...interleavePaths(
      metadata.sourceAImages.map(item => item.localPath),
      metadata.sourceBImages.map(item => item.localPath),
    ),
  ];

  const stagedMedia = [];
  for (const filePath of desiredFilePaths) {
    stagedMedia.push(await stageAndUploadFile(filePath));
  }

  const attach = await shopifyExecute({
    query: MUTATION_ATTACH_MEDIA,
    variables: {
      product: { id: latestCombo.id },
      media: stagedMedia.map(item => ({
        originalSource: item.originalSource,
        alt: path.parse(item.filePath).name,
        mediaContentType: "IMAGE",
      })),
    },
    allowMutations: true,
  });

  if (attach.productUpdate.userErrors.length > 0) {
    throw new Error(`productUpdate failed: ${JSON.stringify(attach.productUpdate.userErrors)}`);
  }

  const readyProduct = await waitForMediaReady(latestCombo.id, desiredFilePaths.length);
  const moves = readyProduct.media.nodes.map((node, index) => ({
    id: node.id,
    newPosition: String(index),
  }));

  const reorder = await shopifyExecute({
    query: MUTATION_REORDER_MEDIA,
    variables: {
      id: latestCombo.id,
      moves,
    },
    allowMutations: true,
  });
  if (reorder.productReorderMedia.mediaUserErrors.length > 0) {
    throw new Error(`productReorderMedia failed: ${JSON.stringify(reorder.productReorderMedia.mediaUserErrors)}`);
  }

  await waitForJob(reorder.productReorderMedia.job.id);

  const verified = await findExactProduct(combo.combo);
  const finalUrls = verified.media.nodes.map(node => node.image?.url).filter(Boolean);
  const verificationOk = finalUrls.length === desiredFilePaths.length;

  metadata.report = {
    uploadResult: `uploaded ${desiredFilePaths.length} images; deleted ${deletedMediaIds.length} previous images`,
    verificationResult: verificationOk
      ? `verified ${finalUrls.length} images in expected gallery length`
      : `unexpected final media count ${finalUrls.length}; expected ${desiredFilePaths.length}`,
  };
  metadata.finalMedia = verified.media.nodes;
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  return metadata;
}

async function writeReport() {
  const lines = ["# Combo Gallery Report", ""];
  for (const combo of targetCombos()) {
    const dir = comboDir(combo.combo);
    const metadata = JSON.parse(await readFile(path.join(dir, "metadata.json"), "utf8"));
    lines.push(`## ${combo.combo}`);
    lines.push(`- combo name: ${combo.combo}`);
    lines.push(`- local folder path: ${dir}`);
    lines.push(`- generated hero image path: ${metadata.heroImagePath}`);
    lines.push(`- upload result: ${metadata.report.uploadResult}`);
    lines.push(`- verification result: ${metadata.report.verificationResult}`);
    lines.push("");
  }
  await ensureDir(OUTPUT_ROOT);
  await writeFile(REPORT_PATH, `${lines.join("\n")}\n`);
}

async function main() {
  await ensureDir(OUTPUT_ROOT);
  const combos = targetCombos();
  if (PHASE === "prepare") {
    for (const combo of combos) {
      await prepareCombo(combo);
    }
    await writeReport();
    return;
  }
  if (PHASE === "upload") {
    for (const combo of combos) {
      await uploadCombo(combo);
    }
    await writeReport();
    return;
  }
  throw new Error('Usage: node scripts/combo_gallery_workflow.mjs <prepare|upload>');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
