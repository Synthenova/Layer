#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const REPO_ROOT = process.cwd();
const CHATGPT_SCRIPT = path.join(REPO_ROOT, "scripts/chatgpt/chatgpt.mjs");
const DEFAULT_PRODUCTS_FILE = path.join(REPO_ROOT, "perfect_product/individual-products.jsonl");
const DEFAULT_PRODUCTS_DIR = path.join(REPO_ROOT, "perfect_product/products");
const DEFAULT_BACKGROUND = path.join(REPO_ROOT, "perfect_product/background.png");
const DEFAULT_LOG_DIR = path.join(REPO_ROOT, "perfect_product/logs");
const DEFAULT_CONCURRENCY = 5;
const POLL_MS = 15000;
const TURN_TIMEOUT_MS = 30 * 60 * 1000;

const OUTPUTS = [
  { key: "hero", turnNumber: 1, filename: "bottle-with-ingredients.png" },
  { key: "top", turnNumber: 2, filename: "top-notes.png" },
  { key: "heart", turnNumber: 3, filename: "heart-notes.png" },
  { key: "base", turnNumber: 4, filename: "base-notes.png" },
];

function usage() {
  console.error(`Usage:
  node scripts/chatgpt/generate-fragrance-editorial-set.mjs [--product <handle>] [--concurrency 5]

Options:
  --product <handle>       Run only one product handle.
  --concurrency <n>        Number of products to run at once. Default: 5.
  --products-file <path>   JSONL product source. Default: perfect_product/individual-products.jsonl.
  --products-dir <path>    Product folders root. Default: perfect_product/products.
  --background <path>      Textured background image. Default: perfect_product/background.png.
  --log-file <path>        Log file path. Default: perfect_product/logs/fragrance-editorial-<timestamp>.log
  --allow-partial-resume   Continue missing turns in a new chat when earlier outputs already exist.`);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = {
    concurrency: String(DEFAULT_CONCURRENCY),
    "products-file": DEFAULT_PRODUCTS_FILE,
    "products-dir": DEFAULT_PRODUCTS_DIR,
    background: DEFAULT_BACKGROUND,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") usage();
    if (arg === "--allow-partial-resume") {
      opts["allow-partial-resume"] = true;
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
  if (!Number.isInteger(opts.concurrency) || opts.concurrency < 1) {
    throw new Error("--concurrency must be a positive integer");
  }
  opts["products-file"] = path.resolve(opts["products-file"]);
  opts["products-dir"] = path.resolve(opts["products-dir"]);
  opts.background = path.resolve(opts.background);
  opts["log-file"] = opts["log-file"]
    ? path.resolve(opts["log-file"])
    : path.join(DEFAULT_LOG_DIR, `fragrance-editorial-${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
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
  const lines = (await fs.readFile(file, "utf8")).split("\n").filter(Boolean);
  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSON on ${file}:${index + 1}: ${error.message}`);
    }
  });
}

class Logger {
  constructor(file) {
    this.file = file;
    this.started = Date.now();
  }

  async init() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.appendFile(this.file, `\n=== fragrance editorial run ${new Date().toISOString()} ===\n`);
  }

  async write(event, data = {}) {
    const elapsed = ((Date.now() - this.started) / 1000).toFixed(1);
    const line = JSON.stringify({ ts: new Date().toISOString(), elapsedSec: Number(elapsed), event, ...data });
    await fs.appendFile(this.file, `${line}\n`);
    process.stdout.write(`${line}\n`);
  }
}

async function runChatGpt(args, logger, context) {
  const logCommand = args[0] !== "status";
  if (logCommand) await logger.write("chatgpt.command.start", { ...context, command: args.join(" ") });
  const child = spawn(process.execPath, [CHATGPT_SCRIPT, ...args], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const code = await new Promise((resolve) => child.on("close", resolve));
  if (stderr.trim()) await logger.write("chatgpt.command.stderr", { ...context, stderr: stderr.trim() });
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`Could not parse chatgpt output for ${args[0]}: ${stdout}`);
  }
  if (logCommand || code !== 0 || parsed.error) {
    await logger.write("chatgpt.command.done", { ...context, code, result: parsed });
  }
  if (code !== 0 || parsed.error) {
    throw new Error(parsed.error || `chatgpt command failed with code ${code}`);
  }
  return parsed;
}

