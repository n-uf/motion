// @ts-check
import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import astro from "eslint-plugin-astro";
import globals from "globals";

// Files a tsconfig covers get type information; the rest get the syntax-only rules.
const typedGroups = [
  { files: ["packages/motion/**/*.ts"], project: "packages/motion/tsconfig.test.json" },
  { files: ["packages/placement/**/*.ts"], project: "packages/placement/tsconfig.test.json" },
  { files: ["packages/docking/**/*.ts"], project: "packages/docking/tsconfig.test.json" },
  { files: ["apps/lab/**/*.ts"], project: "apps/lab/tsconfig.json" },
  {
    files: [
      "apps/web/src/islands/**/*.ts",
      "apps/web/src/demos/**/*.ts",
      "apps/web/src/snippets/*.ts",
      "apps/web/src/data/{pages,schema,site,parts}.ts",
    ],
    project: "apps/web/tsconfig.json",
  },
];
const typedFiles = typedGroups.flatMap((g) => g.files);

export default defineConfig([
  globalIgnores(["**/dist/**", "**/node_modules/**", "**/.astro/**", "**/coverage/**", "apps/web/public/**"]),
  { linterOptions: { reportUnusedDisableDirectives: "error" } },
  js.configs.recommended,

  // Syntax-only for every .ts; the typed groups add on top.
  { files: ["**/*.ts"], extends: [tseslint.configs.recommended] },
  ...typedGroups.map((g) => ({
    files: g.files,
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: { parserOptions: { project: g.project, tsconfigRootDir: import.meta.dirname } },
  })),

  {
    files: typedFiles,
    rules: {
      "@typescript-eslint/switch-exhaustiveness-check": ["error", { considerDefaultExhaustiveForUnions: true }],
      "@typescript-eslint/no-deprecated": "error",
      "@typescript-eslint/prefer-promise-reject-errors": "error",
      "@typescript-eslint/no-misused-spread": "error",
      "@typescript-eslint/no-dynamic-delete": "error",

      // Off for now: these five only remove noise and cannot show a bug, and the first two report about 3,900 false
      // findings until `noUncheckedIndexedAccess` is on in the tsconfigs. They can come back together with that flag.
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unnecessary-template-expression": "off",
      "@typescript-eslint/no-unnecessary-type-arguments": "off",
      "@typescript-eslint/no-unnecessary-type-conversion": "off",
    },
  },
  { rules: { eqeqeq: ["error", "always", { null: "ignore" }] } },
  // `console` stays out of libraries, lab and tests (an `eslint-disable no-console` marks the few that print on purpose).
  {
    files: ["packages/**/*.ts", "apps/lab/**/*.ts", "apps/web/src/{islands,demos}/**/*.ts"],
    ignores: ["packages/*/record/**"],
    rules: { "no-console": "error" },
  },
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // The record files drive whatever API a past commit had: `any` on purpose.
  {
    files: ["packages/*/record/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },
  // Tests: `(t += 16)` clock advances and vi.fn() mocks typed `any` are by design.
  {
    files: ["packages/*/test/**/*.ts", "packages/*/src/**/__tests__/**/*.ts", "packages/*/src/testing/**/*.ts"],
    rules: { "no-useless-assignment": "off", "@typescript-eslint/no-unsafe-return": "off" },
  },

  ...astro.configs.recommended,
  // <script is:inline> blocks are plain browser JS for old engines: `var`, `catch (e) {}`.
  {
    files: ["**/*.astro/**"],
    rules: { "no-var": "off", "no-empty": "off", "@typescript-eslint/no-unused-vars": "off", "no-unused-vars": "off" },
  },

  { files: ["apps/lab/**", "apps/web/src/**"], languageOptions: { globals: { ...globals.browser } } },
  {
    files: [
      "**/*.mjs",
      "scripts/**",
      "packages/*/{test,bench,record,scripts}/**",
      "apps/web/scripts/**",
      "**/*.config.*",
      "**/vitest.config.ts",
      "**/tsup.config.ts",
    ],
    languageOptions: { globals: { ...globals.node } },
  },
  { files: ["**/*.cjs"], languageOptions: { sourceType: "commonjs", globals: { ...globals.node } } },
]);
