#!/usr/bin/env node
/**
 * Playwright smoke: built viewer loads without console errors.
 * Run after `npm run build && npm run preview` (or set VIEWER_URL).
 */
import { chromium } from "playwright";
import { spawn } from "child_process";
import { setTimeout as delay } from "timers/promises";

const VIEWER_URL = process.env.VIEWER_URL ?? "http://127.0.0.1:4173";
const START_PREVIEW = process.env.START_PREVIEW !== "0";

let previewProc = null;

async function startPreview() {
  if (!START_PREVIEW) return;
  previewProc = spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", "4173"], {
    cwd: new URL("../..", import.meta.url).pathname,
    stdio: "ignore",
    shell: true,
  });
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(VIEWER_URL);
      if (res.ok) return;
    } catch {
      // retry
    }
    await delay(500);
  }
  throw new Error(`Viewer preview not reachable at ${VIEWER_URL}`);
}

async function main() {
  await startPreview();

  const launchOpts = { headless: true };
  let browser;
  try {
    browser = await chromium.launch({ ...launchOpts, channel: "chrome" });
  } catch {
    browser = await chromium.launch(launchOpts);
  }

  const consoleErrors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  await page.goto(VIEWER_URL, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector("#app", { timeout: 15000 });

  const title = await page.title();
  if (!title.includes("ProjectLM")) {
    throw new Error(`Unexpected page title: ${title}`);
  }

  const header = await page.locator("h1").first().textContent();
  if (!header?.includes("ProjectLM")) {
    throw new Error(`Missing ProjectLM header, got: ${header}`);
  }

  await browser.close();

  if (previewProc) {
    previewProc.kill("SIGTERM");
  }

  if (consoleErrors.length > 0) {
    console.error("Console errors:", consoleErrors);
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, url: VIEWER_URL, title }));
}

main().catch((err) => {
  if (previewProc) previewProc.kill("SIGTERM");
  console.error(JSON.stringify({ ok: false, error: String(err) }));
  process.exit(1);
});
