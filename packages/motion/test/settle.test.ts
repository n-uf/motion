import { describe, expect, it, vi } from "vitest";
import { createFakeClock, createFrameLoop } from "../src/clock";
import type { Rect } from "../src/shapes";
import {
  checkContentScale,
  checkHeld,
  checkMonotonic,
  checkNoJumps,
  checkNoOvershoot,
  checkTempo,
  type RectSample,
  type TargetSample,
} from "../src/testing";
import { createSettle, createTween, popIn, reveal, SETTLE_DEFAULTS, SETTLE_TEMPO, settleValue } from "../src/values";

const FRAME = 16;
const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

/** A small seeded PRNG so the fuzz cases are the same on every run. */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("settle", () => {
  it("defaults: tempo 25/s, rest within 0.1", () => {
    expect(SETTLE_DEFAULTS).toEqual({ omega: 25, restDelta: 0.1 });
    expect(SETTLE_TEMPO).toEqual({ calm: 20, default: 25, quick: 37 });
    expect(createSettle(0).omega).toBe(25);
  });

  it("a launch from rest follows distance · e^(−ωt) exactly", () => {
    const s = createSettle(0, { omega: 25 });
    s.setTarget(1000);
    expect(s.velocity).toBeCloseTo(25 * 1000, 9);
    for (let i = 1; i <= 10; i++) {
      s.step(FRAME);
      expect(s.value).toBeCloseTo(1000 - 1000 * Math.exp((-25 * FRAME * i) / 1000), 6);
    }
  });

  it("is front-loaded: 90 % in ln(10)/ω, settles exactly on the target", () => {
    const s = createSettle(0, { omega: 25 });
    s.setTarget(500);
    let t = 0;
    let t90: number | null = null;
    while (s.step(1)) {
      t += 1;
      if (t90 === null && s.value >= 450) t90 = t;
    }
    expect(t90).toBeGreaterThanOrEqual(91);
    expect(t90).toBeLessThanOrEqual(93);
    expect(s.value).toBe(500);
    expect(s.velocity).toBe(0);
    expect(s.settled).toBe(true);
    expect(t).toBeLessThan(400);
  });

  it("a rect's position and size arrive together, size never wobbles", () => {
    const from = rect(0, 0, 800, 600);
    const to = rect(400, 0, 400, 600);
    const s = createSettle(from);
    s.setTarget(to);
    const samples: RectSample[] = [];
    let t = 0;
    while (s.step(FRAME)) samples.push({ t: (t += FRAME), rect: s.value });
    samples.push({ t: t + FRAME, rect: s.value });
    expect(checkNoOvershoot(samples, from, to).ok).toBe(true);
    expect(checkMonotonic(samples, to).ok).toBe(true);
    // x and width are the same fraction of the way on every frame.
    for (const { rect: r } of samples) expect(r.x / 400).toBeCloseTo((800 - r.width) / 400, 9);
  });

  it("a retarget starts from the drawn value and keeps going: no jump", () => {
    const s = createSettle(rect(0, 0, 200, 200));
    s.setTarget(rect(600, 0, 200, 200));
    const samples: TargetSample[] = [{ t: 0, rect: s.value, target: s.target }];
    for (let i = 1; i <= 50; i++) {
      if (i === 4) s.setTarget(rect(900, 100, 300, 200));
      if (i === 7) s.setTarget(rect(200, 100, 100, 200));
      s.step(FRAME);
      samples.push({ t: i * FRAME, rect: s.value, target: s.target });
    }
    expect(checkNoJumps(samples, 25).ok).toBe(true);
  });

  it("a nearer target while moving fast toward it is not passed (clamp)", () => {
    const s = createSettle(0);
    s.setTarget(1000);
    s.step(FRAME); // moving at ~16 750 px/s toward 1000, at ~330
    const at = s.value;
    s.setTarget(at + 20); // 20 px ahead: a spring keeping its velocity would fly past
    const seen: number[] = [];
    while (s.step(FRAME)) seen.push(s.value);
    expect(Math.max(...seen)).toBeLessThanOrEqual(at + 20);
    expect(s.value).toBe(at + 20);
  });

  it("a new target behind it: turns at once, never drifts further nor passes it", () => {
    const s = createSettle(0);
    s.setTarget(1000);
    s.step(FRAME * 2);
    const at = s.value;
    s.setTarget(at - 300);
    expect(s.velocity).toBeCloseTo(-25 * 300, 9);
    const seen: number[] = [];
    while (s.step(FRAME)) seen.push(s.value);
    expect(Math.max(...seen)).toBeLessThan(at);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(at - 300);
    expect(s.value).toBe(at - 300);
  });

  it("a velocity set by hand away from the target carries on, turns, and never crosses it", () => {
    const s = createSettle(0);
    s.setTarget(100);
    s.setVelocity(-2000);
    expect(s.velocity).toBe(-2000);
    const seen: number[] = [];
    while (s.step(FRAME)) seen.push(s.value);
    expect(Math.min(...seen)).toBeLessThan(0);
    expect(Math.max(...seen)).toBeLessThanOrEqual(100);
    expect(s.value).toBe(100);
  });

  it("after a new target, every component stays between where it was drawn and the target", () => {
    const rnd = prng(7);
    for (let c = 0; c < 500; c++) {
      const s = createSettle(rect(rnd() * 900, rnd() * 900, 50 + rnd() * 900, 50 + rnd() * 900));
      for (let r = 0; r < 4; r++) {
        const from = s.value;
        const to = rect(rnd() * 900, rnd() * 900, 50 + rnd() * 900, 50 + rnd() * 900);
        s.setTarget(to);
        const samples: RectSample[] = [];
        const frames = 1 + Math.floor(rnd() * 12);
        for (let f = 0; f < frames; f++) {
          s.step(4 + rnd() * 30);
          samples.push({ t: f, rect: s.value });
        }
        expect(checkNoOvershoot(samples, from, to, 1e-6).ok).toBe(true);
        expect(checkMonotonic(samples, to, 1e-6).ok).toBe(true);
      }
    }
  });

  it("fuzz: no component ever crosses its target, whatever the retargets and velocities", () => {
    const rnd = prng(42);
    for (let c = 0; c < 2000; c++) {
      const s = createSettle(rect(rnd() * 1000, rnd() * 1000, 50 + rnd() * 900, 50 + rnd() * 900), {
        omega: 10 + rnd() * 40,
      });
      let goal = rect(rnd() * 1000, rnd() * 1000, 50 + rnd() * 900, 50 + rnd() * 900);
      s.setTarget(goal);
      if (rnd() < 0.3) s.setVelocity(rect((rnd() - 0.5) * 1e5, (rnd() - 0.5) * 1e5, (rnd() - 0.5) * 1e5, (rnd() - 0.5) * 1e5));
      for (let f = 0; f < 120; f++) {
        if (rnd() < 0.08) {
          goal = rect(rnd() * 1000, rnd() * 1000, 50 + rnd() * 900, 50 + rnd() * 900);
          s.setTarget(goal);
        }
        const before = s.value;
        s.step(1 + rnd() * 40);
        const after = s.value;
        for (const k of ["x", "y", "width", "height"] as const) {
          const d0 = before[k] - goal[k];
          const d1 = after[k] - goal[k];
          // From one side of the target, it may reach it but never pass it.
          if (d0 !== 0) expect(d0 * d1 >= -1e-9).toBe(true);
        }
      }
    }
  });

  it("hold puts the value exactly there at rest; the next target launches from it", () => {
    const s = createSettle(rect(0, 0, 100, 100));
    s.setTarget(rect(500, 0, 100, 100));
    s.step(FRAME);
    s.hold(rect(123, 45, 100, 100));
    expect(s.value).toEqual(rect(123, 45, 100, 100));
    expect(s.settled).toBe(true);
    expect(s.step(FRAME)).toBe(false);
    s.setTarget(rect(200, 45, 100, 100));
    expect(s.velocity).toEqual(rect(25 * 77, 0, 0, 0));
  });

  it("setVelocity caps a speed toward the target at ω · distance", () => {
    const s = createSettle(0);
    s.setTarget(100);
    s.setVelocity(1e6);
    expect(s.velocity).toBe(2500);
    s.setVelocity(-400); // away from 100: kept
    expect(s.velocity).toBe(-400);
  });

  it("configure changes the tempo mid-flight and re-clamps", () => {
    const s = createSettle(0, { omega: 40 });
    s.setTarget(100);
    s.configure({ omega: 10 });
    expect(s.omega).toBe(10);
    expect(s.velocity).toBe(1000);
  });

  it("finishes even when restDelta is finer than the float steps at the goal", () => {
    const fine = createSettle(0, { restDelta: 1e-14 });
    fine.setTarget(1000);
    let frames = 0;
    while (fine.step(FRAME) && frames < 10_000) frames++;
    expect(fine.settled).toBe(true);
    expect(fine.value).toBe(1000);
    const far = createSettle(0);
    far.setTarget(1e16);
    frames = 0;
    while (far.step(FRAME) && frames < 10_000) frames++;
    expect(far.settled).toBe(true);
  });

  it("rejects a bad tempo or a shape mismatch", () => {
    expect(() => createSettle(0, { omega: 0 })).toThrow(RangeError);
    expect(() => createSettle(0, { restDelta: -1 })).toThrow(RangeError);
    const s = createSettle(rect(0, 0, 1, 1));
    expect(() => s.setTarget(5 as unknown as Rect)).toThrow(TypeError);
  });

  it("settleValue on a frame loop: moves, settles, honours reduced motion", () => {
    const clock = createFakeClock();
    const loop = createFrameLoop({ clock });
    const value = settleValue(loop, rect(0, 0, 100, 100));
    const settled = vi.fn();
    value.onSettle(settled);
    value.set(rect(300, 0, 50, 100));
    clock.frame();
    expect(value.value.x).toBeGreaterThan(0);
    expect(value.value.x).toBeLessThan(300);
    clock.runUntilIdle();
    expect(value.value).toEqual(rect(300, 0, 50, 100));
    expect(settled).toHaveBeenCalledTimes(1);
    expect(loop.active).toBe(false);

    const reduced = settleValue(loop, 0, { reducedMotion: true });
    reduced.set(50);
    expect(reduced.value).toBe(50);
    expect(reduced.moving).toBe(false);
  });
});

