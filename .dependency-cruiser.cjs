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
  ],
  options: {
    tsPreCompilationDeps: true,
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(node_modules|/dist/|/test/|/__tests__/)" },
    enhancedResolveOptions: { exportsFields: ["exports"], conditionNames: ["types", "import", "default"] },
  },
};
