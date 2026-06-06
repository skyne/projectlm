#!/usr/bin/env node
/**
 * Headless browser capture of the car assembly preview.
 * Run while the viewer dev server is up (default http://localhost:5180).
 *
 *   npm run capture:preview
 *   VIEWER_URL=http://localhost:5180 npm run capture:preview
 */

import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../../scripts/generate_assets/output");
const VIEWER_URL = process.env.VIEWER_URL ?? "http://localhost:5180";

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  /** Prefer system Chrome — avoids sandbox Playwright browser cache issues. */
  const launchOpts = { headless: true };
  let browser;
  try {
    browser = await chromium.launch({ ...launchOpts, channel: "chrome" });
  } catch {
    browser = await chromium.launch(launchOpts);
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => consoleErrors.push(`[pageerror] ${err.message}`));
  page.on("requestfailed", (req) =>
    failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`),
  );
  page.on("response", (res) => {
    if (res.status() >= 400) failedRequests.push(`${res.status()} ${res.url()}`);
  });

  try {
    await page.goto(VIEWER_URL, { waitUntil: "networkidle", timeout: 15_000 });
  } catch (err) {
    console.error(`Failed to open ${VIEWER_URL} — is the viewer dev server running?`);
    console.error(err.message);
    await browser.close();
    process.exit(1);
  }

  await page.waitForSelector(".car-preview-img", { timeout: 10_000 });
  await page.evaluate(async () => {
    const preview = window.__carPreview;
    if (preview?.reloadGraphics) await preview.reloadGraphics();
  });
  await page.waitForTimeout(300);

  const panel = page.locator(".car-preview-panel");
  const canvas = page.locator(".car-preview-img");

  await panel.screenshot({ path: path.join(OUT_DIR, "browser_panel.png") });

  const zones = await page.evaluate(async () => {
    const catalog = await fetch(`/configs/visual_catalog.json?t=${Date.now()}`).then(
      (r) => r.json(),
    );
    const placements =
      catalog?.wheel_package?.Hypercar18WideRear?.socket?.placements ?? [];
    return placements.map((p, i) => ({
      name: i === 0 ? "front_arch" : "rear_arch",
      cx: p.cx,
      cy: p.cy,
    }));
  });

  const metrics = await canvas.evaluate((el, zoneList) => {
    const c = /** @type {HTMLCanvasElement} */ (el);
    const ctx = c.getContext("2d");
    if (!ctx) return { error: "no 2d context" };

    const w = c.width;
    const h = c.height;
    const zones = zoneList;
    const zoneStats = zones.map(({ name, cx, cy }) => {
      const px = Math.round(cx * w);
      const py = Math.round(cy * h);
      let wheelPixels = 0;
      let samples = 0;
      for (let dy = -40; dy <= 40; dy += 2) {
        for (let dx = -40; dx <= 40; dx += 2) {
          const x = px + dx;
          const y = py + dy;
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          samples++;
          const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
          if (a > 80 && r + g + b < 650) wheelPixels++;
        }
      }
      return { name, wheelPixels, samples };
    });

    return {
      width: w,
      height: h,
      dataUrl: c.toDataURL("image/png"),
      zoneStats,
    };
  }, zones);

  if (metrics.error) {
    console.error(metrics.error);
    await browser.close();
    process.exit(1);
  }

  const pngPath = path.join(OUT_DIR, "browser_canvas.png");
  const b64 = metrics.dataUrl.replace(/^data:image\/png;base64,/, "");
  fs.writeFileSync(pngPath, Buffer.from(b64, "base64"));

  console.log(`Canvas: ${metrics.width}×${metrics.height}`);
  for (const z of metrics.zoneStats) {
    const pct = ((z.wheelPixels / z.samples) * 100).toFixed(1);
    console.log(`  ${z.name}: ${z.wheelPixels} wheel-ish pixels (${pct}% of samples)`);
  }
  console.log(`Wrote ${path.join(OUT_DIR, "browser_panel.png")}`);
  console.log(`Wrote ${pngPath}`);

  if (consoleErrors.length || failedRequests.length) {
    if (consoleErrors.length) {
      console.log("\nBrowser console:");
      for (const line of consoleErrors) console.log(`  ${line}`);
    }
    if (failedRequests.length) {
      console.log("\nFailed requests:");
      for (const line of [...new Set(failedRequests)]) console.log(`  ${line}`);
    }
  }

  const minPixels = Number(process.env.MIN_WHEEL_PIXELS ?? 30);
  const failed = metrics.zoneStats.filter((z) => z.wheelPixels < minPixels);
  if (failed.length) {
    console.error(`\nFAIL: low wheel visibility in ${failed.map((z) => z.name).join(", ")}`);
    await browser.close();
    process.exit(1);
  }

  await browser.close();
  console.log("\nPASS: browser preview captured");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
