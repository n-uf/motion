// Signals timing: bench/cases.ts on motion, alien-signals and
// @preact/signals-core. Each library gets its own bundle of the cases (so
// no function is shared between libraries) and its own Node process (so no
// JIT state or heap is shared either). Prints median and best µs per
// operation; `pnpm bench` runs this and then bench/compare.mjs.

import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const adapters = {
  motion: `
    import * as s from "./src/signals/index.ts";
    export const lib = {
      signal: (v) => { const x = s.signal(v); return { get: () => x.value, set: (n) => { x.value = n; } }; },
      computed: (fn) => { const c = s.computed(fn); return { get: () => c.value }; },
      effect: (fn) => s.effect(fn),
    };`,
  "hand-written": `
    import * as s from "./bench/handwritten-signals.ts";
    export const lib = {
      signal: (v) => { const x = s.signal(v); return { get: () => x.value, set: (n) => { x.value = n; } }; },
      computed: (fn) => { const c = s.computed(fn); return { get: () => c.value }; },
      effect: (fn) => s.effect(fn),
    };`,
  "alien-signals": `
    import * as s from "alien-signals";
    export const lib = {
      signal: (v) => { const x = s.signal(v); return { get: () => x(), set: (n) => x(n) }; },
      computed: (fn) => { const c = s.computed(fn); return { get: () => c() }; },
      effect: (fn) => s.effect(fn),
    };`,
  "preact-signals-core": `
    import * as s from "@preact/signals-core";
    export const lib = {
      signal: (v) => { const x = s.signal(v); return { get: () => x.value, set: (n) => { x.value = n; } }; },
      computed: (fn) => { const c = s.computed(fn); return { get: () => c.value }; },
      effect: (fn) => s.effect(fn),
    };`,
};

const results = {};
for (const [name, adapter] of Object.entries(adapters)) {
  const bundle = await build({
    stdin: {
      contents: `${adapter}\nimport { run } from "./bench/cases.ts";\nconsole.log(JSON.stringify(run(lib)));`,
      resolveDir: root,
      loader: "js",
    },
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
  });
  const child = spawnSync(process.execPath, ["--input-type=module", "-"], {
    input: bundle.outputFiles[0].text,
    encoding: "utf8",
    maxBuffer: 1 << 24,
  });
  if (child.status !== 0) {
    console.error(`${name} failed:\n${child.stderr}`);
    process.exit(1);
  }
  results[name] = JSON.parse(child.stdout.trim().split("\n").at(-1));
}

const names = Object.keys(results);
const cases = results[names[0]].map((r) => r.name);
const fmt = (us) => (us >= 100 ? us.toFixed(0) : us.toFixed(1));
console.log(`\nsignals timing, µs per operation: median (best), node ${process.version}`);
for (let i = 0; i < cases.length; i++) {
  console.log(`\n${cases[i]}`);
  const fastest = Math.min(...names.map((n) => results[n][i].medianUs));
  for (const n of names) {
    const r = results[n][i];
    const ratio = r.medianUs / fastest;
    console.log(
      `  ${n.padEnd(20)} ${fmt(r.medianUs).padStart(8)} (${fmt(r.bestUs)})  ${ratio === 1 ? "fastest" : `${ratio.toFixed(2)}x`}  n=${r.samples}`,
    );
  }
}