function cleanNote(note) {
  return String(note || "")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .replace(/[.]+$/g, "")
    .trim();
}

function notesFor(product, group) {
  const notes = product.notes?.[group] || [];
  return notes.map(cleanNote).filter(Boolean);
}

function formatList(items) {
  return items.length ? items.join(", ") : "the visible fragrance notes described for this perfume";
}

function buildPrompt(product, output) {
  const top = notesFor(product, "top");
  const heart = notesFor(product, "heart");
  const base = notesFor(product, "base");
  const title = product.title;

  if (output.key === "hero") {
    return `${title}

We are creating a 4-image fragrance editorial set for this perfume. Use the uploaded bottle-only image of the perfume as the product reference, and use the uploaded textured white background image as the exact background style for the whole set.

Overall visual direction:
Luxury editorial flat-lay fragrance photography.
Clean, premium, minimal, high-end composition.
Soft natural studio lighting.
Square 1:1 composition.
No text, no labels, no borders, no packaging unless explicitly requested.
Everything must feel refined, balanced, and aesthetically styled like a premium perfume campaign.

Image 1 task:
Create the hero image for this perfume.

Requirements:
- Use the real ${title} bottle as the central hero object.
- Keep the bottle accurate to the uploaded reference: bottle color, emblem/details, cap shape, proportions, and front identity.
- Place it on the same textured white background style as the uploaded background image.
- Surround the bottle with elegant ingredient elements representing the fragrance notes.
- The ingredient styling should feel premium, restrained, and balanced, not cluttered.
- Use only visually relevant ingredients from this perfume's note profile.

Notes for ingredient inspiration:
Top notes: ${formatList(top)}
Heart notes: ${formatList(heart)}
Base notes: ${formatList(base)}

Important:
- No text in the image.
- No extra unrelated props.
- No change to bottle identity.
- Keep generous negative space.
- Make it look like a luxury fragrance campaign flat-lay.

Generate image 1 only.`;
  }

  const configs = {
    top: {
      number: 2,
      label: "TOP NOTES",
      notes: top,
      mood: "fresh, bright, aromatic, premium, minimal, balanced, and clean",
      extra: `Make ${formatList(top)} clearly readable as the note story.`,
    },
    heart: {
      number: 3,
      label: "HEART NOTES",
      notes: heart,
      mood: "resinous, warm, mysterious, refined, premium, minimal, balanced, and clean",
      extra: "Use elegant incense/resin/floral/material styling where relevant without making it messy or smoky in an uncontrolled way.",
    },
    base: {
      number: 4,
      label: "BASE NOTES",
      notes: base,
      mood: "dark, woody, luxurious, refined, premium, minimal, balanced, and clean",
      extra: "Use elegant base-note material styling where relevant while keeping the composition restrained.",
    },
  };
  const config = configs[output.key];
  return `Create image ${config.number} of the same 4-image set for ${title}.

Use the uploaded textured white background image style.
Square 1:1 composition.
Luxury editorial flat-lay.
Soft natural studio lighting.
No bottle.
No text.
No borders.
No unrelated props.

This image is for the ${config.label} only:
{${formatList(config.notes)}}

Requirements:
- Show only ingredients/material elements representing these notes.
- The composition should feel ${config.mood}.
- ${config.extra}
- Match the same high-end visual language as the rest of the set.

Generate image ${config.number} only.`;
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

async function copyGeneratedImage(getTurnResult, outputPath) {
  if (!getTurnResult.images?.length) {
    throw new Error(`No generated image returned for ${outputPath}`);
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.copyFile(getTurnResult.images[0], outputPath);
}

async function waitForDone(chatId, logger, context) {
  const started = Date.now();
  while (Date.now() - started < TURN_TIMEOUT_MS) {
    const result = await runChatGpt(["status", "--chat-id", chatId], logger, context);
    if (result.status === "done") return result;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error(`Timed out waiting for ${context.handle} turn ${context.turnNumber}`);
}

async function getTurnWithImage(chatId, assistantTurnIndex, logger, context) {
  const started = Date.now();
  while (Date.now() - started < TURN_TIMEOUT_MS) {
    const result = await runChatGpt(["get-turn", "--chat-id", chatId, "--turn", String(assistantTurnIndex)], logger, context);
    if (result.images?.length) return result;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error(`Timed out waiting for generated image for ${context.handle} turn ${context.turnNumber}`);
}

async function processProduct(product, opts, logger) {
  const handle = product.handle;
  const productDir = path.join(opts["products-dir"], handle);
  const outputDir = path.join(productDir, "download-images");
  const bottle = await findBottle(productDir);
  const allOutputs = OUTPUTS.map((output) => ({ ...output, path: path.join(outputDir, output.filename) }));
  const missing = [];

  for (const output of allOutputs) {
    if (await exists(output.path)) {
      await logger.write("turn.skip.exists", { handle, turnNumber: output.turnNumber, output: output.path });
    } else {
      missing.push(output);
    }
  }

  if (!missing.length) {
    await logger.write("product.skip.complete", { handle, title: product.title });
    return { handle, status: "skipped", missing: 0 };
  }
  const existing = allOutputs.filter((output) => !missing.some((candidate) => candidate.key === output.key));
  if (existing.length && !opts["allow-partial-resume"]) {
    throw new Error(
      `Partial output set exists for ${handle}; refusing to continue in a new chat. Existing: ${existing.map((output) => output.filename).join(", ")}. Missing: ${missing.map((output) => output.filename).join(", ")}. Use --allow-partial-resume to override.`,
    );
  }
  if (!bottle && missing.some((output) => output.key === "hero")) {
    throw new Error(`Missing bottle reference for ${handle}`);
  }
  if (!(await exists(opts.background))) {
    throw new Error(`Missing background reference: ${opts.background}`);
  }

  await logger.write("product.start", { handle, title: product.title, missing: missing.map((output) => output.filename) });
  let chatId = null;
  let assistantTurnIndex = 0;
  try {
    const created = await runChatGpt(["create-chat"], logger, { handle });
    chatId = created.chatId;
    await logger.write("product.chat.created", { handle, chatId });

    for (const output of missing) {
      const context = { handle, chatId, turnNumber: output.turnNumber, output: output.path };
      const prompt = buildPrompt(product, output);
      const promptFile = path.join(outputDir, `.prompt-turn-${output.turnNumber}.txt`);
      await fs.mkdir(outputDir, { recursive: true });
      await fs.writeFile(promptFile, prompt);
      const imageArgs = output.key === "hero"
        ? ["--image", bottle, "--image", opts.background]
        : [];

      await logger.write("turn.start", { ...context, filename: output.filename });
      await runChatGpt(
        ["input", "--chat-id", chatId, "--create-image", "--aspect", "1:1", "--text-file", promptFile, ...imageArgs],
        logger,
        context,
      );
      await runChatGpt(["send", "--chat-id", chatId], logger, context);
      assistantTurnIndex += 1;
      await waitForDone(chatId, logger, context);
      const turn = await getTurnWithImage(chatId, assistantTurnIndex, logger, context);
      await copyGeneratedImage(turn, output.path);
      await logger.write("turn.downloaded", { ...context, sourceImages: turn.images, output: output.path });
    }

    await logger.write("product.done", { handle, title: product.title });
    return { handle, status: "done", generated: missing.length };
  } finally {
    if (chatId) {
      try {
        await runChatGpt(["close-chat", "--chat-id", chatId], logger, { handle, chatId });
        await logger.write("product.chat.closed", { handle, chatId });
      } catch (error) {
        await logger.write("product.chat.close_failed", { handle, chatId, error: error.message });
      }
    }
  }
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

  let products = await loadProducts(opts["products-file"]);
  if (opts.product) products = products.filter((product) => product.handle === opts.product);
  if (!products.length) throw new Error(opts.product ? `No product matched ${opts.product}` : "No products found");

  await logger.write("run.start", {
    products: products.length,
    concurrency: opts.concurrency,
    productsFile: opts["products-file"],
    productsDir: opts["products-dir"],
    background: opts.background,
    logFile: opts["log-file"],
  });

  const queue = [...products];
  const results = [];
  const workers = Array.from({ length: Math.min(opts.concurrency, queue.length) }, (_, index) =>
    worker(`worker-${index + 1}`, queue, opts, logger, results),
  );
  await Promise.all(workers);

  const summary = {
    total: results.length,
    done: results.filter((result) => result.status === "done").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    failed: results.filter((result) => result.status === "failed").length,
    results,
  };
  await logger.write("run.done", summary);
  process.stdout.write(`${JSON.stringify({ ...summary, logFile: opts["log-file"] }, null, 2)}\n`);
  if (summary.failed) process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
