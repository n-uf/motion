/**
 * A lane's guide and its mark come from one layout. For a lane empty as seen, the guide a landing model shows before the
 * pointer enters it (Near: the approached or pending lane) is the mark it shows once entered, the held item aside (guide continuity):
 * `lanes()` without `spot` gives an empty lane's marks in the after-entry layout of its one spot. Under Guides "all" the
 * corner two such lanes share goes to the lane the Near rule picks, and no two lanes' guides overlap on any frame.
 *
 * Swept over the libraries lab's document window and its preset layouts (`fixtures/lab-windows.json`), the library
 * windows of the rail-entry tests, the corner fixtures, and windows captured from two host kits at a toolbar's lift
 * (`fixtures/kit-windows-lift.json`). Each empty lane is entered from each of its sides that lies inside the stage, under
 * "near" and "all", in `emptyLanes: "real"`.
 */
import { createLandingModel, type LandingFrame } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import type { Point, Rect } from "../src/geometry";
import { lanes, solve, type Regions } from "../src/scene";
import { dragOf, windows, type Drag } from "./lift-windows";

/** The frames of a drag along `legs` (each a point and the speed to it, px/ms), a frame every 8 ms, then a rest. */
function play(d: Drag, mode: "near" | "all", legs: readonly [Point, number][], rest = 200): { point: Point; frame: LandingFrame }[] {
  const model = createLandingModel({
    regions: d.regions,
    regionsFor: d.regionsFor,
    grab: d.grab,
    floatLanding: (p) => d.regions.float?.after(p, d.grab).layout.items[d.w.dragged]?.rect ?? null,
    ...(d.home ? { home: d.home } : {}),
    placeGuides: mode,
  });
  const out: { point: Point; frame: LandingFrame }[] = [];
  let t = 0;
  let at = d.press;
  out.push({ point: at, frame: model.update(at, t) });
  for (const [b, speed] of legs) {
    const a = at;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / speed / 8));
    for (let k = 1; k <= n; k++) {
      at = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
      out.push({ point: at, frame: model.update(at, (t += 8)) });
    }
  }
  for (let r = 8; r <= rest; r += 8) out.push({ point: at, frame: model.update(at, (t += 8)) });
  return out;
}

const inStage = (s: Rect, p: Point, m = 2): boolean => p.x > s.x + m && p.x < s.x + s.width - m && p.y > s.y + m && p.y < s.y + s.height - m;

/** The approaches to a lane: from 40 px past each of its sides to inside it, those that start inside the stage. */
function approaches(l: { rect: Rect; axis: "x" | "y" }, stage: Rect): { side: string; from: Point; to: Point }[] {
  const r = l.rect;
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const out: { side: string; from: Point; to: Point }[] = [];
  const across = l.axis === "x" ? [r.x + r.width * 0.3, r.x + r.width * 0.7] : [r.y + r.height * 0.3, r.y + r.height * 0.7];
  for (const a of across) {
    if (l.axis === "x") {
      out.push({ side: `above at x ${Math.round(a)}`, from: { x: a, y: r.y - 40 }, to: { x: a, y: cy } });
      out.push({ side: `below at x ${Math.round(a)}`, from: { x: a, y: r.y + r.height + 40 }, to: { x: a, y: cy } });
    } else {
      out.push({ side: `left at y ${Math.round(a)}`, from: { x: r.x - 40, y: a }, to: { x: cx, y: a } });
      out.push({ side: `right at y ${Math.round(a)}`, from: { x: r.x + r.width + 40, y: a }, to: { x: cx, y: a } });
    }
  }
  if (l.axis === "x") {
    out.push({ side: "the start", from: { x: r.x - 40, y: cy }, to: { x: r.x + 24, y: cy } });
    out.push({ side: "the end", from: { x: r.x + r.width + 40, y: cy }, to: { x: r.x + r.width - 24, y: cy } });
  } else {
    out.push({ side: "the start", from: { x: cx, y: r.y - 40 }, to: { x: cx, y: r.y + 24 } });
    out.push({ side: "the end", from: { x: cx, y: r.y + r.height + 40 }, to: { x: cx, y: r.y + r.height - 24 } });
  }
  return out.filter((a) => inStage(stage, a.from) && inStage(stage, a.to, 0));
}

