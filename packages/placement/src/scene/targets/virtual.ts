/**
 * Generation, the virtual edges of a side: its column lines (a new column on each, along x) and its rail (docking
 * folded into it, along y), tiled as every edge is.
 */
import { RAIL_EDGE, rect, type Rect } from "../../geometry";
import { sideRings } from "../changes";
import type { Edge } from "../model";
import { slotAt } from "./edges";
import { EDGE_KINDS } from "./kinds";
import type { Ctx, EdgeSpec, SceneAfter, Slot, Span } from "./model";

/**
 * The side's column lines as an edge (virtual, along x): a slot on each line for a new column there, tiled as every
 * edge is (its kind's `reach` each way at most), down the columns' stretch.
 */
export function columnLines(c: Ctx, side: "left" | "right"): EdgeSpec[] {
  const { rest, base, dragged } = c;
  const cols = rest.edges
    .filter((e) => e.side === side && e.column === true)
    .map((edge) => ({ edge, l: base.edges[edge.id] }))
    .filter((x) => x.l && !x.l.folded && !x.l.rides && x.l.cross > 0)
    .sort((a, b) => a.edge.ring - b.edge.ring)
    .map((x) => ({ edge: x.edge, r: x.l!.rect }));
  const own = Object.values(base.edges).filter((e) => e.side === side && e.rect.height > 0);
  const span = own[0]?.rect ?? base.content;
  // Rings as the side's edges lie (no ties): a static edge outer to the columns keeps its place.
  const rings = sideRings(rest.edges, side);
  const ringOf = (e: Edge): number => rings.get(e.id) ?? e.ring;
  // Each line with the place a new column there would take in `solve`'s laying order: just before the column it lies
  // outside of (which it would push), just after the innermost (or every edge of the side, with no column).
  const lines: { x: number; ring: number; at: number }[] = [];
  const outerX = (r: Rect): number => (side === "left" ? r.x : r.x + r.width);
  const innerX = (r: Rect): number => (side === "left" ? r.x + r.width : r.x);
  const atOf = (e: Edge): number => c.lay.get(e.id)?.at ?? 0;
  cols.forEach((x) => lines.push({ x: outerX(x.r), ring: ringOf(x.edge), at: atOf(x.edge) - 0.5 }));
  if (cols.length > 0) lines.push({ x: innerX(cols[cols.length - 1]!.r), ring: ringOf(cols[cols.length - 1]!.edge) + 1, at: atOf(cols[cols.length - 1]!.edge) + 0.5 });
  else lines.push({ x: side === "left" ? base.content.x : base.content.x + base.content.width, ring: rings.size, at: Math.max(-1, ...rest.edges.filter((e) => e.side === side).map(atOf)) + 0.5 });
  // A new column lands where it shows open.
  const lands = (r: SceneAfter): boolean => {
    const me = r.layout.items[dragged]!;
    const el = me.edge ? r.layout.edges[me.edge] : undefined;
    return !!el && !me.inMenu && !el.folded && !el.rides && r.scene !== c.scene;
  };
  const { reach, place } = EDGE_KINDS.columnLine;
  // One spec per line: a new column's place, owning a band of `place` px about its line (ranked where that column would
  // be laid), its slot's tile reaching `reach` each way past it as overreach.
  return lines.map((l) => ({
    id: `column:${side}`,
    key: `column:${side}:${l.ring}`,
    kind: "columnLine" as const,
    lay: { phase: EDGE_KINDS.columnLine.phase, side, at: l.at },
    vertical: false,
    zones: [{ zone: "start" as const, a: l.x - reach, b: l.x + reach }],
    slots: [slotAt(c, "start", l.x, `column:${side}:${l.ring}`, { kind: "column", side, ring: l.ring }, lands)],
    refuse: () => "no-room" as const,
    own: null,
    holds: false,
    reserved: [],
    across: (): Span => [span.y, span.y + span.height],
    owned: [span.y, span.y + span.height] as Span,
    ownedAlong: [l.x - place / 2, l.x + place / 2] as Span,
    drawn: false,
    marker: (s: Slot) => rect(s.line, span.y, 0, span.height),
  }));
}

/**
 * The side's rail as an edge (virtual, along y): a slot before each folded column's segments and after the last, or,
 * with no rail shown, one slot `RAIL_EDGE` px deep where the rail lands (`railPlaces`); tiled as every edge is.
 */
export function railStops(c: Ctx, side: "left" | "right"): EdgeSpec | null {
  const { rest, base, now, dragged } = c;
  const rail = base.rails[side];
  const placeRect = base.railPlaces[side];
  if (!placeRect) return null;
  const rings = sideRings(rest.edges, side);
  const mine = rest.edges.filter((e) => e.side === side).sort((a, b) => (rings.get(a.id) ?? 0) - (rings.get(b.id) ?? 0));
  const ringOf = (id: string): number => rings.get(id) ?? 0;
  const stops: { y: number; ring: number }[] = [];
  let zone: Rect;
  if (rail && rail.segments.length > 0) {
    zone = rail.rect;
    const groups: { edge: string; y0: number; y1: number }[] = [];
    for (const s of rail.segments) {
      const g = groups[groups.length - 1];
      if (g && g.edge === s.edge) g.y1 = s.rect.y + s.rect.height;
      else groups.push({ edge: s.edge, y0: s.rect.y, y1: s.rect.y + s.rect.height });
    }
    for (const g of groups) stops.push({ y: g.y0, ring: ringOf(g.edge) });
    const last = groups[groups.length - 1]!;
    stops.push({ y: last.y1, ring: ringOf(last.edge) + 1 });
  } else {
    const firstCol = mine.find((e) => e.column === true);
    zone = rect(side === "left" ? placeRect.x : placeRect.x + placeRect.width - RAIL_EDGE, placeRect.y, RAIL_EDGE, placeRect.height);
    stops.push({ y: placeRect.y, ring: firstCol ? ringOf(firstCol.id) : mine.length });
  }
  // Folded into this rail; every stop is home while the item is folded here already.
  const ownRail = now.items[dragged]?.rail === side;
  const lands = (r: SceneAfter): boolean => r.layout.items[dragged]!.rail === side && r.scene !== c.scene;
  const at = zone;
  return {
    id: `rail:${side}`,
    key: `rail:${side}`,
    kind: "railStop",
    // The rail lies outside every edge on its side: laid first among them.
    lay: { phase: EDGE_KINDS.railStop.phase, side, at: -1 },
    vertical: true,
    zones: [{ zone: "start", a: at.y, b: at.y + at.height }],
    slots: stops.map((s) => slotAt(c, "start", s.y, `rail:${side}:${s.ring}`, { kind: "rail", side, ring: s.ring }, lands, ownRail)),
    refuse: () => "no-room",
    own: null,
    holds: false,
    reserved: [],
    across: () => [at.x, at.x + at.width],
    // A drawn rail owns its rect; where none shows, a thin band of its place at the side's outer boundary.
    owned: rail && rail.segments.length > 0 ? [at.x, at.x + at.width] : side === "left" ? [at.x, at.x + Math.min(at.width, EDGE_KINDS.railStop.place)] : [at.x + at.width - Math.min(at.width, EDGE_KINDS.railStop.place), at.x + at.width],
    ownedAlong: null,
    drawn: !!rail && rail.segments.length > 0,
    marker: (s) => rect(at.x, s.result.layout.items[dragged]!.rect.y, at.width, 0),
  };
}
