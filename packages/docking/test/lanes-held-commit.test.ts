/**
 * A held frame's marks are the commit's (decision 0002): a lane's marks follow its edge as drawn in the layout they are
 * drawn in, and only its hit rect stays as seen.
 *
 * - The hull: for every edge lane and each of its spots, along the lane's axis the hull of the lane's marks while held
 *   (`after({ spot })`, through `./held-lanes`) and the spot's landing is the lane's edge rect in the spot's committed
 *   layout, within the edge's padding and 1 px.
 * - The corner owner: on every frame (as seen and each spot held), a corner where two drawn lanes' edges meet is covered
 *   by the marks of the edge that owns it in that frame's layout (less the items drawn there), and by no other lane's.
 *
 * Swept over the guide-continuity windows (`./lift-windows`: the libraries lab's window and its presets, two host kits'
 * windows at a toolbar's lift, the rail-entry and corner fixtures), side rails holding items and empty, for a held
 * frame's lanes and for the guides a landing model shows held at each spot under "near" and "all".
 */
import { modelOver, type DrawnFrame as LandingFrame } from "./landing-model";
import { describe, expect, it } from "vitest";
import type { Point, Rect } from "@n-uf/placement";
import { lanes, solve, type DockRegions, type DockState, type DockLayout } from "../src";
import { dragOf, windows, type Drag } from "./lift-windows";

const ORIGIN = { x: 0, y: 0 };
type Axis = "x" | "y";
type Mark = { readonly lane: string; readonly kind: string; readonly rect: Rect; readonly id: string };
type Lane = DockRegions["lanes"][number];
type Spot = Lane["spots"][number];

const lo = (r: Rect, a: Axis): number => (a === "x" ? r.x : r.y);
const hi = (r: Rect, a: Axis): number => (a === "x" ? r.x + r.width : r.y + r.height);
const fmt = (r: Rect): string => `${r.x.toFixed(1)},${r.y.toFixed(1)} ${r.width.toFixed(1)}x${r.height.toFixed(1)}`;
const inter = (a: Rect, b: Rect): Rect | null => {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  return x1 - x0 > 1 && y1 - y0 > 1 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
};
const contains = (a: Rect, b: Rect): boolean => b.x >= a.x - 1e-6 && b.y >= a.y - 1e-6 && b.x + b.width <= a.x + a.width + 1e-6 && b.y + b.height <= a.y + a.height + 1e-6;

const edgeOf = (s: DockState, id: string) => s.edges.find((e) => e.id === id);
const axisOf = (s: DockState, id: string): Axis => (edgeOf(s, id)!.side === "top" || edgeOf(s, id)!.side === "bottom" ? "x" : "y");
const drawn = (layout: DockLayout, id: string): boolean => (layout.edges[id]?.cross ?? 0) > 1e-6;
const pad = (s: DockState, id: string): { start: number; end: number } => ({ start: Math.max(0, edgeOf(s, id)!.pad?.start ?? 0), end: Math.max(0, edgeOf(s, id)!.pad?.end ?? 0) });

/** Whether the side rails (compact side edges) of a window hold an item as seen: "occupied", "empty" or "mixed". */
function railsOf(s: DockState): "occupied" | "empty" | "mixed" | "none" {
  const rails = s.edges.filter((e) => (e.side === "left" || e.side === "right") && e.compact);
  if (rails.length === 0) return "none";
  const full = rails.filter((e) => e.items.length > 0).length;
  return full === rails.length ? "occupied" : full === 0 ? "empty" : "mixed";
}

/** The items docked on `edge` in `layout` but `dragged`, their rects. */
const itemsOn = (layout: DockLayout, edge: string, dragged: string): Rect[] =>
  Object.entries(layout.items)
    .filter(([id, it]) => id !== dragged && it.edge === edge && !it.floating && !it.inMenu && it.rect.width > 0 && it.rect.height > 0)
    .map(([, it]) => it.rect);

/**
 * The edge holds the held item alone in `layout`: all its room is free and fits the item, so its marks and the landing
 * cover it. (Beside a docked item, room shorter than the held one is a line, not a box: the hull is then not the edge.
 * A lane with a refused stretch is left out too: no mark lies in it.)
 */
const alone = (layout: DockLayout, edge: string, dragged: string): boolean => layout.items[dragged]?.edge === edge && itemsOn(layout, edge, dragged).length === 0;

/**
 * The hull of `marks`, `landing` and the items the edge holds in the commit (marks never lie over an item), along the
 * lane's axis, against the edge in the commit: null when it matches within its pad and 1 px.
 */