/** The lanes empty as seen: an edge not drawn in the layout as seen. */
function emptyLanes(d: Drag): Regions["lanes"] {
  const seen = solve(d.w.scene, { previous: d.options.previous! });
  return d.regions.lanes.filter((l) => d.w.scene.edges.some((e) => e.id === l.id) && (seen.edges[l.id]?.cross ?? 0) <= 1e-6);
}

type Guide = LandingFrame["guides"][number];
const fmt = (r: Rect): string => `${r.x.toFixed(1)},${r.y.toFixed(1)} ${r.width.toFixed(1)}x${r.height.toFixed(1)}`;
const sameGuides = (a: readonly Guide[], b: readonly Guide[]): string | null => {
  const key = (g: Guide): string => `${g.id} ${g.kind}`;
  const ka = a.map(key).sort().join(" ; ");
  const kb = b.map(key).sort().join(" ; ");
  if (ka !== kb) return `ids ${ka || "-"} before, ${kb || "-"} after`;
  for (const g of a) {
    const h = b.find((x) => x.id === g.id && x.kind === g.kind)!;
    const off = Math.max(Math.abs(g.rect.x - h.rect.x), Math.abs(g.rect.y - h.rect.y), Math.abs(g.rect.width - h.rect.width), Math.abs(g.rect.height - h.rect.height));
    if (off > 1) return `${g.id} at ${fmt(g.rect)} before, ${fmt(h.rect)} after`;
  }
  return null;
};
const overlap = (a: Rect, b: Rect): boolean => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.01 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.01;

interface Sweep {
  readonly bad: string[];
  readonly overlaps: string[];
  readonly compared: number;
  readonly noNear: number;
  readonly notEntered: number;
}

