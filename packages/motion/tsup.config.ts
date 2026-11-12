import { defineConfig } from "tsup";

/**
 * The published build: one package, ES modules with type definitions.
 *
 * - `index` is the whole core; `clock`, `signals`, `values` and `gestures`
 *   are its four folders on their own. No DOM, no globals in any of them.
 * - `browser` is the adapter onto requestAnimationFrame, performance.now,
 *   setTimeout and matchMedia; it imports only types from the core.
 * - One build with code splitting: code two entries share lives in one
 *   chunk, so importing `@n-uf/motion/signals` and `@n-uf/motion/values`
 *   together still gives one signal graph (scripts/check-dist.mjs checks it).
 * - ES module only: the signal graph has module state (the tracking context
 *   and the batch depth), and an app that loaded an ES and a CommonJS copy
 *   would get two graphs that can't see each other.
 * - platform "neutral": nothing Node- or browser-specific is assumed.
 * - alien-signals, the one dependency, stays external.
 */
export default defineConfig({
  entry: {
    index: "index.ts",
    clock: "src/clock/index.ts",
    signals: "src/signals/index.ts",
    values: "src/values/index.ts",
    gestures: "src/gestures/index.ts",
    testing: "src/testing/index.ts",
    drag: "src/drag/index.ts",
    browser: "browser.ts",
  },
  splitting: true,
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  platform: "neutral",
});
