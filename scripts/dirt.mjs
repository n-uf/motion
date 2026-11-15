#!/usr/bin/env node
// The dirt ratchet, part of `pnpm check`: dependency-cruiser violations per rule, jscpd clones (50 tokens and up) and
// knip findings per kind, each against `dirt-baseline.json`. A count above its ceiling fails; a count below it is
// reported so the ceiling can come down (never up). `--write` stores today's counts as the new ceilings, and refuses
// to raise any of them.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = join(root, "dirt-baseline.json");
const bin = (name) => join(root, "node_modules", ".bin", name);
const run = (cmd, args) => {
  try {
    return execFileSync(bin(cmd), args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    // The tools exit non-zero when they find something: their report is still on stdout.
    if (e.stdout) return e.stdout;
    throw e;
  }
};

const counts = {};

// dependency-cruiser: violations per rule.
const cruise = JSON.parse(
  run("depcruise", ["-c", ".dependency-cruiser.cjs", "-T", "json", "packages/motion/src", "packages/motion/index.ts", "packages/motion/browser.ts", "packages/placement/src", "packages/placement/index.ts", "apps/lab/src", "apps/web/src"]),
);
for (const v of cruise.summary.violations) counts[`depcruise:${v.rule.name}`] = (counts[`depcruise:${v.rule.name}`] ?? 0) + 1;

// jscpd: clones of 50 tokens and up.
const out = join(root, "node_modules", ".cache", "jscpd");
mkdirSync(out, { recursive: true });
run("jscpd", ["-c", ".jscpd.json", "."]);
const dup = JSON.parse(readFileSync(join(out, "jscpd-report.json"), "utf8"));
counts["jscpd:clones"] = dup.statistics.total.clones;

// knip: findings per kind.
const k = JSON.parse(run("knip", ["--no-progress", "--reporter", "json"]) || "{}");
for (const issue of k.issues ?? []) {
  for (const [kind, list] of Object.entries(issue)) {
    if (!Array.isArray(list) || list.length === 0) continue;
    counts[`knip:${kind}`] = (counts[`knip:${kind}`] ?? 0) + list.length;
  }
}
for (const f of k.files ?? []) counts["knip:files"] = (counts["knip:files"] ?? 0) + (f ? 1 : 0);

const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : {};
const keys = [...new Set([...Object.keys(baseline), ...Object.keys(counts)])].sort();
const over = [];
const under = [];
for (const key of keys) {
  const now = counts[key] ?? 0;
  const ceiling = baseline[key] ?? 0;
  if (now > ceiling) over.push(`${key}: ${now} > ${ceiling}`);
  else if (now < ceiling) under.push(`${key}: ${now} < ${ceiling}`);
}

if (process.argv.includes("--write")) {
  // The first baseline (none yet) takes today's counts; after that a ceiling never rises.
  if (over.length > 0 && Object.keys(baseline).length > 0) {
    console.error(`dirt: refusing to raise a ceiling:\n  ${over.join("\n  ")}`);
    process.exit(1);
  }
  const next = Object.fromEntries(keys.filter((key) => (counts[key] ?? 0) > 0).map((key) => [key, counts[key]]));
  writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`dirt: ceilings written: ${JSON.stringify(next)}`);
  process.exit(0);
}
if (over.length > 0) {
  console.error(`dirt: above the ceiling (dirt-baseline.json):\n  ${over.join("\n  ")}`);
  process.exit(1);
}
console.log(`dirt: ok ${JSON.stringify(counts)}${under.length ? `; lower the ceilings (node scripts/dirt.mjs --write): ${under.join(", ")}` : ""}`);
