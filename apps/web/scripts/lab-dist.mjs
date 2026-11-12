// The built /lab/ (dist/lab, written by build-lab.mjs): kept out of search, and whole. Run by the site's build after
// build-lab and the link check (see "build" in package.json), so every build checks it; it needs dist, so it is not one
// of the pre-build tests (scripts/*.test.mjs).
//
//   node --test scripts/lab-dist.mjs                 (WEB_DIST=<dir> to check another build; default: dist)
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(process.env.WEB_DIST ?? join(web, "dist"));
const page = join(dist, "lab/index.html");

test("dist/lab/index.html exists", () => {
  assert.ok(existsSync(page), `${page} is missing: run the site's build`);
});

test("/lab/ is noindex: exactly one robots meta, and it says noindex", () => {
  const html = readFileSync(page, "utf8");
  const robots = [...html.matchAll(/<meta\s+name="robots"\s+content="([^"]*)"/gi)].map((m) => m[1]);
  assert.equal(robots.length, 1, `robots metas: ${robots.length}`);
  assert.match(robots[0], /noindex/);
});

test("/lab/ has no canonical and no og:url", () => {
  const html = readFileSync(page, "utf8");
  assert.doesNotMatch(html, /rel="canonical"/i);
  assert.doesNotMatch(html, /property="og:url"/i);
});

test("every asset /lab/index.html references exists", () => {
  const html = readFileSync(page, "utf8");
  const refs = [...html.matchAll(/(?:src|href)="(\/lab\/[^"#?]+)"/g)].map((m) => m[1]).filter((p) => !p.endsWith("/"));
  assert.ok(refs.length > 0, "no assets referenced: is this the lab's build?");
  for (const ref of refs) assert.ok(existsSync(join(dist, ref)), `missing ${ref}`);
});

test("vercel.json sends X-Robots-Tag: noindex for /lab and everything under it", () => {
  const config = JSON.parse(readFileSync(join(web, "vercel.json"), "utf8"));
  const rule = config.headers?.find((h) => h.headers?.some((x) => x.key === "X-Robots-Tag" && /noindex/.test(x.value)));
  assert.ok(rule, "no X-Robots-Tag noindex rule");
  // Vercel's source is a path-to-regexp pattern; this one is a plain regex group, so it reads the same as a RegExp.
  const re = new RegExp(`^${rule.source}$`);
  for (const p of ["/lab", "/lab/", "/lab/index.html", "/lab/assets/x.js"]) assert.match(p, re, `${p} is not covered`);
  for (const p of ["/", "/labs/", "/window-motion/"]) assert.doesNotMatch(p, re, `${p} must not be covered`);
});
