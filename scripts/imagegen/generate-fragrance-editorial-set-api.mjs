#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { annotateFragranceNoteCard } from "./annotate-fragrance-note-cards.mjs";

const REPO_ROOT = process.cwd();
const DEFAULT_PRODUCTS_FILE = path.join(REPO_ROOT, "perfect_product/individual-products.jsonl");
const DEFAULT_PRODUCTS_DIR = path.join(REPO_ROOT, "perfect_product/products");
const DEFAULT_BACKGROUND = path.join(REPO_ROOT, "perfect_product/background.png");
const DEFAULT_LOG_DIR = path.join(REPO_ROOT, "perfect_product/logs");
const IMAGE_GEN = process.env.IMAGE_GEN || path.join(process.env.CODEX_HOME || path.join(process.env.HOME, ".codex"), "skills/.system/imagegen/scripts/image_gen.py");
const DEFAULT_CONCURRENCY = 1;

const OUTPUTS = [
  { key: "hero", turnNumber: 1, filename: "bottle-with-ingredients.png" },
  { key: "top", turnNumber: 2, filename: "top-notes.png" },
  { key: "heart", turnNumber: 3, filename: "heart-notes.png" },
  { key: "base", turnNumber: 4, filename: "base-notes.png" },
];

const NOTE_LABELS = {
  top: "TOP NOTES",
  heart: "HEART NOTES",
  base: "BASE NOTES",
};

