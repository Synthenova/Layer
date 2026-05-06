#!/usr/bin/env node
import fs from "node:fs/promises";
import { openAsBlob } from "node:fs";
import path from "node:path";
import process from "node:process";

const CONTROL_URL = "http://localhost:9868";
const BEARER_TOKEN = "c3a437cec25ec826a5dd278edc80d6a2cbaccf5ef439e4e9";
const PROFILE_NAME = "Me";
const CHATGPT_URL = "https://chatgpt.com/";
const AGENT_ID = "chatgpt-script";
const STATE_DIR = "/tmp/chatgpt-script";
const STATE_PATH = path.join(STATE_DIR, "state.json");
const HUMAN_PAUSE_MIN_MS = Number(process.env.CHATGPT_HUMAN_PAUSE_MIN_MS || 1800);
const HUMAN_PAUSE_MAX_MS = Number(process.env.CHATGPT_HUMAN_PAUSE_MAX_MS || 4200);

const headers = {
  Authorization: `Bearer ${BEARER_TOKEN}`,
  "X-Agent-Id": AGENT_ID,
};

function usage() {
  console.error(`Usage:
  node scripts/chatgpt/chatgpt.mjs create-chat
  node scripts/chatgpt/chatgpt.mjs input --chat-id <id> [--text <text>] [--image <path>] [--image-dir <dir>] [--create-image] [--aspect 1:1]
  node scripts/chatgpt/chatgpt.mjs send --chat-id <id>
  node scripts/chatgpt/chatgpt.mjs status --chat-id <id>
  node scripts/chatgpt/chatgpt.mjs get-turn --chat-id <id> --turn <n>
  node scripts/chatgpt/chatgpt.mjs close-chat --chat-id <id>`);
  process.exit(2);
}

function parseArgs(argv) {
  const command = argv[2];
  if (!command) usage();
  const opts = { _: [] };
  for (let i = 3; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      opts._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (["create-image"].includes(key)) {
      opts[key] = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined) throw new Error(`Missing value for --${key}`);
    i += 1;
    if (["image"].includes(key)) {
      opts[key] = opts[key] || [];
      opts[key].push(value);
    } else {
      opts[key] = value;
    }
  }
  return { command, opts };
}

function out(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function readJsonSafe(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeState(state) {
  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2));
}

async function loadState() {
  return readJsonSafe(STATE_PATH, { chats: {} });
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${url}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }
  return body;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function humanPause(multiplier = 1) {
  const min = HUMAN_PAUSE_MIN_MS * multiplier;
  const max = Math.max(min, HUMAN_PAUSE_MAX_MS * multiplier);
  await sleep(min + Math.floor(Math.random() * (max - min + 1)));
}

async function ensureMeInstance() {
  const instances = await requestJson(`${CONTROL_URL}/instances`);
  const running = instances.find(
    (instance) => instance.profileName === PROFILE_NAME && instance.status === "running" && instance.url,
  );
  if (running) return running;

  const profiles = await requestJson(`${CONTROL_URL}/profiles`);
  const profile = profiles.find((candidate) => candidate.name === PROFILE_NAME);
  if (!profile) throw new Error(`PinchTab profile "${PROFILE_NAME}" was not found`);

  const started = await requestJson(`${CONTROL_URL}/profiles/${encodeURIComponent(profile.id)}/start`, {
    method: "POST",
    body: JSON.stringify({ headless: false }),
  });
  await sleep(1500);
  const refreshed = await requestJson(`${CONTROL_URL}/instances`);
  return (
    refreshed.find((instance) => instance.profileId === profile.id && instance.status === "running" && instance.url) ||
    started
  );
}

async function waitForReady(chat, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await getPageState(chat);
    if (state.ready) return state;
    await sleep(1000);
  }
  throw new Error(`Chat ${chat.chatId} did not become ready within ${timeoutMs}ms`);
}

async function evaluate(chat, expression) {
  const result = await requestJson(`${chat.instanceUrl}/tabs/${chat.tabId}/evaluate`, {
    method: "POST",
    body: JSON.stringify({ expression }),
  });
  return result?.result;
}