describe("reveal", () => {
  it("shrinking: the frame is the drawn size, the content keeps the target size and is clipped", () => {
    expect(reveal(rect(10, 20, 300, 200), rect(0, 0, 200, 150))).toEqual({
      dx: 10,
      dy: 20,
      width: 300,
      height: 200,
      clipRight: 0,
      clipBottom: 0,
    });
    expect(reveal(rect(0, 0, 120, 100), rect(0, 0, 200, 150))).toEqual({
      dx: 0,
      dy: 0,
      width: 120,
      height: 100,
      clipRight: 80,
      clipBottom: 50,
    });
  });

  it("at the target nothing moves or clips", () => {
    expect(reveal(rect(5, 5, 50, 50), rect(5, 5, 50, 50))).toEqual({ dx: 0, dy: 0, width: 50, height: 50, clipRight: 0, clipBottom: 0 });
  });

  it("popIn is uniform and clamps progress", () => {
    expect(popIn(0)).toEqual({ scale: 0.87, opacity: 0 });
    expect(popIn(1)).toEqual({ scale: 1, opacity: 1 });
    expect(popIn(2, 0.5)).toEqual({ scale: 1, opacity: 1 });
    expect(popIn(0.5, 0.8).scale).toBeCloseTo(0.9, 12);
  });
});