function sweep(): Record<"near" | "all", Sweep> {
  const out = { near: { bad: [], overlaps: [], compared: 0, noNear: 0, notEntered: 0 }, all: { bad: [], overlaps: [], compared: 0, noNear: 0, notEntered: 0 } } as Record<"near" | "all", { bad: string[]; overlaps: string[]; compared: number; noNear: number; notEntered: number }>;
  for (const w of windows()) {
    const d = dragOf(w);
    if (!d) continue;
    for (const l of emptyLanes(d))
      for (const a of approaches(l, w.scene.stage)) {
        const legs: [Point, number][] = [
          [a.from, 0.6],
          // (0.1 px/ms: under a pixel a frame, so a landing that follows the hand moves less than the 1 px tolerance.)
          [a.to, 0.1],
        ];
        const near = play(d, "near", legs);
        const all = play(d, "all", legs);
        // The first frame in the lane after the approach's start, and the last frame before it that shows the lane's
        // Near guide (the lane approached or pending). The model's lane logic doesn't read the guides level, so the two
        // plays hold the same lanes frame by frame.
        const startAt = near.findIndex((f, i) => i > 0 && Math.abs(f.point.x - a.from.x) < 1e-6 && Math.abs(f.point.y - a.from.y) < 1e-6);
        const e = near.findIndex((f, i) => i > startAt && f.frame.lane === l.id && f.frame.region === "lane");
        const where = `${w.name}: ${l.id} from ${a.side}`;
        for (const [mode, frames] of [
          ["near", near],
          ["all", all],
        ] as const) {
          const s = out[mode];
          for (const f of frames) {
            const gs = f.frame.guides;
            for (let i = 0; i < gs.length; i++)
              for (let j = i + 1; j < gs.length; j++)
                if (gs[i]!.lane !== gs[j]!.lane && overlap(gs[i]!.rect, gs[j]!.rect)) s.overlaps.push(`${where} (${mode}) at ${Math.round(f.point.x)},${Math.round(f.point.y)}: ${gs[i]!.id} ${fmt(gs[i]!.rect)} over ${gs[j]!.id} ${fmt(gs[j]!.rect)}`);
          }
          if (e < 0) {
            s.notEntered++;
            continue;
          }
          let n = -1;
          for (let i = e - 1; i > startAt; i--) if (near[i]!.frame.lane !== l.id && near[i]!.frame.guides.some((g) => g.lane === l.id)) {
            n = i;
            break;
          }
          if (n < 0) {
            s.noNear++;
            continue;
          }
          s.compared++;
          // The guides as the model gives them: the held toolbar is already cut out at the landing it takes (or would
          // take) there, so a host passes no held rect, and the floating toolbar over the lane changes nothing.
          const after = frames[e]!.frame.guides.filter((g) => g.lane === l.id);
          const why = sameGuides(frames[n]!.frame.guides.filter((g) => g.lane === l.id), after);
          if (why) s.bad.push(`${where} (${mode}): ${why}`);
          // Neither frame draws a guide under the landing the held toolbar takes there (the would-be landing before
          // entry is the landing at entry, a frame away).
          const landing = frames[e]!.frame.landing;
          for (const k of [n, e])
            for (const g of frames[k]!.frame.guides.filter((x) => x.lane === l.id && x.kind !== "line"))
              if (landing && Math.min(g.rect.x + g.rect.width, landing.x + landing.width) - Math.max(g.rect.x, landing.x) > 1 && Math.min(g.rect.y + g.rect.height, landing.y + landing.height) - Math.max(g.rect.y, landing.y) > 1)
                s.bad.push(`${where} (${mode})${k === n ? " before entry" : " at entry"}: ${g.id} ${fmt(g.rect)} under the landing ${fmt(landing)}`);
          // Across the lane (the pointer's place along it fixed), every Near frame from the first one shows that mark:
          // nothing jumps, a rail beside refused columns included (its first Near frame is at entry, pending).
          if (!a.side.startsWith("the "))
            for (let i = n - 1; i > startAt && near[i]!.frame.lane !== l.id && near[i]!.frame.guides.some((g) => g.lane === l.id); i--) {
              const earlier = sameGuides(frames[i]!.frame.guides.filter((g) => g.lane === l.id), after);
              if (earlier) {
                s.bad.push(`${where} (${mode}) at ${Math.round(frames[i]!.point.x)},${Math.round(frames[i]!.point.y)}: ${earlier}`);
                break;
              }
            }
        }
      }
  }
  return out;
}

describe("guide continuity: an empty lane's guide before entry is its mark after entry, the held item aside", () => {
  const result = sweep();
  for (const mode of ["near", "all"] as const)
    it(`under "${mode}": every lane empty as seen, entered from each side, shows the same marks on the last Near frame and the first entered frame`, () => {
      const r = result[mode];
      // The sweep is not vacuous: empty lanes are entered with a Near guide before.
      expect(r.compared).toBeGreaterThan(60);
      expect(r.bad).toEqual([]);
    });
  it('no two lanes\' guides overlap on any frame, under "all" and "near"', () => {
    expect(result.all.overlaps).toEqual([]);
    expect(result.near.overlaps).toEqual([]);
  });
});

