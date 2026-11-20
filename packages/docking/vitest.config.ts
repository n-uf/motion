import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // The layout sweeps run thousands of layouts; on a loaded machine that takes longer than vitest's 5 s default.
    testTimeout: 60_000,
  },
});
