#!/usr/bin/env node
// The terminology rule, part of `pnpm check`: public copy uses the glossary's words (the Glossary page in the lab has
// them). It fails on the banned synonyms below in the READMEs, the CHANGELOGs' `## Unreleased` section, and the source
// of the site, the lab and the packages (page copy, labels, doc comments). Released changelog entries are history and
// are never read; tests, stylesheets and generated files aren't copy. Each allowed hit is a rule in ALLOWED with why.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The banned words: `re` matches a line, `use` says what to write instead. US spelling matches the API (`center`). */
export const BANNED = [
  { re: /drag handle/i, use: "grip" },
  { re: /\bcentr(?:e|es|ed|ing)\b/i, use: "center, centered (US spelling, as in the API)" },
  { re: /\bcolour\w*/i, use: "color (US spelling)" },
  { re: /\bbehaviour\w*/i, use: "behavior (US spelling)" },
  { re: /\bneighbour\w*/i, use: "neighbor (US spelling)" },
  { re: /\brecognis\w*/i, use: "recognizer (US spelling, as in the API)" },
  { re: /\blicence\b/i, use: "license (US spelling)" },
  { re: /(?<!\bits )(?<!['’]s )\bown place\b/i, use: '"its own place" ("the item\'s own place"), or "home"' },
  { re: /\b(?:un)?lock(?:ed)? layout\b/i, use: 'the layout lock is "freeze" / "frozen"' },
];

/**
 * Allowed hits. `line` matches the line, `file` (optional) the path; `why` says why it stays. Add a rule only when the
 * word is not copy: an identifier of the public API that a later stage renames, or a quotation.
 */
export const ALLOWED = [
  // `centre` is an exported function of @n-uf/placement (and `centreX` ... on PaneZoneOptions); a rename keeps a deprecated alias.
  { line: /\bcentre\(|\{[^}]*\bcentre\b[^}]*\}|^\s*centre,\s*$|`centre`|export const centre\b/, why: "the exported function `centre` (API name; renamed with a deprecated alias in a later stage)" },
  // The option `centre` of PaneZoneOptions (with `centreX`, `centreY`, `centreMin`): API names, same stage.
  { file: /packages\/placement\/src\/targets\/zones\.ts$/, line: /readonly centre\?|o\.centre\b/, why: "the PaneZoneOptions field `centre` (API name; renamed with a deprecated alias in a later stage)" },
  // The lab's own helper `const centre = (r) => ...` and its zone id "centre" in desk/grip.ts: code, not copy.
  { line: /\bconst centre = /, why: "a lab-local helper named centre (code, not copy)" },
  { file: /apps\/lab\/src\/desk\/grip\.ts$/, line: /"centre"/, why: "the desk lab's internal zone id (code, not copy)" },
  // Case ids are public data (`CaseRow.id`); renaming one breaks the integrators' suites.
  { line: /id: "P5-neighbour/, why: "a case id (public data, API); not renamed" },
  // A CSS class name in the footer, not copy.
  { line: /class="foot-licence"/, why: "a CSS class name" },
  // The default label of zoneLabel for a horizontal toolbar area is the string "centre" (data the app may show).
  { file: /packages\/placement\/src\/toolbar\/index\.ts$/, line: /center: "centre"/, why: "zoneLabel's default label is data (API); renamed in a later stage" },
  { file: /packages\/placement\/src\/targets\/desk\.ts$/, line: /C: "Centre"/, why: "a default drop label is data (API); renamed in a later stage" },
];

/** The first banned word in `line` that no allowed rule covers (for `file`, when given): `{ word, use }`, else null. */
export function scan(line, file = "", banned = BANNED, allowed = ALLOWED) {
  for (const b of banned) {
    const m = b.re.exec(line);
    if (!m) continue;
    if (allowed.some((a) => (!a.file || a.file.test(file)) && a.line.test(line))) continue;
    return { word: m[0], use: b.use };
  }
  return null;
}

/** The lines of a changelog that belong to `## Unreleased` (with their numbers): from that heading to the next `## `. */
export function unreleased(text) {
  const out = [];
  let on = false;
  text.split("\n").forEach((line, i) => {
    if (/^## /.test(line)) on = /^## Unreleased\b/i.test(line);
    if (on) out.push([i + 1, line]);
  });
  return out;
}

/** The lines to read in a file: `[number, text]`, or none for a file that isn't copy. */
export function linesOf(file, text) {
  if (/(^|\/)CHANGELOG\.md$/.test(file)) return unreleased(text);
  return text.split("\n").map((line, i) => [i + 1, line]);
}

/** Whether a tracked file is public copy (README, changelog, or source of the site, the lab and the packages). */
export function isCopy(file) {
  if (/(^|\/)(dist|node_modules|test|tests|__tests__|legacy)\//.test(file)) return false;
  if (/\.(test|spec)\.[mc]?[jt]s$/.test(file)) return false;
  if (/(^|\/)(README|CHANGELOG)\.md$/.test(file)) return /^(packages\/[^/]+|apps\/web)\//.test(file);
  return /^(apps\/[^/]+\/src|packages\/[^/]+\/src)\/.+\.(astro|html|md|mdx|ts|tsx|mjs|js)$/.test(file) || /^packages\/[^/]+\/index\.ts$/.test(file);
}

// Run as the check (imported, it only lends its functions to its test).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const files = execFileSync("git", ["ls-files", "packages", "apps"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((f) => f && isCopy(f));
  const hits = [];
  for (const f of files) {
    for (const [n, line] of linesOf(f, readFileSync(join(root, f), "utf8"))) {
      const h = scan(line, f);
      if (h) hits.push(`${f}:${n}: "${h.word}": write ${h.use}: ${line.trim().slice(0, 110)}`);
    }
  }
  if (hits.length > 0) {
    console.error(`terminology: ${hits.length} hit(s) of a banned synonym (the lab's Glossary page has the words):\n  ${hits.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`terminology: ok (${files.length} files)`);
}