describe("the corner under \"all\" goes to the lane nearest the pointer within reach, for ownership only", () => {
  // A kit window: an empty top bar and an empty left rail whose band lies over the left panel column (refused for a
  // toolbar). The pointer crosses the column toward the rail at y 250.
  const w = windows().find((x) => x.name === "kit: window 1, columns both sides")!;
  const d = dragOf(w)!;
  const rail = d.regions.lanes.find((l) => l.id === "bar:left")!;
  const top = (gs: readonly Guide[]): number => Math.min(...gs.filter((g) => g.lane === "bar:left" && g.kind !== "line").map((g) => g.rect.y));
  const legs: [Point, number][] = [
    [{ x: rail.rect.x + rail.rect.width + 120, y: 250 }, 0.6],
    [{ x: rail.rect.x + rail.rect.width / 2, y: 250 }, 0.1],
  ];

  it("within reach of the rail, over the column, the rail's predicted box owns the corner: no jump at entry", () => {
    expect(rail.entry && rail.corners).toBeTruthy();
    const fs = play(d, "all", legs);
    const e = fs.findIndex((f) => f.frame.lane === "bar:left" && f.frame.region === "lane");
    expect(e).toBeGreaterThan(0);
    const atEntry = top(fs[e]!.frame.guides);
    const close = fs.slice(0, e).filter((f) => f.point.x - (rail.rect.x + rail.rect.width) <= 12 && f.point.x - (rail.rect.x + rail.rect.width) > 0);
    expect(close.length).toBeGreaterThan(5);
    for (const f of close) expect([Math.round(f.point.x), top(f.frame.guides)]).toEqual([Math.round(f.point.x), atEntry]);
    // Beyond reach of both, the bar keeps it.
    const far = fs.find((f) => f.point.x - (rail.rect.x + rail.rect.width) > 40 && f.frame.lane !== "bar:left")!;
    expect(top(far.frame.guides)).toBeGreaterThan(atEntry);
  });

  it('under "near", nothing shows over the column: the rail is not made Near by the corner rule', () => {
    const fs = play(d, "near", legs);
    for (const f of fs) if (f.frame.region === "refused" && !f.frame.pending && !f.frame.lane) expect(f.frame.guides, `${Math.round(f.point.x)}`).toEqual([]);
  });
});

describe("lanes(): an empty lane's marks in its spot's after-entry layout", () => {
  // The lab's window with every panel on the left: the top bar and the right rail empty, the right rail beside nothing.
  const w = windows().find((x) => x.name === "lab: every panel on the left, tools")!;
  const d = dragOf(w)!;
  const lane = (id: string) => d.regions.lanes.find((l) => l.id === id)!;

  it("the empty top bar's box lies over the left column, as its mark does once entered (one box, not cut at the column)", () => {
    const top = lane("top");
    const entered = d.regionsFor(top.spots[0]!.id).lanes.find((l) => l.id === "top")!;
    expect(top.marks).toEqual(entered.marks);
    expect(top.marks.map((m) => [m.id, m.rect.x, m.rect.width])).toEqual([["top/box/^|$", 30, 1050]]);
  });

  it("the empty right rail gives the corner to the bar in its marks, keeps it in `entry`, and names the bar in `corners`", () => {
    const rail = lane("rail-right");
    const entered = d.regionsFor(rail.spots[0]!.id).lanes.find((l) => l.id === "rail-right")!;
    expect(rail.entry).toEqual(entered.marks);
    expect(rail.corners).toEqual(["top"]);
    expect(rail.marks.map((m) => [m.id, m.rect.y])).toEqual([["rail-right/box/^|$", 64]]);
    expect(rail.entry!.map((m) => [m.id, m.rect.y])).toEqual([["rail-right/box/^|$", 32]]);
  });

  it("a lane that holds items has no prediction; with a spot held no lane has one", () => {
    expect(lane("rail-left").entry).toBeUndefined();
    expect(lane("bottom").entry).toBeUndefined();
    for (const l of d.regionsFor(lane("rail-right").spots[0]!.id).lanes) expect([l.id, l.entry, l.corners]).toEqual([l.id, undefined, undefined]);
  });

  it('`emptyLanes: "edge"` predicts nothing: the thin strips as seen', () => {
    const edge = lanes(w.scene, w.dragged, { ...d.options, emptyLanes: "edge" });
    for (const l of edge.lanes) expect(l.entry).toBeUndefined();
    expect(edge.lanes.find((l) => l.id === "top")!.marks.every((m) => m.kind === "hatch")).toBe(true);
  });
});
