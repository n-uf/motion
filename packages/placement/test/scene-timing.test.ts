/**
 * A timing guard for `targets()`: over the property check's generated windows, every drag of every item, the 95th
 * percentile of one call stays under 5 ms. Each call is timed three times and its least taken, so a busy machine only
 * slows the run, not the verdict. On a laptop the p95 is about 0.6 ms: the bound catches a regression of several times,
 * not noise.
 */
import { describe, expect, it } from "vitest";
import { targets, type Scene } from "../src/scene";
import { modelScene } from "./model-scene";

describe("targets() timing", () => {
  it("p95 of one call under 5 ms over the generated windows", () => {
    const calls: [Scene, string][] = [];
    for (let seed = 1; seed <= 120; seed++) {
      const s = modelScene(seed);
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
    expect(p95).toBeLessThan(5);
  });
});
