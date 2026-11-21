/**
 * Generation, the virtual edges of a side: its column lines (a new column on each, along x) and its rail (docking
 * folded into it, along y), tiled as every edge is.
 */
import { EPS, RAIL_EDGE, clamp, rect, type Rect } from "../../geometry";
import { sideRings } from "../changes";
import { formsOf, isHandFolded, isSideColumn, zoneOf } from "../helpers";
import type { Edge } from "../model";
import { slotAt, thickerThan } from "./edges";
import { targetId, virtualEdgeId } from "./ids";
import { EDGE_KINDS } from "./kinds";
import type { Ctx, EdgeSpec, SceneAfter, Slot, Span } from "./model";

/**
 * A side's rings as a place counts them, with the item lifted, for lines that lie in the seen geometry: `before(e)`,
 * just outside the seen edge `e`; `after(e)`, just inside it. The item's own column, which the lift deletes, counts
 * no ring: both lines about it are one place (home's).
 */
function ringsOf(c: Ctx, side: "left" | "right"): { before: (e: Edge) => number; after: (e: Edge) => number; count: number } {
  const seen = sideRings(c.scene.edges, side);
  const kept = c.rest.edges.filter((e) => e.side === side).map((e) => seen.get(e.id) ?? e.ring);
  const at = (e: Edge): number => seen.get(e.id) ?? e.ring;
  return { before: (e) => kept.filter((r) => r < at(e)).length, after: (e) => kept.filter((r) => r <= at(e)).length, count: kept.length };
}

/**
 * Where the side's undrawn rail stop starts, across: the window's edge (an inset's strip included), or, with drawn edges
 * of the side lying outside the rail's place (its outside bars), the rail place's outer side, flush after them.
 */
export function railOuter(c: Ctx, side: "left" | "right"): number {
  const { now, scene } = c;
  const place = now.railPlaces[side];
  const windowEdge = side === "left" ? scene.stage.x : scene.stage.x + scene.stage.width;
  if (!place) return windowEdge;
  const placeOuter = side === "left" ? place.x : place.x + place.width;
  const barOutside = Object.values(now.edges).some((e) => e.side === side && e.rect.width > 0 && e.rect.height > 0 && (side === "left" ? e.rect.x + e.rect.width <= placeOuter + EPS : e.rect.x >= placeOuter - EPS));
  return barOutside ? placeOuter : windowEdge;
}

/**
 * The one rule for "collapse it at this side": whether a drop's result has the item folded by hand and drawn at `side`,
 * wherever the scene's `handFold` shows a collapsed panel there (a tile in a rail, a rider bar over the side's first
 * open column, a header in its column); not home, and the window fits. The rail strip and an occupied rail's stops
 * both land by it.
 */
export function collapsesAt(c: Ctx, result: SceneAfter, side: "left" | "right"): boolean {
  const me = result.layout.items[c.dragged];
  if (!me || me.floating || me.inMenu || !isHandFolded(result.scene, c.dragged) || c.isHome(result) || !c.sound(result.layout)) return false;
  const sideOf = (edgeId: string | undefined): string | undefined => (edgeId ? result.layout.edges[edgeId]?.side : undefined);
  return me.rail === side || sideOf(me.rides) === side || sideOf(me.edge) === side;
}

/**
 * The side's column lines as an edge (virtual, along x): a slot on each line for a new column there, tiled as every
 * edge is (its kind's `reach` each way at most), down the columns' stretch. The lines lie where the user sees the
 * columns; each counts its ring with the item lifted.
 */