function hullIssue(s: DockState, lane: string, marks: readonly Mark[], landing: Rect, committed: DockLayout, dragged: string): string | null {
  const a = axisOf(s, lane);
  const e = committed.edges[lane]!;
  const p = pad(s, lane);
  const solid = [landing, ...itemsOn(committed, lane, dragged), ...marks.map((m) => m.rect)];
  const h0 = Math.min(...solid.map((r) => lo(r, a)));
  const h1 = Math.max(...solid.map((r) => hi(r, a)));
  const e0 = lo(e.rect, a);
  const e1 = hi(e.rect, a);
  const ok = h0 >= e0 - 1 && h0 <= e0 + p.start + 1 && h1 <= e1 + 1 && h1 >= e1 - p.end - 1;
  return ok ? null : `hull ${a} ${h0.toFixed(1)}→${h1.toFixed(1)}, committed ${lane} ${e0.toFixed(1)}→${e1.toFixed(1)} (pad ${p.start}/${p.end})`;
}

/** The corners of `layout` where two drawn edge lanes across each other meet, each with the edge that owns it. */
function corners(s: DockState, layout: DockLayout, laneIds: ReadonlySet<string>): { owner: string; other: string; rect: Rect }[] {
  const out: { owner: string; other: string; rect: Rect }[] = [];
  const ids = [...laneIds].filter((id) => edgeOf(s, id) && drawn(layout, id));
  for (const b of ids.filter((id) => axisOf(s, id) === "x"))
    for (const r of ids.filter((id) => axisOf(s, id) === "y")) {
      const br = layout.edges[b]!.rect;
      const rr = layout.edges[r]!.rect;
      // The square at the rail's width and the bar's height, where the two meet (touch or overlap).
      const c = { x: rr.x, y: br.y, width: rr.width, height: br.height };
      const near = rr.y <= br.y + br.height + 1 && br.y <= rr.y + rr.height + 1 && br.x <= rr.x + rr.width + 1 && rr.x <= br.x + br.width + 1;
      if (!near) continue;
      if (contains(br, c)) out.push({ owner: b, other: r, rect: c });
      else if (contains(rr, c)) out.push({ owner: r, other: b, rect: c });
    }
  return out;
}

/** A corner owner issue: another lane's marks in the corner, or a part of it the owner's marks leave undrawn. */
function cornerIssues(s: DockState, layout: DockLayout, laneIds: ReadonlySet<string>, marks: readonly Mark[], dragged: string, landing: Rect | null): string[] {
  const out: string[] = [];
  const items = Object.entries(layout.items)
    .filter(([id, it]) => id !== dragged && !it.floating && !it.inMenu && it.rect.width > 0 && it.rect.height > 0)
    .map(([, it]) => it.rect);
  const solid = landing ? [...items, landing] : items;
  for (const c of corners(s, layout, laneIds)) {
    for (const m of marks) if (m.lane !== c.owner && edgeOf(s, m.lane) && inter(m.rect, c.rect)) out.push(`${m.id} ${fmt(m.rect)} in ${c.owner}'s corner ${fmt(c.rect)} with ${c.other}`);
    const own = marks.filter((m) => m.lane === c.owner).map((m) => m.rect);
    // The owner's padding at its two ends holds no item and no mark (its items start past it): never a gap.
    const oa = axisOf(s, c.owner);
    const or = layout.edges[c.owner]!.rect;
    const op = pad(s, c.owner);
    const inPad = (v: number): boolean => v <= lo(or, oa) + op.start + 1 || v >= hi(or, oa) - op.end - 1;
    // Sampled at every pixel's middle: a point of the corner on no item and in no mark of its owner is undrawn.
    let gaps = 0;
    for (let x = Math.ceil(c.rect.x) + 0.5; x < c.rect.x + c.rect.width - 1; x++)
      for (let y = Math.ceil(c.rect.y) + 0.5; y < c.rect.y + c.rect.height - 1; y++) {
        const at = (r: Rect): boolean => x >= r.x - 1 && x <= r.x + r.width + 1 && y >= r.y - 1 && y <= r.y + r.height + 1;
        if (!solid.some(at) && !own.some(at) && !inPad(oa === "x" ? x : y)) gaps++;
      }
    if (gaps > 0) out.push(`${c.owner}'s corner ${fmt(c.rect)} with ${c.other}: ${gaps} px drawn by no mark of ${c.owner}`);
  }
  return out;
}

