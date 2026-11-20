import { defineConfig } from "tsup";

/**
 * The published build: one package, ES modules with type definitions.
 *
 * - `index` is the docking model; `testing` holds its conformance rows, landing rows and their runners, on `index`.
 *   Both are pure: no DOM, no globals.
 * - `@n-uf/placement` (the general layer the model is built on) is the one dependency and stays external. The testing
 *   entry's type-level check reads `@n-uf/motion/drag`'s types only: external too, and erased from the JavaScript.
 * - platform "neutral": nothing Node- or browser-specific is assumed.
 */
export default defineConfig({
  entry: {
    index: "src/index.ts",
    testing: "src/testing/index.ts",
  },
  external: ["@n-uf/placement", "@n-uf/motion"],
  splitting: true,
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  platform: "neutral",
});
