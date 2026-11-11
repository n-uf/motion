#!/usr/bin/env node
// Captures each page's demo in its default state, light theme, at 2x, for the share images (render-og.py reads them
// from scripts/og-src/). Needs a running site (`pnpm dev`) and playwright-core, which is not a dependency of this app:
//
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core node scripts/capture-og.mjs <the dev server's address>
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const core = process.env.PLAYWRIGHT_CORE;
if (!core) {
  console.error("capture-og: set PLAYWRIGHT_CORE to a playwright-core folder");
  process.exit(1);
}
const { chromium } = require(core);
const base = process.argv[2];
if (!base) {
  console.error("capture-og: pass the dev server's address, e.g. the one `pnpm dev` prints");
  process.exit(1);
}
const out = join(dirname(fileURLToPath(import.meta.url)), "og-src");
mkdirSync(out, { recursive: true });

// page path, the element to capture, how long to let its first motion finish, the file
const SHOTS = [
  ["/", "#demo", 600, "home.png"],
  ["/window-motion/", "#stage .chart", 2600, "window-motion.png"],
  ["/drag-intent/", "#stage", 400, "drag-intent.png"],
  ["/desk-layouts/", "#desk", 400, "desk-layouts.png"],
  ["/toolbar-groups/", "#win", 400, "toolbar-groups.png"],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "light" });
const page = await ctx.newPage();
for (const [path, sel, wait, file] of SHOTS) {
  await page.goto(base + path, { waitUntil: "networkidle" });
  await page.locator(sel).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(wait);
  await page.locator(sel).first().screenshot({ path: join(out, file) });
  console.log("captured", file);
}
await browser.close();
