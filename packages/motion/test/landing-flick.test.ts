import { describe, expect, it } from "vitest";
import type { Rect } from "../src/shapes";
import { createLandingModel, type LandingLane, type LandingRegions } from "../src/drag";

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

/**
 * A host's flick: a toolbar lifted from its grip at the bottom bar's start (x 25, directly under the empty left rail),
 * flicked at 3 px/ms up the rail to its middle and let go at once. The window is a host kit's: 868 wide, a 31 px bottom bar
 * (the item's home), an empty 30 px rail whose band lies over the left column (which takes no toolbar).
 */
describe("landing model: a fast flick up a rail from the bar under it", () => {
  const regions = (): LandingRegions => {
    const bottom: LandingLane = { id: "bottom", rect: rect(0, 599, 868, 31), axis: "x", spots: [{ id: "bottom/home", along: [0, 868], landing: rect(8, 599, 362, 31) }], refused: [] };
    const rail: LandingLane = { id: "rail-left", rect: rect(0, 0, 30, 599), axis: "y", spots: [{ id: "rail-left/start", along: [0, 599], landing: rect(0, 242, 30, 121) }], refused: [] };
    return { lanes: [bottom, rail], refused: [], content: rect(0, 0, 868, 599), blocked: [rect(12, 12, 220, 575)], stage: rect(0, 0, 868, 630), item: { width: 362, height: 31 } };
  };
  const flick = (restMs: number) => {
    // (The fast slide rule is capped at `gates.slide`, 2 px/ms: this flick is 24 px per 8 ms.)
    const m = createLandingModel({ regions: regions(), home: { lane: "bottom", spot: "bottom/home" }, lift: { x: 25, y: 614 }, grab: { x: 17, y: 15 } });
    m.update({ x: 25, y: 614 }, 0);
    // 3 px/ms, a frame every 16 ms: 48 px a frame, from (25, 614) to (14, 301) in 7 frames.
    for (let i = 1; i <= 7; i++) m.update({ x: 25 - (11 * i) / 7, y: 614 - (313 * i) / 7 }, 16 * i);
    // The hand stays at (14, 301) for `restMs`, a frame every 16 ms.
    for (let t = 112 + 16; t <= 112 + restMs; t += 16) m.update({ x: 14, y: 301 }, t);
    return m;
  };

  it("let go at once, it is no entry: the frame is held but refused far above the bar, and the item goes home", () => {
    const m = flick(0);
    expect(m.frame.lane).not.toBe("rail-left");
    // 288 px above its bar: held, but refused (the host's tag shows), so a release lands nothing and the item goes home.
    expect(m.frame.region).toBe("refused");
    expect(m.release()).toBeNull();
  });

  it("held there past `pause`, the rail takes it by its still gate", () => {
    const m = flick(80);
    expect(m.frame.lane).toBe("rail-left");
    expect(m.release()).toMatchObject({ kind: "spot", lane: "rail-left", spot: "rail-left/start", home: false });
  });

  /** The flick, then `n` frames 8 ms apart at 1.5 px/ms on up the rail (12 px each). */
  const tail = (n: number, gates?: { slide: number }) => {
    const m = createLandingModel({ regions: regions(), home: { lane: "bottom", spot: "bottom/home" }, lift: { x: 25, y: 614 }, grab: { x: 17, y: 15 }, ...(gates ? { gates } : {}) });
    m.update({ x: 25, y: 614 }, 0);
    for (let i = 1; i <= 7; i++) m.update({ x: 25 - (11 * i) / 7, y: 614 - (313 * i) / 7 }, 16 * i);
    for (let k = 1; k <= n; k++) m.update({ x: 14, y: 301 - 12 * k }, 112 + 8 * k);
    return m;
  };

  it("a fling restarts the slide count: a short slow tail after it (1 or 2 frames) is no entry", () => {
    for (const n of [1, 2]) {
      const m = tail(n);
      expect(m.frame.lane, `${n} slow frames`).not.toBe("rail-left");
      expect(m.release(), `${n} slow frames`).toBeNull();
    }
  });

  it("a sustained slow slide after the fling enters the rail: the 40 px count starts once the hand reads slow over its window", () => {
    // The speed for the slide count is read over the last 48 ms or more of samples, so the frames just after the fling
    // still read fast and add nothing: four slow frames (48 px) are not yet 40 px counted, eight (96 px) are.
    expect(tail(4).frame.lane).not.toBe("rail-left");
    const m = tail(8);
    expect(m.frame.lane).toBe("rail-left");
    expect(m.release()).toMatchObject({ kind: "spot", lane: "rail-left" });
  });

  it("a fling at 2.4 or 2.8 px/ms whose timestamps jitter (±35%, ±50%) stays out of the rail until it rests, and a release at once goes home", () => {
    // 125 Hz samples off by up to a third or half a frame; 60 Hz ones off by up to a third (half of a 16 ms frame, 8 ms,
    // is a dropped sample's worth: a fling at 2.4 px/ms read over a few such samples can read slow).
    const cases: [number, number, number][] = [2.4, 2.8].flatMap((v) => [[v, 0.35, 8], [v, 0.5, 8], [v, 0.35, 16]] as [number, number, number][]);
    for (const [v, j, dt] of cases)
          for (let seed = 1; seed <= 10; seed++) {
            let s = seed * 7919;
            const rnd = (): number => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
            const m = createLandingModel({ regions: regions(), home: { lane: "bottom", spot: "bottom/home" }, lift: { x: 25, y: 614 }, grab: { x: 17, y: 15 } });
            m.update({ x: 25, y: 614 }, 0);
            // The hand moves at `v` px/ms in real time; each sample's timestamp is off by up to `j` of a frame.
            const n = Math.ceil(313 / (v * dt));
            let entered = false;
            for (let k = 1; k <= n; k++) {
              const t = dt * (k + j * (2 * rnd() - 1));
              const u = Math.min(1, k / n);
              if (m.update({ x: 25 - 11 * u, y: 614 - 313 * u }, t).lane === "rail-left") entered = true;
            }
            const where = `${v} px/ms, ±${j * 100}%, ${dt} ms frames, seed ${seed}`;
            expect(entered, where).toBe(false);
            expect(m.release(), where).toBeNull();
          }
  });

  it("a slide at exactly 2 px/ms (16 px per 8 ms, the gate) takes the rail; with `gates: { slide: Infinity }` the fling does too", () => {
    const m = createLandingModel({ regions: regions(), home: { lane: "bottom", spot: "bottom/home" }, lift: { x: 25, y: 614 }, grab: { x: 17, y: 15 } });
    m.update({ x: 25, y: 614 }, 0);
    // 16 px a frame straight up the rail's x 25, from y 614 to y 310.
    for (let k = 1; k <= 19; k++) m.update({ x: 25, y: 614 - 16 * k }, 8 * k);
    expect(m.frame.lane).toBe("rail-left");
    const open = tail(0, { slide: Infinity });
    expect(open.frame.lane).toBe("rail-left");
  });

  it("a steady 1.5 px/ms slide with ±30% timestamp jitter enters the rail about where a smooth one does: a frame read as fast adds nothing and resets nothing", () => {
    /** How far up the rail the hand has slid when the rail takes it, px; frames at 16 ms times `jitter(k)`. */
    const entry = (jitter: (k: number) => number): number => {
      const m = createLandingModel({ regions: regions(), home: { lane: "bottom", spot: "bottom/home" }, lift: { x: 25, y: 614 }, grab: { x: 17, y: 15 } });
      m.update({ x: 25, y: 614 }, 0);
      let t = 0;
      for (let k = 1; k <= 40; k++) {
        t += 16 * jitter(k);
        // The hand moves at 1.5 px/ms in real time; the samples carry jittered timestamps.
        const y = 614 - 1.5 * 16 * k;
        if (m.update({ x: 25, y }, t).lane === "rail-left") return 614 - y;
      }
      return Infinity;
    };
    const smooth = entry(() => 1);
    // A repeating ±30% pattern: every other frame read faster than 2 px/ms (0.7: 17 px per 8 ms), the rest slower.
    const pattern = [1.0, 0.7, 1.3, 0.7];
    const jittered = entry((k) => pattern[k % pattern.length]!);
    // (The hand's speed is read over 80 ms at 60 Hz before anything counts, 120 px at 1.5 px/ms, then `path`.)
    expect(smooth).toBeLessThan(200);
    expect(jittered).toBeLessThanOrEqual(smooth + 48);
  });
});
