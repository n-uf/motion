#!/usr/bin/env node
/**
 * Old vs new: the proof that a library change moved nothing it didn't mean to move.
 *
 *   node scripts/old-vs-new.mjs <base> [--head <rev>] [--only docking,placement,motion] [--expect <file>]
 *   pnpm old-vs-new <base> ...
 *
 * Records the public outputs of each package (the `record/*.record.ts` recorders, see docs/old-vs-new.md) at `<base>` and
 * at the head, and diffs them field by field. The head is this checkout as it is (`--head <rev>`: that commit, in a
 * worktree of its own). `<base>` is checked out detached in a temporary worktree under the OS temp dir (with
 * `pnpm install --offline --frozen-lockfile`), this checkout's recorders are copied into it, and it is removed again with
 * a plain `git worktree remove`.
 *
 * Prints, per package and per output kind, `same N / changed M` and the first 2 differences of each kind (summary.txt has
 * every changed case); writes the full diff to `.old-vs-new/<base>..<head>/`. It also counts the cases a side recorded as
 * absent or threw, and shows what changed in the recorders and the fixture files they load between base and head.
 * Exit 0: nothing changed. Exit 1: something did. With `--expect <file>` (a JSON list of `{ package, kind, case, reason }`,
 * each of the first three a glob; `reason` required; a `case` of `*` needs `"all": true`) exit 0 only if every change is
 * covered by an expectation and every expectation matched a change. Exit 2: the run itself failed, or the head recording
 * has an absent or throwing case or lacks an output kind it should have (a recorder that no longer records proves nothing).
 */
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { diffRecordings, expectationProblems, failedCases, matchExpectations, show } from "./old-vs-new-diff.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES = ["docking", "placement", "motion"];
const SHOWN = 2;
/** The output kinds each recorder must write at the head (the table in docs/old-vs-new.md). */
const KINDS = {
  docking: ["contract", "solve", "targets", "drops", "refusals", "stops", "lanes", "dividers", "resize", "case-layout", "case-solve", "after-rest", "landing-frames", "guides", "after", "release-after"],
  placement: ["contract", "fit", "fit-previous", "dividers", "resize", "gaps", "cut", "float-fit", "layout-split", "split-edits", "pane-region", "pane-targets", "order-layout", "order-targets"],
  motion: ["landing-frames", "layout-frames", "animator"],
};
/** The recorders themselves; the files they read (the corpus) are listed in each recording. A change to either between base and head is shown, since it bends what is compared. */
const RECORDERS = ["record", "packages/docking/record", "packages/placement/record", "packages/motion/record"];

function usage(message) {
  if (message) console.error(`old-vs-new: ${message}`);
  console.error("usage: node scripts/old-vs-new.mjs <base> [--head <rev>] [--only docking,placement,motion] [--expect <file>]");
  process.exit(2);
}

function parse(argv) {
  const opts = { base: undefined, head: undefined, only: PACKAGES, expect: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--head" || a === "--only" || a === "--expect") {
      const v = argv[++i];
      if (!v) usage(`${a} needs a value`);
      if (a === "--head") opts.head = v;
      if (a === "--expect") opts.expect = v;
      if (a === "--only") {
        opts.only = v.split(",").filter(Boolean);
        const bad = opts.only.filter((p) => !PACKAGES.includes(p));
        if (bad.length > 0 || opts.only.length === 0) usage(`--only takes ${PACKAGES.join(", ")}`);
      }
    } else if (a.startsWith("-")) usage(`unknown option ${a}`);
    else if (opts.base === undefined) opts.base = a;
    else usage(`unexpected argument ${a}`);
  }
  if (!opts.base) usage();
  return opts;
}

const git = (args, cwd = root) => spawnSync("git", args, { cwd, encoding: "utf8" });
function rev(name) {
  const r = git(["rev-parse", "--verify", "--quiet", `${name}^{commit}`]);
  if (r.status !== 0) usage(`no commit "${name}"`);
  return r.stdout.trim();
}

/** Run a command, resolve with `{ code, output }` (output: stdout and stderr together). */
function run(cmd, args, options) {
  return new Promise((done) => {
    const child = spawn(cmd, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("error", (e) => done({ code: 127, output: String(e) }));
    child.on("close", (code) => done({ code: code ?? 1, output }));
  });
}

/** The recorder files of this checkout (relative paths): `record/` and each package's `record/`. */
function recorderFiles() {
  const out = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(root, p));
    }
  };
  walk(join(root, "record"));
  for (const p of PACKAGES) walk(join(root, "packages", p, "record"));
  return out;
}

/** A temporary detached worktree at `sha`, with the recorders copied in and the dependencies installed. */
async function checkout(parent, label, sha, files, trees) {
  const dir = join(parent, label);
  const added = git(["worktree", "add", "--detach", dir, sha]);
  if (added.status !== 0) throw new Error(`git worktree add ${sha}: ${added.stderr.trim()}`);
  // Known to the cleanup from here on, so whatever fails next, `release` removes it.
  const wt = { dir, copied: [] };
  trees.push(wt);
  for (const f of files) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    copyFileSync(join(root, f), join(dir, f));
    wt.copied.push(f);
  }
  const install = await run("pnpm", ["install", "--offline", "--frozen-lockfile"], { cwd: dir });
  if (install.code !== 0) throw new Error(`pnpm install --offline --frozen-lockfile at ${sha.slice(0, 8)} failed:\n${install.output.split("\n").slice(-15).join("\n")}`);
  return wt;
}

