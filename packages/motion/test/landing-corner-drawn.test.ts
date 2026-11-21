/**
 * A shared corner is drawn by exactly one lane. Under guides `"all"` the corner two empty lanes share goes to the rail
 * the pointer picks (near it, or nearest within reach) only where that rail's mark, as it is drawn, covers it: its
 * `entry` marks clipped to its own `rect`, as a host clips them (a lane's marks lie inside its rect). Otherwise the bar
 * keeps it. A rail whose lane stops short of a bar's band (a host's lane that doesn't reach into it) never takes the
 * corner from the bar by a mark it can't draw there.
 */
import { describe, expect, it } from "vitest";
import type { Point, Rect } from "../src/shapes";
import { createLandingModel, type LandingFrame, type LandingLane, type LandingOptions, type LandingRegions } from "../src/drag";

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const W = 868;
const H = 658;
/** A bar's thickness and a rail's, px. */
const BAR = 31;
const RAIL = 30;

/** The part of `a` inside `b`, or null. */
function within(a: Rect, b: Rect): Rect | null {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  return x1 - x0 > 1e-6 && y1 - y0 > 1e-6 ? rect(x0, y0, x1 - x0, y1 - y0) : null;
}
const covers = (r: Rect, p: Point): boolean => p.x >= r.x - 1e-6 && p.x <= r.x + r.width + 1e-6 && p.y >= r.y - 1e-6 && p.y <= r.y + r.height + 1e-6;

/**
 * A window of two empty bars (top y 0–31, bottom y 627–658) and two empty rails (x 0–30 and 838–868). A bar's marks are
 * its whole band. A rail's `entry` runs the whole stage height and names both bars in `corners`; its `marks` give both
 * corners up. Its lane rect is `[from, to]` along y: a host's lane, which may stop short of a band.
 */
function window(from: number, to: number): LandingRegions {
  const bar = (id: string, y: number): LandingLane => ({
    id,
    rect: rect(0, y, W, BAR),
    axis: "x",
    spots: [{ id: `${id}/start/^|$`, along: [0, W], landing: rect(300, y, 100, BAR) }],
    refused: [],
    marks: [{ id: `${id}/box/^|$`, kind: "box", rect: rect(0, y, W, BAR) }],
  });
  const rail = (id: string, x: number): LandingLane => ({
    id,
    rect: rect(x, from, RAIL, to - from),
    axis: "y",
    // (Its one spot lands mid-lane, away from every corner.)
    spots: [{ id: `${id}/start/^|$`, along: [from, to], landing: rect(x, 250, RAIL, 100) }],
    refused: [],
    marks: [{ id: `${id}/box/^|$`, kind: "box", rect: rect(x, BAR, RAIL, H - 2 * BAR) }],
    entry: [{ id: `${id}/box/^|$`, kind: "box", rect: rect(x, 0, RAIL, H) }],
    corners: ["top", "bottom"],
  });
  return { lanes: [bar("top", 0), bar("bottom", H - BAR), rail("rail-left", 0), rail("rail-right", W - RAIL)], refused: [], content: rect(0, 0, W, H), blocked: [], stage: rect(0, 0, W, H), item: { width: 100, height: 30 } };
}
const options = (regions: LandingRegions, placeGuides: "near" | "all"): LandingOptions => ({ regions, floatLanding: (p: Point) => rect(p.x - 50, p.y - 15, 100, 30), placeGuides });

/** The last frame of a glide from the page's middle to `to` at 0.15 px/ms, then a rest. */
function settled(regions: LandingRegions, mode: "near" | "all", to: Point): LandingFrame {
  const m = createLandingModel(options(regions, mode));
  const from = { x: W / 2, y: H / 2 };
  let t = 0;
  m.update(from, 0);
  const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 0.15 / 8));
  for (let k = 1; k <= n; k++) m.update({ x: from.x + ((to.x - from.x) * k) / n, y: from.y + ((to.y - from.y) * k) / n }, (t += 8));
  let f!: LandingFrame;
  for (let k = 0; k < 30; k++) f = m.update(to, (t += 8));
  return f;
}

/** Every guide as it is drawn: inside its own lane's rect. */
function drawn(f: LandingFrame, regions: LandingRegions): { lane: string; rect: Rect }[] {
  return f.guides.flatMap((g) => {
    const lane = regions.lanes.find((l) => l.id === g.lane)!;
    const r = within(g.rect, lane.rect);
    return r ? [{ lane: g.lane, rect: r }] : [];
  });
}

/** The corner's sample points: a 3 × 3 grid over the rail's column and the bar's band. */
function corner(x: number, y: number): Point[] {
  return [4, 15, 26].flatMap((dx) => [4, 15, 26].map((dy) => ({ x: x + dx, y: y + dy })));
}
const CORNERS: Record<string, Point[]> = {
  "top left": corner(0, 0),
  "top right": corner(W - RAIL, 0),
  "bottom left": corner(0, H - BAR),
  "bottom right": corner(W - RAIL, H - BAR),
};

