#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const REPO_ROOT = process.cwd();
const CHATGPT_SCRIPT = path.join(REPO_ROOT, "scripts/chatgpt/chatgpt.mjs");
const DEFAULT_PRODUCTS_FILE = path.join(REPO_ROOT, "perfect_product/individual-products.jsonl");
const DEFAULT_QA_FILE = path.join(REPO_ROOT, "perfect_product/image-qa-gemini.jsonl");
const DEFAULT_PRODUCTS_DIR = path.join(REPO_ROOT, "perfect_product/products");
const DEFAULT_BACKGROUND = path.join(REPO_ROOT, "perfect_product/background.png");
const DEFAULT_LOG_DIR = path.join(REPO_ROOT, "perfect_product/logs");
const DEFAULT_CONCURRENCY = 1;
const POLL_MS = 15000;
const TURN_TIMEOUT_MS = 30 * 60 * 1000;

const SLOTS = [
  { key: "hero", filename: "bottle-with-ingredients.png", label: "hero image" },
  { key: "top", filename: "top-notes.png", label: "top notes image" },
  { key: "heart", filename: "heart-notes.png", label: "heart notes image" },
  { key: "base", filename: "base-notes.png", label: "base notes image" },
];

const INPUT_IMAGE_SPECS = [
  { key: "bottle", filename: "bottle-only-rembg.png", role: "bottle-only product identity reference" },
  { key: "hero", filename: "bottle-with-ingredients.png", role: "existing hero/set-style reference" },
  { key: "top", filename: "top-notes.png", role: "existing top-notes/set-style reference" },
  { key: "heart", filename: "heart-notes.png", role: "existing heart-notes/set-style reference" },
  { key: "base", filename: "base-notes.png", role: "existing base-notes/set-style reference" },
];

function usage() {
  console.error(`Usage:
  node scripts/chatgpt/regenerate-fragrance-editorial-failures.mjs [--product <handle>] [--concurrency 1]

Options:
  --product <handle>       Run only one product handle.
  --concurrency <n>        Number of products to run at once. Default: 1.
  --qa-file <path>         Gemini QA JSONL. Default: perfect_product/image-qa-gemini.jsonl.
  --products-file <path>   Product metadata JSONL. Default: perfect_product/individual-products.jsonl.
  --products-dir <path>    Product folders root. Default: perfect_product/products.
  --background <path>      Required background reference. Default: perfect_product/background.png.
  --dry-run                Build and log the repair plan without opening ChatGPT.
  --log-file <path>        Log file path. Default: perfect_product/logs/fragrance-editorial-repair-<timestamp>.log`);
  process.exit(2);
}

