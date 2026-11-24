/**
 * A release sample that comes less than 1 ms after the last frame is the same sample, not a slow step. A toolbar lifted
 * from the lab window's left rail, drawn straight down the rail at a constant speed over the band where the held spot
 * changes (between the rail's start spot and its sliding spot, some 110 px apart), and let go at a point with the
 * release sample `gap` ms after the last frame. The properties:
 *
 * - (a) the same held place and release point give the same landing at any sample rate and any release gap (a check on
 *   the drive: it holds without the fix too).
 * - (c) at sample rates from 50 to 144 Hz and a release-to-last-frame gap anywhere from 0 to 20 ms (under 1 ms too), the
 *   place is the same.
 */
import { describe, expect, it } from "vitest";
import { dockDrag, solve, type DockDrag } from "../src";
import { guided, modelOver } from "./landing-model";
import { windows } from "./lift-windows";

interface Drive {
  readonly place: string;
  readonly landing: { x: number; y: number } | null;
}

const RATES = [50, 60, 62.5, 90, 120, 144];
/** Release gaps, ms: under 1 ms (the same sample), the edge of it, and whole frames' worth. */
const GAPS = [0, 0.17, 0.3, 0.5, 0.9, 1, 4.7, 8.8, 12.8, 20];

function lab() {
  const w = windows().find((x) => x.name.startsWith("lab: ") && x.name.endsWith(", tools"))!;
  const previous = solve(w.state);
  const own = previous.items[w.dragged]!;
  const grab = { x: own.rect.width / 2, y: own.rect.height / 2 };
  const drag = (): DockDrag => dockDrag(w.state, w.dragged, { ...w.options, endReach: 8, emptyLanes: "real", previous, grab });
  return { drag, press: { x: own.rect.x + grab.x, y: own.rect.y + grab.y } };
}
const setup = lab();

/** One drag: straight from the press down the rail to (x, y) at `v` px/ms, a frame every 1000/`hz` ms, the last `gap` ms before the release. */
function drive(y: number, v: number, hz: number, gap: number): Drive {
  const A = setup.press;
  const P = { x: 15, y };
  const T = Math.hypot(P.x - A.x, P.y - A.y) / v;
  const dt = 1000 / hz;
  const d = setup.drag();
  const m = modelOver(d, { preview: guided("all") });
  const at = (t: number) => ({ x: A.x + ((P.x - A.x) * t) / T, y: A.y + ((P.y - A.y) * t) / T });
  m.update(A, 0);
  // Frames every `dt` ms from the press, the last one `gap` ms before the release (the first at least 2 ms after the press).
  let first = (T - gap) % dt;
  if (first < 2) first += dt;
  for (let t = first; t <= T - gap + 1e-9; t += dt) m.update(at(t), t);
  const r = m.release(P, T);
  const landing = r ? d.after(r).landing : null;
  return { place: r ? `${r.kind}|${r.kind === "spot" ? `${r.lane}|${r.spot}` : ""}` : "none", landing: landing ? { x: landing.x, y: landing.y } : null };
}

const speeds = [0.6, 1];

/**
 * The release points: a coarse run down the rail across the band where its held spot changes, and a fine run (0.05 px)
 * around each point where the place changes, since a release sample that moves the place has to come within a
 * fraction of a pixel of it: the same sample less than 1 ms after the last frame, at the speeds driven here.
 */
function releasePoints(v: number): number[] {
  const coarse = Array.from({ length: 24 }, (_, i) => 150 + i * 4.7 + 0.3);
  const edges: number[] = [];
  for (let y = 140; y < 260; y += 1) {
    if (drive(y, v, 60, 8.8).place === drive(y + 1, v, 60, 8.8).place) continue;
    let lo = y;
    let hi = y + 1;
    for (let k = 0; k < 8; k++) {
      const mid = (lo + hi) / 2;
      if (drive(mid, v, 60, 8.8).place === drive(lo, v, 60, 8.8).place) lo = mid;
      else hi = mid;
    }
    edges.push(hi);
  }
  expect(edges.length).toBeGreaterThan(0);
  return [...coarse, ...edges.flatMap((e) => Array.from({ length: 21 }, (_, i) => e - 0.2 + i * 0.05))].sort((a, b) => a - b);
}
const ys = new Map(speeds.map((v) => [v, releasePoints(v)]));

describe("a release sample under 1 ms after the last frame", () => {
  it("(c) gives the same place at sample rates 50 to 144 Hz and a release gap of 0 to 20 ms", () => {
    let cases = 0;
    const bad: string[] = [];
    for (const v of speeds) {
      for (const y of ys.get(v)!) {
        const places = new Map<string, string[]>();
        for (const hz of RATES) {
          for (const gap of GAPS) {
            const p = drive(y, v, hz, gap).place;
            (places.get(p) ?? places.set(p, []).get(p)!).push(`${hz}Hz/${gap}ms`);
          }
        }
        cases++;
        if (places.size > 1) bad.push(`v=${v} y=${y.toFixed(1)}: ${[...places].map(([p, w]) => `${p} <- ${w.slice(0, 3).join(",")}`).join("  |  ")}`);
      }
    }
    expect(cases).toBeGreaterThan(80);
    expect(bad).toEqual([]);
  });

  it("(a) gives the same landing for the same place and release point at any sample rate", () => {
    const bad: string[] = [];
    for (const v of speeds) {
      for (const y of ys.get(v)!) {
        const seen = new Map<string, Drive>();
        for (const hz of [60, 144]) {
          for (const gap of [0, 0.3, 0.9, 8.8, 20]) {
            const r = drive(y, v, hz, gap);
            const first = seen.get(r.place);
            if (!first) seen.set(r.place, r);
            else if (first.landing?.x !== r.landing?.x || first.landing?.y !== r.landing?.y) bad.push(`v=${v} y=${y.toFixed(1)} ${r.place} ${hz}Hz/${gap}ms: ${JSON.stringify(r.landing)} vs ${JSON.stringify(first.landing)}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("(d) gives the same place at 60 Hz, 1 kHz and 2 kHz, a slow hand (0.1 to 0.3 px/ms) at the spot's edge, whatever the release gap", () => {
    let cases = 0;
    const bad: string[] = [];
    for (const v of [0.1, 0.2, 0.3]) {
      // A third of the release points: the coarse run, and the fine run around each edge a third as dense.
      for (const y of releasePoints(v).filter((_, i) => i % 3 === 0)) {
        const places = new Map<string, string[]>();
        for (const hz of [60, 1000, 2000]) {
          for (const gap of [0, 0.3, 0.9, 8.8, 20]) {
            const p = drive(y, v, hz, gap).place;
            (places.get(p) ?? places.set(p, []).get(p)!).push(`${hz}Hz/${gap}ms`);
          }
        }
        cases++;
        if (places.size > 1) bad.push(`v=${v} y=${y.toFixed(1)}: ${[...places].map(([p, w]) => `${p} <- ${w.slice(0, 3).join(",")}`).join("  |  ")}`);
      }
    }
    expect(cases).toBeGreaterThan(30);
    expect(bad).toEqual([]);
  });
});