describe("a rail whose lane stops short of a bar's band", () => {
  // An 868 × 658 window; the rails' lanes run y 71–553: short of the top band (0–31) and the bottom band (627–658).
  const regions = window(71, 553);

  it('under "all", the pointer near the left rail\'s foot: the bottom bar keeps the corner its rail can\'t draw', () => {
    // Just past the rail's side, near its foot (inside the rail's reach, y 520).
    const f = settled(regions, "all", { x: 40, y: 520 });
    expect(f.lane).toBeNull();
    for (const p of CORNERS["bottom left"]!) expect(drawn(f, regions).filter((d) => covers(d.rect, p)).map((d) => d.lane), `${p.x},${p.y}`).toEqual(["bottom"]);
    for (const p of CORNERS["top left"]!) expect(drawn(f, regions).filter((d) => covers(d.rect, p)).map((d) => d.lane), `${p.x},${p.y}`).toEqual(["top"]);
  });
});

describe("a shared corner is covered by exactly one drawn mark", () => {
  // Rails' lanes from `from` to `to`: reaching into both bands, into half of each, up to each band, short of each.
  const EXTENTS: readonly (readonly [number, number])[] = [
    [0, H],
    [15, H - 16],
    [BAR, H - BAR],
    [71, H - 105],
    [BAR, H - 105],
    [71, H - BAR],
  ];
  // The pointer near either rail, near either bar, and in neither's reach.
  const POINTERS: Record<string, Point> = {
    "near the left rail's middle": { x: 40, y: 300 },
    "near the left rail's foot": { x: 40, y: 520 },
    "near the left rail's head": { x: 40, y: 110 },
    "near the right rail's foot": { x: W - 40, y: 520 },
    "near the right rail's head": { x: W - 40, y: 110 },
    "near the top bar": { x: 400, y: 40 },
    "near the bottom bar": { x: 400, y: H - 40 },
    "far from every lane": { x: 400, y: 330 },
  };

  for (const [from, to] of EXTENTS)
    for (const [where, to2] of Object.entries(POINTERS))
      it(`rails' lanes y ${from}–${to}, pointer ${where}: under "all" every corner point has one drawn mark; under "near" never two`, () => {
        const regions = window(from, to);
        for (const mode of ["all", "near"] as const) {
          const f = settled(regions, mode, to2);
          const marks = drawn(f, regions);
          for (const [name, points] of Object.entries(CORNERS))
            for (const p of points) {
              const n = marks.filter((d) => covers(d.rect, p));
              const at = `${mode}, ${name} corner at ${p.x},${p.y}: ${n.map((d) => d.lane).join("+") || "none"}`;
              if (mode === "all") expect(n.length, at).toBe(1);
              else expect(n.length, at).toBeLessThanOrEqual(1);
            }
        }
      });
});

/** A guide as it is drawn: a line thinner than 2 px is 2 px thick, centred on its place (as `guideRects` draws it). */
function thick(r: Rect, kind: string): Rect {
  if (kind !== "line") return r;
  const vertical = r.width <= r.height;
  const own = vertical ? r.width : r.height;
  if (own >= 2) return r;
  const d = (2 - own) / 2;
  return vertical ? rect(r.x - d, r.y, 2, r.height) : rect(r.x, r.y - d, r.width, 2);
}
/** Every guide as it is drawn, in its own lane's rect, lines at their drawn thickness. */
function drawnThick(f: LandingFrame, regions: LandingRegions): { lane: string; kind: string; rect: Rect }[] {
  return f.guides.flatMap((g) => {
    const r = within(thick(g.rect, g.kind), regions.lanes.find((l) => l.id === g.lane)!.rect);
    return r ? [{ lane: g.lane, kind: g.kind, rect: r }] : [];
  });
}
const swap = (regions: LandingRegions, id: string, change: Partial<LandingLane>): LandingRegions => ({ ...regions, lanes: regions.lanes.map((l) => (l.id === id ? { ...l, ...change } : l)) });

