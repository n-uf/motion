/**
 * A frame gap never changes the verdict (decision record 0014). A toolbar lifted from its grip at the bottom bar's
 * start, directly under an empty rail that touches the bar (its band over a column that takes no toolbar), driven
 * straight up the rail at a constant speed and let go at once, at every sample. Hands at 125 Hz and 60 Hz, their
 * timestamps exact or off by up to half a frame. The properties:
 *
 * - (a) one gap of 33 to 100 ms inserted after any frame (the host lost the samples in it) gives the release the
 *   verdict the drive without it gives: a slide (0.8 to 1.6 px/ms, clear of `slideSpeed` by the hand's error) docks in
 *   the rail no later than a frame after the drive without the gap does (three frames with jittered timestamps: the gap
 *   drops jittered samples too), and a fling (2.4 px/ms or faster) never docks. The oracle is a second copy of the drive,
 *   without the gap.
 * - (b) a rest of at least `pause` the host reports (per frame, or once `pause` after the stop) enters the rail, after a
 *   slide or a fling, with a gap before it or none.
 * - (c) a fling after a rest the host reports (per frame, or once `rest` after the stop) is no entry: no sample of it
 *   enters a lane the drag didn't hold when it started, so a release at once lands none.
 */
import { describe, expect, it } from "vitest";
import type { Point, Rect } from "../src/shapes";
import { createLandingModel, LANDING_GATES, type LandingModel, type LandingLane, type LandingRegions, type LandingRelease } from "../src/drag";
import { listed } from "./listed-geometry";

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const regions = (): LandingRegions => {
  const bottom: LandingLane = { id: "bottom", rect: rect(0, 599, 868, 31), axis: "x", spots: [{ id: "bottom/home", along: [0, 868], landing: rect(8, 599, 362, 31) }], refused: [] };
  const rail: LandingLane = { id: "rail-left", rect: rect(0, 0, 30, 599), axis: "y", spots: [{ id: "rail-left/start", along: [0, 599], landing: rect(0, 242, 30, 121) }], refused: [] };
  return { lanes: [bottom, rail], refused: [], content: rect(0, 0, 868, 599), blocked: [rect(12, 12, 220, 575)], stage: rect(0, 0, 868, 630) };
};
const START: Point = { x: 25, y: 614 };
const model = (): LandingModel => createLandingModel({ ...listed(regions()), home: { lane: "bottom", spot: "bottom/home" }, lift: START });
const verdict = (r: LandingRelease): string => (r === null ? "home" : r.kind === "float" ? "float" : r.home ? "own" : r.lane);

