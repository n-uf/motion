import { describe, expect, it } from "vitest";
import { anchoredMorph, MORPH_TEMPO } from "../src/layout";

const FRAME = 1000 / 60;

describe("anchoredMorph: a box that changes size about an anchor on a point", () => {
  it("settles size and anchor together; the anchor sits on the point at every frame", () => {
    const m = anchoredMorph({ width: 200, height: 28 }, { x: 10, y: 14 });
    expect(m.settled).toBe(true);
    expect(m.progress).toBe(1);
    expect(m.to({ width: 96, height: 84 }, { x: 48, y: 6 })).toBe(true);
    expect(m.to({ width: 96, height: 84 }, { x: 48, y: 6 })).toBe(false);
    const p = { x: 300, y: 120 };
    let last = 0;
    let frames = 0;
    while (m.step(FRAME)) {
      frames++;
      const r = m.rectAt(p);
      // The anchor is exactly on the point.
      expect(r.x + m.anchor.x).toBeCloseTo(p.x, 9);
      expect(r.y + m.anchor.y).toBeCloseTo(p.y, 9);
      // Progress only grows; size never passes its target (no overshoot).
      expect(m.progress).toBeGreaterThanOrEqual(last - 1e-9);
      last = m.progress;
      expect(m.size.width).toBeGreaterThanOrEqual(96 - 1e-6);
      expect(m.size.height).toBeLessThanOrEqual(84 + 1e-6);
    }
    expect(m.size).toEqual({ width: 96, height: 84 });
    expect(m.anchor).toEqual({ x: 48, y: 6 });
    expect(m.progress).toBe(1);
    // About 150 ms at the default tempo.
    expect(frames * FRAME).toBeLessThan(200);
    expect(MORPH_TEMPO).toBeGreaterThan(0);
  });

  it("a retarget mid-flight turns from where it is drawn: no jump, and progress starts again from there", () => {
    const m = anchoredMorph({ width: 200, height: 28 }, { x: 10, y: 14 });
    m.to({ width: 96, height: 84 }, { x: 48, y: 6 });
    for (let i = 0; i < 3; i++) m.step(FRAME);
    const mid = { size: m.size, anchor: m.anchor };
    expect(m.progress).toBeGreaterThan(0.2);
    expect(m.progress).toBeLessThan(1);
    m.to({ width: 40, height: 28 }, { x: 4, y: 14 });
    // Nothing moves on the retarget itself.
    expect(m.size).toEqual(mid.size);
    expect(m.anchor).toEqual(mid.anchor);
    expect(m.progress).toBe(0);
    let prev = m.size.width;
    while (m.step(FRAME)) {
      // Toward the new width from there, never back past it.
      expect(m.size.width).toBeLessThanOrEqual(prev + 1e-9);
      expect(m.size.width).toBeGreaterThanOrEqual(40 - 1e-6);
      prev = m.size.width;
    }
    expect(m.target).toEqual({ size: { width: 40, height: 28 }, anchor: { x: 4, y: 14 } });
    expect(m.size).toEqual({ width: 40, height: 28 });
  });

  it("jumpTo is at rest at once; bad numbers are read as 0", () => {
    const m = anchoredMorph({ width: Number.NaN, height: -5 }, { x: Infinity, y: 2 });
    expect(m.size).toEqual({ width: 0, height: 0 });
    expect(m.anchor).toEqual({ x: 0, y: 2 });
    m.to({ width: 50, height: 20 }, { x: 5, y: 5 });
    m.jumpTo({ width: 30, height: 30 }, { x: 1, y: 1 });
    expect(m.settled).toBe(true);
    expect(m.rectAt({ x: 10, y: 10 })).toEqual({ x: 9, y: 9, width: 30, height: 30 });
  });
});