export function columnLines(c: Ctx, side: "left" | "right", railLands: boolean): EdgeSpec[] {
  const { scene, now, dragged } = c;
  // `sideColumns: "one"`: a side that keeps a column with the item lifted offers no new one. A declared column edge (not a
  // dynamic one, which an empty column loses) is the side's column whether it holds items or not: empty, or emptied by the
  // lift, it keeps its box and a drop there lands in it, so its place is that column's, not a new column's on the same line.
  if (scene.sideColumns === "one" && c.rest.edges.some((e) => e.side === side && isSideColumn(c.rest, e) && (e.items.length > 0 || e.column !== true))) return [];
  const cols = scene.edges
    .filter((e) => e.side === side && e.column === true)
    .map((edge) => ({ edge, l: now.edges[edge.id] }))
    .filter((x) => x.l && !x.l.folded && !x.l.rides && x.l.cross > 0)
    .sort((a, b) => a.edge.ring - b.edge.ring)
    .map((x) => ({ edge: x.edge, r: x.l!.rect }));
  const own = Object.values(now.edges).filter((e) => e.side === side && e.rect.height > 0);
  const span = own[0]?.rect ?? now.content;
  // Rings as the side's edges lie (no ties): a static edge outer to the columns keeps its place.
  const rings = ringsOf(c, side);
  // Each line with the place a new column there would take in `solve`'s laying order: just before the column it lies
  // outside of (which it would push), just after the innermost (or every edge of the side, with no column).
  const lines: { x: number; ring: number; at: number }[] = [];
  const outerX = (r: Rect): number => (side === "left" ? r.x : r.x + r.width);
  const innerX = (r: Rect): number => (side === "left" ? r.x + r.width : r.x);
  const atOf = (e: Edge): number => c.lay.get(e.id)?.at ?? 0;
  cols.forEach((x) => lines.push({ x: outerX(x.r), ring: rings.before(x.edge), at: atOf(x.edge) - 0.5 }));
  if (cols.length > 0) lines.push({ x: innerX(cols[cols.length - 1]!.r), ring: rings.after(cols[cols.length - 1]!.edge), at: atOf(cols[cols.length - 1]!.edge) + 0.5 });
  else lines.push({ x: side === "left" ? now.content.x : now.content.x + now.content.width, ring: rings.count, at: Math.max(-1, ...scene.edges.filter((e) => e.side === side).map(atOf)) + 0.5 });
  // A new column lands where it shows open.
  const lands = (r: SceneAfter): boolean => {
    const me = r.layout.items[dragged]!;
    const el = me.edge ? r.layout.edges[me.edge] : undefined;
    return !!el && !me.inMenu && !el.folded && !el.rides && r.scene !== c.scene;
  };
  const { reach, place, edgePlace } = EDGE_KINDS.columnLine;
  // No column line's zone lies past the stage. The outermost line, with no drawn edge outside it, at the window's edge
  // (a flush window) or where the rail stop lies (the side's outer boundary): its band can't be centered there, half of
  // it past the stage or under the rail stop. It is laid inward instead, its zone running from the window's edge (an
  // inset's strip included): the rail stop keeps `RAIL_EDGE` px at the boundary (where an undrawn rail would land), the
  // line's band of `edgePlace` px follows it inward, and its tile reaches `reach` px on from the band's middle.
  const stage = c.scene.stage;
  const dir = side === "left" ? 1 : -1;
  const outside = (x: number): boolean =>
    Object.values(now.edges).some((e) => e.side === side && e.rect.width > 0 && e.rect.height > 0 && (side === "left" ? e.rect.x + e.rect.width <= x + EPS : e.rect.x >= x - EPS));
  // The rail stop takes its place only when one of its slots lands (`railLands`): a virtual edge with no landing slot
  // owns nothing, so the line is laid from the window's edge then (a panel that would ride over an open column).
  const railFirst = railLands && !!c.scene.rails?.[side]?.accepts.includes(c.kind) && !!now.railPlaces[side] && !(now.rails[side]?.segments.length ?? 0);
  const placeOf = (l: { x: number }, i: number): { line: number; zone: Span; owned: Span } => {
    const atEdge = side === "left" ? l.x <= stage.x + EPS : l.x >= stage.x + stage.width - EPS;
    if (i > 0 || outside(l.x) || !(atEdge || railFirst)) return { line: l.x, zone: [l.x - reach, l.x + reach], owned: [l.x - place / 2, l.x + place / 2] };
    const windowEdge = side === "left" ? stage.x : stage.x + stage.width;
    const boundary = clamp(l.x, stage.x, stage.x + stage.width);
    // With the rail first, its stop holds the outer `RAIL_EDGE` px from the side's outer edge (the window's, an inset's
    // strip included): the line's zone and band start where the stop ends. Without one, from the window's edge.
    const band0 = railFirst ? railOuter(c, side) + dir * RAIL_EDGE : boundary;
    const line = band0 + (dir * edgePlace) / 2;
    const span2 = (a: number, b: number): Span => [Math.min(a, b), Math.max(a, b)];
    return { line, zone: span2(railFirst ? band0 : windowEdge, line + dir * reach), owned: span2(band0, band0 + dir * edgePlace) };
  };
  // No form of the item fits across a column the side can make (as thick as its template's `cross.max` at most): a
  // refusal on a line is for thickness, as on a real edge.
  const most = scene.columns?.[side]?.cross.max;
  const tooThick = most !== undefined && thickerThan(formsOf(scene.items[dragged]!, "column"), most);
  // One spec per line: a new column's place, owning a band of `place` px about its line (ranked where that column would
  // be laid), its slot's tile reaching `reach` each way past it as overreach.
  return lines.map((l, i) => {
    const p = placeOf(l, i);
    return {
      id: virtualEdgeId("column", side),
      edge: null,
      kind: "columnLine" as const,
      lay: { phase: EDGE_KINDS.columnLine.phase, side, at: l.at },
      vertical: false,
      zones: [{ zone: "start" as const, a: Math.max(p.zone[0], stage.x), b: Math.min(p.zone[1], stage.x + stage.width) }],
      slots: [slotAt(c, "start", p.line, targetId({ kind: "column", side, ring: l.ring }), { kind: "column", side, ring: l.ring }, lands)],
      refuse: () => (tooThick ? ("too-thick" as const) : ("no-room" as const)),
      own: null,
      holds: false,
      reserved: [],
      cards: [],
      across: (): Span => [span.y, span.y + span.height],
      owned: [span.y, span.y + span.height] as Span,
      ownedAlong: p.owned,
      drawn: false,
      // Where the new column's edge lands: the line itself, inside the stage.
      marker: () => rect(clamp(l.x, stage.x, stage.x + stage.width), span.y, 0, span.height),
    };
  });
}

