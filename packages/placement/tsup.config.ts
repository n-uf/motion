import { defineConfig } from "tsup";

/**
 * The published build: one package, ES modules with type definitions.
 *
 * - `index` holds the shapes and the popup positioner; `dock`, `toolbar`, `targets`, `panels`, `desk` (presets on
 *   `panels`), `stack`, `scene` (a whole window, on `stack`) and `scene-cases` (the Scene's conformance rows and runner, on `scene`) and `tiling` (panes dividing an area) are the nine entries. All of them are pure: no DOM, no globals, no dependencies.
 * - One build with code splitting: code two entries share (the shapes, the dock's parts that `targets` reads, the
 *   panel stops `targets` hands panel targets to) lives in one chunk.
 * - platform "neutral": nothing Node- or browser-specific is assumed.
 */
export default defineConfig({
  entry: {
    index: "index.ts",
    dock: "src/dock/index.ts",
    toolbar: "src/toolbar/index.ts",
    targets: "src/targets/index.ts",
    panels: "src/panels/index.ts",
    desk: "src/desk/index.ts",
    stack: "src/stack/index.ts",
    scene: "src/scene/index.ts",
    "scene-cases": "src/scene/cases/index.ts",
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
