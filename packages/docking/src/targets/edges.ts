/**
 * Generation, the real edges: each edge's zones and their extents, its slots (insertion lines, each with the drop it
 * makes, settled), its reserved stretches and its band across, as the tiler reads them (`EdgeSpec`).
 */
import { EPS, area, rect, type Rect } from "@n-uf/placement";
import { formCrossMin, formMenu, formSetsCross, itemSteps, type StackForm } from "@n-uf/placement/stack";
import { markUsed, moveAmong, moveTo } from "../changes";
import { axisOf, edgeTakes, formsOf, growsOnBar, withoutBarGrowth, zoneOf, zonesOf, zoneTakes } from "../helpers";
import { DEFAULT_STRIP, ZONES, type DockEdge, type DockState, type DockLayout, type SolveOptions, type Zone } from "../model";
import { solve } from "../solve";
import { targetId } from "./ids";
import { EDGE_KINDS, edgeKindOf, opensEmpty, type EdgeKind } from "./kinds";
import type { Ctx, EdgeSpec, DropResult, DockDropOptions, Slot, Span } from "./model";

/**
 * What a fixed item reserves in `l`: its drawn rect, or for a form that grows only its natural length, placed by its
 * zone (from its start, from its end in the end zone, centered in the center zone). No hit or slot ever lies there, so a
 * host that draws "no drop" areas reads them from here.
 */
export function reservedRect(state: DockState, l: DockLayout, id: string): Rect {
  const it = l.items[id]!;
  const e = it.edge ? l.edges[it.edge] : undefined;
  const f = e ? formsOf(state.items[id]!, axisOf(e.side))[it.form] : undefined;
  if (!e || !f?.main.grows) return it.rect;
  const column = axisOf(e.side) === "column";
  const len = column ? it.rect.height : it.rect.width;
  const keep = Math.min(len, Math.max(0, Number.isFinite(f.main.natural) ? f.main.natural : len));
  const shift = it.zone === "end" ? len - keep : it.zone === "center" ? (len - keep) / 2 : 0;
  return column ? rect(it.rect.x, it.rect.y + shift, it.rect.width, keep) : rect(it.rect.x + shift, it.rect.y, keep, it.rect.height);
}

/**
 * `l` (the solve of `state` under `prev`) as a drop of `dragged` draws it: where `dragged` is a movable grower on a bar
 * (`growsOnBar`), the state solved with its growth off (`withoutBarGrowth`), so it and its bar's neighbors lie at its
 * natural length, the preview and the landing; it grows once placed, when its state is solved again. Any other item:
 * `l` itself, the same object.
 */
export function landedLayout(state: DockState, l: DockLayout, dragged: string, prev: SolveOptions): DockLayout {
  const it = l.items[dragged];
  if (!it || it.fixed || it.inMenu || it.floating || !it.edge) return l;
  const e = state.edges.find((x) => x.id === it.edge);
  if (!e || !growsOnBar(state, e, dragged, it.form)) return l;
  return solve(withoutBarGrowth(state, dragged), prev);
}

/**
 * A drop's layout of `dragged` from its state alone, in one solve: `landedLayout`'s result. The growth is turned off
 * before solving wherever `dragged` lies on a bar with a form that grows; a form that grows only sets its length, never
 * which form an item takes, so where it ends in a form that doesn't grow the solve is the same.
 */
export const solveLanded = (state: DockState, dragged: string, prev: SolveOptions): DockLayout => solve(withoutBarGrowth(state, dragged), prev);

