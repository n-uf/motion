import { defineConfig } from "tsup";

/**
 * The published build: ES modules with type definitions for the two entries.
 *
 * - `index` is the core: clock, signals, values, gestures. No DOM, no globals.
 * - `browser` is the adapter onto requestAnimationFrame, performance.now,
 *   setTimeout and matchMedia. It imports only types from the core, so the
 *   two entries never carry two copies of the signal graph.
 * - ES module only: the signal graph has module state (the tracking context
 *   and the batch depth), and an app that loaded an ES and a CommonJS copy
 *   would get two graphs that can't see each other.
 * - platform "neutral": nothing Node- or browser-specific is assumed.
 * - No runtime dependencies to keep external.
 */
export default defineConfig({
  entry: { index: "index.ts", browser: "browser.ts" },
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  platform: "neutral",
});
