/**
 * One aim order: for the same pointer and grab, the landing path (`lanes()`'s spots, what a landing model plays) and the
 * tile path (`targets()`'s tiles) put the dragged item on the same side of every neighbor. Both cut by `aimCut`: a panel
 * column by halves of its panels, a bar or a toolbar rail by its landings (the nearest landing, at the grab where two
 * overlap). A property over a grid of pointers along each scene's edge, three grabs and every item dragged.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { targetAt } from "@n-uf/motion/drag";
import type { Point } from "@n-uf/placement";
import { lanes, solve, targets, type DockDrop, type DockItem, type DockLayout, type DockState } from "../src";
import { aimCut, aimSlack, grabShare } from "../src/aim";
import { byId, column, controls, form, panel, title } from "./fixture";

/** A toolbar: `len` px along a bar or a rail. */
const tb = (id: string, len: number, more: Partial<DockItem> = {}): DockItem => ({ id, kind: "group", used: 1, forms: { row: [form("row", len, len, 32), form("menu", 0, 0, 0)], column: [form("icons", len, len, 28), form("menu", 0, 0, 0)] }, ...more });
/** A panel whose header stretches along a bar (it takes the bar's spare length). */
const stretchy = (id: string, used: number): DockItem => ({ ...panel(id, used), forms: { ...panel(id, used).forms, row: [form("header", 120, 160, 28, { grows: true }), form("menu", 0, 0, 0)] } });
/** A movable toolbar that grows along a bar or a rail: it takes the free span after its zone. */
const growing = (id: string, len: number, more: Partial<DockItem> = {}): DockItem => ({ ...tb(id, len, more), forms: { row: [form("row", len - 20, len, 32, { grows: true }), form("menu", 0, 0, 0)], column: [form("icons", len - 20, len, 28, { grows: true }), form("menu", 0, 0, 0)] } });
const STAGE = { x: 0, y: 0, width: 1080, height: 640 };
const rail = (items: string[], list: DockItem[]): DockState => ({
  stage: STAGE,
  edges: [{ id: "edge", side: "left", ring: 0, accepts: ["group"], items, cross: { min: 30, max: 30, rail: 30 }, compact: true, gap: 4, pad: { start: 4, end: 4 } }],
  items: byId(list),
  floats: [],
  floatKinds: ["group"],
});
const bar = (side: "top" | "bottom", items: string[], list: DockItem[]): DockState => ({
  stage: STAGE,
  edges: [{ id: "edge", side, ring: 0, accepts: ["group", "panel"], items, cross: { min: 36, max: 36, rail: 36 }, gap: 4, pad: { start: 8, end: 8 } }],
  items: byId(list),
  floats: [],
  floatKinds: ["group", "panel"],
});
const columnOf = (items: string[], list: DockItem[]): DockState => ({ stage: STAGE, edges: [column("edge", "left", 0, items)], items: byId(list), floats: [], floatKinds: ["panel"] });

/** A scene: its name, its state, and the edge swept (default `edge`) with the items dragged (default the edge's own). */
type Scene = readonly [string, DockState, { readonly edge?: string; readonly drag?: readonly string[] }?];

export const SCENES: readonly Scene[] = [
  ["a rail of two toolbars", rail(["a", "b"], [tb("a", 102), tb("b", 102)])],
  ["a rail of three toolbars, one long", rail(["a", "b", "c"], [tb("a", 158), tb("b", 102), tb("c", 102)])],
  ["a rail of a short and a long toolbar", rail(["a", "b"], [tb("a", 60), tb("b", 158)])],
  ["a top bar of three toolbars, one at the end", bar("top", ["a", "b", "c"], [tb("a", 120), tb("b", 160), tb("c", 120, { align: "end" })])],
  ["a bottom bar of two panels and a toolbar", bar("bottom", ["p", "q", "g"], [panel("p", 1), panel("q", 2), tb("g", 120)])],
  ["a bottom bar of two stretchable panels and a toolbar", bar("bottom", ["p", "q", "g"], [stretchy("p", 1), stretchy("q", 2), tb("g", 120)])],
  ["a bottom bar of two stretchable panels and a toolbar at the end", bar("bottom", ["p", "q", "g"], [stretchy("p", 1), stretchy("q", 2), tb("g", 120, { align: "end" })])],
  // Movable growers: the gap beside a grown toolbar stays a place, and its slack is reachable (a landing lies in it).
  ["a top bar of a toolbar, a growing toolbar and a toolbar at the end", bar("top", ["a", "t", "c"], [tb("a", 120), growing("t", 200), tb("c", 120, { align: "end" })])],
  ["a top bar of three leading toolbars, the middle one growing", bar("top", ["a", "t", "c"], [tb("a", 120), growing("t", 200), tb("c", 120)])],
  ["a rail of a growing toolbar and a toolbar", rail(["t", "b"], [growing("t", 120), tb("b", 102)])],
  ["a panel column of three", columnOf(["p", "q", "r"], [panel("p", 1), panel("q", 2), panel("r", 3)])],
  ["a title bar of two toolbars, a growing title and controls", titleBar()],
  ["a column's tray: two panels, three toolbars at its foot", tray()],
  // The lab window as captured, Zoom in its title bar: Views (in the bottom bar) aimed into the title bar, as the lab's
  // release-in-band case drags it.
  ["the lab window, Zoom in the title bar, Views dragged in", labTitleBar(), { edge: "title", drag: ["views", "zoom"] }],
];

