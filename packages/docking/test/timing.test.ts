/**
 * A timing guard for `targets()`: over the property check's generated windows, every drag of every item, the 95th
 * percentile of one call stays under 10 ms. Each call is timed three times and its least taken, so a busy machine only
 * slows the run, not the verdict. On a laptop the p95 is about 0.6 ms; shared CI runners are several times slower, so
 * the bound catches a regression of an order of magnitude, not noise.
 */
import { describe, expect, it } from "vitest";
import { targets, type DockState } from "../src";
import { modelState } from "./model-window";

describe("targets() timing", () => {
  it("p95 of one call under 10 ms over the generated windows", () => {
    const calls: [DockState, string][] = [];
    for (let seed = 1; seed <= 120; seed++) {
      const s = modelState(seed);
      for (const id of Object.keys(s.items)) if (!s.items[id]!.fixed && !s.items[id]!.closed) calls.push([s, id]);
    }
    const best = calls.map(() => Infinity);
    for (let pass = 0; pass < 3; pass++)
      calls.forEach(([s, id], i) => {
        const t0 = performance.now();
        targets(s, id);
        best[i] = Math.min(best[i]!, performance.now() - t0);
      });
    const sorted = [...best].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(0.95 * (sorted.length - 1))]!;
    expect(calls.length).toBeGreaterThan(500);
    expect(p95).toBeLessThan(10);
  });
});
