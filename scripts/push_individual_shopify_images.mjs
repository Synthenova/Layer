#!/usr/bin/env node

import { readFile, stat, writeFile } from "node:fs/promises";
import path, { basename } from "node:path";
import { spawn } from "node:child_process";

const STORE = "vzixet-tr.myshopify.com";
const ROOT = process.cwd();
const PRODUCTS_ROOT = path.join(ROOT, "perfect_product", "products");

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

async function listProductFolders() {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(PRODUCTS_ROOT, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function escapeQueryValue(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
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

async function buildDesiredFileList(handle, productTitle) {
  const productDir = path.join(PRODUCTS_ROOT, handle);
  const shopifyImagesDir = path.join(productDir, "shopify-images");
  const annotatedImagesDir = path.join(productDir, "shopify-images-annotated");
  const desired = [];

  desired.push({
    filePath: path.join(shopifyImagesDir, "bottle-only-rembg.png"),
    alt: `${productTitle} bottle-only-rembg`,
  });

  const packagedPath = path.join(shopifyImagesDir, "packaged-bottle-rembg.png");
  try {
    await stat(packagedPath);
    desired.push({
      filePath: packagedPath,
      alt: `${productTitle} packaged-bottle-rembg`,
    });
  } catch {
    // Some products intentionally do not have packaged art.
  }

  const trailingFiles = [
    {
      filePath: path.join(shopifyImagesDir, "bottle-with-ingredients.png"),
      alt: `${productTitle} bottle-with-ingredients`,
    },
    {
      filePath: path.join(annotatedImagesDir, "top-notes.png"),
      alt: `${productTitle} top-notes`,
    },
    {
      filePath: path.join(annotatedImagesDir, "heart-notes.png"),
      alt: `${productTitle} heart-notes`,
    },
    {
      filePath: path.join(annotatedImagesDir, "base-notes.png"),
      alt: `${productTitle} base-notes`,
    },
  ];

  for (const { filePath, alt } of trailingFiles) {
    await stat(filePath);
    desired.push({ filePath, alt });
  }

  return desired;
}

async function uploadProduct(handle) {
  const product = await loadProductByHandle(handle);
  const existingMedia = product.media.nodes;
  const desiredFiles = await buildDesiredFileList(handle, product.title);
  const deletedCount = await deleteExistingMedia(product.id, existingMedia.map(node => node.id));
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
    throw new Error(`productUpdate failed for ${handle}: ${JSON.stringify(attach.productUpdate.userErrors)}`);
  }
  const finalProduct = await waitForReadyCount(handle, desiredFiles.length);
  return {
    handle,
    title: product.title,
    deletedCount,
    uploadedCount: desiredFiles.length,
    finalCount: finalProduct.media.nodes.length,
  };
}

function parseArgs(argv) {
  const args = {
    reportFile: path.join(ROOT, "perfect_product", "shopify-image-upload-report.json"),
    concurrency: 5,
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

async function runWithConcurrency(handles, concurrency) {
  const results = new Array(handles.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= handles.length) {
        return;
      }
      const handle = handles[currentIndex];
      const result = await uploadProduct(handle);
      results[currentIndex] = result;
      console.log(`${handle}: uploaded ${result.uploadedCount}, replaced ${result.deletedCount}`);
    }
  }

  const workerCount = Math.min(concurrency, handles.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const handles = args.handles.length > 0 ? args.handles : await listProductFolders();
  const results = await runWithConcurrency(handles, args.concurrency);
  await writeFile(
    args.reportFile,
    JSON.stringify({ store: STORE, products: results }, null, 2) + "\n",
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