function usage() {
  console.error(`Usage:
  node scripts/imagegen/generate-fragrance-editorial-set-api.mjs [--product <handle>] [--concurrency 1]

Options:
  --product <handle>        Run only one product handle.
  --concurrency <n>         Number of Image API jobs to run at once. Default: 1.
  --products-file <path>    JSONL product source. Default: perfect_product/individual-products.jsonl.
  --products-dir <path>     Product folders root. Default: perfect_product/products.
  --background <path>       Textured background image. Default: perfect_product/background.png.
  --output-dir-name <name>  Product output folder. Default: download-images.
  --copy-to-shopify         Also copy final PNGs into each product's shopify-images folder.
  --dry-run                 Print API payloads; does not call the API and does not require OPENAI_API_KEY.
  --force                   Pass --force to image_gen.py for existing output paths.
  --log-file <path>         Log file path. Default: perfect_product/logs/fragrance-editorial-api-<timestamp>.log`);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = {
    concurrency: String(DEFAULT_CONCURRENCY),
    "products-file": DEFAULT_PRODUCTS_FILE,
    "products-dir": DEFAULT_PRODUCTS_DIR,
    background: DEFAULT_BACKGROUND,
    "output-dir-name": "download-images",
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") usage();
    if (arg === "--copy-to-shopify" || arg === "--dry-run" || arg === "--force") {
      opts[arg.slice(2)] = true;
      continue;
    }
    if (!arg.startsWith("--")) usage();
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (!value) throw new Error(`Missing value for ${arg}`);
    opts[key] = value;
    i += 1;
  }
  opts.concurrency = Number(opts.concurrency);
  if (!Number.isInteger(opts.concurrency) || opts.concurrency < 1) throw new Error("--concurrency must be a positive integer");
  opts["products-file"] = path.resolve(opts["products-file"]);
  opts["products-dir"] = path.resolve(opts["products-dir"]);
  opts.background = path.resolve(opts.background);
  opts["log-file"] = opts["log-file"]
    ? path.resolve(opts["log-file"])
    : path.join(DEFAULT_LOG_DIR, `fragrance-editorial-api-${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
  return opts;
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function loadProducts(file) {
  return (await fs.readFile(file, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

class Logger {
  constructor(file) {
    this.file = file;
    this.started = Date.now();
  }

  async init() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.appendFile(this.file, `\n=== fragrance editorial api run ${new Date().toISOString()} ===\n`);
  }

  async write(event, payload = {}) {
    const line = JSON.stringify({ ts: new Date().toISOString(), elapsedSec: Number(((Date.now() - this.started) / 1000).toFixed(1)), event, ...payload });
    console.log(line);
    await fs.appendFile(this.file, `${line}\n`);
  }
}

function list(value) {
  return Array.isArray(value) && value.length ? value.join(", ") : "the visible fragrance notes described for this perfume";
}

function buildPrompt(product, output) {
  const title = product.title || product.handle;
  const notes = product.notes || {};
  if (output.key === "hero") {
    return `${title}

We are creating a 4-image fragrance editorial set for this perfume. Use the provided bottle-only image as the product reference, and use the provided textured white background image as the exact background style.

Overall visual direction:
Luxury editorial flat-lay fragrance photography.
Clean, premium, minimal, high-end composition.
Soft natural studio lighting.
Square 1:1 composition.
No text, no labels, no borders, no packaging unless explicitly requested.

Image 1 task:
Create the hero image for this perfume.

Requirements:
- Use the real ${title} bottle as the central hero object.
- Keep the bottle accurate to the reference: bottle color, emblem/details, cap shape, proportions, and front identity.
- Place it on the same textured white background style as the background reference.
- Surround the bottle with elegant ingredient elements representing the fragrance notes.
- Keep ingredient styling premium, restrained, balanced, and not cluttered.

Notes for ingredient inspiration:
Top notes: ${list(notes.top)}
Heart notes: ${list(notes.heart)}
Base notes: ${list(notes.base)}

Important:
- No text in the image.
- No extra unrelated props.
- No change to bottle identity.
- Keep generous negative space.
- Make it look like a luxury fragrance campaign flat-lay.
- Generate one square 1:1 image only.`;
  }

  const configs = {
    top: {
      number: 2,
      label: "TOP NOTES",
      notes: notes.top,
      mood: "fresh, bright, aromatic, premium, minimal, balanced, and clean",
    },
    heart: {
      number: 3,
      label: "HEART NOTES",
      notes: notes.heart,
      mood: "resinous, warm, mysterious, refined, premium, minimal, balanced, and clean",
    },
    base: {
      number: 4,
      label: "BASE NOTES",
      notes: notes.base,
      mood: "dark, woody, luxurious, refined, premium, minimal, balanced, and clean",
    },
  }[output.key];

  return `Create image ${configs.number} of the same 4-image fragrance editorial set for ${title}.

Use the provided textured white background image as the exact background style reference.
Square 1:1 composition.
Luxury editorial flat-lay.
Soft natural studio lighting.
No bottle.
No text.
No borders.
No unrelated props.

This image is for the ${configs.label} only:
{${list(configs.notes)}}

Requirements:
- Show only ingredients/material elements representing these notes.
- The composition should feel ${configs.mood}.
- Keep the same high-end visual language as the hero image.
- Generate one square 1:1 image only.`;
}

async function findBottle(productDir) {
  const candidates = [
    path.join(productDir, "shopify-images/bottle-only-rembg.png"),
    path.join(productDir, "generated-images/bottle-only-rembg.png"),
    path.join(productDir, "downloaded-images/bottle-only-rembg.png"),
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}

async function runImageGen(args, logger, context) {
  await logger.write("imagegen.command.start", { ...context, command: args.join(" ") });
  let stdout = "";
  let stderr = "";
  const child = spawn("python", [IMAGE_GEN, ...args], { cwd: REPO_ROOT, env: process.env });
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const code = await new Promise((resolve) => child.on("close", resolve));
  if (stdout.trim()) await logger.write("imagegen.command.stdout", { ...context, stdout: stdout.trim() });
  if (stderr.trim()) await logger.write("imagegen.command.stderr", { ...context, stderr: stderr.trim() });
  await logger.write("imagegen.command.done", { ...context, code });
  if (code !== 0) throw new Error(`image_gen.py failed with code ${code}`);
}

async function processProduct(product, opts, logger) {
  const handle = product.handle;
  const productDir = path.join(opts["products-dir"], handle);
  const outputDir = path.join(productDir, opts["output-dir-name"]);
  const shopifyDir = path.join(productDir, "shopify-images");
  const bottle = await findBottle(productDir);
  const allOutputs = OUTPUTS.map((output) => ({ ...output, path: path.join(outputDir, output.filename) }));
  const missing = [];

  for (const output of allOutputs) {
    if ((await exists(output.path)) && !opts.force) {
      await logger.write("turn.skip.exists", { handle, turnNumber: output.turnNumber, output: output.path });
    } else {
      missing.push(output);
    }
  }

  if (!missing.length) {
    await logger.write("product.skip.complete", { handle, title: product.title });
    return { handle, status: "skipped", missing: 0 };
  }
  if (!bottle && missing.some((output) => output.key === "hero")) throw new Error(`Missing bottle reference for ${handle}`);
  if (!(await exists(opts.background))) throw new Error(`Missing background reference: ${opts.background}`);

  await fs.mkdir(outputDir, { recursive: true });
  await logger.write("product.start", { handle, title: product.title, missing: missing.map((output) => output.filename) });

  for (const output of missing) {
    const prompt = buildPrompt(product, output);
    const promptFile = path.join(outputDir, `.prompt-turn-${output.turnNumber}.txt`);
    await fs.writeFile(promptFile, prompt);
    const imageArgs = output.key === "hero"
      ? ["--image", bottle, "--image", opts.background]
      : ["--image", opts.background];
    const args = [
      "edit",
      "--prompt-file", promptFile,
      "--size", "1024x1024",
      "--quality", "high",
      "--out", output.path,
      "--output-format", "png",
      ...imageArgs,
    ];
    if (opts["dry-run"]) args.push("--dry-run");
    if (opts.force) args.push("--force");
    await logger.write("turn.start", { handle, turnNumber: output.turnNumber, output: output.path, filename: output.filename });
    await runImageGen(args, logger, { handle, turnNumber: output.turnNumber, output: output.path });
    if (NOTE_LABELS[output.key] && !opts["dry-run"]) {
      const annotated = await annotateFragranceNoteCard(output.path, NOTE_LABELS[output.key], product.notes?.[output.key] ?? []);
      await logger.write("turn.notes_annotated", {
        handle,
        turnNumber: output.turnNumber,
        output: output.path,
        mode: annotated.mode,
        blockHeight: annotated.blockHeight,
      });
    }
    if (opts["copy-to-shopify"] && !opts["dry-run"]) {
      await fs.mkdir(shopifyDir, { recursive: true });
      await fs.copyFile(output.path, path.join(shopifyDir, output.filename));
      await logger.write("turn.copied_to_shopify", { handle, turnNumber: output.turnNumber, output: path.join(shopifyDir, output.filename) });
    }
  }

  await logger.write("product.done", { handle, title: product.title });
  return { handle, status: "done", generated: missing.length };
}

async function worker(name, queue, opts, logger, results) {
  while (queue.length) {
    const product = queue.shift();
    await logger.write("worker.product.claim", { worker: name, handle: product.handle });
    try {
      results.push(await processProduct(product, opts, logger));
    } catch (error) {
      await logger.write("product.failed", { worker: name, handle: product.handle, error: error.message });
      results.push({ handle: product.handle, status: "failed", error: error.message });
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  const logger = new Logger(opts["log-file"]);
  await logger.init();

  if (!(await exists(IMAGE_GEN))) throw new Error(`imagegen CLI not found: ${IMAGE_GEN}`);
  if (!opts["dry-run"] && !process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set. Set it or use --dry-run.");

  let products = await loadProducts(opts["products-file"]);
  if (opts.product) products = products.filter((product) => product.handle === opts.product);
  if (!products.length) throw new Error("No products matched");

  await logger.write("run.start", {
    products: products.length,
    concurrency: opts.concurrency,
    productsFile: opts["products-file"],
    productsDir: opts["products-dir"],
    background: opts.background,
    imageGen: IMAGE_GEN,
    dryRun: Boolean(opts["dry-run"]),
    logFile: opts["log-file"],
  });

  const queue = [...products];
  const results = [];
  const workers = Array.from({ length: Math.min(opts.concurrency, queue.length) }, (_, index) => worker(`worker-${index + 1}`, queue, opts, logger, results));
  await Promise.all(workers);

  const summary = {
    total: results.length,
    done: results.filter((result) => result.status === "done").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    failed: results.filter((result) => result.status === "failed").length,
    results,
    logFile: opts["log-file"],
  };
  await logger.write("run.done", summary);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
