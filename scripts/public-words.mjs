#!/usr/bin/env node
// The public-repo rule, part of `pnpm check`: no names from the private list and no process words in `packages/` or
// `apps/`. The names are kept only as SHA-256 hashes: each line is split into words (letters and digits), and each
// word, and each run of two or three words joined by "-" or " ", is hashed lower-cased (and once as written, for the
// names that count only in one case) and looked up. Each allowed hit is a whole phrase below, with why it stays.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The hashes of the names, lower-cased. */
export const LOWER = new Set([
  "40108bfe5126f405a867a4c0bd0d57d3d2b589e46fd2fd45ccc2227b072dfb35",
  "5a43c676311a072ed45e97ca4427820f36fd1deb275ca7bfacc56bf07670f2a3",
  "46d6f1153934e2343dff04f4e5611e15baed047f7c81de3e3bef5bba4848c8d5",
  "3d001075a761693f70117f9aa0872563350a91a435e1016b6be8075bf9078fc9",
  "f0bde7b485fc37384f900f55ee5803900d9aa071db5844c9ca669759bd120a00",
  "919a11f948095f31d9220d1d6f1e4fda01b2826094c6d3c711cc8c6c696c34e0",
  "c8ec03ed9ce7765f29aa574e50412bd72cf0a36864fe798712c6ef2b398bf283",
  "6ea219c96a04f671dc71c6ac8b039fdb076592f489c7be5a1a1e717ea3d9b3cc",
  "18f1255e3f7344a3ba6b47c30c585c48baf1b1d0ace3872b38658de130772f6e",
  "7f94c893f68d0e86bfc393385fb9e24a7d95378a76426bc67196c3885adf1625",
  "b68919aff001d8366249403a2544fba2d833084f1ad22839b6310aadacb6a138",
  "e17db7f77c8491cbe0ada135c34bfe16d8150f73de99781a9d31b332666733bb",
  "fd89a2f18bdb5c049e7aaeed3c8c90ed518542701a907facbcff950abab80c18",
  "2bffe03e18a235b7678f1e5bfb07880e7575f7665f329eb2635641b2f932f902",
  "f2f76cf8c340a80541fc3654980a999c87f4cb59a8596afd31cb463eac796eab",
]);
/** The hashes of the names that count only as written (an ordinary word in another case). */
export const EXACT = new Set(["0905f7f59021c2a85f1c0a50d7c252a3e6c6ee006514f01d7264097f1fd4337a"]);
/** Process words, which aren't private: plain patterns. */
const PROCESS = /[Rr]evision \d|\b[Oo]perator\b|\bRev \d/;
const ALLOWED = [
  // A TextMate scope name in the site's code theme.
  "keyword.operator",
  // The title of a section of @preact/signals-core's README, quoted in the bench notes.
  "Creating Your Own Surface API",
];

const sha = (s) => createHash("sha256").update(s).digest("hex");

/** The first word or run of words in `line` whose hash is listed (or a process word), or null. */
export function scan(line, lower = LOWER, exact = EXACT) {
  let rest = line;
  for (const a of ALLOWED) rest = rest.split(a).join("");
  const p = PROCESS.exec(rest);
  if (p) return p[0];
  const words = rest.match(/[A-Za-z0-9]+/g) ?? [];
  for (let i = 0; i < words.length; i++)
    for (let n = 1; n <= 3 && i + n <= words.length; n++) {
      const run = words.slice(i, i + n);
      for (const joined of n === 1 ? [run[0]] : [run.join("-"), run.join(" ")]) {
        if (lower.has(sha(joined.toLowerCase())) || exact.has(sha(joined))) return joined;
      }
    }
  return null;
}

// Run as the check (imported, it only lends `scan` to its test).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf)$/i;
  const files = execFileSync("git", ["ls-files", "packages", "apps"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((f) => f && !BINARY.test(f) && !/(^|\/)(dist|node_modules)\//.test(f));
  const hits = [];
  for (const f of files) {
    const lines = readFileSync(join(root, f), "utf8").split("\n");
    lines.forEach((line, i) => {
      const m = scan(line);
      if (m) hits.push(`${f}:${i + 1}: ${m}: ${line.trim().slice(0, 120)}`);
    });
  }
  if (hits.length > 0) {
    console.error(`public words: ${hits.length} hit(s) of a listed name or a process word:\n  ${hits.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`public words: ok (${files.length} files)`);
}
