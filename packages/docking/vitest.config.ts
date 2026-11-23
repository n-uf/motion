import { configDefaults, defineConfig } from "vitest/config";

/**
 * The heavy sweep files: each takes 20 s or more on an idle machine (the ones that run thousands of layouts, drags or
 * held frames; measured as the biggest file totals of a full run). `pnpm test` skips them and `pnpm test:sweep` runs
 * only them, so the quick run stays quick; `pnpm check` and CI run both. A run with neither (plain `vitest run`) takes
 * everything. This list is the one place that says which files are sweeps.
 */
const SWEEP_FILES = [
  "test/bar-zones.test.ts",
  "test/drop-grab.test.ts",
  "test/grab-fold-sweep.test.ts",
  "test/grab-function.test.ts",
  "test/keep-clear-scope.test.ts",
  "test/kit-edges.test.ts",
  "test/lanes-corner.test.ts",
  "test/lanes-held-commit.test.ts",
  "test/lanes-landing.test.ts",
  "test/lanes-stepdown-seeded.test.ts",
  "test/near-guides.test.ts",
  "test/rail-end-reach.test.ts",
  "test/refusal-pick.test.ts",
  "test/resize-commit.test.ts",
  "test/sweep.test.ts",
  "test/target-model.test.ts",
];

// DOCKING_RUN=sweep runs only the sweep files, DOCKING_RUN=rest everything else, unset everything.
const run = process.env.DOCKING_RUN;

export default defineConfig({
  test: {
    environment: "node",
    include: run === "sweep" ? SWEEP_FILES : ["test/**/*.test.ts"],
    exclude: run === "rest" ? [...configDefaults.exclude, ...SWEEP_FILES] : configDefaults.exclude,
    // The layout sweeps run thousands of layouts; a loaded machine makes them several times slower than an idle one.
    // 180 s keeps a heavy file from failing on load alone (a hang still fails, only later).
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
