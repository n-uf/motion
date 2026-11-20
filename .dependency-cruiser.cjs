/**
 * Layering rules (dependency-cruiser), run by `scripts/dirt.mjs` as part of `pnpm check`. A violation count above
 * `dirt-baseline.json` fails the check; the baseline only ever goes down.
 */
module.exports = {
  forbidden: [
    { name: "no-circular", severity: "error", from: {}, to: { circular: true } },
    {
      name: "placement-not-motion",
      severity: "error",
      from: { path: "^packages/placement/(src|index)" },
      to: { path: "(^packages/motion|@n-uf/motion)" },
    },
    {
      name: "motion-not-placement",
      severity: "error",
      from: { path: "^packages/motion/(src|index|browser)" },
      to: { path: "(^packages/placement|@n-uf/placement)" },
    },
    {
      name: "motion-not-docking",
      severity: "error",
      from: { path: "^packages/motion/(src|index|browser)" },
      to: { path: "(^packages/docking|@n-uf/docking)" },
    },
    {
      // The general layer never reaches up into the docking model built on it.
      name: "placement-not-docking",
      severity: "error",
      from: { path: "^packages/placement/(src|index)" },
      to: { path: "(^packages/docking|@n-uf/docking)" },
    },
    {
      // Docking never imports motion. The one exception is the testing entry's landing check, a type-only import.
      name: "docking-not-motion",
      severity: "error",
      from: { path: "^packages/docking/src/", pathNot: "^packages/docking/src/testing/" },
      to: { path: "(^packages/motion|@n-uf/motion)" },
    },
    {
      name: "docking-testing-motion-types-only",
      severity: "error",
      from: { path: "^packages/docking/src/testing/" },
      to: { path: "(^packages/motion|@n-uf/motion)", dependencyTypesNot: ["type-only"] },
    },
    {
      // Docking builds on placement's published entries only.
      name: "docking-placement-entries-only",
      severity: "error",
      from: { path: "^packages/docking/src/" },
      to: { path: "^packages/placement/", pathNot: "^packages/placement/(index[.]ts|src/[^/]+/index[.]ts)$" },
    },
    { name: "packages-not-apps", severity: "error", from: { path: "^packages" }, to: { path: "^apps" } },
    {
      name: "apps-public-entries-only",
      severity: "error",
      from: { path: "^apps" },
      to: { path: "^packages/[^/]+/src/", pathNot: "/index[.]ts$" },
    },
    {
      name: "cross-folder-via-index",
      severity: "error",
      from: { path: "^packages/([^/]+)/src/([^/]+)/" },
      to: { path: "^packages/$1/src/[^/]+/", pathNot: ["^packages/$1/src/$2/", "/index[.]ts$"] },
    },
    {
      // The general layer never imports the docking model: `./stack` stands on the root alone.
      name: "stack-not-model",
      severity: "error",
      from: { path: "^packages/placement/src/stack/" },
      to: { path: "(^packages/docking|@n-uf/docking)" },
    },
    {
      // Tiling stands on the root (geometry, `Target`) alone.
      name: "tiling-root-only",
      severity: "error",
      from: { path: "^packages/placement/src/tiling/" },
      to: { path: "^packages/placement/src/[^/]+/", pathNot: "^packages/placement/src/tiling/" },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(node_modules|/dist/|/test/|/__tests__/)" },
    enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["types", "import", "default"] },
  },
};