/** A slot for `place` on `line`: its drop, settled; home when it puts the item back (or `home`); `lands`, its edge's rule. */
export function slotAt(c: Ctx, zone: Zone, line: number, id: string, place: Slot["place"], lands: (r: DropResult) => boolean, home = false): Slot {
  const result = c.settle(markUsed(moveAmong(c.state, c.dragged, place, c.others), c.dragged));
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
function zoneSpans(state: DockState, seen: DockLayout, edge: DockEdge, reach: number, probe: (z: Zone) => Span | null): { zone: Zone; a: number; b: number }[] {
  const el = seen.edges[edge.id]!;
  const column = axisOf(edge.side) === "column";
  const main0 = column ? el.rect.y : el.rect.x;
  const length = column ? el.rect.height : el.rect.width;
  const thirds = EDGE_KINDS[edgeKindOf(state, edge)].zoneExtent === "thirds";
  const at = (r: Rect): Span => (column ? [r.y, r.y + r.height] : [r.x, r.x + r.width]);
  const declared = new Set<Zone>(edge.zoneAccepts ? ZONES.filter((z) => edge.zoneAccepts![z] !== undefined) : ["start"]);
  // Each zone's seen cards, end to end.
  const placed = new Map<Zone, Span>();
  for (const [id, it] of Object.entries(seen.items)) {
    if (it.edge !== edge.id || it.inMenu) continue;
    // The zone it is laid out in (`zoneIn`: its own wherever the edge takes it there).
    const z = it.zone ?? zoneOf(state.items[id]);
    const [a, b] = at(thirds && it.fixed ? reservedRect(state, seen, id) : it.rect);
    const was = placed.get(z);
    placed.set(z, was ? [Math.min(was[0], a), Math.max(was[1], b)] : [a, b]);
    declared.add(z);
  }
  const lo = (z: Zone): number => placed.get(z)?.[0] ?? Infinity;
  const hi = (z: Zone): number => placed.get(z)?.[1] ?? -Infinity;
  if (edge.zones !== undefined) {
    // An edge with only some zones (`DockEdge.zones`): its length split between them alone, evenly, each boundary moved past
    // the cards seen on either side of it, as the thirds are. One zone: the whole length, ordered by position along it.
    const has = zonesOf(edge);
    let prev = main0 - reach;
    return has.map((zone, i) => {
      const last = i === has.length - 1;
      const mark = main0 + (length * (i + 1)) / has.length;
      const b = last ? main0 + length + reach : Math.max(prev, Math.min(Math.max(mark, ...has.slice(0, i + 1).map(hi)), ...has.slice(i + 1).map(lo)));
      const span = { zone, a: prev, b };
      prev = b;
      return span;
    });
  }
  if (thirds) {
    // `barZones: "nearest"`: each boundary halfway between the landing rects either side of it (a zone's landing beside
    // the boundary: past its last card, else where its first drop lands), so the pointer is in the zone whose landing is
    // nearest. Else at a third of the length.
    const nearest = state.barZones === "nearest";
    const landing = (z: Zone, side: "before" | "after"): Span | null => (placed.has(z) ? (side === "after" ? [hi(z), hi(z)] : [lo(z), lo(z)]) : probe(z));
    const between = (l: Zone, r: Zone, fallback: number): number => {
      const a = landing(l, "after");
      const b = landing(r, "before");
      return nearest && a && b ? (a[1] + b[0]) / 2 : fallback;
    };
    const b1 = Math.min(Math.max(between("start", "center", main0 + length / 3), hi("start")), lo("center"), lo("end"));
    const b2 = Math.max(Math.min(between("center", "end", main0 + (2 * length) / 3), lo("end")), hi("center"), hi("start"), b1);
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
 * `zoneExtents(state, dragged, edgeId, options?)`: the zones of an edge and their extents along it, as the targets of a
 * drag of `dragged` tile them (the edge's rect as the user sees it, the item in place). For a test or a host that
 * shows the zones.
 */
export function zoneExtents(state: DockState, dragged: string, edgeId: string, options: DockDropOptions = {}): { zone: Zone; a: number; b: number }[] {
  const prev = { ...(options.previous ? { previous: options.previous } : {}), ...(options.fresh ? { fresh: options.fresh } : {}) };
  // (As the targets read them: every movable grower on a bar at its natural length.)
  const seen = solve(withoutBarGrowth(state), prev);
  const edge = state.edges.find((e) => e.id === edgeId);
  if (!edge || !seen.edges[edgeId]) return [];
  const column = axisOf(edge.side) === "column";
  const reach = Math.max(0, Number.isFinite(options.endReach) ? options.endReach! : 0);
  return zoneSpans(state, seen, edge, reach, (zone) => {
    if (!zoneTakes(edge, zone, state.items[dragged]?.kind ?? "")) return null;
    const l = solve(withoutBarGrowth(markUsed(moveTo(state, dragged, { kind: "gap", edge: edgeId, zone, at: 0 }), dragged)), prev);
    const me = l.items[dragged];
    return me && me.edge === edgeId && me.zone === zone ? (column ? [me.rect.y, me.rect.y + me.rect.height] : [me.rect.x, me.rect.x + me.rect.width]) : null;
  });
}

/**
 * An edge's slots: each zone's insertion lines, in the seen geometry (the item in place; its own place is an interval,
 * home's). A slot counts its place among the edge's members with the item lifted (`at`); its drop is solved. What an
 * item takes of the edge for its lines: its rect, or a growing fixed item's natural rect (a title's text), so the
 * length it grew by is free room. A place that would move a protected fixed item of the edge is no slot. Protected: a
 * fixed item in the slot's zone's anchored fixed run (the fixed members contiguous from the zone's anchor with no
 * movable member between: the start zone's from its first member, the end zone's from its last), any fixed item of the
 * center zone, and any fixed item of another zone. A fixed item behind a movable one in the slot's own zone is placed
 * by that movable's size, so a drop there may push it. A fixed item that declares `pushable` is not protected in the
 * anchored run: a drop after it may push it inward, so the gap at the end of a run of them is a slot (the place a toolbar
 * homed after them is put back in); no gap between two of them is (they keep their order).
 */
function edgeSlots(c: Ctx, edge: DockEdge, accepts: boolean): Slot[] {
  const { state, rest, now, base, dragged, kind } = c;
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
  // Where a drop lands on this edge: in it, shown (no » entry). A growing fixed item beside it (a title) takes its natural
  // length of the target room, not its grown length (filter (ii), `soundness`): nothing else is asked of a title bar.
  const lands = ({ layout: after }: DropResult): boolean => {
    const me = after.items[dragged]!;
    return me.edge === edge.id && !me.inMenu;
  };
  const pad = { start: Math.max(0, edge.pad?.start ?? 0), end: Math.max(0, edge.pad?.end ?? 0) };
  const menuLen = el.menu ? len(el.menu.rect) : 0;
  // (Read in the drop room's geometry, `c.room`: every movable grower on a bar at its natural length.)
  const occupied = (id: string): Rect => (c.room.items[id]?.fixed ? reservedRect(state, c.room, id) : c.room.items[id]!.rect);
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
    // The zone's anchored fixed run, read from its anchor (the start zone's first member, the end zone's last) up to its
    // first shown movable member. The center zone has none: every fixed item there keeps the geometric test.
    const fixedHere = (id: string): boolean => !!base.items[id]?.fixed && base.items[id]!.edge === edge.id;
    const fromAnchor = (zone === "start" ? members : zone === "end" ? [...members].reverse() : []).filter((id) => fixedHere(id) || shown(id));
    const firstMovable = fromAnchor.findIndex((id) => !fixedHere(id));
    const anchored = new Set(firstMovable < 0 ? fromAnchor : fromAnchor.slice(0, firstMovable));
    // A fixed item that declares `pushable` yields in the anchored run: a drop after it may push it inward.
    const pushable = (id: string): boolean => fixedHere(id) && state.items[id]?.pushable === true;
    const isProtected = (id: string): boolean => fixedHere(id) && (zone === "center" || zoneOf(rest.items[id]) !== zone || (anchored.has(id) && !pushable(id)));
    for (let k = 0; k <= members.length; k++) {
      const next = members.slice(k).find(shown);
      const before = members.slice(0, k).reverse().find(shown);
      // Pushable items keep their order among the fixed items: no gap between two of them.
      if (before && next && pushable(before) && pushable(next)) continue;
      const line = next ? at(occupied(next)) : before ? at(occupied(before)) + len(occupied(before)) : anchorLine[zone];
      const s = { ...slotAt(c, zone, line, slotId(zone, k), { kind: "gap", edge: edge.id, zone, at: k }, lands), order: before0 + members.slice(0, k).filter(aimed).length };
      // A place that would move a protected fixed item (before a title, after the window controls) is no slot: it keeps
      // its place, so no drop ever lands there. A fixed item behind a movable one in this zone may be pushed.
      const movesFixed = members0.some((id) => {
        const b = base.items[id];
        const a = s.result.layout.items[id];
        // (Pushed is not gone: a drop that would take any fixed item out of the layout is no slot either.)
        if (fixedHere(id) && !a) return true;
        if (!isProtected(id)) return false;
        // A fixed item that takes steps (`stepping`) in the » has no place along the edge: "nothing lands before it" is
        // read from the order of ids, a drop between it and its zone's anchor.
        if (itemSteps(state.items[id]!) && (a!.inMenu || b!.inMenu)) {
          const i = members.indexOf(id);
          return i >= 0 && anchored.has(id) && (zone === "end" ? k > i : k <= i);
        }
        return (Math.abs(a!.rect.x - b!.rect.x) > 0.5 || Math.abs(a!.rect.y - b!.rect.y) > 0.5);
      });
      if (!movesFixed) slots.push(s);
    }
  }
  return slots;
}

/**
 * Whether the item is thicker than an edge `cross` px across: every form but the » menu's sets no cross size (an `open`
 * panel does, and is clamped) and asks at least `cross.min` across, over `cross`. Then no length makes room for it.
 * The one thickness test of every edge, real or virtual (a new column's line, a rail stop).
 */
export function thickerThan(forms: readonly StackForm[], cross: number): boolean {
  const shown = forms.filter((f) => !formMenu(f));
  return shown.length > 0 && shown.every((f) => !formSetsCross(f) && formCrossMin(f) > cross + EPS);
}

/**
 * Why `zone` of `spec`, which takes the kind, refuses a drop there that doesn't fit: `too-thick` where no form of the
 * item fits across the edge (the spec's own refusal says so), else `no-room` (too short). Every refusal for want of
 * room reads it, so a slot that doesn't fit and a sliver cut off a slot say what the zone says.
 */
export const roomReason = (spec: EdgeSpec, zone: Zone): "too-thick" | "no-room" => (spec.refuse(zone) === "too-thick" ? "too-thick" : "no-room");

/**
 * A real edge as the tiler reads it, in the seen geometry, or null where it offers nothing (home's own rect is added
 * on its own). An edge the lift deletes (the item's own column, or a dynamic column left empty) has no place a drop
 * counts in: the item's own collapses into home.
 */
export function edgeSpec(c: Ctx, edge: DockEdge, as?: EdgeKind): EdgeSpec | null {
  const { state, rest, now, dragged, kind } = c;
  const el = now.edges[edge.id];
  // A folded or riding column takes drops through its side's rail and column lines, not here.
  if (!el || el.folded || el.rides || !rest.edges.some((e) => e.id === edge.id)) return null;
  const edgeKind = as ?? edgeKindOf(state, edge);
  const data = EDGE_KINDS[edgeKind];
  const column = axisOf(edge.side) === "column";
  const at = (r: Rect): number => (column ? r.y : r.x);
  const len = (r: Rect): number => (column ? r.height : r.width);
  const empty = el.stack.items.every((p) => el.stack.menu?.items.includes(p.id)) && !el.menu;
  // Whether it takes the kind at all: listed in `accepts` and taken by at least one zone. An edge whose zones take
  // nothing for it (`zoneAccepts: {}`, a rail the host doesn't draw) is one that doesn't accept it.
  const accepts = edgeTakes(edge, kind);
  // An edge that takes the kind nowhere and draws nothing has nothing to say; an empty edge opens only as it may.
  if (!accepts && (empty || area(el.rect) <= EPS)) return null;
  if (accepts && empty && !opensEmpty(state, edge, kind)) return null;
  // The item's own rect, where it is seen in this edge (in its » menu, the » entry): home's, whatever else the edge
  // offers.
  // (In the drop room's geometry, `c.room`, as the zones and slots are.)
  const ownNow = c.room.items[dragged];
  const ownHere = ownNow && ownNow.edge === edge.id && !ownNow.floating && area(ownNow.rect) > EPS ? ownNow.rect : null;
  // A column drawn as a rail, under `DockState.foldedColumnDrop: "end"`: for an item arriving from elsewhere its whole length
  // is one place, after its last member. One of its own tiles keeps its gaps, to move among them.
  const oneEnd = state.foldedColumnDrop === "end" && column && el.tabs.length > 0 && ownNow?.edge !== edge.id && zoneTakes(edge, "start", kind);
  const allSlots = edgeSlots(c, edge, accepts);
  const slots = oneEnd ? allSlots.filter((s) => s.zone === "start").sort((a, b) => a.line - b.line).slice(-1) : allSlots;
  const spanOf = (r: Rect): Span => [at(r), at(r) + len(r)];
  // The edge's reserved rects along it (its fixed items; a growing one's natural rect): no slot's tile lies there.
  // A growing one (a title) is not: its text is a stretch of the gap just after it.
  const grows = (id: string): boolean => !!formsOf(state.items[id]!, axisOf(edge.side))[now.items[id]!.form]?.main.grows;
  const reserved: Span[] = Object.entries(now.items)
    .filter(([id, p]) => p.edge === edge.id && p.fixed && !p.inMenu && !grows(id))
    .map(([, p]) => spanOf(p.rect));
  const cards: Span[] = Object.entries(c.room.items)
    .filter(([id, p]) => id !== dragged && p.edge === edge.id && !p.fixed && !p.inMenu && !p.floating && area(p.rect) > EPS)
    .map(([, p]) => spanOf(p.rect));
  const zones = oneEnd
    ? [{ zone: "start" as const, a: at(el.rect) - c.reach, b: at(el.rect) + len(el.rect) + c.reach }]
    : zoneSpans(state, c.room, edge, c.reach, (zone) => {
        const s = slots.find((x) => x.zone === zone && x.place.kind === "gap" && x.place.at === 0);
        const me = s?.result.layout.items[dragged];
        return me && me.edge === edge.id && me.zone === zone ? spanOf(me.rect) : null;
      });

  // Across: the band from the edge's outer side, as deep as the edge (seen or after the drop) or an empty edge's strip.
  const r = el.rect;
  const strip = Math.max(0, Number.isFinite(edge.strip) ? edge.strip! : DEFAULT_STRIP);
  const outer = edge.side === "left" ? r.x : edge.side === "right" ? r.x + r.width : edge.side === "top" ? r.y : r.y + r.height;
  const inward = (depth: number): Span => (edge.side === "left" || edge.side === "top" ? [outer, outer + depth] : [outer - depth, outer]);
  // An empty rail or bar: as deep as a drop draws it (a rail's or a bar's drawn depth), entered over that. An empty column,
  // whose drop draws a whole column, keeps the thin band.
  const thin = edgeKind === "rail" || edgeKind === "bar" || edgeKind === "barBetween";
  const landed = el.cross > 0 || !thin ? 0 : Math.max(0, ...slots.map((s) => s.result.layout.edges[edge.id]?.cross ?? 0));
  const across = (after?: DockLayout): Span => inward((el.cross > 0 ? Math.max(el.cross, after?.edges[edge.id]?.cross ?? 0) : Math.max(strip, landed)) + data.inward);
  // What it owns: its seen thickness; an edge not drawn (empty, or one that shows only once the item lifts) owns the
  // depth a drop draws it at, at its boundary, else a thin band of its place.
  const drawn = el.cross > 0;
  const marker = (s: Slot): Rect => {
    const slot = s.result.layout.items[dragged]!.rect;
    const e = s.result.layout.edges[edge.id]!;
    return column ? rect(e.rect.x, slot.y, e.cross, 0) : rect(slot.x, e.rect.y, 0, e.cross);
  };
  const takes = (zone: Zone): boolean => accepts && zoneTakes(edge, zone, kind);
  // No form of the item fits across the edge: a refusal there is for thickness, not for lack of length.
  const tooThick = thickerThan(formsOf(state.items[dragged]!, axisOf(edge.side)), el.stack.cross);
  return {
    id: edge.id,
    edge,
    kind: edgeKind,
    lay: c.lay.get(edge.id)!,
    vertical: column,
    zones,
    slots,
    refuse: (zone) => (takes(zone) ? (tooThick ? "too-thick" : "no-room") : accepts || area(el.rect) > EPS ? "not-accepted" : null),
    own: ownHere,
    holds: !!ownNow && ownNow.edge === edge.id && !ownNow.floating,
    reserved,
    cards,
    across,
    owned: inward(drawn ? el.cross : landed > 0 ? landed : Math.min(strip, data.place)),
    ...(!drawn && landed > Math.min(strip, data.place) ? { thinOwned: inward(Math.min(strip, data.place)) } : {}),
    ownedAlong: null,
    drawn,
    marker,
  };
}

/**
 * The run of a column folded into its side's declared rail, as the edge of its own that it is for one of its tiles held:
 * `edgeSpec` of the column drawn where its tiles lie, `run` (the rail's tiles of that column, end to end). Its zones,
 * its slots and its cards are those of the column drawn as a rail, within the run; it reaches no further (no
 * `endReach`), so what lies beside the run in the rail stays with the rail's own stops. It is as deep as the rail, never
 * deeper (a drop that would open the column draws it wider, but a place here stays in the rail), and its zones lie in the
 * run (a tray's end zone is solved where the column would lie open, not in the rail). Null where the column offers
 * nothing (the item alone in it, which the lift deletes).
 */
export function railColumnSpec(c: Ctx, edge: DockEdge, run: Rect): EdgeSpec | null {
  const el = c.now.edges[edge.id];
  if (!el) return null;
  const { folded: _folded, ...shown } = el;
  const seen = { ...c, reach: 0, now: { ...c.now, edges: { ...c.now.edges, [edge.id]: { ...shown, rect: run, cross: run.width } } } };
  const spec = edgeSpec(seen, edge, "railColumn");
  if (!spec) return null;
  const across: Span = [run.x, run.x + run.width];
  return { ...spec, across: () => across, owned: across };
}