/** Take the copied recorder files out again (a tracked one back to what the commit has), then `git worktree remove`, never forced. */
function release(wt) {
  for (const f of wt.copied) {
    if (git(["ls-files", "--error-unmatch", f], wt.dir).status === 0) git(["checkout", "--", f], wt.dir);
    else rmSync(join(wt.dir, f), { force: true });
  }
  for (const p of PACKAGES) rmdirIfEmpty(join(wt.dir, "packages", p, "record"));
  rmdirIfEmpty(join(wt.dir, "record"));
  const r = git(["worktree", "remove", wt.dir]);
  if (r.status !== 0) console.error(`old-vs-new: could not remove ${wt.dir} (${r.stderr.trim()}); remove it with "git worktree remove ${wt.dir}"`);
}
function rmdirIfEmpty(dir) {
  try {
    rmdirSync(dir);
  } catch {
    // not empty, or not there
  }
}

/** Run one recorder in a checkout; resolve with the recording file, or throw with the tail of its output. */
async function record(wt, pkg, outFile) {
  const cwd = join(wt.dir, "packages", pkg);
  const started = Date.now();
  const r = await run(join(cwd, "node_modules", ".bin", "vitest"), ["run", "--config", join(cwd, "record", "vitest.config.ts")], { cwd, env: { ...process.env, OVN_OUT: outFile } });
  if (r.code !== 0 || !existsSync(outFile)) throw new Error(`the ${pkg} recorder failed (exit ${r.code}):\n${r.output.split("\n").slice(-25).join("\n")}`);
  return { file: outFile, seconds: Math.round((Date.now() - started) / 1000) };
}

async function pool(tasks, size) {
  const results = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, tasks.length) }, async () => {
      while (next < tasks.length) {
        const i = next++;
        results[i] = await tasks[i]().catch((error) => ({ error }));
      }
    }),
  );
  // Every task has finished (none is still running in a worktree about to be removed) before the first failure is thrown.
  const failed = results.find((r) => r.error);
  if (failed) throw failed.error;
  return results;
}