describe("the corner decision compares marks as they are drawn, on both sides", () => {
  it("a named lane's marks are clipped to its own rect: a bar lane cut short to x 40–828 does not hold a corner it can't draw", () => {
    // The rails' lanes y 15–642; the top bar's lane x 40–828, its marks x 0–868. The pointer is held in the left rail.
    const regions = swap(window(15, 642), "top", { rect: rect(40, 0, 788, BAR) });
    const f = settled(regions, "all", { x: 15, y: 300 });
    expect(f.lane).toBe("rail-left");
    // (The rail's lane starts at y 15, so the corner's part below it is the rail's to draw, and no one else's.)
    for (const y of [16, 20, 28]) expect(drawn(f, regions).filter((d) => covers(d.rect, { x: 15, y })).map((d) => d.lane), `y ${y}`).toEqual(["rail-left"]);
  });

  it("a line counts at its drawn thickness: a zero-thick bar line inside the corner the rail took is not drawn over it", () => {
    const top = window(0, H).lanes.find((l) => l.id === "top")!;
    const regions = swap(window(0, H), "top", { marks: [...top.marks!, { id: "top/line/a|b", kind: "line", rect: rect(10, 0, 0, BAR) }] });
    for (const to of [{ x: 15, y: 300 }, { x: 40, y: 300 }]) {
      const f = settled(regions, "all", to);
      const at = drawnThick(f, regions).filter((d) => covers(d.rect, { x: 10, y: 15 }));
      expect(at.map((d) => `${d.lane}/${d.kind}`), `${to.x}`).toEqual(["rail-left/box"]);
    }
  });

  it("the named lane is cut by what the owner draws: a point in a dropped stub is the bar's, and so is one the landing leaves", () => {
    // The rail's landing starts 6 px below the stage top: the 6 px above it is a stub no longer than MIN_BOX_LENGTH,
    // not drawn. Its landing then covers the corner under it.
    const base = window(0, H);
    const rail = base.lanes.find((l) => l.id === "rail-left")!;
    const regions = swap(base, "rail-left", { spots: [{ ...rail.spots[0]!, landing: rect(0, 6, RAIL, 100) }] });
    for (const to of [{ x: 15, y: 60 }, { x: 40, y: 60 }]) {
      const f = settled(regions, "all", to);
      expect(drawn(f, regions).filter((d) => covers(d.rect, { x: 15, y: 3 })).map((d) => d.lane), `${to.x}`).toEqual(["top"]);
    }
  });
});

describe("what a lane returns is never clipped to its hit rect", () => {
  // A held layout draws a lane's marks outside its hit rect (placement keeps the hit rect as seen): a rail whose
  // hit rect starts at y 32 has a head line at y 0.
  const rail = (): LandingRegions => ({
    lanes: [
      {
        id: "rail",
        rect: rect(0, 32, RAIL, 576),
        axis: "y",
        spots: [{ id: "rail/start/^|$", along: [32, 608], landing: rect(0, 250, RAIL, 100) }],
        refused: [],
        marks: [
          { id: "rail/line/^|x", kind: "line", rect: rect(0, 0, RAIL, 0) },
          { id: "rail/box/^|$", kind: "box", rect: rect(0, 4, RAIL, 600) },
        ],
      },
    ],
    refused: [],
    content: rect(0, 0, W, H),
    blocked: [],
    stage: rect(0, 0, W, H),
    item: { width: 100, height: 30 },
  });
  for (const mode of ["near", "all"] as const)
    it(`under "${mode}", the held rail keeps its head line and its box above its rect`, () => {
      const f = settled(rail(), mode, { x: 15, y: 300 });
      expect(f.lane).toBe("rail");
      expect(f.guides.find((g) => g.id === "rail/line/^|x")?.rect).toEqual(rect(0, 0, RAIL, 0));
      expect(f.guides.some((g) => g.id.startsWith("rail/box/") && g.rect.y === 4)).toBe(true);
    });
});

describe("the named lane's kept marks are its drawn ones, and the held landing is left out", () => {
  it("a bar lane at x 20–848 with marks over the full width: at (10, 20) exactly the rail draws", () => {
    const regions = swap(window(15, 642), "top", { rect: rect(20, 0, 828, BAR) });
    for (const to of [{ x: 15, y: 300 }, { x: 40, y: 300 }]) {
      const f = settled(regions, "all", to);
      expect(drawn(f, regions).filter((d) => covers(d.rect, { x: 10, y: 20 })).map((d) => d.lane), `${to.x}`).toEqual(["rail-left"]);
    }
  });

  it("held, the bar draws nothing under the toolbar at the corner; the stub outside the landing stays the bar's", () => {
    // The rail's landing is y 5–105: the 5 px above it is a stub, not drawn by the rail.
    const base = window(0, H);
    const rail = base.lanes.find((l) => l.id === "rail-left")!;
    const regions = swap(base, "rail-left", { spots: [{ ...rail.spots[0]!, landing: rect(0, 5, RAIL, 100) }] });
    for (const to of [{ x: 15, y: 60 }, { x: 40, y: 60 }]) {
      const f = settled(regions, "all", to);
      expect(drawn(f, regions).filter((d) => covers(d.rect, { x: 15, y: 20 })).map((d) => d.lane), `under ${to.x}`).toEqual([]);
      expect(drawn(f, regions).filter((d) => covers(d.rect, { x: 15, y: 3 })).map((d) => d.lane), `stub ${to.x}`).toEqual(["top"]);
    }
  });
});