describe("testing checks", () => {
  const from = rect(0, 0, 100, 100);
  const to = rect(100, 0, 50, 100);

  it("checkNoOvershoot catches a size wobble", () => {
    const tween = createTween(from, { duration: 220, easing: (p) => Math.min(1.05, p * 1.2) });
    tween.setTarget(to);
    const samples: RectSample[] = [];
    let t = 0;
    while (tween.step(FRAME)) samples.push({ t: (t += FRAME), rect: tween.value });
    const res = checkNoOvershoot(samples, from, to);
    expect(res.ok).toBe(false);
    expect(res.failures.some((f) => f.includes("width"))).toBe(true);
  });

  it("checkMonotonic catches a bounce", () => {
    const samples: RectSample[] = [
      { t: 0, rect: rect(0, 0, 100, 100) },
      { t: 16, rect: rect(110, 0, 100, 100) },
      { t: 32, rect: rect(100, 0, 100, 100) },
      { t: 48, rect: rect(104, 0, 100, 100) },
    ];
    expect(checkMonotonic(samples, rect(100, 0, 100, 100)).ok).toBe(false);
  });

  it("checkMonotonic catches a slow drift away, under the per-frame tolerance", () => {
    const drift: RectSample[] = Array.from({ length: 100 }, (_, i) => ({ t: i * 16, rect: rect(50 - i * 0.4, 0, 100, 100) }));
    expect(checkMonotonic(drift, rect(100, 0, 100, 100)).ok).toBe(false);
  });

  it("checkNoJumps catches a snap but not a settle", () => {
    const target = rect(1000, 0, 100, 100);
    const snap: TargetSample[] = [
      { t: 0, rect: rect(0, 0, 100, 100), target },
      { t: 16, rect: target, target },
    ];
    expect(checkNoJumps(snap, 25).ok).toBe(false);
    const s = createSettle(rect(0, 0, 100, 100));
    s.setTarget(target);
    s.step(16);
    expect(checkNoJumps([{ t: 0, rect: rect(0, 0, 100, 100), target }, { t: 16, rect: s.value, target }], 25).ok).toBe(true);
  });

  it("checkHeld measures distance from the pointer's place", () => {
    expect(checkHeld([{ t: 0, rect: rect(10, 10, 5, 5), expected: rect(10, 10.3, 5, 5) }]).ok).toBe(true);
    expect(checkHeld([{ t: 0, rect: rect(10, 10, 5, 5), expected: rect(60, 10, 5, 5) }]).ok).toBe(false);
  });

  it("checkContentScale: stretch fails, uniform passes, any scale fails with uniformOnly false", () => {
    expect(checkContentScale([{ t: 0, a: 1.4, d: 1 }]).ok).toBe(false);
    expect(checkContentScale([{ t: 0, a: 0.9, d: 0.9 }]).ok).toBe(true);
    expect(checkContentScale([{ t: 0, a: 0.9, d: 0.9 }], { uniformOnly: false }).ok).toBe(false);
    expect(checkContentScale([{ t: 0, a: 1, d: 1 }], { uniformOnly: false }).ok).toBe(true);
  });

  it("checkTempo measures time to 90 %", () => {
    const s = createSettle(from);
    s.setTarget(to);
    const samples: RectSample[] = [{ t: 0, rect: s.value }];
    for (let t = 1; s.step(1); t++) samples.push({ t, rect: s.value });
    const res = checkTempo(samples, from, to, Math.log(10) / 0.025);
    expect(res.ok).toBe(true);
    expect(res.t90).toBeGreaterThan(85);
    expect(checkTempo(samples, from, to, 300).ok).toBe(false);
    // Samples recorded only after each step: pass when the move began.
    const after = samples.slice(1);
    expect(checkTempo(after, from, to, 92.1, 0.25, 0).t90).toBe(res.t90);
    // No move: nothing to time.
    expect(checkTempo(samples, to, to, 92)).toEqual({ ok: true, failures: [], t90: null });
  });
});