const committedOf = (sp: Spot): DockLayout => sp.target.after(ORIGIN, ORIGIN).layout;
const marksOf = (ls: readonly Lane[]): Mark[] => ls.flatMap((l) => l.marks.map((m) => ({ lane: l.id, kind: m.kind, rect: m.rect, id: m.id })));

interface Tally {
  hull: { checked: number; refused: number; bad: string[] };
  corner: { frames: number; corners: number; bad: string[] };
  byRails: Record<string, number>;
}

function sweepLanes(): Tally {
  const t: Tally = { hull: { checked: 0, refused: 0, bad: [] }, corner: { frames: 0, corners: 0, bad: [] }, byRails: {} };
  for (const w of windows()) {
    const d = dragOf(w);
    if (!d) continue;
    const s = w.state;
    t.byRails[railsOf(s)] = (t.byRails[railsOf(s)] ?? 0) + 1;
    const seen = solve(s, { previous: d.options.previous! });
    const ids = new Set(d.regions.lanes.map((l) => l.id));
    t.corner.frames++;
    t.corner.corners += corners(s, seen, ids).length;
    for (const b of cornerIssues(s, seen, ids, marksOf(d.regions.lanes), w.dragged, null)) t.corner.bad.push(`${w.name} seen: ${b}`);
    for (const l of d.regions.lanes) {
      if (!edgeOf(s, l.id)) continue;
      for (const sp of l.spots) {
        const held = d.regionsFor(sp.id);
        const layout = committedOf(sp);
        const hl = held.lanes.find((x) => x.id === l.id);
        if (!hl || !drawn(layout, l.id)) continue;
        t.corner.frames++;
        t.corner.corners += corners(s, layout, ids).length;
        for (const b of cornerIssues(s, layout, ids, marksOf(held.lanes), w.dragged, sp.landing)) t.corner.bad.push(`${w.name}, ${sp.id} held: ${b}`);
        if (!alone(layout, l.id, w.dragged)) continue;
        // A refused stretch draws no mark (and here its end lies short of the edge's): the hull is not the edge.
        if (hl.refused.length > 0) {
          t.hull.refused++;
          continue;
        }
        t.hull.checked++;
        const why = hullIssue(s, l.id, marksOf([hl]), sp.landing, layout, w.dragged);
        if (why) t.hull.bad.push(`${w.name}, ${sp.id}: ${why}`);
      }
    }
  }
  return t;
}

/** The landing model's frame held at `sp`: the pointer led there from the press and rested. */
function heldFrame(d: Drag, mode: "near" | "all", sp: Spot, lane: Lane): LandingFrame {
  const model = modelOver(d.drag, { ...(d.home ? { home: d.home } : {}), placeGuides: mode });
  const a = lane.axis;
  // Along the lane at the middle of the spot's stretch, across it at the lane's middle line.
  const along = (sp.along[0] + sp.along[1]) / 2;
  const across = a === "x" ? lane.rect.y + lane.rect.height / 2 : lane.rect.x + lane.rect.width / 2;
  const to: Point = a === "x" ? { x: along, y: across } : { x: across, y: along };
  let t = 0;
  let at = d.press;
  let f = model.update(at, t);
  for (const [b, speed] of [
    [to, 0.6],
    [to, 0.1],
  ] as const) {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - at.x, b.y - at.y) / speed / 8));
    const from = at;
    for (let k = 1; k <= n; k++) {
      at = { x: from.x + ((b.x - from.x) * k) / n, y: from.y + ((b.y - from.y) * k) / n };
      f = model.update(at, (t += 8));
    }
  }
  for (let r = 8; r <= 400; r += 8) f = model.update(at, (t += 8));
  return f;
}

interface ModelTally {
  held: number;
  missed: number;
  alone: number;
  hullBad: string[];
  cornerBad: string[];
}

