/**
 * Generation, the real edges: each edge's zones and their extents, its slots (insertion lines, each with the drop it
 * makes, settled), its reserved stretches and its band across, as the tiler reads them (`EdgeSpec`).
 */
import { EPS, area, rect, type Rect } from "../../geometry";
import { formMain } from "../../stack";
import { lift, moveTo, use } from "../changes";
import { DEFAULT_STRIP, ZONES, axisOf, formsOf, zoneOf, zoneTakes, type Edge, type Scene, type SceneLayout, type Zone } from "../model";
import { solve } from "../solve";
import { EDGE_KINDS, edgeKindOf, opensEmpty } from "./kinds";
import type { Ctx, EdgeSpec, SceneAfter, SceneTargetOptions, Slot, Span } from "./model";

/**
 * What a fixed item reserves in `l`: its drawn rect, or for a form that grows only its natural length, placed by its
 * zone (from its start, from its end in the end zone, centred in the centre zone). No hit or slot ever lies there, so a
 * host that draws "no drop" areas reads them from here.
 */
export function reservedRect(scene: Scene, l: SceneLayout, id: string): Rect {
  const it = l.items[id]!;
  const e = it.edge ? l.edges[it.edge] : undefined;
  const f = e ? formsOf(scene.items[id]!, axisOf(e.side))[it.form] : undefined;
  if (!e || !f?.main.grows) return it.rect;
  const column = axisOf(e.side) === "column";
  const len = column ? it.rect.height : it.rect.width;
  const keep = Math.min(len, Math.max(0, Number.isFinite(f.main.natural) ? f.main.natural : len));
  const shift = it.zone === "end" ? len - keep : it.zone === "center" ? (len - keep) / 2 : 0;
  return column ? rect(it.rect.x, it.rect.y + shift, it.rect.width, keep) : rect(it.rect.x + shift, it.rect.y, keep, it.rect.height);
}

/** A slot for `place` on `line`: its drop, settled; home when it puts the item back (or `home`); `lands`, its edge's rule. */
export function slotAt(c: Ctx, zone: Zone, line: number, id: string, place: Slot["place"], lands: (r: SceneAfter) => boolean, home = false): Slot {
  const result = c.settle(use(moveTo(c.scene, c.dragged, place), c.dragged));
  const isHome = home || c.isHome(result);
  return { zone, line, id, place, result, home: isHome, ok: isHome || (!!result.layout.items[c.dragged] && lands(result) && c.sound(result.layout)) };
}

/**
 * The zones of `edge` with their extents along it, for a drag of `kind` (`EDGE_KINDS[...].zoneExtent`). `probe(zone)`:
 * the span an empty zone takes once it holds the item (a `solved` edge's empty zone), or null (then a point at the
 * zone's anchor). The outer extents reach `reach` past the edge's ends.
 */
function zoneSpans(scene: Scene, base: SceneLayout, edge: Edge, reach: number, probe: (z: Zone) => Span | null): { zone: Zone; a: number; b: number }[] {
  const el = base.edges[edge.id]!;
  const column = axisOf(edge.side) === "column";
  const main0 = column ? el.rect.y : el.rect.x;
  const length = column ? el.rect.height : el.rect.width;
  if (EDGE_KINDS[edgeKindOf(scene, edge)].zoneExtent === "thirds")
    return ZONES.map((zone, k) => ({ zone, a: k === 0 ? main0 - reach : main0 + (length * k) / 3, b: k === 2 ? main0 + length + reach : main0 + (length * (k + 1)) / 3 }));
  // Where items fill the edge: the zones it declares (or its one zone), each where the solver puts its items.
  const at = (r: Rect): Span => (column ? [r.y, r.y + r.height] : [r.x, r.x + r.width]);
  const declared = new Set<Zone>(edge.zoneAccepts ? ZONES.filter((z) => edge.zoneAccepts![z] !== undefined) : ["start"]);
  const placed = new Map<Zone, Span>();
  for (const [id, it] of Object.entries(base.items)) {
    if (it.edge !== edge.id || it.inMenu) continue;
    const z = zoneOf(scene.items[id]);
    const [a, b] = at(it.rect);
    const was = placed.get(z);
    placed.set(z, was ? [Math.min(was[0], a), Math.max(was[1], b)] : [a, b]);
    declared.add(z);
  }
  const anchor: Record<Zone, number> = { start: main0, center: main0 + length / 2, end: main0 + length };
  const spans = ZONES.filter((z) => declared.has(z)).map((zone) => ({ zone, s: placed.get(zone) ?? probe(zone) ?? ([anchor[zone], anchor[zone]] as Span) }));
  return spans.map(({ zone, s }, i) => ({
    zone,
    a: i === 0 ? main0 - reach : (spans[i - 1]!.s[1] + s[0]) / 2,
    b: i === spans.length - 1 ? main0 + length + reach : (s[1] + spans[i + 1]!.s[0]) / 2,
  }));
}

