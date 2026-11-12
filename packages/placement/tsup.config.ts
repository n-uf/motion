import { defineConfig } from "tsup";

/**
 * The published build: one package, ES modules with type definitions.
 *
 * - `index` holds the shapes and the popup positioner; `dock`, `toolbar` and `targets` are the three entries. All
 *   of them are pure: no DOM, no globals, no dependencies.
 * - One build with code splitting: code two entries share (the shapes, the dock's parts that `targets` reads) lives
 *   in one chunk.
 * - platform "neutral": nothing Node- or browser-specific is assumed.
 */
export default defineConfig({
  entry: {
    index: "index.ts",
    dock: "src/dock/index.ts",
    toolbar: "src/toolbar/index.ts",
    targets: "src/targets/index.ts",
  },
  splitting: true,
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  platform: "neutral",
});
