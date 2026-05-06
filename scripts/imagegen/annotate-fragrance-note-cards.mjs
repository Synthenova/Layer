#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_PRODUCTS_DIR = path.resolve("perfect_product/products");
const DEFAULT_PRODUCTS_FILE = path.resolve("perfect_product/individual-products.jsonl");
const DEFAULT_OUTPUT_DIR_NAME = "shopify-images-annotated";

const NOTE_CONFIGS = [
  { key: "top", label: "TOP NOTES", filename: "top-notes.png" },
  { key: "heart", label: "HEART NOTES", filename: "heart-notes.png" },
  { key: "base", label: "BASE NOTES", filename: "base-notes.png" },
];

const ANALYSIS_SIZE = 96;
const HORIZONTAL_MARGIN = 170;
const HEADING_FONT = "Helvetica";
const NOTES_FONT = "Helvetica";
const HEADING_POINTSIZE = 32;
const NOTES_POINTSIZE = 28;
const BAND_PADDING_TOP = 22;
const HEADING_TO_RULE_GAP = 12;
const RULE_TO_NOTES_GAP = 18;
const BAND_PADDING_BOTTOM = 24;
const TOP_SAFETY_MARGIN = 26;
const RULE_WIDTH = 360;
const RULE_STROKE = 2;
const MIN_FOREGROUND_PIXELS = 6;
function parseArgs(argv) {
  const args = {
    "products-dir": DEFAULT_PRODUCTS_DIR,
    "products-file": DEFAULT_PRODUCTS_FILE,
    "output-dir-name": DEFAULT_OUTPUT_DIR_NAME,
    force: false,
    "dry-run": false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    switch (arg) {
      case "--products-dir":
        args["products-dir"] = path.resolve(next);
        index += 1;
        break;
      case "--products-file":
        args["products-file"] = path.resolve(next);
        index += 1;
        break;
      case "--product":
        args.product = next;
        index += 1;
        break;
      case "--output-dir-name":
        args["output-dir-name"] = next;
        index += 1;
        break;
      case "--force":
        args.force = true;
        break;
      case "--dry-run":
        args["dry-run"] = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

async function loadProducts(productsFile) {
  const raw = await fs.readFile(productsFile, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function runMagick(args) {
  return execFileAsync("magick", args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

async function identifyFormat(filePath, format) {
  const { stdout } = await runMagick([filePath, "-format", format, "info:"]);
  return stdout.trim();
}

function averageColor(samples) {
  const total = samples.reduce(
    (acc, sample) => ({
      r: acc.r + sample.r,
      g: acc.g + sample.g,
      b: acc.b + sample.b,
    }),
    { r: 0, g: 0, b: 0 },
  );
  return {
    r: total.r / samples.length,
    g: total.g / samples.length,
    b: total.b / samples.length,
  };
}

function saturation({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  return max === 0 ? 0 : (max - min) / max;
}

async function analyzeForegroundRows(filePath) {
  const { stdout } = await runMagick([filePath, "-resize", `${ANALYSIS_SIZE}x${ANALYSIS_SIZE}!`, "txt:-"]);
  const pixels = Array.from({ length: ANALYSIS_SIZE }, () => Array(ANALYSIS_SIZE));

  for (const line of stdout.trim().split("\n").slice(1)) {
    const match = line.match(/(\d+),(\d+): \(([-\d]+),([-\d]+),([-\d]+)(?:,[-\d]+)?\)/);
    if (!match) continue;
    const [, x, y, r, g, b] = match;
    pixels[Number(y)][Number(x)] = { r: Number(r), g: Number(g), b: Number(b) };
  }

  const cornerSamples = [];
  for (const [x0, y0] of [
    [0, 0],
    [ANALYSIS_SIZE - 12, 0],
    [0, ANALYSIS_SIZE - 12],
    [ANALYSIS_SIZE - 12, ANALYSIS_SIZE - 12],
  ]) {
    for (let y = y0; y < y0 + 12; y += 1) {
      for (let x = x0; x < x0 + 12; x += 1) {
        cornerSamples.push(pixels[y][x]);
      }
    }
  }
  const bg = averageColor(cornerSamples);
  const bgLuma = (bg.r + bg.g + bg.b) / 3;

  const rows = [];
  for (let y = 0; y < ANALYSIS_SIZE; y += 1) {
    let foreground = 0;
    for (let x = 0; x < ANALYSIS_SIZE; x += 1) {
      const pixel = pixels[y][x];
      const dist = Math.sqrt(
        ((pixel.r - bg.r) ** 2) +
        ((pixel.g - bg.g) ** 2) +
        ((pixel.b - bg.b) ** 2),
      );
      const sat = saturation(pixel);
      const luma = (pixel.r + pixel.g + pixel.b) / 3;
      if (dist > 48 || (dist > 26 && sat > 0.14) || luma < bgLuma - 30) {
        foreground += 1;
      }
    }
    rows.push({ y, foreground });
  }

  const strongRows = rows.filter((row) => row.foreground >= MIN_FOREGROUND_PIXELS);
  return {
    firstStrong: strongRows[0]?.y ?? 0,
    lastStrong: strongRows.at(-1)?.y ?? ANALYSIS_SIZE - 1,
  };
}

async function buildNotesBlock(tempDir, label, notes, width) {
  const notesText = notes.length ? notes.join(", ") : "No notes available";
  const notesImage = path.join(tempDir, "notes-text.png");
  const blockImage = path.join(tempDir, "block.png");

  await runMagick([
    "-background", "none",
    "-fill", "#171717",
    "-font", NOTES_FONT,
    "-pointsize", String(NOTES_POINTSIZE),
    "-gravity", "center",
    "-size", `${Math.max(320, width - HORIZONTAL_MARGIN * 2)}x`,
    `caption:${notesText}`,
    notesImage,
  ]);

  const notesHeight = Number(await identifyFormat(notesImage, "%h"));
  const blockHeight =
    BAND_PADDING_TOP +
    HEADING_POINTSIZE +
    HEADING_TO_RULE_GAP +
    RULE_STROKE +
    RULE_TO_NOTES_GAP +
    notesHeight +
    BAND_PADDING_BOTTOM;

  const ruleLeft = Math.round((width - RULE_WIDTH) / 2);
  const ruleY = BAND_PADDING_TOP + HEADING_POINTSIZE + HEADING_TO_RULE_GAP;
  const notesY = ruleY + RULE_STROKE + RULE_TO_NOTES_GAP;

  await runMagick([
    "-size", `${width}x${blockHeight}`,
    "xc:none",
    "-fill", "#121212",
    "-font", HEADING_FONT,
    "-pointsize", String(HEADING_POINTSIZE),
    "-gravity", "north",
    "-annotate", `+0+${BAND_PADDING_TOP}`, label,
    "-stroke", "#181818",
    "-strokewidth", String(RULE_STROKE),
    "-draw", `line ${ruleLeft},${ruleY} ${width - ruleLeft},${ruleY}`,
    notesImage,
    "-gravity", "north",
    "-geometry", `+0+${notesY}`,
    "-composite",
    blockImage,
  ]);

  return { blockImage, blockHeight };
}

async function buildTextureBand(inputPath, tempDir, width, height, blockHeight) {
  const stripHeight = Math.max(1, Math.min(Math.ceil(blockHeight / 2), height));
  const stripPath = path.join(tempDir, "texture-source.png");
  const flippedPath = path.join(tempDir, "texture-flipped.png");
  const reflectedPath = path.join(tempDir, "texture-reflected.png");
  const bandPath = path.join(tempDir, "texture-band.png");

  await runMagick([
    inputPath,
    "-gravity", "south",
    "-crop", `${width}x${stripHeight}+0+0`,
    "+repage",
    stripPath,
  ]);

  await runMagick([
    stripPath,
    "-flip",
    flippedPath,
  ]);

  await runMagick([
    flippedPath,
    stripPath,
    "-append",
    reflectedPath,
  ]);

  await runMagick([
    reflectedPath,
    "-gravity", "north",
    "-crop", `${width}x${blockHeight}+0+0`,
    "+repage",
    bandPath,
  ]);

  return bandPath;
}

export async function annotateFragranceNoteCard(inputPath, label, notes, options = {}) {
  const outputPath = options.outputPath || inputPath;
  const width = Number(await identifyFormat(inputPath, "%w"));
  const height = Number(await identifyFormat(inputPath, "%h"));
  const analysis = await analyzeForegroundRows(inputPath);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "layer-note-card-"));

  try {
    const { blockImage, blockHeight } = await buildNotesBlock(tempDir, label, notes, width);
    const textureBand = await buildTextureBand(inputPath, tempDir, width, height, blockHeight);
    const finalBand = path.join(tempDir, "final-band.png");
    await runMagick([
      textureBand,
      blockImage,
      "-gravity", "center",
      "-composite",
      finalBand,
    ]);

    const availableTopSpace = Math.max(
      0,
      Math.round((analysis.firstStrong / ANALYSIS_SIZE) * height) - TOP_SAFETY_MARGIN,
    );
    const renderedPath = path.join(tempDir, "annotated.png");

    if (availableTopSpace >= blockHeight) {
      const shiftedBase = path.join(tempDir, "shifted-base.png");
      await runMagick([
        inputPath,
        "-gravity", "north",
        "-chop", `0x${blockHeight}`,
        shiftedBase,
      ]);
      await runMagick([shiftedBase, finalBand, "-append", renderedPath]);
    } else {
      const expandedPath = path.join(tempDir, "expanded.png");
      await runMagick([inputPath, finalBand, "-append", expandedPath]);
      await runMagick([
        expandedPath,
        "-resize", `${width}x${height}!`,
        renderedPath,
      ]);
    }

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.copyFile(renderedPath, outputPath);
    return {
      inputPath,
      outputPath,
      width,
      height,
      blockHeight,
      topWhitespacePx: availableTopSpace,
      mode: availableTopSpace >= blockHeight ? "shift-up" : "expand-and-resize",
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function processProducts(opts) {
  let products = await loadProducts(opts["products-file"]);
  if (opts.product) products = products.filter((product) => product.handle === opts.product);

  const results = [];
  for (const product of products) {
    const shopifyDir = path.join(opts["products-dir"], product.handle, "shopify-images");
    for (const config of NOTE_CONFIGS) {
      const filePath = path.join(shopifyDir, config.filename);
      if (!(await exists(filePath))) continue;
      const outputPath = path.join(
        path.dirname(shopifyDir),
        opts["output-dir-name"],
        config.filename,
      );
      if (!opts["dry-run"] && !opts.force && (await exists(outputPath))) {
        results.push({
          handle: product.handle,
          key: config.key,
          inputPath: filePath,
          outputPath,
          skipped: true,
        });
        continue;
      }
      if (opts["dry-run"]) {
        const width = Number(await identifyFormat(filePath, "%w"));
        const height = Number(await identifyFormat(filePath, "%h"));
        const analysis = await analyzeForegroundRows(filePath);
        results.push({
          handle: product.handle,
          key: config.key,
          filePath,
          outputPath,
          width,
          height,
          firstStrong: analysis.firstStrong,
          lastStrong: analysis.lastStrong,
        });
        continue;
      }

      const result = await annotateFragranceNoteCard(
        filePath,
        config.label,
        product.notes?.[config.key] ?? [],
        { outputPath },
      );
      results.push({ handle: product.handle, key: config.key, ...result });
    }
  }
  return results;
}

async function main() {
  const opts = parseArgs(process.argv);
  const results = await processProducts(opts);
  process.stdout.write(`${JSON.stringify({ count: results.length, results }, null, 2)}\n`);
}

const isEntrypoint = import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isEntrypoint) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}