/**
 * `zoneExtents(scene, dragged, edgeId, options?)`: the zones of an edge and their extents along it, as the targets of a
 * drag of `dragged` tile them (the edge's rect as the lift leaves it). For a test or a host that shows the zones.
 */
export function zoneExtents(scene: Scene, dragged: string, edgeId: string, options: SceneTargetOptions = {}): { zone: Zone; a: number; b: number }[] {
  const prev = { ...(options.previous ? { previous: options.previous } : {}), ...(options.fresh ? { fresh: options.fresh } : {}) };
  const rest = lift(scene, dragged);
  const base = solve(rest, prev);
  const edge = rest.edges.find((e) => e.id === edgeId);
  if (!edge || !base.edges[edgeId]) return [];
  const column = axisOf(edge.side) === "column";
  const reach = Math.max(0, Number.isFinite(options.endReach) ? options.endReach! : 0);
  return zoneSpans(rest, base, edge, reach, (zone) => {
    if (!zoneTakes(edge, zone, scene.items[dragged]?.kind ?? "")) return null;
    const l = solve(use(moveTo(scene, dragged, { kind: "gap", edge: edgeId, zone, at: 0 }), dragged), prev);
    const me = l.items[dragged];
    return me && me.edge === edgeId && me.zone === zone ? (column ? [me.rect.y, me.rect.y + me.rect.height] : [me.rect.x, me.rect.x + me.rect.width]) : null;
  });
}

/**
 * An edge's slots: each zone's insertion lines, from the layout with the item lifted. What an item takes of the edge
 * for its lines: its rect, or a growing fixed item's natural rect (a title's text), so the length it grew by is free
 * room. A place that would move a fixed item of the edge is no slot.
 */
