#!/usr/bin/env node

import { readFile, stat, writeFile } from "node:fs/promises";
import path, { basename } from "node:path";
import { spawn } from "node:child_process";

const STORE = "vzixet-tr.myshopify.com";
const ROOT = process.cwd();
const targets = process.argv.slice(2);

const QUERY_PRODUCT_BY_ID = `
query ProductById($id: ID!) {
  product(id: $id) {
    id
    title
    media(first: 100, query: "media_type:IMAGE", sortKey: POSITION) {
      nodes {
        id
        status
        ... on MediaImage {
          image {
            url
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

function interleavePaths(pathsA, pathsB) {
  const result = [];
  const maxLen = Math.max(pathsA.length, pathsB.length);
  for (let index = 0; index < maxLen; index += 1) {
    if (index < pathsA.length) result.push(pathsA[index]);
    if (index < pathsB.length) result.push(pathsB[index]);
  }
  return result;
}

async function mimeTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

async function stageAndUploadFile(filePath) {
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
    throw new Error(`Raw file upload failed for ${filename}: ${response.status} ${await response.text()}`);
  }
  return {
    originalSource: target.resourceUrl,
    alt: path.parse(filename).name,
    mediaContentType: "IMAGE",
  };
}

async function readProductById(id) {
  const response = await shopifyExecute({ query: QUERY_PRODUCT_BY_ID, variables: { id } });
  if (!response.product) throw new Error(`Product not found for id ${id}`);
  return response.product;
}

async function deleteExistingMedia(productId) {
  const product = await readProductById(productId);
  const mediaIds = product.media.nodes.map(node => node.id);
  if (mediaIds.length === 0) return 0;
  const response = await shopifyExecute({
    query: MUTATION_DELETE_MEDIA,
    variables: { productId, mediaIds },
    allowMutations: true,
  });
  if (response.productDeleteMedia.mediaUserErrors.length > 0) {
    throw new Error(JSON.stringify(response.productDeleteMedia.mediaUserErrors));
  }
  return response.productDeleteMedia.deletedMediaIds.length;
}

async function waitForCount(productId, expectedCount) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const product = await readProductById(productId);
    if (product.media.nodes.length === expectedCount && product.media.nodes.every(node => node.status === "READY")) {
      return product;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error(`Timed out waiting for ${expectedCount} media on ${productId}`);
}

async function uploadCombo(metadataPath) {
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const desiredFilePaths = [
    metadata.heroImagePath,
    ...interleavePaths(
      metadata.sourceAImages.map(item => item.localPath),
      metadata.sourceBImages.map(item => item.localPath),
    ),
  ];

  for (const filePath of desiredFilePaths) {
    await stat(filePath);
  }

  const productId = metadata.comboProduct.id;
  const deletedCount = await deleteExistingMedia(productId);
  const media = [];
  for (const filePath of desiredFilePaths) {
    media.push(await stageAndUploadFile(filePath));
  }

  const attach = await shopifyExecute({
    query: MUTATION_ATTACH_MEDIA,
    variables: {
      product: { id: productId },
      media,
    },
    allowMutations: true,
  });
  if (attach.productUpdate.userErrors.length > 0) {
    throw new Error(`productUpdate failed: ${JSON.stringify(attach.productUpdate.userErrors)}`);
  }

  const finalProduct = await waitForCount(productId, desiredFilePaths.length);
  metadata.report = {
    uploadResult: `uploaded ${desiredFilePaths.length} images; deleted ${deletedCount} previous images`,
    verificationResult: `verified ${finalProduct.media.nodes.length} images in expected gallery length`,
  };
  metadata.finalMedia = finalProduct.media.nodes;
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`${metadata.combo.combo}: ok (${desiredFilePaths.length})`);
}

async function main() {
  if (targets.length === 0) {
    throw new Error("Pass one or more metadata.json paths");
  }
  for (const target of targets) {
    await uploadCombo(target);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