async function main() {
  const opts = parse(process.argv.slice(2));
  const baseSha = rev(opts.base);
  const headSha = opts.head ? rev(opts.head) : rev("HEAD");
  const expectations = opts.expect ? JSON.parse(readFileSync(resolve(opts.expect), "utf8")) : undefined;
  if (expectations && !Array.isArray(expectations)) usage("--expect takes a JSON list");
  if (expectations) {
    const problems = expectationProblems(expectations);
    if (problems.length > 0) usage(`${opts.expect} is not usable:\n  ${problems.join("\n  ")}`);
  }
  const label = `${baseSha.slice(0, 8)}..${headSha.slice(0, 8)}`;
  const outDir = join(root, ".old-vs-new", label);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const files = recorderFiles();
  if (!files.some((f) => f.endsWith(".record.ts"))) throw new Error("no recorders in this checkout (record/ and packages/*/record/)");
  const parent = mkdtempSync(join(tmpdir(), "old-vs-new-"));
  const trees = [];
  const interrupted = () => {
    for (const t of trees) release(t);
    process.exit(130);
  };
  process.on("SIGINT", interrupted);
  process.on("SIGTERM", interrupted);
  const started = Date.now();
  let recordings;
  try {
    // Both checkouts settle before anything is thrown, so the other one is in `trees` and removed too.
    const made = await Promise.allSettled([checkout(parent, "base", baseSha, files, trees), opts.head ? checkout(parent, "head", headSha, files, trees) : { dir: root, copied: [], here: true }]);
    const failed = made.find((r) => r.status === "rejected");
    if (failed) throw failed.reason;
    const [base, head] = made.map((r) => r.value);
    if (head.here && !existsSync(join(root, "node_modules"))) throw new Error("run `pnpm install` in this checkout first");
    const tasks = opts.only.flatMap((pkg) => [
      () => record(base, pkg, join(outDir, "base", `${pkg}.json`)).then((r) => ({ pkg, side: "base", ...r })),
      () => record(head, pkg, join(outDir, "head", `${pkg}.json`)).then((r) => ({ pkg, side: "head", ...r })),
    ]);
    recordings = await pool(tasks, 4);
  } finally {
    for (const t of trees) release(t);
    rmdirIfEmpty(parent);
  }

  // What the screen shows, and what summary.txt keeps (the same, with every changed case on a line of its own).
  const screen = [];
  const file = [];
  const both = (s) => (screen.push(s), file.push(s));
  const changes = [];
  const broken = [];
  both(`old-vs-new ${label}  (base ${baseSha.slice(0, 8)}, head ${headSha.slice(0, 8)}${opts.head ? "" : ", this checkout"})`);
  const read = (side, pkg) => JSON.parse(readFileSync(join(outDir, side, `${pkg}.json`), "utf8"));
  // The corpus files are the ones the recorders read, at either side (the recordings list them).
  const corpus = [...new Set(opts.only.flatMap((pkg) => [...(read("base", pkg).corpus ?? []), ...(read("head", pkg).corpus ?? [])]))].sort();
  const bent = bentFiles(baseSha, opts.head ? headSha : undefined, corpus);
  if (bent) both(`\nRECORDER OR CORPUS CHANGED between base and head (the recorders and the files they read; check it is meant):\n${bent}`);
  const totals = [];
  for (const pkg of opts.only) {
    const base = read("base", pkg);
    const head = read("head", pkg);
    const { kinds } = diffRecordings(base, head);
    for (const [kind, k] of Object.entries(kinds)) totals.push({ package: pkg, kind, cases: k.same + k.changed.length });
    const failed = { base: failedCases(base), head: failedCases(head) };
    const secs = recordings.filter((r) => r.pkg === pkg).map((r) => `${r.side} ${r.seconds}s`).join(", ");
    both(`\n${pkg}  (recorded: ${secs})`);
    const full = {};
    for (const [kind, k] of Object.entries(kinds)) {
      const lost = ["base", "head"].filter((s) => failed[s][kind]).map((s) => `${s} absent ${failed[s][kind].absent}, threw ${failed[s][kind].threw}`);
      both(`  ${kind.padEnd(16)} same ${k.same} / changed ${k.changed.length}${lost.length > 0 ? `   [${lost.join("; ")}]` : ""}`);
      for (const c of k.changed) changes.push({ package: pkg, kind, id: c.id });
      const line = (c, d) => `      ${c.id}  ${d.path || "(whole case)"}  ${show(d.old)} -> ${show(d.new)}${c.diffs.length > 2 ? `  (+${c.diffs.length - 2} more in this case)` : ""}`;
      for (const c of k.changed.slice(0, SHOWN)) for (const d of c.diffs.slice(0, 2)) screen.push(line(c, d));
      for (const c of k.changed) file.push(line(c, c.diffs[0]));
      if (k.changed.length > SHOWN) screen.push(`      … ${k.changed.length - SHOWN} more changed ${kind} cases in summary.txt`);
      if (k.changed.length > 0) full[kind] = k.changed;
    }
    for (const kind of Object.keys(failed.head)) broken.push(`${pkg}: the head recording has ${failed.head[kind].absent} absent and ${failed.head[kind].threw} throwing ${kind} cases`);
    for (const kind of KINDS[pkg].filter((k) => !(k in head.kinds))) broken.push(`${pkg}: the head recording has no ${kind} cases`);
    writeFileSync(join(outDir, `${pkg}.diff.json`), JSON.stringify(full, null, 1));
  }

  let ok = changes.length === 0;
  if (expectations) {
    const m = matchExpectations(expectations, changes, totals);
    both("\nexpected changes");
    for (const c of m.covered) both(`  covered ${c.count} of ${c.of} changed; ${c.inKind.join("+")} cases in kind: ${c.package} / ${c.kind}  [${c.case}${c.all ? ", all" : ""}]: ${c.reason}`);
    for (const e of m.unmatched) both(`  UNMATCHED expectation (it matched no change): ${e.package} / ${e.kind} / ${e.case}: ${e.reason}`);
    for (const c of m.uncovered.slice(0, 20)) both(`  UNEXPECTED change: ${c.package} / ${c.kind} / ${c.id}`);
    if (m.uncovered.length > 20) both(`  … ${m.uncovered.length - 20} more unexpected changes`);
    ok = m.uncovered.length === 0 && m.unmatched.length === 0;
  }
  both(`\n${changes.length === 0 ? "no difference" : `${changes.length} changed case${changes.length === 1 ? "" : "s"}`}`);
  if (broken.length > 0) both(`\nTHE RECORDING IS NOT A PROOF:\n  ${broken.join("\n  ")}`);
  both(`${broken.length > 0 ? "FAILED" : ok ? "OK" : "DIFFERENT"}  (${Math.round((Date.now() - started) / 1000)}s; full diff and both recordings in ${relative(process.cwd(), outDir) || outDir})`);
  writeFileSync(join(outDir, "summary.txt"), `${file.join("\n")}\n`);
  console.log(screen.join("\n"));
  process.exit(broken.length > 0 ? 2 : ok ? 0 : 1);
}

/** `git diff --stat` of the recorders (not files only added) and the corpus files they read, base to head (head: the working tree when not given). */
function bentFiles(baseSha, headSha, corpus) {
  const range = headSha ? [baseSha, headSha] : [baseSha];
  const stat = (filter, paths) => (paths.length === 0 ? "" : git(["diff", "--stat", ...filter, ...range, "--", ...paths]).stdout.trim());
  return [stat(["--diff-filter=MDRT"], RECORDERS), stat([], corpus)].filter(Boolean).join("\n");
}

main().catch((e) => {
  console.error(`old-vs-new: ${e.message}`);
  process.exit(2);
});