function edgeSlots(c: Ctx, edge: Edge, accepts: boolean): Slot[] {
  const { scene, rest, base, dragged, kind } = c;
  const el = base.edges[edge.id]!;
  const column = axisOf(edge.side) === "column";
  const at = (r: Rect): number => (column ? r.y : r.x);
  const len = (r: Rect): number => (column ? r.height : r.width);
  const main0 = at(el.rect);
  const length = len(el.rect);
  const restEdge = rest.edges.find((e) => e.id === edge.id)!;
  // `strip:<edge>:<zone>` names a slot only on an edge with no members at all (a zone there has one slot); every other
  // slot, beside closed members or the item's own place too, is named by its gap, so no two slots share an id.
  const slotId = (zone: Zone, k: number): string => (restEdge.items.length === 0 ? `strip:${edge.id}:${zone}` : `gap:${edge.id}:${zone}:${k}`);
  // Where a drop lands on this edge: in it, shown (no » entry); on a title bar (a fixed item that grows), in its first
  // form, the title at its natural width and nothing else changing form or going into the menu.
  const titles = edge.items.filter((id) => base.items[id]?.edge === edge.id && base.items[id]!.fixed && !!formsOf(scene.items[id]!, axisOf(edge.side))[base.items[id]!.form]?.main.grows);
  const lands = ({ layout: after }: SceneAfter): boolean => {
    const me = after.items[dragged]!;
    if (me.edge !== edge.id || me.inMenu) return false;
    if (titles.length === 0) return true;
    if (me.form !== 0) return false;
    return edge.items.every((id) => {
      const a = after.items[id];
      const b = base.items[id];
      if (!a || !b || b.edge !== edge.id || id === dragged) return true;
      if (!titles.includes(id)) return a.form === b.form && !!a.inMenu === !!b.inMenu;
      const f = formsOf(scene.items[id]!, axisOf(edge.side))[a.form];
      return !f || (column ? a.rect.height : a.rect.width) >= formMain(f, "natural", after.edges[edge.id]!.cross) - 0.5;
    });
  };
  const pad = { start: Math.max(0, edge.pad?.start ?? 0), end: Math.max(0, edge.pad?.end ?? 0) };
  const menuLen = el.menu ? len(el.menu.rect) : 0;
  const occupied = (id: string): Rect => (base.items[id]?.fixed ? reservedRect(scene, base, id) : base.items[id]!.rect);
  const shown = (id: string): boolean => base.items[id]?.edge === edge.id && !base.items[id]!.inMenu;
  const drawnOf = (z: Zone): Rect[] => restEdge.items.filter((id) => zoneOf(rest.items[id]) === z && shown(id)).map(occupied);
  const startEnd = ((): number => {
    const s = drawnOf("start");
    return s.length ? at(s[s.length - 1]!) + len(s[s.length - 1]!) : main0 + pad.start;
  })();
  const endStart = ((): number => {
    const e = drawnOf("end");
    return e.length ? at(e[0]!) : main0 + length - pad.end - menuLen;
  })();
  const anchorLine: Record<Zone, number> = { start: main0 + pad.start, center: Math.min(Math.max(main0 + length / 2, startEnd), Math.max(startEnd, endStart)), end: main0 + length - pad.end - menuLen };
  const slots: Slot[] = [];
  for (const zone of ZONES) {
    if (!accepts || !zoneTakes(edge, zone, kind)) continue;
    const members = restEdge.items.filter((id) => zoneOf(rest.items[id]) === zone);
    for (let k = 0; k <= members.length; k++) {
      const next = members.slice(k).find(shown);
      const before = members.slice(0, k).reverse().find(shown);
      const line = next ? at(occupied(next)) : before ? at(occupied(before)) + len(occupied(before)) : anchorLine[zone];
      const s = slotAt(c, zone, line, slotId(zone, k), { kind: "gap", edge: edge.id, zone, at: k }, lands);
      // A place that would move a fixed item of the edge (before a title, after the window controls) is no slot: a
      // fixed item keeps its place, so no drop ever lands there.
      const movesFixed = restEdge.items.some((id) => {
        const b = base.items[id];
        const a = s.result.layout.items[id];
        return !!b?.fixed && b.edge === edge.id && (!a || Math.abs(a.rect.x - b.rect.x) > 0.5 || Math.abs(a.rect.y - b.rect.y) > 0.5);
      });
      if (!movesFixed) slots.push(s);
    }
  }
  return slots;
}

