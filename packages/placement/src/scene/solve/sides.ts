/**
 * The reserved left and right edges, ring by ring, with column give-way (`./columns`). From the window's side inward:
 * the side's bars outside the inset (toolbar bars, `isOutsideSideBar`), the side's rail, the static column edges outside
 * the inset (anchors), the inset, then the columns, a gutter after each. Folded columns go to the rail or ride
 * (`./rails`).
 */
import { EPS, rect, type Rect } from "../../geometry";
import { isOutsideSideBar } from "../helpers";
import type { Edge } from "../model";
import { columnRoom, columnsOf, giveWay, giveWayNotes, type Col, type GiveWay } from "./columns";
import { emit, type Draft } from "./draft";
import { solveEdge, type EdgeSolve } from "./edge";
import { insetReach, type Frame } from "./insets";
import { finite, px, zoneSorted } from "./order";
import { layRail, layRiders, ridersHeight } from "./rails";

/** The side phase's running state across one side: the content's left and right so far, and the gap before the next edge. */
interface Walk {
  x0: number;
  x1: number;
}

/** The side edges laid in `area`; returns the area they leave. */
export function laySides(d: Draft, sideEdges: readonly Edge[], area: Rect, f: Frame): Rect {
  const H = area.height;
  const reach = insetReach(area, f);
  const tall = (edge: Edge): number => H + (edge.outsideInset === true ? reach.up + reach.down : 0);
  const cols = columnsOf(d, sideEdges, area, tall);
  const g = giveWay(d, cols, area, f.gutter);
  columnRoom(d, cols, area, f);
  giveWayNotes(d, g, cols);
  const walk: Walk = { x0: area.x, x1: area.x + area.width };
  for (const side of ["left", "right"] as const) laySide(d, side, cols, g, area, f, walk, reach.up, tall);
  return rect(walk.x0, area.y, Math.max(0, walk.x1 - walk.x0), H);
}

/** `c`'s edge re-solved at width `w` and length `length` (its user's size dropped). */
function forced(d: Draft, c: Col, length: number, w: number): EdgeSolve {
  const edge: Edge = { ...c.edge, cross: { ...c.edge.cross, min: w, max: w } };
  const { size: _s, ...plain } = edge;
  return solveEdge(d.scene, plain, d.owned.get(c.edge)!, length, w, d.prevEdge(c.edge));
}

/** One side, from the window's side inward: its outside bars, its rail, its anchors, the inset, its columns. */
function laySide(d: Draft, side: "left" | "right", cols: readonly Col[], g: GiveWay, area: Rect, f: Frame, walk: Walk, upInset: number, tall: (edge: Edge) => number): void {
  const { scene, edges } = d;
  const H = area.height;
  // Only while it lays out an item: an empty (or all closed) bar draws as nothing, so it changes no order either.
  const outsideSideBar = (c: Col): boolean => c.width > 0 && isOutsideSideBar(scene, c.edge) && !g.railed(c) && !g.riding(c);
  const all = cols.filter((c) => c.side === side);
  const mine = [...all.filter(outsideSideBar), ...all.filter((c) => !outsideSideBar(c))];
  const railed = mine.filter((c) => g.railed(c));
  const riders = mine.filter((c) => g.riding(c));
  const host = mine.find((c) => c.dyn && c.edge.column === true && !c.hand && !g.auto.has(c) && c.width > 0);
  const ridersTop = ridersHeight(d, riders);
  const railW = px(scene.rails?.[side]?.width);
  let railRect: Rect | null = null;
  // The gap just outside the next edge: the inset at the window's side, then a gutter. An edge outside the inset
  // (an anchor) lies before that gap, which then follows it.
  let gap = px(side === "left" ? f.inset.left : f.inset.right);
  /** Whether one of the side's outside bars is laid already (the rail then lies flush after it). */
  let barLaid = false;
  /** Where the side's rail lies, or would lie were one shown (`railPlaces`). */
  let railPlace: Rect | null = null;
  const placeRail = (): Rect => {
    const lead = barLaid ? gap : 0;
    return side === "left" ? rect(walk.x0 - lead, area.y, railW, H) : rect(walk.x1 + lead - railW, area.y, railW, H);
  };
  for (const c of mine) {
    // The side's rail is its outermost panel edge; an anchor lies flush inside it. After the side's outside bars it
    // lies outside the inset too, flush after them, the inset (at least a gutter) then following it and the anchor.
    // With no such bar it lies at the window's side inside the inset, a gutter after it (the hosts' rows).
    if (!railPlace && !outsideSideBar(c)) {
      railPlace = placeRail();
      if (railed.length > 0) {
        railRect = railPlace;
        const lead = barLaid ? gap : 0;
        const after = barLaid ? Math.max(gap, f.gutter) : f.gutter;
        if (side === "left") walk.x0 += railPlace.width - lead + after;
        else walk.x1 -= railPlace.width - lead + after;
        gap = after;
      }
    }
    if (outsideSideBar(c)) barLaid = true;
    // A folded column's members are drawn as rail segments, in zone order (`layRail`).
    const base = { side: c.edge.side, ring: finite(c.edge.ring, 0), cross: 0, menu: null, items: zoneSorted(scene, c.visible), tabs: [], stack: c.solved.stack, free: c.solved.free };
    if (g.railed(c)) {
      edges[c.edge.id] = { ...base, rect: rect(railRect!.x, area.y, 0, H), folded: g.auto.has(c) ? "auto" : "hand" };
      continue;
    }
    if (g.riding(c)) continue;
    // Never wider than the room the edges outside it leave.
    const w = Math.min(g.widths.get(c)!, Math.max(0, walk.x1 - walk.x0));
    const top = c === host ? ridersTop : 0;
    let solved = top > 0 || Math.abs(w - c.width) > EPS ? forced(d, c, H - top, w) : c.solved;
    let r: Rect;
    if (c.edge.outsideInset === true) {
      // Outside the inset: at the stage's side, full height; the inset (not a gutter) follows it.
      const y0 = area.y - upInset;
      const h = tall(c.edge);
      if (side === "left") {
        r = rect(walk.x0 - gap, y0, w, h);
        walk.x0 += w;
      } else {
        r = rect(walk.x1 + gap - w, y0, w, h);
        walk.x1 -= w;
      }
      if (Math.abs(h - H) > EPS || Math.abs(w - c.width) > EPS) solved = forced(d, c, h, w);
    } else if (side === "left") {
      r = rect(walk.x0, area.y + top, w, H - top);
      walk.x0 += w > 0 ? w + f.gutter : 0;
      if (w > 0) gap = f.gutter;
    } else {
      walk.x1 -= w;
      r = rect(walk.x1, area.y + top, w, H - top);
      walk.x1 -= w > 0 ? f.gutter : 0;
      if (w > 0) gap = f.gutter;
    }
    emit(d, c.edge, r, solved, w < c.width - EPS ? { shrunk: true } : {});
  }
  if (host && riders.length > 0) layRiders(d, host, riders, area.y);
  if (railRect) layRail(d, side, railRect, railed, g);
  // A side that can have a rail: where it lies, or would lie (after every outside bar when the side has nothing else).
  if (scene.rails?.[side]) d.railPlaces[side] = railPlace ?? placeRail();
}