/**
 * A declared rail's one place under `foldedColumnDrop`: the end of its last folded column. The item keeps its state: a
 * collapsed one lands as the rail's last tile, an open one opens that column, or there is no place.
 */
function railEnd(c: Ctx, side: "left" | "right", segments: readonly { readonly edge: string }[], y: number): Slot | null {
  const { scene, rest, dragged } = c;
  const edge = [...segments].reverse().map((s) => rest.edges.find((e) => e.id === s.edge)).find((e) => !!e);
  if (!edge) return null;
  const at = edge.items.filter((id) => zoneOf(rest.items[id]) === "start").length;
  const place = { kind: "gap" as const, edge: edge.id, zone: "start" as const, at };
  const collapsed = isHandFolded(scene, dragged);
  const lands = ({ layout }: SceneAfter): boolean => {
    const me = layout.items[dragged]!;
    return !me.inMenu && (collapsed ? me.rail === side : me.edge === edge.id && !me.rail && !me.rides && !layout.edges[edge.id]?.folded);
  };
  return slotAt(c, "start", y, targetId(place), place, lands);
}

/**
 * The side's rail as an edge (virtual, along y): a slot before each folded column's segments and after the last, or,
 * with no rail shown, one slot `RAIL_EDGE` px deep where the rail lands (`railPlaces`); tiled as every edge is. The
 * stops lie where the user sees the rail; each counts its ring with the item lifted.
 */