/** A real edge as the tiler reads it, or null where it offers nothing (home's own rect is added on its own). */
export function edgeSpec(c: Ctx, edge: Edge): EdgeSpec | null {
  const { scene, rest, now, base, dragged, kind } = c;
  const el = base.edges[edge.id];
  // A folded or riding column takes drops through its side's rail and column lines, not here.
  if (!el || el.folded || el.rides) return null;
  const edgeKind = edgeKindOf(rest, edge);
  const data = EDGE_KINDS[edgeKind];
  const column = axisOf(edge.side) === "column";
  const at = (r: Rect): number => (column ? r.y : r.x);
  const len = (r: Rect): number => (column ? r.height : r.width);
  const empty = el.stack.items.every((p) => p.kind === "menu") && !el.menu;
  const accepts = edge.accepts.includes(kind);
  // An edge that takes the kind nowhere and draws nothing has nothing to say; an empty edge opens only as it may.
  if (!accepts && (empty || area(el.rect) <= EPS)) return null;
  if (accepts && empty && !opensEmpty(rest, edge, kind)) return null;
  // The item's own rect, where it lies in this edge now: home's, whatever else the edge offers.
  const ownNow = now.items[dragged];
  const ownHere = ownNow && ownNow.edge === edge.id && !ownNow.floating && !ownNow.inMenu ? ownNow.rect : null;
  const slots = edgeSlots(c, edge, accepts);
  const spanOf = (r: Rect): Span => [at(r), at(r) + len(r)];
  // The edge's reserved rects along it (its fixed items; a growing one's natural rect): no slot's tile lies there.
  // A growing one (a title) is not: its text is a stretch of the gap just after it.
  const grows = (id: string): boolean => !!formsOf(scene.items[id]!, axisOf(edge.side))[base.items[id]!.form]?.main.grows;
  const reserved: Span[] = Object.entries(base.items)
    .filter(([id, p]) => p.edge === edge.id && p.fixed && !p.inMenu && !grows(id))
    .map(([, p]) => spanOf(p.rect));
  const zones = zoneSpans(rest, base, edge, c.reach, (zone) => {
    const s = slots.find((x) => x.zone === zone && x.place.kind === "gap" && x.place.at === 0);
    const me = s?.result.layout.items[dragged];
    return me && me.edge === edge.id && me.zone === zone ? spanOf(me.rect) : null;
  });

  // Across: the band from the edge's outer side, as deep as the edge (now or after the drop) or an empty edge's strip.
  const r = el.rect;
  const strip = Math.max(0, Number.isFinite(edge.strip) ? edge.strip! : DEFAULT_STRIP);
  const nowCross = now.edges[edge.id]?.cross ?? 0;
  const outer = edge.side === "left" ? r.x : edge.side === "right" ? r.x + r.width : edge.side === "top" ? r.y : r.y + r.height;
  const inward = (depth: number): Span => (edge.side === "left" || edge.side === "top" ? [outer, outer + depth] : [outer - depth, outer]);
  const across = (after?: SceneLayout): Span => inward((el.cross > 0 || nowCross > 0 ? Math.max(el.cross, nowCross, after?.edges[edge.id]?.cross ?? 0) : strip) + data.inward);
  // What it owns: its current thickness, with the item lifted or as it is now, but the item's own edge only as lifted
  // (the item has left it); an edge with no thickness owns only a thin band of its place, at its boundary.
  const ownCross = ownNow?.edge === edge.id ? el.cross : Math.max(el.cross, nowCross);
  const drawn = ownCross > 0;
  const marker = (s: Slot): Rect => {
    const slot = s.result.layout.items[dragged]!.rect;
    const e = s.result.layout.edges[edge.id]!;
    return column ? rect(e.rect.x, slot.y, e.cross, 0) : rect(slot.x, e.rect.y, 0, e.cross);
  };
  const takes = (zone: Zone): boolean => accepts && zoneTakes(edge, zone, kind);
  return {
    id: edge.id,
    key: edge.id,
    kind: edgeKind,
    lay: c.lay.get(edge.id)!,
    vertical: column,
    zones,
    slots,
    refuse: (zone) => (takes(zone) ? "no-room" : accepts || area(el.rect) > EPS ? "not-accepted" : null),
    own: ownHere,
    holds: !!ownNow && ownNow.edge === edge.id && !ownNow.floating,
    reserved,
    across,
    owned: inward(drawn ? ownCross : Math.min(strip, data.place)),
    ownedAlong: null,
    drawn,
    marker,
  };
}
