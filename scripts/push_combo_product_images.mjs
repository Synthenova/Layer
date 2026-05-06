#!/usr/bin/env node

import { readFile, stat, writeFile } from "node:fs/promises";
import path, { basename } from "node:path";
import { spawn } from "node:child_process";

const STORE = "vzixet-tr.myshopify.com";
const ROOT = process.cwd();
const COMBOS_FILE = path.join(ROOT, "perfect_product", "combo-products.jsonl");
const COMBO_IMAGES_ROOT = path.join(ROOT, "perfect_product", "combo-product-images");

const QUERY_PRODUCT_BY_HANDLE = `
query ProductByHandle($query: String!) {
  products(first: 10, query: $query) {
    edges {
      node {
        id
        title
        handle
        media(first: 100, query: "media_type:IMAGE", sortKey: POSITION) {
          nodes {
            id
            status
            alt
            ... on MediaImage {
              image {
                url
                altText
              }
            }
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
      handle
      media(first: 100, query: "media_type:IMAGE", sortKey: POSITION) {
        nodes {
          id
          status
          alt
          ... on MediaImage {
            image {
              url
              altText
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

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
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
  if (allowMutations) {
    args.push("--allow-mutations");
  }
  const { stdout } = await run("shopify", args);
  const cleaned = stdout
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
    .split("\n")
    .filter(line => !line.includes("Loading stored store auth") && !line.includes("Executing GraphQL operation"))
    .join("\n")
    .trim();
  return JSON.parse(cleaned);
}

function escapeQueryValue(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

async function loadCombos() {
  return (await readFile(COMBOS_FILE, "utf8"))
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

async function loadProductByHandle(handle) {
  const response = await shopifyExecute({
    query: QUERY_PRODUCT_BY_HANDLE,
    variables: { query: `handle:${escapeQueryValue(handle)}` },
  });
  const nodes = response.products.edges.map(edge => edge.node).filter(node => node.handle === handle);
  if (nodes.length !== 1) {
    throw new Error(`expected exactly one product for handle "${handle}", found ${nodes.length}`);
  }
  return nodes[0];
}

async function mimeTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".avif") return "image/avif";
  return "image/jpeg";
}

async function stageAndUploadFile(filePath, alt) {
  const filename = basename(filePath);
  const mimeType = await mimeTypeFor(filePath);
  const staged = await shopifyExecute({
    query: MUTATION_STAGED_UPLOADS,
    variables: {
      input: [{ filename, mimeType, httpMethod: "POST", resource: "PRODUCT_IMAGE" }],
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
  const response = await fetch(target.url, { method: "POST", body: form });
  if (!response.ok) {
    throw new Error(`raw file upload failed for ${filename}: ${response.status} ${await response.text()}`);
  }
  return {
    alt,
    originalSource: target.resourceUrl,
    mediaContentType: "IMAGE",
  };
}

async function deleteExistingMedia(productId, mediaIds) {
  if (mediaIds.length === 0) {
    return 0;
  }
  const response = await shopifyExecute({
    query: MUTATION_DELETE_MEDIA,
    variables: { productId, mediaIds },
    allowMutations: true,
  });
  if (response.productDeleteMedia.mediaUserErrors.length > 0) {
    throw new Error(`productDeleteMedia failed: ${JSON.stringify(response.productDeleteMedia.mediaUserErrors)}`);
  }
  return response.productDeleteMedia.deletedMediaIds.length;
}

async function waitForReadyCount(handle, expectedCount) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const product = await loadProductByHandle(handle);
    if (product.media.nodes.length === expectedCount && product.media.nodes.every(node => node.status === "READY")) {
      return product;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error(`timed out waiting for ${expectedCount} READY images on "${handle}"`);
}

async function buildDesiredFileList(combo) {
  const fr = combo.shop_individual_fragrances ?? [];
  if (fr.length < 2) {
    throw new Error(`combo "${combo.handle}" is missing source fragrance metadata`);
  }
  const comboDir = path.join(COMBOS_FILE.replace("combo-products.jsonl", "combo-product-images"), combo.handle);
  const desired = [
    {
      filePath: path.join(comboDir, "hero-generated.png"),
      alt: `${combo.title} hero-generated`,
    },
    {
      filePath: path.join(comboDir, `${fr[0].handle}-bottle-with-ingredients.png`),
      alt: `${combo.title} ${fr[0].handle} bottle-with-ingredients`,
    },
    {
      filePath: path.join(comboDir, `${fr[1].handle}-bottle-with-ingredients.png`),
      alt: `${combo.title} ${fr[1].handle} bottle-with-ingredients`,
    },
  ];

  for (const item of desired) {
    await stat(item.filePath);
  }
  return desired;
}

async function uploadCombo(combo) {
  const product = await loadProductByHandle(combo.handle);
  const desiredFiles = await buildDesiredFileList(combo);
  const deletedCount = await deleteExistingMedia(product.id, product.media.nodes.map(node => node.id));
  const mediaInputs = [];
  for (const item of desiredFiles) {
    mediaInputs.push(await stageAndUploadFile(item.filePath, item.alt));
  }
  const attach = await shopifyExecute({
    query: MUTATION_ATTACH_MEDIA,
    variables: {
      product: { id: product.id },
      media: mediaInputs,
    },
    allowMutations: true,
  });
  if (attach.productUpdate.userErrors.length > 0) {
    throw new Error(`productUpdate failed for ${combo.handle}: ${JSON.stringify(attach.productUpdate.userErrors)}`);
  }
  const finalProduct = await waitForReadyCount(combo.handle, desiredFiles.length);
  return {
    handle: combo.handle,
    title: combo.title,
    deletedCount,
    uploadedCount: desiredFiles.length,
    finalCount: finalProduct.media.nodes.length,
  };
}

function parseArgs(argv) {
  const args = {
    reportFile: path.join(ROOT, "perfect_product", "combo-image-upload-report.json"),
    concurrency: 4,
    handles: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--report-file") {
      args.reportFile = path.resolve(ROOT, argv[index + 1]);
      index += 1;
      continue;
    }
    if (argv[index] === "--concurrency") {
      args.concurrency = Number.parseInt(argv[index + 1] ?? "", 10);
      index += 1;
      continue;
    }
    args.handles.push(argv[index]);
  }

  if (!Number.isInteger(args.concurrency) || args.concurrency < 1) {
    throw new Error("expected --concurrency to be an integer >= 1");
  }

  return args;
}

async function partitionCombos(combos) {
  const ready = [];
  const skipped = [];
  for (const combo of combos) {
    try {
      await buildDesiredFileList(combo);
      ready.push(combo);
    } catch (error) {
      skipped.push({
        handle: combo.handle,
        title: combo.title,
        reason: error.message,
      });
    }
  }
  return { ready, skipped };
}

async function runWithConcurrency(combos, concurrency) {
  const results = new Array(combos.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= combos.length) {
        return;
      }
      const combo = combos[currentIndex];
      const result = await uploadCombo(combo);
      results[currentIndex] = result;
      console.log(`${combo.handle}: uploaded ${result.uploadedCount}, replaced ${result.deletedCount}`);
    }
  }

  const workerCount = Math.min(concurrency, combos.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let combos = await loadCombos();
  if (args.handles.length > 0) {
    const wanted = new Set(args.handles);
    combos = combos.filter(combo => wanted.has(combo.handle));
  }

  const { ready, skipped } = await partitionCombos(combos);
  console.log(`ready: ${ready.length}, skipped: ${skipped.length}`);
  for (const item of skipped) {
    console.log(`${item.handle}: skipped (${item.reason})`);
  }
  const results = await runWithConcurrency(ready, args.concurrency);
  await writeFile(
    args.reportFile,
    JSON.stringify({ store: STORE, uploaded: results, skipped }, null, 2) + "\n",
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
