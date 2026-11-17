/**
 * Generation, the real edges: each edge's zones and their extents, its slots (insertion lines, each with the drop it
 * makes, settled), its reserved stretches and its band across, as the tiler reads them (`EdgeSpec`).
 */
import { EPS, area, rect, type Rect } from "../../geometry";
import { formMain } from "../../stack";
import { moveTo, use } from "../changes";
import { axisOf, formsOf, zoneOf, zoneTakes } from "../helpers";
import { DEFAULT_STRIP, ZONES, type Edge, type Scene, type SceneLayout, type Zone } from "../model";
import { solve } from "../solve";
import { targetId } from "./ids";
import { EDGE_KINDS, edgeKindOf, opensEmpty } from "./kinds";
import type { Ctx, EdgeSpec, SceneAfter, SceneTargetOptions, Slot, Span } from "./model";

/**
 * What a fixed item reserves in `l`: its drawn rect, or for a form that grows only its natural length, placed by its
 * zone (from its start, from its end in the end zone, centered in the center zone). No hit or slot ever lies there, so a
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
 * Slots that are the same move are one slot: one line and one landing, or both home (both put the item back, wherever
 * their lines lie). Home keeps it where one of them is home (beside a closed member the item lands where it is); else
 * the first (the lowest `at`).
 */
export function distinctSlots(c: Ctx, slots: readonly Slot[]): Slot[] {
  const landing = (s: Slot): Rect | undefined => s.result.layout.items[c.dragged]?.rect;
  const sameMove = (a: Slot, b: Slot): boolean => {
    if (a.zone !== b.zone) return false;
    if (a.home && b.home) return true;
    const [p, q] = [landing(a), landing(b)];
    // Two rail stops that land the same (a rider bar at the top, whichever tile's line it was taken from) are one move,
    // wherever their lines lie; other slots are the same move only on one line.
    const sameLine = (a.place.kind === "rail" && b.place.kind === "rail") || Math.abs(a.line - b.line) < EPS;
    return sameLine && (!p || !q ? p === q : Math.abs(p.x - q.x) + Math.abs(p.y - q.y) + Math.abs(p.width - q.width) + Math.abs(p.height - q.height) < 0.01);
  };
  const wins = (o: Slot, j: number, s: Slot, i: number): boolean => (o.home !== s.home ? o.home : j < i);
  return slots.filter((s, i) => !slots.some((o, j) => j !== i && sameMove(o, s) && wins(o, j, s, i)));
}

/**
 * The zones of `edge` with their extents along it, for a drag of `kind` (`EDGE_KINDS[...].zoneExtent`). `probe(zone)`:
 * the span an empty zone takes once it holds the item (a `solved` edge's empty zone), or null (then a point at the
 * zone's anchor). The outer extents reach `reach` past the edge's ends. `seen`: the layout as the user sees it.
 *
 * Thirds hold the cards seen in them: a zone's extent reaches over every card of its zone (a fixed item's reserved
 * rect, a title's text), its neighbor's starting past it, so a point over a card is that card's zone.
 */