/**
 * A panel column (cut by halves) whose start zone takes panels and whose end zone, its foot, takes toolbars: two panels
 * and, at its foot, three toolbars.
 */
function tray(): DockState {
  return {
    stage: STAGE,
    edges: [{ ...column("edge", "left", 0, ["p", "q", "a", "b", "c"]), accepts: ["panel", "group"], zoneAccepts: { start: ["panel"], end: ["group"] }, gap: 6, pad: { start: 6, end: 6 } }],
    items: byId([panel("p", 1), panel("q", 2), tb("a", 150, { align: "end" }), tb("b", 150, { align: "end" }), tb("c", 150, { align: "end" })]),
    floats: [],
    floatKinds: ["panel", "group"],
  };
}

/** The lab's window as captured (`fixtures/lab-windows.json`), Zoom moved from the left rail into the title bar. */
function labTitleBar(): DockState {
  const w = JSON.parse(readFileSync(new URL("./fixtures/lab-windows.json", import.meta.url), "utf8")).windows[0].scene as DockState;
  return { ...w, edges: w.edges.map((e) => (e.id === "title" ? { ...e, items: ["title", "zoom", "controls"] } : { ...e, items: e.items.filter((x) => x !== "zoom") })) };
}

/**
 * A title bar holding two toolbars before a title that grows over the bar's spare length, and the controls at its end:
 * the free stretch after the title is a sliding spot whose range starts inside the title as drawn (at its natural
 * length, where a dock takes its slack).
 */
function titleBar(): DockState {
  return {
    stage: { x: 0, y: 0, width: 1200, height: 800 },
    edges: [{ id: "edge", side: "top", ring: 0, accepts: ["group"], items: ["a", "b", "title", "controls"], cross: { min: 32, max: 32, rail: 32 } }],
    items: byId([tb("a", 200), tb("b", 120), title(), controls()]),
    floats: [],
    floatKinds: ["group"],
  };
}

/** The shown items on `edge` in `l`, in order along it. */
function orderOn(l: DockLayout, edge: string): string {
  return Object.entries(l.items)
    .filter(([, x]) => x.edge === edge && !x.inMenu && !x.floating && x.rect.width >= 1 && x.rect.height >= 1)
    .sort(([, a], [, b]) => a.rect.x + a.rect.y - (b.rect.x + b.rect.y))
    .map(([k]) => k)
    .join(" ");
}

/** The pitches swept: the default, none, and two others (half of one is how far an overlap's cut may move). */
const PITCHES = [undefined, 0, 120, 400] as const;

/** Every pointer along each scene's edge, each item dragged at three grabs and four pitches: where the two paths' places differ. */
export function aimOrderDiffs(scenes: readonly Scene[] = SCENES): { points: number; diffs: string[]; perScene: Map<string, number> } {
  const diffs: string[] = [];
  let points = 0;
  const perScene = new Map<string, number>();
  for (const [name, s, opts] of scenes) {
    const before = points;
    const seen = solve(s);
    const edgeId = opts?.edge ?? "edge";
    const order = (l: DockLayout, _edge: string): string => orderOn(l, edgeId);
    const edge = s.edges.find((x) => x.id === edgeId)!;
    const e = seen.edges[edgeId]!;
    const vertical = edge.side === "left" || edge.side === "right";
    for (const id of opts?.drag ?? edge.items) {
      const own = seen.items[id]?.rect;
      if (!own || s.items[id]?.fixed) continue;
      for (const pitch of PITCHES)
      for (const share of [0.1, 0.5, 0.9]) {
        // Along the item's own length (its longer side), as a grip anywhere along it.
        const grab: Point = own.width >= own.height ? { x: own.width * share, y: own.height / 2 } : { x: own.width / 2, y: own.height * share };
        const options = { grab, ...(pitch === undefined ? {} : { pitch }) };
        const ts = targets(s, id, options);
        const lane = lanes(s, id, options).lanes.find((l) => l.id === edgeId);
        if (!lane) continue;
        const cuts = lane.spots.flatMap((sp) => sp.along);
        const [a0, a1] = vertical ? [e.rect.y, e.rect.y + e.rect.height] : [e.rect.x, e.rect.x + e.rect.width];
        // Off the pixel grid, so no point lies on a cut; a point within a pixel of one is a tie either path may break.
        for (let p = a0 + 0.37; p < a1; p += 3) {
          if (cuts.some((c) => Math.abs(c - p) < 1)) continue;
          const pt = vertical ? { x: e.rect.x + e.rect.width / 2, y: p } : { x: p, y: e.rect.y + e.rect.height / 2 };
          const spot = lane.spots.find((sp) => p >= sp.along[0] && p <= sp.along[1]);
          const tile = targetAt(ts, pt) as DockDrop | null;
          if (!spot || !tile || tile.free) continue;
          points++;
          // The place a release commits: the edge's order and the zone the item lands in (home: as seen).
          const placeIn = (l: DockLayout): string => `${order(l, "edge")} [${l.items[id]?.edge === edgeId ? (l.items[id]?.zone ?? "start") : "elsewhere"}]`;
          const byTile = placeIn(tile.place.kind === "home" ? seen : tile.after(pt, grab).layout);
          const byLane = placeIn(spot.home && !spot.slide ? seen : spot.target.after(pt, grab).layout);
          if (byTile !== byLane) diffs.push(`${name}: ${id} held at ${share}${pitch === undefined ? "" : `, pitch ${pitch}`} at ${p.toFixed(1)}: tiles ${byTile} (${tile.id}), lanes ${byLane} (${spot.id})`);
        }
      }
    }
    perScene.set(name, points - before);
  }
  return { points, diffs, perScene };
}