function parseArgs(argv) {
  const opts = {
    concurrency: String(DEFAULT_CONCURRENCY),
    "qa-file": DEFAULT_QA_FILE,
    "products-file": DEFAULT_PRODUCTS_FILE,
    "products-dir": DEFAULT_PRODUCTS_DIR,
    background: DEFAULT_BACKGROUND,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") usage();
    if (arg === "--dry-run") {
      opts["dry-run"] = true;
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
  opts["qa-file"] = path.resolve(opts["qa-file"]);
  opts["products-file"] = path.resolve(opts["products-file"]);
  opts["products-dir"] = path.resolve(opts["products-dir"]);
  opts.background = path.resolve(opts.background);
  opts["log-file"] = opts["log-file"]
    ? path.resolve(opts["log-file"])
    : path.join(DEFAULT_LOG_DIR, `fragrance-editorial-repair-${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
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

async function loadJsonl(file) {
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
    await fs.appendFile(this.file, `\n=== fragrance editorial repair run ${new Date().toISOString()} ===\n`);
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

function slotForKey(key) {
  const slot = SLOTS.find((candidate) => candidate.key === key);
  if (!slot) throw new Error(`Unknown slot: ${key}`);
  return slot;
}

function failedSlotsFromQa(row) {
  return SLOTS
    .filter((slot) => row.checks?.[slot.key]?.status !== "correct")
    .map((slot) => ({
      ...slot,
      qaStatus: row.checks?.[slot.key]?.status || "missing",
      qaReason: row.checks?.[slot.key]?.reason || "",
    }));
}

async function collectInputImages(productDir, qaRow, background) {
  const shopifyDir = path.join(productDir, "shopify-images");
  const images = [{ key: "background", filename: path.basename(background), role: "required exact background style reference: off-white plaster/paper texture with subtle grey mottling and shallow fibrous relief", path: background }];
  for (const spec of INPUT_IMAGE_SPECS) {
    if (spec.key !== "bottle" && qaRow.checks?.[spec.key]?.status !== "correct") continue;
    const file = path.join(shopifyDir, spec.filename);
    if (await exists(file)) images.push({ ...spec, path: file });
  }
  return images;
}

function prelude(product, inputs, repairSlots) {
  const inputLines = inputs.map((input, index) => (
    `Input image ${index + 1}: ${input.filename} - ${input.role}. Use this only for identity/style/reference as described.`
  ));
  const repairLines = repairSlots.map((slot) => (
    `- ${slot.label} (${slot.filename}) is marked ${slot.qaStatus}. QA reason: ${slot.qaReason || "not provided"}`
  ));
  return `${product.title}

We are repairing a luxury editorial fragrance image set for this product. This is a deterministic repair pass based on QA results.

Provided input images:
${inputLines.join("\n")}

Reference integrity:
Only QA-correct existing set images are provided as style references. Any image that QA marked wrong, missing, or uncertain has deliberately been excluded and must not be inferred or recreated from memory.

Background reference rule:
Use the provided background image as the exact background style for every regenerated image. It is a square off-white textured plaster/paper surface with subtle grey mottling and shallow fibrous relief. Match this clean tactile white surface, soft natural studio lighting, and generous negative space. Do not replace it with marble, fabric, wood, colored paper, gradients, table props, or a plain flat white void.

Images that must be regenerated in this chat:
${repairLines.join("\n")}

Global visual direction for all regenerated images:
Luxury editorial flat-lay fragrance photography.
Clean, premium, minimal, high-end composition.
Soft natural studio lighting.
Square 1:1 composition.
Same refined visual language as the provided correct set images.
No added captions, no added typography, no borders, no packaging, no unrelated props.
For hero images only: preserve real text, logo marks, label typography, engravings, and brand/product identity that are physically part of the bottle reference.
For note-only images: no text or labels of any kind.

Important product identity rule:
Always preserve the real bottle identity from the bottle-only reference when the target image includes a bottle. The bottle-only reference outranks every other image for product identity. If the target image is a note-only image, do not include any bottle or packaging.`;
}

function taskPrompt(product, slot) {
  const top = notesFor(product, "top");
  const heart = notesFor(product, "heart");
  const base = notesFor(product, "base");

  if (slot.key === "hero") {
    return `Regenerate the hero image only.

Target output file: ${slot.filename}

Requirements:
- Use the real ${product.title} bottle as the central hero object.
- Treat the bottle-only input image as the strict product identity source.
- Keep the bottle accurate to the bottle-only reference: exact silhouette, shape, cap, color, material finish, emblem/details, label placement, label text/marks when visible, proportions, and front identity.
- Preserve real bottle text, logo marks, label typography, engravings, and any visible brand/product wording from the bottle-only reference. Do not remove, blur, simplify, hallucinate, or replace bottle text.
- Do not invent a different brand bottle, different logo, different label geometry, different cap, different colorway, or different product name.
- If existing correct note images are provided, use them only for ingredient styling, composition language, lighting, and background continuity. Never use them to override the bottle identity.
- Use the existing correct set images only as style references, not as product identity references.
- Place the bottle on the exact provided off-white textured plaster/paper background style.
- Surround the bottle with elegant ingredient elements representing the fragrance notes.
- Use only visually relevant ingredients from this perfume's note profile.
- Keep ingredient styling premium, restrained, balanced, and not cluttered.

Notes for ingredient inspiration:
Top notes: ${formatList(top)}
Heart notes: ${formatList(heart)}
Base notes: ${formatList(base)}

Generate the corrected hero image only.`;
  }

  const configs = {
    top: {
      label: "TOP NOTES",
      notes: top,
      mood: "fresh, bright, aromatic, premium, minimal, balanced, and clean",
      extra: `Make ${formatList(top)} clearly readable as the note story.`,
    },
    heart: {
      label: "HEART NOTES",
      notes: heart,
      mood: "resinous, warm, mysterious, refined, premium, minimal, balanced, and clean",
      extra: "Use elegant botanical/resin/material styling where relevant without making it messy or smoky in an uncontrolled way.",
    },
    base: {
      label: "BASE NOTES",
      notes: base,
      mood: "dark, woody, luxurious, refined, premium, minimal, balanced, and clean",
      extra: "Use elegant base-note material styling where relevant while keeping the composition restrained.",
    },
  }[slot.key];

  return `Regenerate the ${slot.label} only.

Target output file: ${slot.filename}

This image is for the ${configs.label} only:
{${formatList(configs.notes)}}

Requirements:
- No bottle.
- No packaging.
- Show only ingredients/material elements representing these notes.
- The composition should feel ${configs.mood}.
- ${configs.extra}
- Match the same luxury editorial flat-lay style as the provided correct set images.
- Keep generous negative space and the exact provided off-white textured plaster/paper background feel.

Generate the corrected ${slot.label} only.`;
}

function buildTurnPrompt(product, inputs, repairSlots, slot, isFirstTurn) {
  const parts = [];
  if (isFirstTurn) parts.push(prelude(product, inputs, repairSlots));
  parts.push(taskPrompt(product, slot));
  parts.push("Make the aspect ratio 1:1.");
  return parts.join("\n\n");
}

async function waitForDone(chatId, logger, context) {
  const started = Date.now();
  while (Date.now() - started < TURN_TIMEOUT_MS) {
    const result = await runChatGpt(["status", "--chat-id", chatId], logger, context);
    if (result.status === "done") return result;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error(`Timed out waiting for ${context.handle} ${context.slotKey}`);
}

async function getTurnWithImage(chatId, assistantTurnIndex, logger, context) {
  const started = Date.now();
  while (Date.now() - started < TURN_TIMEOUT_MS) {
    const result = await runChatGpt(["get-turn", "--chat-id", chatId, "--turn", String(assistantTurnIndex)], logger, context);
    if (result.images?.length) return result;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error(`Timed out waiting for generated image for ${context.handle} ${context.slotKey}`);
}

async function saveGeneratedImage(turn, paths) {
  if (!turn.images?.length) throw new Error(`No generated image returned for ${paths.download}`);
  await fs.mkdir(path.dirname(paths.download), { recursive: true });
  await fs.mkdir(path.dirname(paths.shopify), { recursive: true });
  await fs.copyFile(turn.images[0], paths.download);
  await fs.copyFile(turn.images[0], paths.shopify);
}

async function processProduct(job, opts, logger) {
  const product = job.product;
  const handle = product.handle;
  const productDir = path.join(opts["products-dir"], handle);
  if (!(await exists(opts.background))) throw new Error(`Missing background reference: ${opts.background}`);
  const inputs = await collectInputImages(productDir, job.qaRow, opts.background);
  const bottle = inputs.find((input) => input.key === "bottle");
  if (!bottle) throw new Error(`Missing bottle-only-rembg.png in shopify-images for ${handle}`);

  await logger.write("product.start", {
    handle,
    title: product.title,
    repairSlots: job.repairSlots.map((slot) => `${slot.key}:${slot.qaStatus}`),
    inputImages: inputs.map((input) => path.relative(REPO_ROOT, input.path)),
  });

  if (opts["dry-run"]) {
    for (let i = 0; i < job.repairSlots.length; i += 1) {
      const slot = job.repairSlots[i];
      const prompt = buildTurnPrompt(product, inputs, job.repairSlots, slot, i === 0);
      await logger.write("dry_run.turn", {
        handle,
        slot: slot.key,
        output: path.relative(REPO_ROOT, outputPaths(productDir, slot).shopify),
        prompt,
      });
    }
    return { handle, status: "planned", repairSlots: job.repairSlots.map((slot) => slot.key) };
  }

  let chatId = null;
  let assistantTurnIndex = 0;
  try {
    const created = await runChatGpt(["create-chat"], logger, { handle });
    chatId = created.chatId;
    await logger.write("product.chat.created", { handle, chatId });

    for (let i = 0; i < job.repairSlots.length; i += 1) {
      const slot = job.repairSlots[i];
      const paths = outputPaths(productDir, slot);
      const prompt = buildTurnPrompt(product, inputs, job.repairSlots, slot, i === 0);
      const promptFile = path.join(productDir, "download-images", `.repair-prompt-${slot.key}.txt`);
      await fs.mkdir(path.dirname(promptFile), { recursive: true });
      await fs.writeFile(promptFile, prompt);

      const context = { handle, chatId, slotKey: slot.key, output: paths.shopify };
      const args = ["input", "--chat-id", chatId, "--create-image", "--aspect", "1:1", "--text-file", promptFile];
      if (i === 0) {
        for (const input of inputs) args.push("--image", input.path);
      }

      await logger.write("turn.start", {
        ...context,
        qaStatus: slot.qaStatus,
        qaReason: slot.qaReason,
        inputImages: i === 0 ? inputs.map((input) => path.relative(REPO_ROOT, input.path)) : [],
      });
      await runChatGpt(args, logger, context);
      await runChatGpt(["send", "--chat-id", chatId], logger, context);
      assistantTurnIndex += 1;
      await waitForDone(chatId, logger, context);
      const turn = await getTurnWithImage(chatId, assistantTurnIndex, logger, context);
      await saveGeneratedImage(turn, paths);
      await logger.write("turn.saved", {
        ...context,
        sourceImages: turn.images,
        downloadOutput: paths.download,
        shopifyOutput: paths.shopify,
      });
    }

    await logger.write("product.done", { handle, title: product.title });
    return { handle, status: "done", generated: job.repairSlots.length };
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

function outputPaths(productDir, slot) {
  return {
    download: path.join(productDir, "download-images", slot.filename),
    shopify: path.join(productDir, "shopify-images", slot.filename),
  };
}

async function worker(name, queue, opts, logger, results) {
  while (queue.length) {
    const job = queue.shift();
    await logger.write("worker.product.claim", { worker: name, handle: job.product.handle });
    try {
      results.push(await processProduct(job, opts, logger));
    } catch (error) {
      await logger.write("product.failed", { worker: name, handle: job.product.handle, error: error.message });
      results.push({ handle: job.product.handle, status: "failed", error: error.message });
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  const logger = new Logger(opts["log-file"]);
  await logger.init();

  const products = await loadJsonl(opts["products-file"]);
  const productByHandle = new Map(products.map((product) => [product.handle, product]));
  const qaRows = await loadJsonl(opts["qa-file"]);
  const jobs = [];

  for (const row of qaRows) {
    if (opts.product && row.handle !== opts.product) continue;
    const product = productByHandle.get(row.handle) || { handle: row.handle, title: row.title, notes: {} };
    const repairSlots = failedSlotsFromQa(row).map((slot) => slotForKey(slot.key) && slot);
    if (!repairSlots.length) continue;
    jobs.push({ product: { ...product, title: product.title || row.title }, qaRow: row, repairSlots });
  }

  if (!jobs.length) throw new Error(opts.product ? `No QA repair slots matched ${opts.product}` : "No QA repair slots found");

  await logger.write("run.start", {
    products: jobs.length,
    turns: jobs.reduce((sum, job) => sum + job.repairSlots.length, 0),
    concurrency: opts.concurrency,
    dryRun: Boolean(opts["dry-run"]),
    qaFile: opts["qa-file"],
    productsFile: opts["products-file"],
    productsDir: opts["products-dir"],
    background: opts.background,
    logFile: opts["log-file"],
  });

  const queue = [...jobs];
  const results = [];
  const workers = Array.from({ length: Math.min(opts.concurrency, queue.length) }, (_, index) =>
    worker(`worker-${index + 1}`, queue, opts, logger, results),
  );
  await Promise.all(workers);

  const summary = {
    total: results.length,
    done: results.filter((result) => result.status === "done").length,
    planned: results.filter((result) => result.status === "planned").length,
    failed: results.filter((result) => result.status === "failed").length,
    results,
    logFile: opts["log-file"],
  };
  await logger.write("run.done", summary);
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (summary.failed) process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
