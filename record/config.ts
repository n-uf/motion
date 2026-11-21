/**
 * The recorders' vitest config (`packages/<pkg>/record/vitest.config.ts` default-exports it): `record/*.record.ts` only,
 * no time limit. A plain object, so this file needs no import of its own (the workspace root has no vitest).
 */
export function recordConfig(packageRoot: string): { root: string; test: { environment: "node"; include: string[]; testTimeout: number; hookTimeout: number } } {
  return {
    root: packageRoot,
    test: { environment: "node", include: ["record/**/*.record.ts"], testTimeout: 0, hookTimeout: 0 },
  };
}
