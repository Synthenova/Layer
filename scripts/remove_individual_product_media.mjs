#!/usr/bin/env node

import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
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
            ... on MediaImage {
              image {
                url
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

async function listProductFolders() {
  const entries = await readdir(PRODUCTS_ROOT, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b));
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

async function removeProductMedia(handle) {
  const product = await loadProductByHandle(handle);
  const mediaIds = product.media.nodes.map(node => node.id);
  const deletedCount = await deleteExistingMedia(product.id, mediaIds);
  return {
    handle,
    title: product.title,
    deletedCount,
    initialCount: mediaIds.length,
  };
}

function parseArgs(argv) {
  const args = {
    reportFile: path.join(ROOT, "perfect_product", "shopify-image-removal-report.json"),
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
      const result = await removeProductMedia(handle);
      results[currentIndex] = result;
      console.log(`${handle}: removed ${result.deletedCount} of ${result.initialCount}`);
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
