import { defineConfig } from "tsup";

/**
 * The published build: one package, ES modules with type definitions.
 *
 * - `index` holds the shapes; `stack` (the edge cut, the edge fit, one edge's drop places, the float fit), `tiling`
 *   (panes dividing an area) and `popup` (the positioner) are the other entries. All of them are pure: no DOM, no
 *   globals, no dependencies.
 * - One build with code splitting: code two entries share (the shapes) lives in one chunk.
 * - platform "neutral": nothing Node- or browser-specific is assumed.
 */
export default defineConfig({
  entry: {
    index: "index.ts",
    stack: "src/stack/index.ts",
    tiling: "src/tiling/index.ts",
    popup: "src/popup/index.ts",
  },
  splitting: true,
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  platform: "neutral",
});