describe("a sliding spot beside a growing neighbor", () => {
  it("cuts from its range's first landing inside the neighbor's slack, which a drop there takes: halfway from the landing before", () => {
    const s = titleBar();
    const seen = solve(s);
    const title = seen.items.title!.rect;
    const grab = { x: 20, y: 16 };
    const lane = lanes(s, "a", { grab }).lanes.find((l) => l.id === "edge")!;
    const slide = lane.spots.find((sp) => sp.slide)!;
    const before = lane.spots[lane.spots.indexOf(slide) - 1]!;
    // The title fills the bar (drawn far past its natural 160 px); the slide's range starts inside it, where a drop
    // lands at the hand and the title gives way.
    expect(title.width).toBeGreaterThan(400);
    expect(slide.slide!.from).toBeLessThan(title.x + title.width);
    const first = slide.target.after({ x: slide.slide!.from + grab.x, y: title.y + 16 }, grab).layout;
    expect(first.items.a!.rect.x).toBeCloseTo(slide.slide!.from, 6);
    // So the cut is the aim cut between the landing before the title and that first landing (they overlap: at the grab),
    // no cut from the title as drawn.
    const firstLanding = { ...slide.landing, x: slide.slide!.from };
    expect(slide.along[0]).toBeCloseTo(aimCut(before.landing, firstLanding, "x", grabShare(seen.items.a!.rect, grab).x, aimSlack(undefined)), 6);
    expect(slide.along[0]).toBeLessThan(title.x + title.width);
    // Over the title's slack both paths take the place after the title.
    const pt = { x: slide.along[0] + 10, y: title.y + title.height / 2 };
    const tile = targetAt(targets(s, "a", { grab }), pt) as DockDrop | null;
    expect(orderOn(tile!.after(pt, grab).layout, "edge")).toBe(orderOn(slide.target.after(pt, grab).layout, "edge"));
  });
});

/**
 * Points of the sweep where the two paths make one order but dock in different zones (the free room's zone rule, not yet
 * one answer: the tiles keep the room's zone extents, thirds, where a sliding spot docks by its landing against the
 * edge's middle). Every bar and rail scene contributes, growers or not: 14,304 over the plain rails and bars (the three
 * rails of toolbars, the top bar of toolbars, the bottom bar of panels and a toolbar, and the lab's title bar), 8,255
 * beside stretchable panels and a growing title (a sliding spot over the grower's slack docks where a landing there
 * lands, the end zone mostly), and 11,008 over the three movable-grower toolbar scenes. None in a panel column.
 */
const ZONE_ONLY_KNOWN = 33_567;

describe("one aim order", () => {
  it("the landing path and the tile path put the item on the same side of every neighbor, for every pointer", () => {
    const { points, diffs, perScene } = aimOrderDiffs();
    expect(points).toBeGreaterThan(2000);
    // Every scene is swept, none skipped for want of a lane or a target.
    expect([...perScene].filter(([, n]) => n < 100).map(([k, n]) => `${k}: ${n}`)).toEqual([]);
    // The order (which side of every neighbor): one answer.
    const orderDiffs = diffs.filter((d) => d.match(/tiles (.*?) \[.*lanes (.*?) \[/)?.slice(1).reduce((a, b) => (a !== b ? "x" : "")) === "x");
    const byScene = new Map<string, number>();
    for (const d of orderDiffs) byScene.set(d.split(":")[0]!, (byScene.get(d.split(":")[0]!) ?? 0) + 1);
    expect(orderDiffs.slice(0, 12), `${orderDiffs.length} of ${points} points differ in order (${[...byScene].map(([k, n]) => `${k}: ${n}`).join("; ")})`).toEqual([]);
    // The zone of one place over free room: the tiles take the zone extents (thirds, `barZones`, `DockEdge.zones`), a
    // sliding spot the landing against the edge's middle and its snap points. Not yet one answer; never more apart.
    expect(diffs.length - orderDiffs.length, `${diffs.length - orderDiffs.length} of ${points} points dock in another zone`).toBeLessThanOrEqual(ZONE_ONLY_KNOWN);
  });
});
