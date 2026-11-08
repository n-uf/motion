// Size and stack depth of each signals option, as an app would ship it.
// `pnpm bench` prints this after the timings.
//
// - Size: the same four primitives (signal, computed, effect, batch) bundled,
//   minified, then gzip- and brotli-compressed.
// - Depth: the longest chain of computeds (each reading the one before) whose
//   first read doesn't overflow the stack. The first read of a chain recurses
//   through every level in any of these libraries; later updates recurse less.

import { build } from "esbuild";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const libs = [
  {
    name: "vusyk",
    entry: `export { signal, computed, effect, batch } from "./src/signals/index.ts";`,
    chain: (lib, depth) => {
      const source = lib.signal(0);
      let last = source;
      for (let i = 0; i < depth; i++) {
        const previous = last;
        last = lib.computed(() => previous.value + 1);
      }
      return () => last.value;
    },
  },
  {
    name: "hand-written",
    entry: `export { signal, computed, effect, batch } from "./bench/handwritten-signals.ts";`,
    chain: (lib, depth) => {
      const source = lib.signal(0);
      let last = source;
      for (let i = 0; i < depth; i++) {
        const previous = last;
        last = lib.computed(() => previous.value + 1);
      }
      return () => last.value;
    },
  },
  {
    name: "alien-signals",
    entry: `export { signal, computed, effect, startBatch, endBatch } from "alien-signals";`,
    chain: (lib, depth) => {
      const source = lib.signal(0);
      let last = source;
      for (let i = 0; i < depth; i++) {
        const previous = last;
        last = lib.computed(() => previous() + 1);
      }
      return () => last();
    },
  },
  {
    name: "preact-signals-core",
    entry: `export { signal, computed, effect, batch } from "@preact/signals-core";`,
    chain: (lib, depth) => {
      const source = lib.signal(0);
      let last = source;
      for (let i = 0; i < depth; i++) {
        const previous = last;
        last = lib.computed(() => previous.value + 1);
      }
      return () => last.value;
    },
  },
];

function survives(lib, make, depth) {
  try {
    return make(lib, depth)() === depth;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

/** Largest depth (to the nearest 250) whose first read works. */
function maxDepth(lib, make) {
  let low = 0;
  let high = 250;
  while (high <= 64000 && survives(lib, make, high)) {
    low = high;
    high *= 2;
  }
  while (high - low > 250) {
    const middle = Math.round((low + high) / 2 / 250) * 250;
    if (survives(lib, make, middle)) low = middle;
    else high = middle;
  }
  return low;
}

const rows = [];
for (const lib of libs) {
  const result = await build({
    stdin: { contents: lib.entry, resolveDir: root, loader: "ts" },
    bundle: true,
    minify: true,
    format: "esm",
    platform: "neutral",
    write: false,
  });
  const code = result.outputFiles[0].contents;
  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  rows.push({
    name: lib.name,
    minified: code.length,
    gzip: gzipSync(code, { level: 9 }).length,
    brotli: brotliCompressSync(code).length,
    depth: maxDepth(module, lib.chain),
  });
}

console.log("\nsignals: bundle size (bytes) and deepest chain a first read survives");
console.log("name                 minified   gzip  brotli   depth");
for (const row of rows) {
  console.log(
    `${row.name.padEnd(20)} ${String(row.minified).padStart(8)} ${String(row.gzip).padStart(6)} ${String(row.brotli).padStart(7)} ${String(row.depth).padStart(7)}`,
  );
}