function sweepModel(mode: "near" | "all"): ModelTally {
  const t: ModelTally = { held: 0, missed: 0, alone: 0, hullBad: [], cornerBad: [] };
  for (const w of windows()) {
    const d = dragOf(w);
    if (!d) continue;
    const s = w.state;
    const ids = new Set(d.regions.lanes.map((l) => l.id));
    for (const l of d.regions.lanes) {
      if (!edgeOf(s, l.id)) continue;
      for (const sp of l.spots) {
        if (sp.home) continue;
        const f = heldFrame(d, mode, sp, l);
        if (f.lane !== l.id || f.spot !== sp.id || !f.landing) {
          t.missed++;
          continue;
        }
        t.held++;
        const layout = committedOf(sp);
        const gs: Mark[] = f.guides.map((g) => ({ lane: g.lane, kind: g.kind, rect: g.rect, id: g.id }));
        if (alone(layout, l.id, w.dragged) && d.regionsFor(sp.id).lanes.find((x) => x.id === l.id)?.refused.length === 0) {
          t.alone++;
          const why = hullIssue(s, l.id, gs.filter((g) => g.lane === l.id), f.landing, layout, w.dragged);
          if (why) t.hullBad.push(`${w.name}, ${sp.id} (${mode}): ${why}`);
        }
        // Under "near" only the lanes shown take part: a corner of a lane not shown is not a guide of this frame.
        const shown = mode === "all" ? ids : new Set(f.guides.map((g) => g.lane));
        for (const b of cornerIssues(s, layout, shown, gs, w.dragged, f.landing)) t.cornerBad.push(`${w.name}, ${sp.id} (${mode}): ${b}`);
      }
    }
  }
  return t;
}

describe("a held frame's marks are the commit's (decision 0002)", () => {
  const t = sweepLanes();

  it("the sweep covers side rails holding items and empty", () => {
    expect(t.byRails.occupied ?? 0).toBeGreaterThan(2);
    expect(t.byRails.empty ?? 0).toBeGreaterThan(2);
  });

  it("a held frame's lanes: along each lane, the hull of its held marks and the landing is its edge in the commit, within its pad and 1 px", () => {
    expect(t.hull.checked).toBeGreaterThan(20);
    expect(t.hull.bad).toEqual([]);
  });

  it("a held frame's lanes: on every frame, as seen and held, a corner of two drawn lanes is drawn by the edge that owns it, and by no other lane", () => {
    expect(t.corner.corners).toBeGreaterThan(200);
    expect(t.corner.bad).toEqual([]);
  });

  for (const mode of ["near", "all"] as const)
    it(`the landing model under "${mode}", held at each spot: the hull and the corner owner hold for its guides`, () => {
      const m = sweepModel(mode);
      expect(m.held).toBeGreaterThan(150);
      expect(m.alone).toBeGreaterThan(20);
      expect(m.hullBad).toEqual([]);
      expect(m.cornerBad).toEqual([]);
    });
});

describe("the lab window, 1080 px wide, both side rails holding a toolbar, a toolbar held in the empty top bar", () => {
  const w = windows().find((x) => x.name === "lab: zoom on the right rail, views")!;
  const d = dragOf(w)!;
  const top = d.regions.lanes.find((l) => l.id === "top")!;

  it("is the window of the report: the rails hold tools and zoom, the top bar is empty as seen", () => {
    const seen = solve(w.state);
    expect(w.state.stage.width).toBe(1080);
    expect([seen.items.tools?.edge, seen.items.zoom?.edge]).toEqual(["rail-left", "rail-right"]);
    expect(drawn(seen, "top")).toBe(false);
    // Its hit rect stays as seen: it stops at the rails' inner sides.
    expect([top.rect.x, top.rect.x + top.rect.width]).toEqual([30, 1050]);
  });

  it("held, the top bar's box runs the full width, x 0 to 1080, as the commit's bar does; the rails' marks start below it", () => {
    expect(top.spots.length).toBeGreaterThan(0);
    for (const sp of top.spots) {
      const held = d.regionsFor(sp.id);
      const committed = committedOf(sp).edges.top!.rect;
      expect([committed.x, committed.x + committed.width]).toEqual([0, 1080]);
      const boxes = held.lanes.find((l) => l.id === "top")!.marks.filter((m) => m.kind === "box");
      expect(boxes.length).toBeGreaterThan(0);
      const x0 = Math.min(sp.landing.x, ...boxes.map((m) => m.rect.x));
      const x1 = Math.max(sp.landing.x + sp.landing.width, ...boxes.map((m) => m.rect.x + m.rect.width));
      expect([sp.id, x0, x1]).toEqual([sp.id, 0, 1080]);
      for (const rail of ["rail-left", "rail-right"]) for (const m of held.lanes.find((l) => l.id === rail)!.marks) expect([m.id, m.rect.y >= committed.y + committed.height - 1e-6]).toEqual([m.id, true]);
    }
  });

  it("seen, the top bar's hit rect and its spots' stretches are unchanged: a pointer on a rail's end is in the rail's lane", () => {
    for (const sp of top.spots) expect(sp.along[0] >= 30 - 1e-6 && sp.along[1] <= 1050 + 1e-6).toBe(true);
    expect(lanes(w.state, "views", d.options).lanes.find((l) => l.id === "rail-left")!.rect.y).toBe(32);
  });
});
