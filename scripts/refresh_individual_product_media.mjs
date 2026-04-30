#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import path, { basename } from "node:path";
import { spawn } from "node:child_process";

const STORE = "vzixet-tr.myshopify.com";
const ROOT = process.cwd();

const QUERY_PRODUCT_BY_TITLE = `
query ProductByTitle($query: String!) {
  products(first: 10, query: $query) {
    edges {
      node {
        id
        title
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

function parseArgs(argv) {
  const args = {
    title: null,
    exact: false,
    force: false,
    files: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--title") {
      args.title = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (value === "--exact") {
      args.exact = true;
      continue;
    }
    if (value === "--force") {
      args.force = true;
      continue;
    }
    args.files.push(value);
  }

  if (!args.title) {
    throw new Error("missing --title");
  }
  if (args.files.length === 0) {
    throw new Error("pass at least one image path");
  }
  return args;
}

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

async function loadProductByTitle(title, exact) {
  const response = await shopifyExecute({
    query: QUERY_PRODUCT_BY_TITLE,
    variables: { query: `title:\"${escapeQueryValue(title)}\"` },
  });
  const nodes = response.products.edges.map(edge => edge.node);
  if (exact) {
    const exactNodes = nodes.filter(node => node.title === title);
    if (exactNodes.length !== 1) {
      throw new Error(`expected exactly one exact product for "${title}", found ${exactNodes.length}`);
    }
    return exactNodes[0];
  }
  if (nodes.length !== 1) {
    throw new Error(`expected exactly one product for "${title}", found ${nodes.length}`);
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

async function waitForReadyCount(title, expectedCount) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const product = await loadProductByTitle(title, true);
    if (product.media.nodes.length === expectedCount && product.media.nodes.every(node => node.status === "READY")) {
      return product;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error(`timed out waiting for ${expectedCount} READY images on "${title}"`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  for (const filePath of args.files) {
    await stat(filePath);
  }

  const product = await loadProductByTitle(args.title, args.exact);
  const existingMedia = product.media.nodes;
  if (!args.force && existingMedia.length !== 1) {
    throw new Error(`"${product.title}" has ${existingMedia.length} existing images; expected exactly 1`);
  }

  const deletedCount = await deleteExistingMedia(product.id, existingMedia.map(node => node.id));
  const mediaInputs = [];
  for (const [index, filePath] of args.files.entries()) {
    mediaInputs.push(await stageAndUploadFile(filePath, `${product.title} ${index + 1}`));
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
    throw new Error(`productUpdate failed: ${JSON.stringify(attach.productUpdate.userErrors)}`);
  }

  const finalProduct = await waitForReadyCount(product.title, args.files.length);
  process.stdout.write(JSON.stringify({
    productId: product.id,
    title: product.title,
    deletedCount,
    uploadedCount: args.files.length,
    finalMedia: finalProduct.media.nodes,
  }, null, 2) + "\n");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
