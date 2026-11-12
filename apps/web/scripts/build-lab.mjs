#!/usr/bin/env node
// Builds the lab (apps/lab, the one-app shell) into the site at /lab/: the lab's public build (`vite build --mode
// public`), with base /lab/ and its own entry and assets, written to dist/lab. Runs after `astro build` (see "build" in
// package.json), from the same commit as the site. Its routes live in the hash (/lab/#/placement/desk), so it needs no
// server rewrites.
//
// Search: every lab page must carry <meta name="robots" content="noindex"> (the lab's index.html has it; a lab that
// predates it gets it here) and nothing else from the head contract: no canonical, no og:url. vercel.json adds
// X-Robots-Tag: noindex for /lab/(.*), and robots.txt does not block it, so crawlers can see the noindex. The site's
// pages neither import nor preload anything of it; the top bar's "Lab" pill and the footer's "Lab" are the only links.
//
// The build fails when a lab page lacks the noindex, or when the bundle names a local development address.
//
//   node scripts/build-lab.mjs [dist-dir]              (default: dist)
//   LAB_DIR=/path/to/apps/lab node scripts/build-lab.mjs   build another checkout's lab (local checks only)
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(process.argv[2] ?? join(web, "dist"));
const lab = resolve(process.env.LAB_DIR ?? join(web, "../lab"));
const out = join(dist, "lab");
if (!existsSync(dist)) {
  console.error(`build-lab: ${dist} does not exist; run astro build first`);
  process.exit(1);
}

execFileSync("pnpm", ["--dir", lab, "exec", "vite", "build", "--mode", "public", "--base", "/lab/", "--outDir", out, "--emptyOutDir", "--logLevel", "warn"], { stdio: "inherit" });

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else yield p;
  }
}
const NOINDEX = '<meta name="robots" content="noindex" />';
const problems = [];
let pages = 0;
for (const file of files(out)) {
  const text = readFileSync(file, "utf8");
  if (/localhost|127\.0\.0\.1|:3060\b|:3070\b/.test(text)) problems.push(`${file.slice(out.length)} names a local development address`);
  if (!file.endsWith(".html")) continue;
  pages++;
  const hasNoindex = (h) => /<meta\s+name="robots"\s+content="noindex/i.test(h);
  let html = text;
  if (!hasNoindex(html)) html = html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}\n    ${NOINDEX}`);
  // Whatever the page's head looks like, a lab page without the noindex fails the build.
  if (!hasNoindex(html)) problems.push(`${file.slice(out.length)} has no noindex robots meta`);
  if (/rel="canonical"|property="og:url"/i.test(html)) problems.push(`${file.slice(out.length)} has a canonical or og:url`);
  if (html !== text) writeFileSync(file, html);
}
if (problems.length) {
  console.error(`build-lab: ${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log(`build-lab: ok (${pages} page(s) under /lab/, noindex)`);
