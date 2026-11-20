/**
 * A lane's `entry` marks and the corner it shares. A lane may carry, beside its `marks`, the marks it shows once entered
 * (`entry`, placement's prediction for an empty lane) and the lanes those overlap (`corners`). While it is the lane the
 * pointer picks (held, pending or approached) the landing model shows `entry` in place of `marks`; under `"all"` the
 * lanes in `corners` are cut where they overlap it, so the corner goes to that lane and no two guides overlap. With no
 * such lane every lane shows its `marks`, where the bar keeps the corner.
 */
import { describe, expect, it } from "vitest";
import type { Point, Rect } from "../src/shapes";
import { createLandingModel, type LandingFrame, type LandingGuide, type LandingLane, type LandingOptions, type LandingRegions } from "../src/drag";

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });

/**
 * An 800 × 600 window, both its top bar (y 0–31) and its left rail (x 0–30) empty: their predictions share the corner
 * (0–30, 0–31). The bar keeps it in `marks`; the rail's `entry` runs up to y 0 and names the bar in `corners`.
 */
function window(): LandingRegions {
  const top: LandingLane = {
    id: "top",
    rect: rect(0, 0, 800, 31),
    axis: "x",
    spots: [{ id: "top/start/^|$@slide", along: [0, 800], landing: rect(0, 0, 100, 31) }],
    refused: [],
    marks: [{ id: "top/box/^|$", kind: "box", rect: rect(0, 0, 800, 31) }],
  };
  const rail: LandingLane = {
    id: "rail",
    rect: rect(0, 0, 30, 600),
    axis: "y",
    // (Its one spot lands at the rail's foot, y 500–600: the Near guide leaves that landing out.)
    spots: [{ id: "rail/start/^|$", along: [0, 600], landing: rect(0, 500, 30, 100) }],
    refused: [],
    marks: [{ id: "rail/box/^|$", kind: "box", rect: rect(0, 31, 30, 569) }],
    entry: [{ id: "rail/box/^|$", kind: "box", rect: rect(0, 0, 30, 600) }],
    corners: ["top"],
  };
  return { lanes: [top, rail], refused: [], content: rect(0, 0, 800, 600), blocked: [], stage: rect(0, 0, 800, 600), item: { width: 100, height: 30 } };
}
const options = (placeGuides: "near" | "all"): LandingOptions => ({ regions: window(), floatLanding: (p: Point) => rect(p.x - 50, p.y - 15, 100, 30), placeGuides });

/** The frames along `path` at 0.15 px/ms, a frame every 8 ms. */
function frames(o: LandingOptions, path: readonly Point[]): LandingFrame[] {
  const m = createLandingModel(o);
  const out: LandingFrame[] = [m.update(path[0]!, 0)];
  let t = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.15 / 8));
    for (let k = 1; k <= n; k++) out.push(m.update({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }, (t += 8)));
  }
  return out;
}
const of = (f: LandingFrame, lane: string): Rect[] => f.guides.filter((g: LandingGuide) => g.lane === lane).map((g) => g.rect);
const overlap = (a: Rect, b: Rect): boolean => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1e-6 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1e-6;

describe("a lane's entry marks and the corner it shares", () => {
  it('under "near", the approached and the pending rail show its entry marks: up to the stage top, the corner its own', () => {
    // From the page toward the rail: approached within reach, then pending inside it.
    const fs = frames(options("near"), [{ x: 300, y: 300 }, { x: 60, y: 300 }, { x: 20, y: 300 }]);
    const near = fs.filter((f) => f.lane !== "rail" && f.guides.some((g) => g.lane === "rail"));
    expect(near.length).toBeGreaterThan(0);
    expect(near.some((f) => f.pending === "rail")).toBe(true);
    // Up to the stage top, and less the landing it would take (y 500–600).
    for (const f of near) expect(of(f, "rail")).toEqual([rect(0, 0, 30, 500)]);
  });

  it("the Near guide leaves out the held toolbar at the landing it would take there, never its floating rect", () => {
    // The floating toolbar (100 × 30 at the pointer) lies over the rail at y 285–315; the guide is cut only at y 500–600.
    const fs = frames(options("near"), [{ x: 300, y: 300 }, { x: 60, y: 300 }, { x: 20, y: 300 }]);
    const pending = fs.filter((f) => f.pending === "rail");
    expect(pending.length).toBeGreaterThan(0);
    for (const f of pending) expect(f.guides.filter((g) => g.lane === "rail").map((g) => [g.id, g.rect])).toEqual([["rail/box/^|$", rect(0, 0, 30, 500)]]);
  });

  it('under "all", with no lane near, every lane shows its marks: the bar keeps the corner', () => {
    const fs = frames(options("all"), [{ x: 400, y: 300 }, { x: 410, y: 300 }]);
    const f = fs.at(-1)!;
    expect(of(f, "top")).toEqual([rect(0, 0, 800, 31)]);
    expect(of(f, "rail")).toEqual([rect(0, 31, 30, 569)]);
  });

  it('under "all", while the rail is the lane the pointer picks, the rail owns the corner and the bar is cut there', () => {
    const fs = frames(options("all"), [{ x: 300, y: 300 }, { x: 60, y: 300 }, { x: 20, y: 300 }]);
    const picked = fs.filter((f) => f.pending === "rail" || f.lane === "rail");
    expect(picked.length).toBeGreaterThan(0);
    for (const f of picked) {
      expect(of(f, "rail")).toEqual([rect(0, 0, 30, 500)]);
      expect(of(f, "top")).toEqual([rect(30, 0, 770, 31)]);
      // The bar keeps its id: a cut at its start trims it.
      expect(f.guides.filter((g) => g.lane === "top").map((g) => g.id)).toEqual(["top/box/^|$"]);
    }
  });

  it('under "all", on every frame of a pass by the corner, no two lanes\' guides overlap', () => {
    const fs = frames(options("all"), [{ x: 400, y: 300 }, { x: 60, y: 300 }, { x: 20, y: 200 }, { x: 20, y: 60 }, { x: 200, y: 20 }, { x: 400, y: 300 }]);
    for (const f of fs) for (const a of of(f, "top")) for (const b of of(f, "rail")) expect(overlap(a, b)).toBe(false);
  });

  it("a lane without entry marks shows its marks as before", () => {
    const r = window();
    const plain: LandingRegions = { ...r, lanes: r.lanes.map((l) => ({ id: l.id, rect: l.rect, axis: l.axis, spots: l.spots, refused: l.refused, marks: l.marks! })) };
    const fs = frames({ ...options("near"), regions: plain }, [{ x: 300, y: 300 }, { x: 60, y: 300 }, { x: 20, y: 300 }]);
    for (const f of fs.filter((x) => x.lane !== "rail" && x.guides.some((g) => g.lane === "rail"))) expect(of(f, "rail")).toEqual([rect(0, 31, 30, 469)]);
  });
});
