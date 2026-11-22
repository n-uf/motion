/**
 * Sliding spots: a free stretch exposed as one spot. The model names the spot and the pointer (`frame.held`); where it
 * lands is the geometry's (`landingOf`: here a stand-in for the docking layer's rule, the pointer less the grab,
 * clamped, snapped within 8 px). A step comes only where the order changes (passing a neighbor); a release names the
 * held place, and is home only where the geometry lands it at the item's own place.
 */
import { describe, expect, it } from "vitest";
import type { Point, Rect } from "../src/shapes";
import { createLandingModel, type LandingFrame, type LandingGeometry, type LandingOptions, type LandingHeld, type LandingRegions } from "../src/drag";

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

/**
 * A bar (x 0–1000, y 0–32) holding one neighbor `n` (x 400–500) and the held item (100 × 28) at x 150: the stretch
 * before `n` slides from 8 to 296 (home at 150), the one after it from 504 to 892.
 */
function regions(): LandingRegions {
  const lane = rect(0, 0, 1000, 32);
  return {
    lanes: [
      {
        id: "top",
        rect: lane,
        axis: "x",
        spots: [
          { id: "top/start/^|n@slide", along: [0, 450], landing: rect(150, 2, 100, 28), others: "n" },
          { id: "top/start/n|$@slide", along: [450, 1000], landing: rect(504, 2, 100, 28), others: "n" },
        ],
        refused: [],
      },
    ],
    refused: [],
    content: rect(0, 32, 1000, 568),
    blocked: [lane],
    stage: rect(0, 0, 1000, 600),
  };
}
const RANGES: Record<string, { from: number; to: number; snaps: number[] }> = {
  "top/start/^|n@slide": { from: 8, to: 296, snaps: [8, 150, 296] },
  "top/start/n|$@slide": { from: 504, to: 892, snaps: [504, 892] },
};
const GRAB = { x: 30, y: 14 };
/** The stand-in geometry: a sliding spot's start at the pointer less the grab, clamped, snapped within 8, whole px. */
function geometry(): LandingGeometry & { asked: LandingHeld[] } {
  const asked: LandingHeld[] = [];
  return {
    regions: regions(),
    asked,
    landingOf: (s) => {
      asked.push(s);
      if (s.kind !== "spot") return null;
      const r = RANGES[s.spot]!;
      const c = Math.min(r.to, Math.max(r.from, s.point.x - GRAB.x));
      const snap = r.snaps.find((q) => Math.abs(q - c) <= 8);
      return rect(snap ?? Math.round(c), 2, 100, 28);
    },
  };
}
const HOME = { lane: "top", spot: "top/start/^|n@slide" };
const PRESS = { x: 150 + GRAB.x, y: 16 };
const at = (x: number): Point => ({ x, y: PRESS.y });

/** Every 8 ms from the press through `points` at `speed` px/ms, then `rest` ms held still: each frame and the release. */
function drive(o: LandingOptions, points: readonly Point[], speed = 0.2, rest = 200) {
  const m = createLandingModel(o);
  const frames: { p: Point; f: LandingFrame }[] = [];
  let t = 0;
  frames.push({ p: points[0]!, f: m.update(points[0]!, t) });
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]!;
    const b = points[k]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (speed * 8)));
    for (let i = 1; i <= n; i++) {
      const p = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
      frames.push({ p, f: m.update(p, (t += 8)) });
    }
  }
  for (let s = 0; s < rest; s += 8) frames.push({ p: points.at(-1)!, f: m.update(points.at(-1)!, (t += 8)) });
  return { frames, release: m.release(points.at(-1)!, t) };
}

describe("landing model: sliding spots name the pointer, the geometry lands them", () => {
  it("along the stretch every frame names the spot and the pointer, and its landing is the geometry's for that held place: no steps", () => {
    const g = geometry();
    const { frames } = drive({ ...g, home: HOME }, [PRESS, at(326)]);
    for (const { p, f } of frames) {
      expect(f.held).toEqual({ kind: "spot", lane: "top", spot: HOME.spot, point: p });
      expect(f.landing).toEqual(g.landingOf(f.held!));
    }
  });

  it("a press, a wobble of ±6 px and a release is home: the geometry lands it at the item's own place", () => {
    const wobble: Point[] = [PRESS];
    for (let k = 0; k < 6; k++) wobble.push(at(PRESS.x + 6), at(PRESS.x - 6));
    for (const end of [PRESS.x + 6, PRESS.x - 6, PRESS.x + 3]) {
      const { frames, release } = drive({ ...geometry(), home: HOME }, [...wobble, at(end)], 0.3, 40);
      expect(release).toEqual({ kind: "spot", lane: "top", spot: HOME.spot, point: at(end), home: true });
      expect(frames.every(({ f }) => f.spot === HOME.spot)).toBe(true);
    }
  });

  it("passing a neighbor is one step, and the landing follows the pointer again past it", () => {
    const { frames } = drive({ ...geometry(), home: HOME }, [PRESS, at(760)]);
    const steps = frames.map(({ f }) => f.spot).filter((s, i, a) => i === 0 || s !== a[i - 1]);
    expect(steps).toEqual(["top/start/^|n@slide", "top/start/n|$@slide"]);
    expect(frames.at(-1)!.f.landing!.x).toBe(760 - GRAB.x);
  });

  it("release() names the held place: the spot and the pointer, home only where it lands at the item's own place", () => {
    expect(drive({ ...geometry(), home: HOME }, [PRESS, at(250.4)]).release).toEqual({ kind: "spot", lane: "top", spot: HOME.spot, point: at(250.4), home: false });
    expect(drive({ ...geometry(), home: HOME }, [PRESS, at(700)]).release).toEqual({ kind: "spot", lane: "top", spot: "top/start/n|$@slide", point: at(700), home: false });
  });
});
