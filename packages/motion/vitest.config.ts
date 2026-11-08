import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // src/gestures/__tests__ holds the recogniser's tests as they were in the
    // surface, so they run unchanged.
    include: ["test/**/*.test.ts", "src/**/__tests__/**/*.test.ts"],
    // The version-script test starts Node per case; on a loaded machine that
    // takes longer than vitest's 5 s default.
    testTimeout: 30_000,
  },
});
