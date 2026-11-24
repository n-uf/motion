#!/usr/bin/env node
// Changelog fragments, part of `pnpm check` (`check`) and of `pnpm version:bump` (`join`). A change adds one small file,
// `packages/<pkg>/changes/<yyyy-mm-dd>-<slug>.md`, holding exactly the markdown that goes under the changelog's
// `## Unreleased` heading: bullets, optionally with a `### Heading` line first for a grouped entry. Parallel branches
// then never edit the same lines. A release joins them, in name order (so by date, then slug).
//
//   node scripts/changelog.mjs check              fails on an empty fragment, one that starts with neither a bullet
//                                                 nor a `###` line, or a malformed name
//   node scripts/changelog.mjs preview [version]  prints what `join` would write per package (the version defaults to
//                                                 the next release's, as `pnpm release:next-version` prints it)
//   node scripts/changelog.mjs join [version]     puts the existing `## Unreleased` body, then each fragment, under
//                                                 `## <version>` where `## Unreleased` was, and deletes the fragments;
//                                                 ungrouped bullets come first, then the `###` groups in order. The
//                                                 version defaults to packages/motion's and must be every package.json's.
//
// `--root <dir>` runs it on another checkout (the tests use it).
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** A fragment's name: a date, then a lower-case slug of words joined by "-". */
export const NAME = /^(\d{4})-(\d{2})-(\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const UNRELEASED = /^## Unreleased\b/i;

/** Whether `name` is a well-formed fragment name (a real calendar date included). */
export function validName(name) {
  const m = NAME.exec(name);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** What is wrong with a fragment, or null: a malformed name, an empty body, a body that starts with neither a bullet nor `###`. */
export function problem(name, text) {
  if (!validName(name)) return "the name must be <yyyy-mm-dd>-<slug>.md (a real date; the slug lower-case words joined by -)";
  const first = text.split("\n").find((line) => line.trim() !== "");
  if (first === undefined) return "empty";
  if (!/^(- |### )/.test(first)) return "must start with a bullet (`- `) or a `### ` heading line";
  if (/^## /m.test(text)) return "must not hold a `## ` heading (the join writes that)";
  return null;
}

/** The package folders (under `root/packages`) that have a CHANGELOG.md, sorted. */
export function packagesOf(root) {
  const dir = join(root, "packages");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, "CHANGELOG.md")))
    .map((e) => e.name)
    .sort();
}

/** A package's fragments as `{ name, text }`, in name order. */
export function fragmentsOf(root, pkg) {
  const dir = join(root, "packages", pkg, "changes");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .sort()
    .map((name) => ({ name, text: readFileSync(join(dir, name), "utf8") }));
}

/** Whether `next` continues the bullet list that `prev` ends with (so no blank line between them). */
const continuesList = (prev, next) => /^- /.test(next) && /^(- |\s+\S)/.test(prev.split("\n").at(-1) ?? "");

/**
 * The changelog `text` with a `## <version>` section where `## Unreleased` was (else before the first released
 * version, else at the end): the old Unreleased body, then the fragments' texts. Null when there is nothing to join.
 * Throws when `## <version>` is already there.
 */
export function joinInto(text, fragments, version) {
  const lines = text.split("\n");
  const heading = new RegExp(`^## v?${version.replace(/\./g, "\\.")}(\\s|$)`);
  if (lines.some((l) => heading.test(l))) throw new Error(`## ${version} already exists`);
  const at = lines.findIndex((l) => UNRELEASED.test(l));
  let end = at;
  if (at >= 0) {
    end = lines.findIndex((l, i) => i > at && /^## /.test(l));
    if (end < 0) end = lines.length;
  }
  const body = at >= 0 ? lines.slice(at + 1, end).join("\n").trim() : "";
  // Ungrouped text first (the old body's top-level bullets, then the bullet fragments), then the `###` groups in
  // order (the old body's, then the grouped fragments'): a bullet after a group would otherwise sit inside it.
  const loose = [];
  const groups = [];
  for (const text of [body, ...fragments.map((f) => f.text.trim())]) {
    const cut = text.search(/^### /m);
    const head = (cut < 0 ? text : text.slice(0, cut)).trim();
    if (head !== "") loose.push(head);
    if (cut >= 0) groups.push(...text.slice(cut).split(/\n(?=### )/).map((g) => g.trim()));
  }
  if (loose.length === 0 && groups.length === 0) return null;
  let section = loose.length > 0 ? loose[0] : "";
  for (const p of loose.slice(1)) section += (continuesList(section, p) ? "\n" : "\n\n") + p;
  for (const g of groups) section += (section === "" ? "" : "\n\n") + g;
  if (at >= 0) {
    const tail = lines.slice(end);
    return [...lines.slice(0, at), `## ${version}`, "", ...section.split("\n"), ...(tail.length > 0 ? ["", ...tail] : [""])].join("\n");
  }
  const first = lines.findIndex((l) => /^## /.test(l));
  if (first >= 0) return [...lines.slice(0, first), `## ${version}`, "", ...section.split("\n"), "", ...lines.slice(first)].join("\n");
  return `${text.replace(/\n*$/, "\n")}\n## ${version}\n\n${section}\n`;
}

/** Every fragment problem under `root`: `["packages/x/changes/name.md: why", ...]`. */
export function checkAll(root) {
  const out = [];
  for (const pkg of packagesOf(root))
    for (const { name, text } of fragmentsOf(root, pkg)) {
      const why = problem(name, text);
      if (why) out.push(`packages/${pkg}/changes/${name}: ${why}`);
    }
  return out;
}

/** The planned joins: `[{ pkg, next, fragments }]` for the packages that have something to join. Throws when a version exists. */
export function plan(root, version) {
  if (!VERSION.test(version)) throw new Error(`"${version}" is not a YY.M.R version`);
  const bad = checkAll(root);
  if (bad.length > 0) throw new Error(`fragments are malformed:\n  ${bad.join("\n  ")}`);
  const out = [];
  for (const pkg of packagesOf(root)) {
    const fragments = fragmentsOf(root, pkg);
    let next;
    try {
      next = joinInto(readFileSync(join(root, "packages", pkg, "CHANGELOG.md"), "utf8"), fragments, version);
    } catch (e) {
      throw new Error(`packages/${pkg}/CHANGELOG.md: ${e.message}`, { cause: e });
    }
    if (next !== null) out.push({ pkg, next, fragments });
  }
  return out;
}

/** Throws unless every package's package.json (with a CHANGELOG) says `version`: a join is for a bumped release. */
export function assertBumped(root, version) {
  const off = [];
  for (const pkg of packagesOf(root)) {
    const path = join(root, "packages", pkg, "package.json");
    const have = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")).version : undefined;
    if (have !== version) off.push(`packages/${pkg}/package.json is ${have ?? "missing"}`);
  }
  if (off.length > 0) throw new Error(`cannot join ${version}: ${off.join(", ")} (run the bump first, or give the bumped version)`);
}

/** The next release's version, as `release:next-version` computes it (motion's calendar bump, dry run). */
export function nextVersion(root) {
  const dir = join(root, "packages", "motion");
  return execFileSync("node", [join(dir, "scripts", "calendar-version-bump.mjs"), "--dry-run"], { cwd: dir, encoding: "utf8" }).trim();
}

/** Writes the joins and deletes the fragments; nothing is written when any package refuses. */
export function apply(root, version) {
  assertBumped(root, version);
  const planned = plan(root, version);
  for (const { pkg, next, fragments } of planned) {
    writeFileSync(join(root, "packages", pkg, "CHANGELOG.md"), next);
    for (const f of fragments) rmSync(join(root, "packages", pkg, "changes", f.name));
    if (fragments.length > 0 && readdirSync(join(root, "packages", pkg, "changes")).length === 0) rmSync(join(root, "packages", pkg, "changes"), { recursive: true });
  }
  return planned;
}

/** The section a join would write for `pkg`, for `preview`. */
function sectionOf(next, version) {
  const lines = next.split("\n");
  const at = lines.findIndex((l) => l.startsWith(`## ${version}`));
  const end = lines.findIndex((l, i) => i > at && /^## /.test(l));
  return lines.slice(at, end < 0 ? lines.length : end).join("\n").trimEnd();
}

// Run as the script (imported, it only lends its functions to its test).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const r = args.indexOf("--root");
  const root = r >= 0 ? args.splice(r, 2)[1] : join(dirname(fileURLToPath(import.meta.url)), "..");
  const [command, given] = args;
  // `join` takes the bumped version (motion's package.json by default, which the bump has just set); `preview` the
  // next release's, as `release:next-version` computes it.
  const versionOf = () => given ?? (command === "preview" ? nextVersion(root) : JSON.parse(readFileSync(join(root, "packages", "motion", "package.json"), "utf8")).version);
  try {
    if (command === "check") {
      const bad = checkAll(root);
      if (bad.length > 0) {
        console.error(`changelog: ${bad.length} malformed fragment(s):\n  ${bad.join("\n  ")}`);
        process.exit(1);
      }
      const n = packagesOf(root).reduce((sum, pkg) => sum + fragmentsOf(root, pkg).length, 0);
      console.log(`changelog: ok (${n} fragment${n === 1 ? "" : "s"})`);
    } else if (command === "preview" || command === "join") {
      const version = versionOf();
      const planned = command === "join" ? apply(root, version) : plan(root, version);
      for (const { pkg, next, fragments } of planned) {
        if (command === "preview") console.log(`--- packages/${pkg}/CHANGELOG.md (${fragments.length} fragment${fragments.length === 1 ? "" : "s"})\n${sectionOf(next, version)}\n`);
        else console.log(`changelog: packages/${pkg}: ## ${version} (${fragments.length} fragment${fragments.length === 1 ? "" : "s"} joined)`);
      }
      if (planned.length === 0) console.log("changelog: nothing to join");
    } else {
      console.error("usage: node scripts/changelog.mjs check | preview [version] | join [version]   (--root <dir>)");
      process.exit(2);
    }
  } catch (e) {
    console.error(`changelog: ${e.message}`);
    process.exit(1);
  }
}