function zoneSpans(scene: Scene, seen: SceneLayout, edge: Edge, reach: number, probe: (z: Zone) => Span | null): { zone: Zone; a: number; b: number }[] {
  const el = seen.edges[edge.id]!;
  const column = axisOf(edge.side) === "column";
  const main0 = column ? el.rect.y : el.rect.x;
  const length = column ? el.rect.height : el.rect.width;
  const thirds = EDGE_KINDS[edgeKindOf(scene, edge)].zoneExtent === "thirds";
  const at = (r: Rect): Span => (column ? [r.y, r.y + r.height] : [r.x, r.x + r.width]);
  const declared = new Set<Zone>(edge.zoneAccepts ? ZONES.filter((z) => edge.zoneAccepts![z] !== undefined) : ["start"]);
  // Each zone's seen cards, end to end.
  const placed = new Map<Zone, Span>();
  for (const [id, it] of Object.entries(seen.items)) {
    if (it.edge !== edge.id || it.inMenu) continue;
    const z = zoneOf(scene.items[id]);
    const [a, b] = at(thirds && it.fixed ? reservedRect(scene, seen, id) : it.rect);
    const was = placed.get(z);
    placed.set(z, was ? [Math.min(was[0], a), Math.max(was[1], b)] : [a, b]);
    declared.add(z);
  }
  if (thirds) {
    const lo = (z: Zone): number => placed.get(z)?.[0] ?? Infinity;
    const hi = (z: Zone): number => placed.get(z)?.[1] ?? -Infinity;
    const b1 = Math.min(Math.max(main0 + length / 3, hi("start")), lo("center"), lo("end"));
    const b2 = Math.max(Math.min(main0 + (2 * length) / 3, lo("end")), hi("center"), hi("start"), b1);
    return [
      { zone: "start", a: main0 - reach, b: b1 },
      { zone: "center", a: b1, b: b2 },
      { zone: "end", a: b2, b: main0 + length + reach },
    ];
  }
  // Where items fill the edge: the zones it declares (or its one zone), each where the solver puts its items.
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
 * drag of `dragged` tile them (the edge's rect as the user sees it, the item in place). For a test or a host that
 * shows the zones.
 */
export function zoneExtents(scene: Scene, dragged: string, edgeId: string, options: SceneTargetOptions = {}): { zone: Zone; a: number; b: number }[] {
  const prev = { ...(options.previous ? { previous: options.previous } : {}), ...(options.fresh ? { fresh: options.fresh } : {}) };
  const seen = solve(scene, prev);
  const edge = scene.edges.find((e) => e.id === edgeId);
  if (!edge || !seen.edges[edgeId]) return [];
  const column = axisOf(edge.side) === "column";
  const reach = Math.max(0, Number.isFinite(options.endReach) ? options.endReach! : 0);
  return zoneSpans(scene, seen, edge, reach, (zone) => {
    if (!zoneTakes(edge, zone, scene.items[dragged]?.kind ?? "")) return null;
    const l = solve(use(moveTo(scene, dragged, { kind: "gap", edge: edgeId, zone, at: 0 }), dragged), prev);
    const me = l.items[dragged];
    return me && me.edge === edgeId && me.zone === zone ? (column ? [me.rect.y, me.rect.y + me.rect.height] : [me.rect.x, me.rect.x + me.rect.width]) : null;
  });
}

/**
 * An edge's slots: each zone's insertion lines, in the seen geometry (the item in place; its own place is an interval,
 * home's). A slot counts its place among the edge's members with the item lifted (`at`); its drop is solved. What an
 * item takes of the edge for its lines: its rect, or a growing fixed item's natural rect (a title's text), so the
 * length it grew by is free room. A place that would move a fixed item of the edge is no slot.
 */
function edgeSlots(c: Ctx, edge: Edge, accepts: boolean): Slot[] {
  const { scene, rest, now, base, dragged, kind } = c;
  const el = now.edges[edge.id]!;
  const column = axisOf(edge.side) === "column";
  const at = (r: Rect): number => (column ? r.y : r.x);
  const len = (r: Rect): number => (column ? r.height : r.width);
  const main0 = at(el.rect);
  const length = len(el.rect);
  // The edge's members with the item lifted, the places a gap counts.
  const members0 = rest.edges.find((e) => e.id === edge.id)?.items ?? [];
  // `strip:<edge>:<zone>` names a slot only on an edge with no members at all (a zone there has one slot); every other
  // slot, beside closed members or the item's own place too, is named by its gap, so no two slots share an id.
  const slotId = (zone: Zone, k: number): string => targetId(members0.length === 0 ? { kind: "strip", edge: edge.id, zone } : { kind: "gap", edge: edge.id, zone, at: k });
  // Where a drop lands on this edge: in it, shown (no » entry); on a title bar (a fixed item that grows), in a form of its
  // first form's kind (the full row or one of its compact variants, read from the forms, not from their index), the
  // title at its natural width and nothing else changing form or going into the menu.
  const firstKind = formsOf(scene.items[dragged]!, axisOf(edge.side))[0]?.kind;
  const titles = edge.items.filter((id) => base.items[id]?.edge === edge.id && base.items[id]!.fixed && !!formsOf(scene.items[id]!, axisOf(edge.side))[base.items[id]!.form]?.main.grows);
  const lands = ({ layout: after }: SceneAfter): boolean => {
    const me = after.items[dragged]!;
    if (me.edge !== edge.id || me.inMenu) return false;
    if (titles.length === 0) return true;
    if (formsOf(scene.items[dragged]!, axisOf(edge.side))[me.form]?.kind !== firstKind) return false;
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
  const occupied = (id: string): Rect => (now.items[id]?.fixed ? reservedRect(scene, now, id) : now.items[id]!.rect);
  const shown = (id: string): boolean => now.items[id]?.edge === edge.id && !now.items[id]!.inMenu;
  const drawnOf = (z: Zone): Rect[] => members0.filter((id) => zoneOf(rest.items[id]) === z && shown(id)).map(occupied);
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
  // A slot's order: how many of the edge's shown items (fixed ones aside) lie before it, the item taken out.
  const aimed = (id: string): boolean => shown(id) && !now.items[id]!.fixed;
  let earlier = 0;
  for (const zone of ZONES) {
    const members = members0.filter((id) => zoneOf(rest.items[id]) === zone);
    const before0 = earlier;
    earlier += members.filter(aimed).length;
    if (!accepts || !zoneTakes(edge, zone, kind)) continue;
    for (let k = 0; k <= members.length; k++) {
      const next = members.slice(k).find(shown);
      const before = members.slice(0, k).reverse().find(shown);
      const line = next ? at(occupied(next)) : before ? at(occupied(before)) + len(occupied(before)) : anchorLine[zone];
      const s = { ...slotAt(c, zone, line, slotId(zone, k), { kind: "gap", edge: edge.id, zone, at: k }, lands), order: before0 + members.slice(0, k).filter(aimed).length };
      // A place that would move a fixed item of the edge (before a title, after the window controls) is no slot: a
      // fixed item keeps its place, so no drop ever lands there.
      const movesFixed = members0.some((id) => {
        const b = base.items[id];
        const a = s.result.layout.items[id];
        return !!b?.fixed && b.edge === edge.id && (!a || Math.abs(a.rect.x - b.rect.x) > 0.5 || Math.abs(a.rect.y - b.rect.y) > 0.5);
      });
      if (!movesFixed) slots.push(s);
    }
  }
  return slots;
}

/**
 * A real edge as the tiler reads it, in the seen geometry, or null where it offers nothing (home's own rect is added
 * on its own). An edge the lift deletes (the item's own column, or a dynamic column left empty) has no place a drop
 * counts in: the item's own collapses into home.
 */
export function edgeSpec(c: Ctx, edge: Edge): EdgeSpec | null {
  const { scene, rest, now, dragged, kind } = c;
  const el = now.edges[edge.id];
  // A folded or riding column takes drops through its side's rail and column lines, not here.
  if (!el || el.folded || el.rides || !rest.edges.some((e) => e.id === edge.id)) return null;
  const edgeKind = edgeKindOf(scene, edge);
  const data = EDGE_KINDS[edgeKind];
  const column = axisOf(edge.side) === "column";
  const at = (r: Rect): number => (column ? r.y : r.x);
  const len = (r: Rect): number => (column ? r.height : r.width);
  const empty = el.stack.items.every((p) => p.kind === "menu") && !el.menu;
  const accepts = edge.accepts.includes(kind);
  // An edge that takes the kind nowhere and draws nothing has nothing to say; an empty edge opens only as it may.
  if (!accepts && (empty || area(el.rect) <= EPS)) return null;
  if (accepts && empty && !opensEmpty(scene, edge, kind)) return null;
  // The item's own rect, where it is seen in this edge (in its » menu, the » entry): home's, whatever else the edge
  // offers.
  const ownNow = now.items[dragged];
  const ownHere = ownNow && ownNow.edge === edge.id && !ownNow.floating && area(ownNow.rect) > EPS ? ownNow.rect : null;
  const slots = edgeSlots(c, edge, accepts);
  const spanOf = (r: Rect): Span => [at(r), at(r) + len(r)];
  // The edge's reserved rects along it (its fixed items; a growing one's natural rect): no slot's tile lies there.
  // A growing one (a title) is not: its text is a stretch of the gap just after it.
  const grows = (id: string): boolean => !!formsOf(scene.items[id]!, axisOf(edge.side))[now.items[id]!.form]?.main.grows;
  const reserved: Span[] = Object.entries(now.items)
    .filter(([id, p]) => p.edge === edge.id && p.fixed && !p.inMenu && !grows(id))
    .map(([, p]) => spanOf(p.rect));
  const cards: Span[] = Object.entries(now.items)
    .filter(([id, p]) => id !== dragged && p.edge === edge.id && !p.fixed && !p.inMenu && !p.floating && area(p.rect) > EPS)
    .map(([, p]) => spanOf(p.rect));
  const zones =zoneSpans(scene, now, edge, c.reach, (zone) => {
    const s = slots.find((x) => x.zone === zone && x.place.kind === "gap" && x.place.at === 0);
    const me = s?.result.layout.items[dragged];
    return me && me.edge === edge.id && me.zone === zone ? spanOf(me.rect) : null;
  });

  // Across: the band from the edge's outer side, as deep as the edge (seen or after the drop) or an empty edge's strip.
  const r = el.rect;
  const strip = Math.max(0, Number.isFinite(edge.strip) ? edge.strip! : DEFAULT_STRIP);
  const outer = edge.side === "left" ? r.x : edge.side === "right" ? r.x + r.width : edge.side === "top" ? r.y : r.y + r.height;
  const inward = (depth: number): Span => (edge.side === "left" || edge.side === "top" ? [outer, outer + depth] : [outer - depth, outer]);
  const across = (after?: SceneLayout): Span => inward((el.cross > 0 ? Math.max(el.cross, after?.edges[edge.id]?.cross ?? 0) : strip) + data.inward);
  // What it owns: its seen thickness; an edge not drawn (empty, or one that shows only once the item lifts) owns only a
  // thin band of its place, at its boundary.
  const drawn = el.cross > 0;
  const marker = (s: Slot): Rect => {
    const slot = s.result.layout.items[dragged]!.rect;
    const e = s.result.layout.edges[edge.id]!;
    return column ? rect(e.rect.x, slot.y, e.cross, 0) : rect(slot.x, e.rect.y, 0, e.cross);
  };
  const takes = (zone: Zone): boolean => accepts && zoneTakes(edge, zone, kind);
  return {
    id: edge.id,
    edge,
    kind: edgeKind,
    lay: c.lay.get(edge.id)!,
    vertical: column,
    zones,
    slots,
    refuse: (zone) => (takes(zone) ? "no-room" : accepts || area(el.rect) > EPS ? "not-accepted" : null),
    own: ownHere,
    holds: !!ownNow && ownNow.edge === edge.id && !ownNow.floating,
    reserved,
    cards,
    across,
    owned: inward(drawn ? el.cross : Math.min(strip, data.place)),
    ownedAlong: null,
    drawn,
    marker,
  };
}