/** A seeded generator: the same drive draws the same timestamp error at the same sample. */
function seeded(seed: number): () => number {
  let s = seed * 7919 + 17;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

interface Drive {
  readonly v: number;
  readonly dt: number;
  /** The timestamps' error, a share of a frame. */
  readonly jitter: number;
  readonly seed: number;
  /** A gap of `gap` ms in place of the frame after frame `after` (0: none). */
  readonly after: number;
  readonly gap: number;
}

/**
 * The drive up the rail for `travel` px: each sample's px slid and the verdict a release there at once lands, and the
 * model with the last sample's point and time.
 */
function play(d: Drive, travel: number): { rows: { slid: number; verdict: string }[]; m: LandingModel; at: Point; t: number } {
  const rnd = seeded(d.seed);
  const m = model();
  m.update(START, 0);
  const rows: { slid: number; verdict: string }[] = [];
  let real = 0;
  let stamp = 0;
  let at = START;
  for (let i = 1; ; i++) {
    real += d.after > 0 && i === d.after + 1 ? d.gap : d.dt;
    const err = d.jitter * d.dt * (2 * rnd() - 1);
    if (d.v * real > travel) break;
    at = { x: START.x, y: START.y - d.v * real };
    stamp = Math.max(stamp + 0.5, real + err);
    m.update(at, stamp);
    rows.push({ slid: d.v * real, verdict: verdict(m.release(at, stamp)) });
  }
  return { rows, m, at, t: stamp };
}

const SLIDES = [0.8, 1, 1.2, 1.44, 1.6];
const FLINGS = [2.4, 3, 4];
const FRAMES = [8, 1000 / 60];
const GAPS = [33, 40, 45, 50, 66, 75, 83, 100];
const TRAVEL = 400;

describe("a frame gap never changes the verdict", () => {
  it("(a) one gap of 33 to 100 ms after any frame: a slide docks no later than a frame after the drive without it (three with jittered timestamps), a fling never", () => {
    const bad: string[] = [];
    let slides = 0;
    let flings = 0;
    for (const v of [...SLIDES, ...FLINGS])
      for (const dt of FRAMES)
        for (const jitter of [0, 0.5])
          for (let seed = 1; seed <= (jitter ? 4 : 1); seed++) {
            const plain = play({ v, dt, jitter, seed, after: 0, gap: 0 }, TRAVEL).rows;
            const docked = plain.find((r) => r.verdict === "rail-left")?.slid ?? null;
            const fling = v > LANDING_GATES.slideSpeed;
            if (fling ? docked !== null : docked === null) bad.push(`${v} px/ms, ${dt.toFixed(1)} ms, seed ${seed}: without a gap ${docked === null ? "never docks" : `docks at ${docked.toFixed(0)} px`}`);
            for (const gap of GAPS)
              for (let after = 1; v * (after * dt + gap) <= TRAVEL; after++) {
                const rows = play({ v, dt, jitter, seed, after, gap }, TRAVEL).rows;
                const where = `${v} px/ms, ${dt.toFixed(1)} ms, ±${jitter * 100}%, seed ${seed}, ${gap} ms after frame ${after}`;
                const got = rows.find((r) => r.verdict === "rail-left")?.slid ?? null;
                if (fling) {
                  flings++;
                  if (got !== null) bad.push(`${where}: a fling docks at ${got.toFixed(0)} px`);
                  continue;
                }
                slides++;
                if (docked === null) continue;
                // The first sample of this drive at or past where the drive without the gap docks, and the slack.
                const due = rows.find((r) => r.slid >= docked - 1e-9)?.slid ?? Infinity;
                const slack = v * dt * (jitter ? 3 : 1) + 1e-6;
                if (got === null || got > due + slack) bad.push(`${where}: docks at ${got === null ? "never" : `${got.toFixed(0)} px`}, due by ${due.toFixed(0)} px (${docked.toFixed(0)} px without the gap)`);
              }
          }
    expect(slides).toBeGreaterThan(5000);
    expect(flings).toBeGreaterThan(1000);
    expect(bad).toEqual([]);
  });

  it("(a) the host's corner case: a slide at 1.44 px/ms with one frame of 44 to 50 ms anywhere, let go at once at 300 px, docks in the rail", () => {
    const bad: string[] = [];
    for (const jitter of [0, 0.5])
      for (let seed = 1; seed <= 8; seed++)
        for (const gap of [44, 47, 50])
          for (let after = 1; 1.44 * (after * (1000 / 60) + gap) <= 300; after++) {
            const { rows } = play({ v: 1.44, dt: 1000 / 60, jitter, seed, after, gap }, 300);
            if (rows[rows.length - 1]!.verdict !== "rail-left") bad.push(`±${jitter * 100}%, seed ${seed}, ${gap} ms after frame ${after}: ${rows[rows.length - 1]!.verdict}`);
          }
    expect(bad).toEqual([]);
  });

  it("(b) a rest of `pause` the host reports, per frame or once, enters the rail after a slide or a fling, with a gap before it or none", () => {
    const bad: string[] = [];
    for (const v of [...SLIDES, ...FLINGS])
      for (const dt of FRAMES)
        for (const gap of [0, 50, 100])
          for (const report of ["frames", "once"] as const) {
            const { m, at, t } = play({ v, dt, jitter: 0, seed: 1, after: gap ? 4 : 0, gap }, 250);
            const end = t + LANDING_GATES.pause + dt;
            if (report === "frames") for (let r = t + dt; r <= end; r += dt) m.update(at, r);
            else m.update(at, end);
            if (m.frame.lane !== "rail-left") bad.push(`${v} px/ms, ${dt.toFixed(1)} ms, gap ${gap}, rest reported ${report}: lane ${m.frame.lane}`);
          }
    expect(bad).toEqual([]);
  });

  it("(c) a fling after a rest the host reports, per frame or once, is no entry: no sample of it enters a lane", () => {
    const bad: string[] = [];
    let runs = 0;
    for (const dir of ["up", "along"] as const)
      for (const v1 of [0.3, 0.6, 1, 1.5])
        for (const before of [6, 20, 40, 80])
          for (const restMs of [40, 60, 100, 300])
            for (const report of ["frames", "once"] as const)
              for (const v2 of FLINGS)
                for (const dt of FRAMES) {
                  runs++;
                  const m = model();
                  m.update(START, 0);
                  let t = 0;
                  let p = START;
                  // Slide or creep `before` px, up the rail or along the bar.
                  for (let moved = 0; moved < before; ) {
                    t += dt;
                    moved = Math.min(before, moved + v1 * dt);
                    p = dir === "up" ? { x: START.x, y: START.y - moved } : { x: START.x + moved, y: START.y };
                    m.update(p, t);
                  }
                  // The rest, reported per frame or once `rest` after the stop; then the fling starts a frame before its end.
                  const stop = t;
                  if (report === "frames") for (let r = stop + dt; r < stop + restMs; r += dt) m.update(p, r);
                  else if (restMs > LANDING_GATES.rest) m.update(p, stop + LANDING_GATES.rest);
                  const held = m.frame.lane;
                  const from = p;
                  for (let k = 1; k * v2 * dt <= 320; k++) {
                    const q = { x: from.x, y: from.y - k * v2 * dt };
                    const at = stop + restMs + (k - 1) * dt;
                    const lane = m.update(q, at).lane;
                    const r = m.release(q, at);
                    if ((lane !== null && lane !== held) || (r?.kind === "spot" && r.lane !== held)) {
                      bad.push(`${dir} ${before} px at ${v1} px/ms, rest ${restMs} ms reported ${report}, fling ${v2} px/ms, ${dt.toFixed(1)} ms: frame ${k} enters ${lane ?? r?.kind}`);
                      break;
                    }
                  }
                }
    expect(runs).toBe(1536);
    expect(bad).toEqual([]);
  });
});