export function railStops(c: Ctx, side: "left" | "right"): EdgeSpec | null {
  const { scene, now, dragged } = c;
  const rail = now.rails[side];
  const placeRect = now.railPlaces[side];
  if (!placeRect) return null;
  const rings = ringsOf(c, side);
  const seenRings = sideRings(scene.edges, side);
  const mine = scene.edges.filter((e) => e.side === side).sort((a, b) => (seenRings.get(a.id) ?? 0) - (seenRings.get(b.id) ?? 0));
  const edgeOf = (id: string): Edge | undefined => mine.find((e) => e.id === id);
  const ringBefore = (id: string): number => {
    const e = edgeOf(id);
    return e ? rings.before(e) : 0;
  };
  const ringAfter = (id: string): number => {
    const e = edgeOf(id);
    return e ? rings.after(e) : 1;
  };
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
    for (const g of groups) stops.push({ y: g.y0, ring: ringBefore(g.edge) });
    const last = groups[groups.length - 1]!;
    stops.push({ y: last.y1, ring: ringAfter(last.edge) });
  } else {
    const firstCol = mine.find((e) => e.column === true);
    // The outer `RAIL_EDGE` px from the side's outer edge: the window's (an inset's strip included), or flush after the
    // side's outside bars.
    const outer = railOuter(c, side);
    zone = rect(side === "left" ? outer : outer - RAIL_EDGE, placeRect.y, RAIL_EDGE, placeRect.height);
    stops.push({ y: placeRect.y, ring: firstCol ? rings.before(firstCol) : rings.count });
  }
  // Every stop is home while the item is folded here already. A rail that shows (occupied) offers its stops wherever the
  // item ends up collapsed at this side (`collapsesAt`: its tile, or a rider bar when the lifted item's column reopens
  // over it). With no rail shown, a stop is only the item folded into the rail: a thin band that would otherwise take
  // the side's edge from the column line for a panel that rides.
  const ownRail = now.items[dragged]?.rail === side;
  const shown = !!rail && rail.segments.length > 0;
  const lands = (r: SceneAfter): boolean => (shown ? collapsesAt(c, r, side) : r.layout.items[dragged]!.rail === side && r.scene !== c.scene);
  const at = zone;
  // `foldedColumnDrop`: no stop changes the state of an item arriving here. A shown rail is one place, the end of its last
  // folded column; with none shown, only an item already collapsed has a stop.
  const arriving = scene.foldedColumnDrop === "end" && !ownRail;
  const end = arriving && shown ? railEnd(c, side, rail.segments, at.y + at.height) : null;
  if (arriving && (shown ? !end : !isHandFolded(scene, dragged))) return null;
  // No form of the item fits across the rail (its `width`): a refusal on a stop is for thickness, as on a real edge.
  const width = scene.rails?.[side]?.width;
  const tooThick = width !== undefined && thickerThan(formsOf(scene.items[dragged]!, "column"), width);
  return {
    id: virtualEdgeId("rail", side),
    edge: null,
    kind: "railStop",
    // The rail lies outside every edge on its side: laid first among them.
    lay: { phase: EDGE_KINDS.railStop.phase, side, at: -1 },
    vertical: true,
    zones: [{ zone: "start", a: at.y, b: at.y + at.height }],
    slots: end ? [end] : stops.map((s) => slotAt(c, "start", s.y, targetId({ kind: "rail", side, ring: s.ring }), { kind: "rail", side, ring: s.ring }, lands, ownRail)),
    refuse: () => (tooThick ? "too-thick" : "no-room"),
    own: null,
    holds: false,
    reserved: [],
    cards: [],
    across: () => [at.x, at.x + at.width],
    // A drawn rail owns its rect; where none shows, a thin band of its place at the side's outer boundary.
    owned: rail && rail.segments.length > 0 ? [at.x, at.x + at.width] : side === "left" ? [at.x, at.x + Math.min(at.width, EDGE_KINDS.railStop.place)] : [at.x + at.width - Math.min(at.width, EDGE_KINDS.railStop.place), at.x + at.width],
    ownedAlong: null,
    drawn: !!rail && rail.segments.length > 0,
    marker: (s) => rect(at.x, s.result.layout.items[dragged]!.rect.y, at.width, 0),
  };
}