async function action(chat, payload) {
  await humanPause();
  return requestJson(`${chat.instanceUrl}/tabs/${chat.tabId}/action`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function snapshot(chat) {
  return requestJson(`${chat.instanceUrl}/tabs/${chat.tabId}/snapshot?filter=interactive&format=compact`);
}

function findRef(snapshotText, role, nameIncludes) {
  const wanted = nameIncludes.toLowerCase();
  for (const line of snapshotText.split("\n")) {
    const match = line.match(/^(e\d+):(\w+)\s+"([^"]*)"/);
    if (!match) continue;
    const [, ref, foundRole, name] = match;
    if (foundRole === role && name.toLowerCase().includes(wanted)) return ref;
  }
  return null;
}

async function clickNamed(chat, role, nameIncludes) {
  const ref = findRef(await snapshot(chat), role, nameIncludes);
  if (!ref) throw new Error(`Could not find ${role} named ${nameIncludes}`);
  await action(chat, { kind: "click", ref });
}

async function getPageState(chat) {
  const raw = await evaluate(
    chat,
    `(() => {
      const textBox = document.querySelector("#prompt-textarea");
      const composerRoot = textBox?.closest("form") || textBox?.parentElement || document;
      const footer = document.querySelector("[data-testid='composer-footer-actions']");
      const send = document.querySelector("[data-testid='send-button']");
      const stop = [...document.querySelectorAll("button")].find((button) => {
        const label = ((button.getAttribute("aria-label") || "") + " " + (button.innerText || "")).trim();
        const active = !button.disabled && button.getAttribute("aria-disabled") !== "true";
        return active && /^(stop|cancel)|\\b(stop generating|stop streaming|stop responding|cancel response)\\b/i.test(label) && !/stopped/i.test(label);
      });
      const removeFileButtons = [...composerRoot.querySelectorAll("button")].filter((button) => /remove file|remove attachment/i.test(button.getAttribute("aria-label") || ""));
      const uploadedPreviews = [...composerRoot.querySelectorAll("img")].filter((img) => {
        const alt = img.alt || "";
        const src = img.src || "";
        const rect = img.getBoundingClientRect();
        if (rect.width < 24 || rect.height < 24) return false;
        if (/persistent\\.oaistatic\\.com\\/images-app/i.test(src)) return false;
        if (/generated image/i.test(alt)) return false;
        return true;
      });
      return JSON.stringify({
        url: location.href,
        title: document.title,
        ready: Boolean(textBox),
        composerText: textBox?.innerText || "",
        footerText: footer?.innerText || "",
        sendEnabled: Boolean(send && !send.disabled && send.getAttribute("aria-disabled") !== "true"),
        streaming: Boolean(stop),
        attachmentCount: Math.max(removeFileButtons.length, uploadedPreviews.length),
        hasImageMode: /\\bImage\\b/i.test(footer?.innerText || ""),
        aspect: (footer?.innerText || "").split("\\n").find((line) => /^(Auto|1:1|3:4|9:16|4:3|16:9)$/.test(line.trim())) || ""
      });
    })()`,
  );
  return JSON.parse(raw);
}

async function createChat() {
  const instance = await ensureMeInstance();
  const created = await requestJson(`${instance.url}/tab`, {
    method: "POST",
    body: JSON.stringify({ action: "new", url: CHATGPT_URL }),
  });
  const chatId = `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const chat = {
    chatId,
    tabId: created.tabId,
    instanceId: instance.id,
    instanceUrl: instance.url,
    createdAt: new Date().toISOString(),
    url: created.url || CHATGPT_URL,
  };
  await waitForReady(chat);
  const state = await loadState();
  state.chats[chatId] = chat;
  await writeState(state);
  return { chatId, status: "ready" };
}

async function getChat(chatId) {
  if (!chatId) throw new Error("--chat-id is required");
  const state = await loadState();
  const chat = state.chats[chatId];
  if (!chat) throw new Error(`Unknown chatId: ${chatId}`);
  return chat;
}

async function listImages(opts) {
  const images = [...(opts.image || [])];
  if (opts["image-dir"]) {
    const dir = path.resolve(opts["image-dir"]);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!/\.(png|jpe?g|webp|gif)$/i.test(entry.name)) continue;
      images.push(path.join(dir, entry.name));
    }
  }
  return images.map((image) => path.resolve(image));
}

async function setComposerText(chat, text) {
  if (!text) return;
  await humanPause();
  await evaluate(
    chat,
    `(() => {
      const el = document.querySelector("#prompt-textarea");
      if (!el) throw new Error("Composer not found");
      const text = ${JSON.stringify(text)};
      const selectComposerContents = () => {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        selection.removeAllRanges();
        selection.addRange(range);
      };
      el.focus();
      selectComposerContents();
      document.execCommand("delete", false, null);
      el.focus();
      const inserted = document.execCommand("insertText", false, text.replace(/\\r\\n/g, "\\n"));
      if (!inserted) {
        el.textContent = text;
        el.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: text }));
        el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      }
      return { inserted, text: el.innerText || "" };
    })()`,
	  );
  await humanPause();
  let lastComposerText = "";
  await waitUntil(async () => {
    const state = await getPageState(chat);
    lastComposerText = state.composerText;
    return composerMatches(state.composerText, text);
  }, 60000, () => {
    const expected = normalizeText(text);
    const actual = normalizeText(lastComposerText);
    return `Composer text did not match staged text: expectedLength=${expected.length} actualLength=${actual.length} actualStart=${JSON.stringify(actual.slice(0, 120))} actualEnd=${JSON.stringify(actual.slice(-120))}`;
  });
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function composerMatches(actualText, expectedText) {
  const actual = normalizeText(actualText);
  const expected = normalizeText(expectedText);
  if (actual === expected) return true;
  if (compactText(actual) === compactText(expected)) return true;
  if (!expected) return !actual;
  if (actual.length < Math.min(80, expected.length)) return false;
  const prefix = expected.slice(0, Math.min(80, expected.length));
  const suffix = expected.slice(Math.max(0, expected.length - Math.min(80, expected.length)));
  const lengthCloseEnough = actual.length >= expected.length * 0.9;
  if (actual.startsWith(prefix) && actual.endsWith(suffix) && lengthCloseEnough) return true;

  const compactActual = compactText(actual);
  const compactExpected = compactText(expected);
  const compactPrefix = compactExpected.slice(0, Math.min(100, compactExpected.length));
  const compactSuffix = compactExpected.slice(Math.max(0, compactExpected.length - Math.min(100, compactExpected.length)));
  return (
    compactActual.startsWith(compactPrefix) &&
    compactActual.endsWith(compactSuffix) &&
    compactActual.length >= compactExpected.length * 0.95
  );
}

function compactText(text) {
  return String(text || "").replace(/\s+/g, "");
}

async function uploadImages(chat, images, selector = "#upload-photos") {
  const warnings = [];
  if (!images.length) return warnings;
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index];
    await humanPause();
    const form = new FormData();
    form.append("selector", selector);
    await fs.access(image);
    const blob = await openAsBlob(image);
    form.append("file", blob, path.basename(image));
    await requestJson(`${chat.instanceUrl}/tabs/${chat.tabId}/upload`, {
      method: "POST",
      body: form,
    });
    const attached = await waitForCondition(async () => {
      const state = await getPageState(chat);
      return state.attachmentCount >= index + 1;
    }, 90000);
    if (!attached) {
      const state = await getPageState(chat);
      warnings.push(`Expected ${index + 1} attached image(s) after uploading ${path.basename(image)}, saw ${state.attachmentCount}`);
    }
    await humanPause();
  }
  return warnings;
}

async function enableCreateImage(chat, aspect) {
  const imageButton = findRef(await snapshot(chat), "button", "Create an image");
  if (imageButton) await action(chat, { kind: "click", ref: imageButton });
  await humanPause();
  const enabled = await waitForCondition(async () => {
    const state = await getPageState(chat);
    return state.hasImageMode;
  }, 15000);
  if (!enabled) {
    return false;
  }

  if (!aspect || aspect === "auto") return true;
  const label = aspect === "1:1" ? "Square 1:1" : aspect;
  try {
    await clickNamed(chat, "button", "Choose image aspect ratio");
  } catch {
    return false;
  }
  await humanPause();
  const optionAppeared = await waitForCondition(async () => {
    return Boolean(findRef(await snapshot(chat), "menuitemradio", label));
  }, 10000);
  if (!optionAppeared) return false;
  try {
    await clickNamed(chat, "menuitemradio", label);
  } catch {
    return false;
  }
  await humanPause();
  const selected = await waitForCondition(async () => {
    const state = await getPageState(chat);
    return state.aspect.trim() === aspect;
  }, 10000);
  return selected;
}

async function waitUntil(fn, timeoutMs, message) {
  const ok = await waitForCondition(fn, timeoutMs);
  if (ok) return;
  throw new Error(typeof message === "function" ? message() : message);
}

async function waitForCondition(fn, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await fn()) return true;
    } catch (error) {
      // Retry until the timeout; transient DOM states are common during ChatGPT updates.
    }
    await sleep(500);
  }
  return false;
}

async function input(opts) {
  const chat = await getChat(opts["chat-id"]);
  await waitForReady(chat);
  const images = await listImages(opts);
  const text = opts["text-file"] ? await fs.readFile(path.resolve(opts["text-file"]), "utf8") : opts.text || "";
  await humanPause();
  const imageModeEnabled = opts["create-image"] ? await enableCreateImage(chat, opts.aspect || "1:1") : false;
  await humanPause();
  const uploadWarnings = images.length ? await uploadImages(chat, images, imageModeEnabled ? "#upload-photos" : "#upload-files") : [];
  await humanPause();
  await setComposerText(chat, text);
  if (images.length || text) {
    await waitUntil(async () => {
      const current = await getPageState(chat);
      return current.sendEnabled;
    }, 90000, "Composer was staged but send button did not become ready");
    await humanPause(1.5);
  }
  const state = await getPageState(chat);
  return {
    chatId: chat.chatId,
    status: "staged",
    composerText: state.composerText,
    attachmentCount: state.attachmentCount,
    uploadWarnings,
    createImage: state.hasImageMode,
    createImageControlUsed: imageModeEnabled,
    aspect: state.aspect || null,
    sendReady: state.sendEnabled,
  };
}

async function send(opts) {
  const chat = await getChat(opts["chat-id"]);
  const before = await getPageState(chat);
  if (!before.sendEnabled) {
    return { chatId: chat.chatId, status: before.streaming ? "still_streaming" : "not_ready", state: before };
  }
  await humanPause(2);
  const ready = await getPageState(chat);
  if (!ready.sendEnabled) {
    return { chatId: chat.chatId, status: ready.streaming ? "still_streaming" : "not_ready", state: ready };
  }
  await action(chat, { kind: "click", selector: '[data-testid="send-button"]' });
  await humanPause();
  const state = await getPageState(chat);
  return { chatId: chat.chatId, status: state.streaming ? "still_streaming" : "done", state };
}

async function status(opts) {
  const chat = await getChat(opts["chat-id"]);
  const state = await getPageState(chat);
  return { chatId: chat.chatId, status: state.streaming ? "still_streaming" : "done", state };
}

async function getTurn(opts) {
  const chat = await getChat(opts["chat-id"]);
  const turn = Number(opts.turn);
  if (!Number.isInteger(turn) || turn < 1) throw new Error("--turn must be a positive integer");

  const raw = await evaluate(
    chat,
    `(() => {
      const turnNodes = [...document.querySelectorAll("[data-testid^='conversation-turn-']")];
      const assistantNodes = [...document.querySelectorAll("[data-message-author-role='assistant']")]
        .filter((node) => !node.closest("[data-testid^='conversation-turn-']"));
      const candidates = [...turnNodes, ...assistantNodes];
      const assistantTurns = [];
      const seen = new Set();
      for (const node of candidates) {
        const role = node.getAttribute("data-message-author-role") || node.querySelector("[data-message-author-role]")?.getAttribute("data-message-author-role");
        const text = (node.innerText || "").trim();
        const hasAssistantRole = role === "assistant";
        if (role === "user") continue;
        if (seen.has(node)) continue;
        seen.add(node);
        const images = [...node.querySelectorAll("img")]
          .map((img) => ({ src: img.src, alt: img.alt || "", width: img.naturalWidth, height: img.naturalHeight }))
          .filter((img) => img.src && !/cdn\\.auth0\\.com/.test(img.src))
          .filter((img) => !/uploaded image/i.test(img.alt))
          .filter((img, index, all) => all.findIndex((candidate) => candidate.src === img.src) === index);
        const hasGeneratedImage = images.some((img) => /generated image/i.test(img.alt) || (img.width >= 768 && img.height >= 768));
        if (!hasAssistantRole && !hasGeneratedImage) continue;
        assistantTurns.push({ text, images });
      }
      return JSON.stringify({ count: assistantTurns.length, turn: assistantTurns[${turn - 1}] || null });
    })()`,
  );
  const parsed = JSON.parse(raw);
  if (!parsed.turn) {
    return { chatId: chat.chatId, turn, availableTurns: parsed.count, text: "", images: [] };
  }

  const dir = path.join(STATE_DIR, chat.chatId, `turn_${turn}`);
  await fs.mkdir(dir, { recursive: true });
  const downloaded = [];
  for (let i = 0; i < parsed.turn.images.length; i += 1) {
    const image = parsed.turn.images[i];
    const bytes = await fetchImageBytesInPage(chat, image.src);
    const ext = extensionForMime(bytes.mimeType);
    const target = path.join(dir, `image_${i + 1}.${ext}`);
    await fs.writeFile(target, bytes.buffer);
    downloaded.push(target);
  }

  return { chatId: chat.chatId, turn, text: parsed.turn.text, images: downloaded };
}

async function fetchImageBytesInPage(chat, src) {
  const key = `__chatgptImageDownload_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  await evaluate(
    chat,
    `(() => {
      const key = ${JSON.stringify(key)};
      window[key] = { done: false };
      fetch(${JSON.stringify(src)}, { credentials: "include" })
        .then(async (response) => {
          if (!response.ok) throw new Error("image fetch failed: " + response.status);
          const mimeType = response.headers.get("content-type") || "image/png";
          const bytes = new Uint8Array(await response.arrayBuffer());
          let binary = "";
          const chunkSize = 0x8000;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
          }
          window[key] = { done: true, mimeType, base64: btoa(binary) };
        })
        .catch((error) => {
          window[key] = { done: true, error: error.message || String(error) };
        });
      return true;
    })()`,
  );
  let parsed = null;
  await waitUntil(async () => {
    const raw = await evaluate(chat, `(() => JSON.stringify(window[${JSON.stringify(key)}] || { done: false }))()`);
    parsed = JSON.parse(raw);
    return parsed.done;
  }, 120000, "Timed out fetching image bytes in page context");
  await evaluate(chat, `(() => { delete window[${JSON.stringify(key)}]; return true; })()`);
  if (parsed.error) throw new Error(parsed.error);
  return { mimeType: parsed.mimeType, buffer: Buffer.from(parsed.base64, "base64") };
}

function extensionForMime(mimeType) {
  if (/webp/i.test(mimeType)) return "webp";
  if (/jpe?g/i.test(mimeType)) return "jpg";
  if (/gif/i.test(mimeType)) return "gif";
  return "png";
}

async function closeChat(opts) {
  const chat = await getChat(opts["chat-id"]);
  await requestJson(`${chat.instanceUrl}/tab`, {
    method: "POST",
    body: JSON.stringify({ action: "close", tabId: chat.tabId }),
  });
  const state = await loadState();
  delete state.chats[chat.chatId];
  await writeState(state);
  return { chatId: chat.chatId, status: "closed" };
}

async function main() {
  const { command, opts } = parseArgs(process.argv);
  if (command === "create-chat") return out(await createChat());
  if (command === "input") return out(await input(opts));
  if (command === "send") return out(await send(opts));
  if (command === "status") return out(await status(opts));
  if (command === "get-turn") return out(await getTurn(opts));
  if (command === "close-chat") return out(await closeChat(opts));
  usage();
}

main().catch((error) => {
  out({ error: error.message });
  process.exit(1);
});
