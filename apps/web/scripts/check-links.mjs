#!/usr/bin/env node
// Fails the build when a built page links to an internal address that has no built file.
// Why: a live page must never link to a draft, and production builds render no page for a draft, so such a link
// shows up here as a target without a file. Runs after `astro build` (see "build" in package.json).
//
//   node scripts/check-links.mjs [dist-dir]     (default: dist)
//
// Walks every .html file in the folder, collects every internal href (starting with "/", not "//", or an absolute link
// to this site's own host, https://motion.n-uf.com/..., which counts as the same path; "#..." and links to other
// hosts are ignored; ?query and #hash are cut off) and checks that a file exists for it:
// /x/ -> /x/index.html, /x -> /x.html or /x/index.html, /file.ext -> that file.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve, relative, extname } from "node:path";

const SITE_HOST = "motion.n-uf.com"; // keep equal to `site` in astro.config.mjs
const ownHost = new RegExp(`^(?:https?:)?//${SITE_HOST.replace(/\./g, "\\.")}(?=[/?#]|$)`, "i");

/** The site path of an internal href ("/x/", "/x?a#b"), or null if the href is an external link or not a path. */
function internalPath(href) {
  const own = href.match(ownHost);
  if (own) {
    const rest = href.slice(own[0].length);
    return rest.startsWith("/") ? rest : `/${rest}`; // "https://host" and "https://host?x" are the home page
  }
  return href.startsWith("/") && !href.startsWith("//") ? href : null;
}

const dist = resolve(process.argv[2] ?? "dist");
if (!existsSync(dist)) {
  console.error(`check-links: ${dist} does not exist; run astro build first`);
  process.exit(1);
}

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* htmlFiles(p);
    else if (name.endsWith(".html")) yield p;
  }
}

function exists(href) {
  let path;
  try { path = decodeURIComponent(href.split(/[?#]/)[0]); } catch { path = href.split(/[?#]/)[0]; }
  const file = join(dist, path);
  if (path.endsWith("/")) return existsSync(join(file, "index.html"));
  if (extname(path)) return existsSync(file);
  return existsSync(`${file}.html`) || existsSync(join(file, "index.html"));
}

const missing = [];
let pages = 0, checked = 0;
for (const file of htmlFiles(dist)) {
  pages++;
  const page = "/" + relative(dist, file).replace(/index\.html$/, "").replace(/\\/g, "/");
  const seen = new Set();
  const html = readFileSync(file, "utf8");
  // the links in the page, and the share images its meta tags name (og:image, twitter:image): each must be a built file
  const targets = [
    ...[...html.matchAll(/<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((m) => ["", m[1] ?? m[2]]),
    ...[...html.matchAll(/<meta\b[^>]*?(?:property|name)\s*=\s*["'](?:og|twitter):image["'][^>]*?\scontent\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((m) => ["image ", m[1] ?? m[2]]),
  ];
  for (const [kind, raw] of targets) {
    const href = internalPath(raw.replace(/&amp;/g, "&").trim());
    if (href === null || seen.has(kind + href)) continue;
    seen.add(kind + href);
    checked++;
    if (!exists(href)) missing.push(`${page} -> ${kind}${href}`);
  }
}

if (missing.length > 0) {
  console.error(`check-links: ${missing.length} internal link(s) point to no built page (a live page linking to a draft?):`);
  for (const line of missing) console.error(`  ${line}`);
  process.exit(1);
}
console.log(`check-links: ok (${pages} pages, ${checked} internal links)`);
