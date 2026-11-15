/**
 * `targets(scene, dragged, { previous, endReach, floatSize })`: every drop target for one dragged item, in the shape
 * `@n-uf/motion/drag` takes (`id`, `priority`, `hit`, `slot?`, `free?`). Each target's `after(point, grab)` is the scene
 * a release there commits and its layout, `solve(after.scene, { previous })`: the host draws every item from that layout
 * during the preview (C22), so the preview is the result by construction.
 *
 * One model makes every docked target and refusal: **edge → zones → slots → tiles**, then one ordered
 * filter.
 *
 * - **Edges.** Every edge, empty or occupied, and two virtual edges per side: the column lines and the rail.
 * - **Zones.** Each edge's start, center and end zones have an extent along it. Where items keep their length and the
 *   zones only align them (bars, compact rails, side toolbar bars) the extents are the edge's thirds; where items fill
 *   the edge (panel columns) a zone's extent is the span the solver gives it: a plain column is one zone, a tray column
 *   its panels' span and its tray's (`EDGE_KINDS`, the only data keyed on the kind of edge). The outer extents reach
 *   `endReach` past the edge's ends.
 * - **Slots.** A zone's insertion lines, from the layout with the item lifted (`gap:<edge>:<zone>:<at>`; on an edge with
 *   no members at all a zone has one, `strip:<edge>:<zone>`). The item's own place is an interval, its own rect along the edge: home.
 * - **Tiles.** A zone's extent split halfway between its slots' lines (lines that lie past the extent are spread into
 *   it); the own interval keeps exactly its length, its neighbours meeting it, and a stretch of a zone with no other
 *   slot is home's. Across: the edge's thickness (the larger of now and after the drop), an empty edge's strip depth
 *   (`Edge.strip`, default 24, inward), a compact rail's `RAIL_REACH` further inward.
 * - **Filter**, in order: (i) the edge and zone take the kind (`accepts`, `zoneAccepts`), and an empty side column opens
 *   only through its start zone; (ii) the drop fits (C29: no » entry, no new overflow or `too-wide`, every fixed item
 *   keeps its form, place and least length, a title bar's title its natural width with the toolbar in its first form;
 *   the slot covers no chrome or reserved rect). A slot (i) or (ii) removes is a refusal over its own tile, with that
 *   reason (`refusals()`). (iii) Clipping, in precedence order: home, the virtual edges, then the edges by layer (full
 *   bars, side edges, bars between), each tile cut clear of the tiles before it, of the other edges' rects, of every
 *   fixed item that doesn't grow and of the chrome, keeping the part that holds its slot's line; its other parts are
 *   refused, a virtual edge's as a real one's (a virtual edge's refused stretches take only what every other tile
 *   leaves). (iv) `blocked` rects are `none:<i>`.
 *
 * Ids: `gap:<edge>:<zone>:<at>` (priority 2), `strip:<edge>:<zone>` (2), `column:<side>:<ring>` (2), `rail:<side>:<ring>`
 * (1), `none:<i>` (1), `float:<id>` (3, free). A slot that would put the item back where it is keeps its id with place
 * `home` (no slot, nothing committed); `home:<id>` (1) is emitted too, over the same tile (its own rect when no slot is
 * its home), for hosts that read it. A floating item has no home: a move inside its own rect is a float move.
 *
 * - `column:<side>:<ring>`: a new column on each column line of a side whose `scene.columns[side]` takes the kind
 *   (outside the outermost open column, between two, inside the innermost; on a side with none, at the content's
 *   edge), up to `COLUMN_REACH` px each way (two lines nearer than that meet halfway), only where the new column shows
 *   open (elsewhere refused).
 * - `rail:<side>:<ring>`: docking folded into a side's rail (its rail and its template take the kind), before each
 *   folded column's segments and after the last, or, with no rail shown, `RAIL_EDGE` px deep where the rail lands
 *   (`SceneLayout.railPlaces`).
 * - `float:<id>`: when `floatKinds` lists the kind, the whole plane: the landing is the float with the pointer holding
 *   it at `grab` (default its middle), in the stage and clear of the docked items, the bars and the chrome. Its orient:
 *   `options.floatOrient`, else its float's, else the item's (`floatOrientOf`). Its size: `options.floatSize`, else its
 *   float's size, else `floatSizeOf`.
 *
 * `stops(scene, id)` orders the same targets (no home, no none) for "Move to ›" and the arrow keys.
 *
 * A dropped item counts as just used (`use`). An unknown, fixed or closed item has no targets.
 */
import { COLUMN_REACH, EPS, PLANE, RAIL_EDGE, area, contains, overlaps, rect, subtract, type Point, type Rect, type Size } from "../geometry";
import type { Target } from "../target";
import { formMain } from "../stack/model";
import { floatAt, lift, moveTo, sideRings, use, type ColumnPlace, type RailPlace } from "./changes";
import { DEFAULT_HIT_BAND, DEFAULT_STRIP, ZONES, axisOf, floatOrientOf, floatSizeOf, formsOf, isSideBar, zoneOf, zoneTakes, type Edge, type Orient, type Scene, type SceneLayout, type Zone } from "./model";
import { solve } from "./solve";

export type ScenePlace =
  | { readonly kind: "gap"; readonly edge: string; readonly zone: Zone; readonly at: number }
  | ColumnPlace
  | RailPlace
  | { readonly kind: "float" }
  | { readonly kind: "home" }
  | { readonly kind: "none" };

export interface SceneAfter {
  readonly scene: Scene;
  readonly layout: SceneLayout;
}

export interface SceneTarget extends Target {
  /** The item dragged. */
  readonly item: string;
  readonly place: ScenePlace;
  /** Gaps and strips: the line where the item's leading edge lands, zero thick, across the edge after the drop. */
  readonly marker?: Rect;
  /** The scene a release here commits and its layout. Only a float's depends on the pointer. */
  after(point: Point, grab?: Point): SceneAfter;
}

export interface SceneTargetOptions {
  /** The layout before the drag: every `after` is solved with it, as the drop will be. */
  readonly previous?: SceneLayout;
  /** How far the first and last gaps of an edge reach past its ends, px (default 0). */
  readonly endReach?: number;
  /** The float's size for the float target. */
  readonly floatSize?: Size;
  /** The float's orient for the float target (default: its float's, else the item's `floatOrientOf`). */
  readonly floatOrient?: Orient;
  /** As `solve`'s: edge or item ids solved without `previous`, in every `after` too. */
  readonly fresh?: readonly string[];
}

/** Where a drop of the dragged item is refused: a host shows "no room here" at the pointer, with no slot anywhere. */
export interface SceneRefusal {
  /**
   * `refuse:<edge>:<zone>`, with `:<n>` after it for a zone's second refused tile and on, numbered by where they lie
   * along the edge (then across it), so an id is stable from one frame to the next.
   */
  readonly id: string;
  readonly edge: string;
  readonly zone: Zone;
  /** Where the pointer means it: the refused slot's tile, never over a target's hit. */
  readonly hit: Rect;
  /**
   * `no-room`: the zone takes the kind, but the drop there doesn't fit (a title bar at the title's natural width, say).
   * `own-place`: the stretch beside an item alone in its zone: there is room, but the zone's only place is the item's
   * own (a release there puts it back). `not-accepted`: the edge or zone doesn't take the kind.
   */
  readonly reason: "no-room" | "own-place" | "not-accepted";
}

/** How far a compact rail's hits reach inward past the rail, px. */
const RAIL_REACH = 24;

/**
 * The edge kinds and their data, the only place target generation tells them apart, the virtual edges (the column
 * lines across a side, the stops down its rail) among them.
 * - `zoneExtent`: `thirds` where items keep their length and the zones only align them, `solved` where items fill the
 *   edge (each zone's extent is the span the solver gives it), `whole` for an edge of one zone.
 * - `opens`: through which zones an empty edge opens: `any` zone that takes the kind, or only its `start` zone.
 * - `inward`: how far hits reach inward past the edge's thickness, over the other edges' rects but never their tiles.
 * - `layer`: clipping precedence (lower first: the virtual edges, then a full bar owns the corners, a side edge runs
 *   between the bars, a rail's reach takes what the edges beside it leave).
 * - `priority`: its targets' priority. `reach`: how far a slot's tile reaches each way from its line, px.
 * - `virtual`: an edge the scene doesn't draw. Its tiles aren't cut by the other edges' rects, and its refused
 *   stretches take only what every other tile leaves.
 */
const EDGE_KINDS = {
  bar: { zoneExtent: "thirds", opens: "any", inward: 0, layer: 10, priority: 2, reach: Infinity, virtual: false },
  rail: { zoneExtent: "thirds", opens: "any", inward: RAIL_REACH, layer: 14, priority: 2, reach: Infinity, virtual: false },
  sideBar: { zoneExtent: "thirds", opens: "any", inward: 0, layer: 11, priority: 2, reach: Infinity, virtual: false },
  column: { zoneExtent: "solved", opens: "start", inward: 0, layer: 12, priority: 2, reach: Infinity, virtual: false },
  barBetween: { zoneExtent: "thirds", opens: "any", inward: 0, layer: 13, priority: 2, reach: Infinity, virtual: false },
  railStop: { zoneExtent: "whole", opens: "any", inward: 0, layer: 4, priority: 1, reach: Infinity, virtual: true },
  columnLine: { zoneExtent: "whole", opens: "any", inward: 0, layer: 5, priority: 2, reach: COLUMN_REACH, virtual: true },
} as const satisfies Record<
  string,
  {
    readonly zoneExtent: "thirds" | "solved" | "whole";
    readonly opens: "any" | "start";
    readonly inward: number;
    readonly layer: number;
    readonly priority: 1 | 2;
    readonly reach: number;
    readonly virtual: boolean;
  }
>;
type EdgeKind = keyof typeof EDGE_KINDS;

/** Which of `EDGE_KINDS` an edge is. */
function edgeKindOf(scene: Scene, e: Edge): EdgeKind {
  if (e.compact) return "rail";
  if (e.side === "top" || e.side === "bottom") return e.span === "between" ? "barBetween" : "bar";
  return isSideBar(scene, e) ? "sideBar" : "column";
}

/**
 * Whether an empty `edge` opens to `kind`: an edge opens only through its start zone, so a kind never makes a column of
 * its own where the start zone takes another kind (a group never makes a column of one toolbar: a tray column's tray is
 * its end zone). Edges whose zones only align (bars, rails, side bars) open through any zone that takes the kind.
 */
export const opensEmpty = (scene: Scene, edge: Edge, kind: string): boolean => EDGE_KINDS[edgeKindOf(scene, edge)].opens === "any" || zoneTakes(edge, "start", kind);

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

/**
 * Where things are, without ages or the ids of dynamic columns: two scenes with one key place every item alike. An
 * edge's items count by zone (start, center, end), in their order within it: the list's order across zones places
 * nothing.
 */
function placeKey(s: Scene, id: string): string {
  const it = Object.hasOwn(s.items, id) ? s.items[id] : undefined;
  const byZone = (items: readonly string[]): string[] => ZONES.flatMap((z) => items.filter((x) => zoneOf(s.items[x]) === z));
  return JSON.stringify({
    edges: s.edges.map((e) => JSON.stringify([e.side, e.ring, e.column === true ? "" : e.id, byZone(e.items), e.size ?? null])).sort(),
    floats: s.floats.map((f) => [f.id, f.rect, f.anchor ?? null, f.orient ?? null]),
    from: it?.from ?? 0,
    align: it?.align ?? "start",
  });
}

/** One tile before clipping: a slot's, home's, or a refused slot's. */
interface Tile {
  readonly edge: string;
  /** Its edge's kind, set by the edge's description (a virtual edge's too): never read from an edge's id. */
  readonly edgeKind: EdgeKind;
  /** Its edge runs along y. */
  readonly vertical: boolean;
  readonly zone: Zone;
  /** Clipping precedence: lower first. */
  readonly order: number;
  readonly kind: "slot" | "home" | "refuse";
  readonly id: string;
  readonly priority: 1 | 2 | 3;
  readonly place?: ScenePlace;
  readonly result?: SceneAfter;
  readonly reason?: SceneRefusal["reason"];
  readonly hit: Rect;
  /** The point the tile must keep through clipping (on its slot's line), or null for a refusal (its largest part). */
  readonly keep: Point | null;
  readonly marker?: Rect;
  readonly slot?: Rect;
}

/** What one drag can do: its targets and its refusals, from one generation. */
interface Generated {
  readonly targets: SceneTarget[];
  readonly refusals: SceneRefusal[];
}

/** The context every edge's generator shares. */
interface Ctx {
  readonly scene: Scene;
  readonly rest: Scene;
  readonly now: SceneLayout;
  readonly base: SceneLayout;
  readonly dragged: string;
  readonly kind: string;
  readonly reach: number;
  readonly settle: (s: Scene) => SceneAfter;
  readonly isHome: (r: SceneAfter) => boolean;
  /** Whether a drop's layout fits the window (filter ii): what every edge checks; its own landing rule comes on top. */
  readonly sound: (after: SceneLayout) => boolean;
}

/** A slot: an insertion line along an edge and the drop it makes. */
interface Slot {
  readonly zone: Zone;
  /** Its line along the edge. */
  readonly line: number;
  readonly id: string;
  readonly place: Extract<ScenePlace, { kind: "gap" }> | ColumnPlace | RailPlace;
  readonly result: SceneAfter;
  /** A drop here puts the item back where it is. */
  readonly home: boolean;
  /** It passes the filter: home, or the item lands where the slot aims and the window fits. */
  readonly ok: boolean;
}

/**
 * One edge as the tiler reads it, a real edge or a virtual one alike: its kind (`EDGE_KINDS`), its axis, its zones'
 * extents along it, its slots, the item's own rect on it (its interval along the edge is home's tile), the spans no
 * tile takes, its band across and its markers.
 */
interface EdgeSpec {
  readonly id: string;
  readonly kind: EdgeKind;
  /** It runs along y (side edges, the rail), not x (bars, the column lines). */
  readonly vertical: boolean;
  readonly zones: readonly { readonly zone: Zone; readonly a: number; readonly b: number }[];
  readonly slots: readonly Slot[];
  /** Why a stretch of `zone` with no slot is refused, or null where it is no drop place at all. */
  readonly refuse: (zone: Zone) => SceneRefusal["reason"] | null;
  /** The item's own rect on this edge, or null. */
  readonly own: Rect | null;
  /** The item lies on this edge now (drawn, or in its » menu): its home slot gets no tile, home is only its own rect. */
  readonly holds: boolean;
  readonly reserved: readonly Span[];
  /** The band across, `[from, to]`, as deep as the edge is now or after `after`. */
  readonly across: (after?: SceneLayout) => Span;
  /** A slot's marker: the zero-thick line where the item's leading edge lands. */
  readonly marker: (s: Slot) => Rect;
}

/** A slot for `place` on `line`: its drop, settled; home when it puts the item back (or `home`); `lands`, its edge's rule. */
function slotAt(c: Ctx, zone: Zone, line: number, id: string, place: Slot["place"], lands: (r: SceneAfter) => boolean, home = false): Slot {
  const result = c.settle(use(moveTo(c.scene, c.dragged, place), c.dragged));
  const isHome = home || c.isHome(result);
  return { zone, line, id, place, result, home: isHome, ok: isHome || (!!result.layout.items[c.dragged] && lands(result) && c.sound(result.layout)) };
}

/** `[a, b]` along an edge. */
type Span = readonly [number, number];

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

/** A real edge as the tiler reads it, or null where it offers nothing (home's own rect is added on its own). */
function edgeSpec(c: Ctx, edge: Edge): EdgeSpec | null {
  const { scene, rest, now, base, dragged, kind } = c;
  const el = base.edges[edge.id];
  // A folded or riding column takes drops through its side's rail and column lines, not here.
  if (!el || el.folded || el.rides) return null;
  const edgeKind = edgeKindOf(rest, edge);
  const data = EDGE_KINDS[edgeKind];
  const column = axisOf(edge.side) === "column";
  const at = (r: Rect): number => (column ? r.y : r.x);
  const len = (r: Rect): number => (column ? r.height : r.width);
  const main0 = at(el.rect);
  const length = len(el.rect);
  const empty = el.stack.items.every((p) => p.kind === "menu") && !el.menu;
  const accepts = edge.accepts.includes(kind);
  // An edge that takes the kind nowhere and draws nothing has nothing to say; an empty edge opens only as it may.
  if (!accepts && (empty || area(el.rect) <= EPS)) return null;
  if (accepts && empty && !opensEmpty(rest, edge, kind)) return null;
  // The item's own rect, where it lies in this edge now: home's, whatever else the edge offers.
  const ownNow = now.items[dragged];
  const ownHere = ownNow && ownNow.edge === edge.id && !ownNow.floating && !ownNow.inMenu ? ownNow.rect : null;
  const restEdge = rest.edges.find((e) => e.id === edge.id)!;
  // `strip:<edge>:<zone>` names a slot only on an edge with no members at all (a zone there has one slot); every other
  // slot, beside closed members or the item's own place too, is named by its gap, so no two slots share an id.
  const slotId = (zone: Zone, at: number): string => (restEdge.items.length === 0 ? `strip:${edge.id}:${zone}` : `gap:${edge.id}:${zone}:${at}`);
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

  // Slots: a zone's insertion lines, from the layout with the item lifted. What an item takes of the edge for its lines:
  // its rect, or a growing fixed item's natural rect (a title's text), so the length it grew by is free room.
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
  const across = (after?: SceneLayout): Span => {
    const depth = (el.cross > 0 || nowCross > 0 ? Math.max(el.cross, nowCross, after?.edges[edge.id]?.cross ?? 0) : strip) + data.inward;
    const outer = edge.side === "left" ? r.x : edge.side === "right" ? r.x + r.width : edge.side === "top" ? r.y : r.y + r.height;
    return edge.side === "left" || edge.side === "top" ? [outer, outer + depth] : [outer - depth, outer];
  };
  const marker = (s: Slot): Rect => {
    const slot = s.result.layout.items[dragged]!.rect;
    const e = s.result.layout.edges[edge.id]!;
    return column ? rect(e.rect.x, slot.y, e.cross, 0) : rect(slot.x, e.rect.y, 0, e.cross);
  };
  const takes = (zone: Zone): boolean => accepts && zoneTakes(edge, zone, kind);
  return {
    id: edge.id,
    kind: edgeKind,
    vertical: column,
    zones,
    slots,
    refuse: (zone) => (takes(zone) ? "no-room" : accepts || area(el.rect) > EPS ? "not-accepted" : null),
    own: ownHere,
    holds: !!ownNow && ownNow.edge === edge.id && !ownNow.floating,
    reserved,
    across,
    marker,
  };
}

/**
 * One edge's tiles, every kind alike: each zone's extent less the item's own interval, split halfway between its slots'
 * lines (projected into it), a slot's tile reaching at most its kind's `reach` from its line. A stretch with no slot is
 * refused (`spec.refuse`), a slot the filter removed is refused over its own tile, and the own interval is home's
 * (across, the edge's band and the own rect), named after the home slot when there is one. Where the item has no rect
 * on the edge, home's tile is its slot's.
 */
function tileEdge(c: Ctx, spec: EdgeSpec): Tile[] {
  const data = EDGE_KINDS[spec.kind];
  const v = spec.vertical;
  const own: Span | null = spec.own ? (v ? [spec.own.y, spec.own.y + spec.own.height] : [spec.own.x, spec.own.x + spec.own.width]) : null;
  const band = (a: number, b: number, after?: SceneLayout): Rect => {
    const [c0, c1] = spec.across(after);
    return v ? rect(c0, a, c1 - c0, b - a) : rect(a, c0, b - a, c1 - c0);
  };
  // The point a tile keeps through clipping: on its line, in the middle of its band across.
  const keepAt = (line: number, h: Rect): Point => (v ? { x: h.x + h.width / 2, y: line } : { x: line, y: h.y + h.height / 2 });
  type More = Pick<Tile, "kind" | "id" | "order" | "priority" | "keep"> & Partial<Tile>;
  const tile = (zone: Zone, hit: Rect, more: More): Tile => ({ edge: spec.id, edgeKind: spec.kind, vertical: v, zone, hit, ...more });
  const refused = (zone: Zone, hit: Rect, reason: SceneRefusal["reason"]): Tile => tile(zone, hit, { kind: "refuse", id: "", order: data.layer, priority: data.priority, keep: null, reason });
  const reserved = spec.reserved;
  const out: Tile[] = [];
  for (const z of spec.zones) {
    // The zone's extent less the own interval: up to two pieces.
    const pieces: Span[] = (own ? [[z.a, Math.min(z.b, own[0])] as Span, [Math.max(z.a, own[1]), z.b] as Span] : [[z.a, z.b] as Span]).filter(([a, b]) => b - a > EPS);
    const mine = spec.slots.filter((s) => s.zone === z.zone && !(spec.holds && s.home));
    const reason = spec.refuse(z.zone);
    for (const [pa, pb] of pieces) {
      // Lines spread into the zone's extent less its reserved rects when they lie past it: their share of the span
      // the lines and the extent cover, laid along the extent's free pieces end to end.
      const lines = mine.map((s) => s.line);
      const lo = Math.min(z.a, ...lines);
      const hi = Math.max(z.b, ...lines);
      const free = reserved.reduce<Span[]>((acc, [ra, rb]) => acc.flatMap(([a, b]) => (rb <= a || ra >= b ? [[a, b] as Span] : ([[a, Math.max(a, ra)], [Math.min(b, rb), b]] as Span[]).filter(([u, v]) => v - u > EPS))), [[z.a, z.b]]);
      const freeLen = free.reduce((n, [a, b]) => n + (b - a), 0);
      const spread = (x: number): number => {
        if (hi - lo <= EPS || freeLen <= EPS) return x;
        let d = ((x - lo) / (hi - lo)) * freeLen;
        for (const [a, b] of free) {
          if (d <= b - a + EPS) return a + Math.min(d, b - a);
          d -= b - a;
        }
        return free[free.length - 1]![1];
      };
      // A line inside the own interval (an empty zone's anchor under the item) goes to the interval's nearer end.
      // Lines inside the extent stay where they are, one inside a reserved rect going to its nearer end.
      const past = lines.some((x) => x < z.a - EPS || x > z.b + EPS);
      const nearer = (p: number, [a, b]: Span): number => (p > a && p < b ? (p - a < b - p ? a : b) : p);
      const proj = (x: number): number => {
        const p = reserved.reduce((q, s) => nearer(q, s), past ? spread(x) : x);
        return own ? nearer(p, own) : p;
      };
      const inPiece = mine.filter((s) => proj(s.line) >= pa - EPS && proj(s.line) <= pb + EPS).sort((a, b) => proj(a.line) - proj(b.line));
      if (inPiece.length === 0) {
        // A stretch of a zone with no slot of its own is refused: home is only over the item's own place, and no stretch
        // is handed to another zone's slot. Beside a lone item (the zone's only slot is home) there is room, but no
        // place other than its own: `own-place`.
        const lone = reason === "no-room" && mine.length === 0 && spec.slots.some((s) => s.zone === z.zone && s.home);
        if (reason) out.push(refused(z.zone, band(pa, pb), lone ? "own-place" : reason));
        continue;
      }
      inPiece.forEach((s, i) => {
        // Halfway between neighbouring lines, the piece's ends at its ends (the own interval's ends are one), and no
        // further from its line than the kind's reach.
        const p = proj(s.line);
        const a = Math.max(i === 0 ? pa : (proj(inPiece[i - 1]!.line) + p) / 2, p - data.reach);
        const b = Math.min(i === inPiece.length - 1 ? pb : (p + proj(inPiece[i + 1]!.line)) / 2, p + data.reach);
        if (b - a <= EPS) return;
        const line = Math.min(Math.max(p, a), b);
        const hit = band(a, b, s.result.layout);
        if (!s.ok) out.push(refused(z.zone, hit, "no-room"));
        else if (s.home) out.push(tile(z.zone, hit, { kind: "home", id: s.id, order: 1, priority: data.priority, keep: keepAt(line, hit), place: { kind: "home" } }));
        else out.push(tile(z.zone, hit, { kind: "slot", id: s.id, order: data.layer, priority: data.priority, keep: keepAt(line, hit), place: s.place, result: s.result, marker: spec.marker(s), slot: s.result.layout.items[c.dragged]!.rect }));
      });
    }
  }
  if (own && spec.own) {
    const home = spec.slots.find((s) => s.home);
    // Across the edge's band and the own rect where it lies now: home's wherever the lift moves things (nothing clips
    // it). A slot's id and priority; `home:<id>` (1) when no slot is home.
    const [a, b] = own;
    const h = band(a, b);
    const o = spec.own;
    const hit = v ? rect(Math.min(h.x, o.x), a, Math.max(h.x + h.width, o.x + o.width) - Math.min(h.x, o.x), b - a) : rect(a, Math.min(h.y, o.y), b - a, Math.max(h.y + h.height, o.y + o.height) - Math.min(h.y, o.y));
    out.push(tile(home?.zone ?? zoneOf(c.scene.items[c.dragged]), hit, { kind: "home", id: home ? home.id : `home:${c.dragged}`, order: 0, priority: home ? data.priority : 1, keep: null, place: { kind: "home" } }));
  }
  return out;
}

/**
 * The side's column lines as an edge (virtual, along x): a slot on each line for a new column there, tiled as every
 * edge is (its kind's `reach` each way at most), down the columns' stretch.
 */
function columnLines(c: Ctx, side: "left" | "right"): EdgeSpec {
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
  const lines: { x: number; ring: number }[] = [];
  const outerX = (r: Rect): number => (side === "left" ? r.x : r.x + r.width);
  const innerX = (r: Rect): number => (side === "left" ? r.x + r.width : r.x);
  cols.forEach((x) => lines.push({ x: outerX(x.r), ring: ringOf(x.edge) }));
  if (cols.length > 0) lines.push({ x: innerX(cols[cols.length - 1]!.r), ring: ringOf(cols[cols.length - 1]!.edge) + 1 });
  else lines.push({ x: side === "left" ? base.content.x : base.content.x + base.content.width, ring: rings.size });
  // A new column lands where it shows open.
  const lands = (r: SceneAfter): boolean => {
    const me = r.layout.items[dragged]!;
    const el = me.edge ? r.layout.edges[me.edge] : undefined;
    return !!el && !me.inMenu && !el.folded && !el.rides && r.scene !== c.scene;
  };
  const xs = lines.map((l) => l.x);
  const reach = EDGE_KINDS.columnLine.reach;
  return {
    id: `column:${side}`,
    kind: "columnLine",
    vertical: false,
    zones: [{ zone: "start", a: Math.min(...xs) - reach, b: Math.max(...xs) + reach }],
    slots: lines.map((l) => slotAt(c, "start", l.x, `column:${side}:${l.ring}`, { kind: "column", side, ring: l.ring }, lands)),
    refuse: () => null,
    own: null,
    holds: false,
    reserved: [],
    across: () => [span.y, span.y + span.height],
    marker: (s) => rect(s.line, span.y, 0, span.height),
  };
}

/**
 * The side's rail as an edge (virtual, along y): a slot before each folded column's segments and after the last, or,
 * with no rail shown, one slot `RAIL_EDGE` px deep where the rail lands (`railPlaces`); tiled as every edge is.
 */
function railStops(c: Ctx, side: "left" | "right"): EdgeSpec | null {
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
    kind: "railStop",
    vertical: true,
    zones: [{ zone: "start", a: at.y, b: at.y + at.height }],
    slots: stops.map((s) => slotAt(c, "start", s.y, `rail:${side}:${s.ring}`, { kind: "rail", side, ring: s.ring }, lands, ownRail)),
    refuse: () => null,
    own: null,
    holds: false,
    reserved: [],
    across: () => [at.x, at.x + at.width],
    marker: (s) => rect(at.x, s.result.layout.items[dragged]!.rect.y, at.width, 0),
  };
}

function generate(scene: Scene, dragged: string, options: SceneTargetOptions): Generated {
  const item = Object.hasOwn(scene.items, dragged) ? scene.items[dragged] : undefined;
  if (!item || item.fixed || item.closed) return { targets: [], refusals: [] };
  const prev = { ...(options.previous ? { previous: options.previous } : {}), ...(options.fresh ? { fresh: options.fresh } : {}) };
  const settle = (s: Scene): SceneAfter => ({ scene: s, layout: solve(s, prev) });
  const now = solve(scene, prev);
  const rest = lift(scene, dragged);
  const base = solve(rest, prev);
  const chrome = scene.chrome ?? [];
  const here = placeKey(scene, dragged);

  // Filter (ii), fit: a drop may not add an `overflow` or `too-wide` note anywhere, change a fixed item's form or least
  // length, nor lie over chrome or a fixed item's reserved rect (C29). Each edge adds where a drop on it lands (`lands`).
  const noteKey = (n: SceneLayout["notes"][number]): string | null => ("edge" in n && (n.code === "overflow" || n.code === "too-wide") ? `${n.edge}:${n.code}:${"id" in n ? n.id : ""}` : null);
  const hadNotes = new Set(base.notes.map(noteKey).filter((k): k is string => k !== null));
  const sound = (after: SceneLayout): boolean => {
    if (after.notes.some((n) => { const k = noteKey(n); return k !== null && !hadNotes.has(k); })) return false;
    for (const [id, b] of Object.entries(base.items)) {
      if (!b.fixed) continue;
      const a = after.items[id];
      const e = a?.edge ? after.edges[a.edge] : undefined;
      if (!a || !e || a.form !== b.form || a.formKind !== b.formKind) return false;
      const f = formsOf(scene.items[id]!, axisOf(e.side))[a.form];
      const len = axisOf(e.side) === "column" ? a.rect.height : a.rect.width;
      if (f && len < formMain(f, "min", e.cross) - 0.5) return false;
    }
    const me = after.items[dragged];
    if (!me) return true;
    const fixedAfter = Object.entries(after.items).filter(([id, it]) => it.fixed && id !== dragged).map(([id]) => reservedRect(scene, after, id));
    return !chrome.some((c) => overlaps(me.rect, c)) && !fixedAfter.some((f) => overlaps(me.rect, f));
  };
  const c: Ctx = { scene, rest, now, base, dragged, kind: item.kind, reach: Math.max(0, Number.isFinite(options.endReach) ? options.endReach! : 0), settle, isHome: (r) => placeKey(r.scene, dragged) === here, sound };

  // The edges as the tiler reads them: every real edge, then each side's column lines and rail, only for kinds the
  // side's template opens with (its start zone).
  const specs: (EdgeSpec | null)[] = rest.edges.map((edge) => edgeSpec(c, edge));
  for (const side of ["left", "right"] as const) {
    const template = scene.columns?.[side];
    if (!template || !zoneTakes(template, "start", item.kind)) continue;
    specs.push(columnLines(c, side));
    if (scene.rails?.[side]?.accepts.includes(item.kind)) specs.push(railStops(c, side));
  }
  const tiles: Tile[] = specs.flatMap((spec) => (spec ? tileEdge(c, spec) : []));
  // The item's own place is home's even where no edge tiles it (its column, deleted by the lift; its » entry).
  const ownRect = now.items[dragged];
  const homeEdge = scene.edges.find((e) => e.id === ownRect?.edge);
  if (ownRect && homeEdge && !ownRect.floating && !tiles.some((t) => t.order === 0))
    tiles.push({ edge: homeEdge.id, edgeKind: edgeKindOf(scene, homeEdge), vertical: axisOf(homeEdge.side) === "column", zone: zoneOf(item), order: 0, kind: "home", id: `home:${dragged}`, priority: 1, place: { kind: "home" }, hit: ownRect.rect, keep: null });

  // Filter (iii), clipping in precedence order: each tile clear of the ones before it, of the other edges' rects (with
  // the item lifted, and as they are now), of the fixed items that don't grow and of the chrome.
  const grows = (l: SceneLayout, id: string): boolean => {
    const it = l.items[id]!;
    const e = it.edge ? l.edges[it.edge] : undefined;
    return !!e && !!formsOf(scene.items[id]!, axisOf(e.side))[it.form]?.main.grows;
  };
  const solid = [...new Set([now, base])].flatMap((l) => Object.entries(l.items).filter(([id, it]) => it.fixed && !grows(l, id)).map(([, it]) => it.rect));
  const ownEdge = now.items[dragged]?.edge;
  const edgeRects = (id: string): Rect[] => [
    ...Object.entries(base.edges).filter(([eid, e]) => eid !== id && area(e.rect) > EPS).map(([, e]) => e.rect),
    ...Object.entries(now.edges).filter(([eid, e]) => eid !== id && eid !== ownEdge && area(e.rect) > EPS).map(([, e]) => e.rect),
  ];
  // Panel bodies (an open item's), but for `hitBand / 2` at each end, aren't drop places of their edge.
  // Nor are its fixed items' reserved rects (a growing title's natural rect): each cut across the edge's whole band.
  const bodies = (id: string): Rect[] => {
    const e = rest.edges.find((x) => x.id === id);
    if (!e) return [];
    const column = axisOf(e.side) === "column";
    const across = (a: number, b: number): Rect => (column ? rect(-1e9, a, 2e9, b - a) : rect(a, -1e9, b - a, 2e9));
    const reserved = Object.entries(base.items)
      .filter(([iid, p]) => p.edge === id && p.fixed && !p.inMenu && !grows(base, iid))
      .map(([, p]) => (column ? across(p.rect.y, p.rect.y + p.rect.height) : across(p.rect.x, p.rect.x + p.rect.width)));
    const bandOpt = e.hitBand ?? DEFAULT_HIT_BAND;
    if (bandOpt === "middle") return reserved;
    const half = Math.max(0, Number.isFinite(bandOpt) ? bandOpt : DEFAULT_HIT_BAND) / 2;
    const open = Object.entries(base.items)
      .filter(([iid, p]) => p.edge === id && p.formKind === "open" && iid !== dragged)
      .map(([, p]) => (column ? across(p.rect.y + half, p.rect.y + p.rect.height - half) : across(p.rect.x + half, p.rect.x + p.rect.width - half)));
    return [...reserved, ...open].filter((b) => area(b) > EPS);
  };
  const placed: Tile[] = [];
  // A virtual edge's refused stretches (its refused slots, its slots' clipped-off pieces) come after every other tile:
  // they take only what no tile takes, never a real edge's room.
  const later: Tile[] = [];
  for (const t of [...tiles].sort((a, b) => a.order - b.order)) {
    // Home's tile is the item's own place: nothing clips it.
    if (t.order === 0) {
      placed.push(t);
      continue;
    }
    const data = EDGE_KINDS[t.edgeKind];
    if (data.virtual && t.kind === "refuse") {
      later.push(t);
      continue;
    }
    // An edge that reaches inward (a compact rail) reaches over the other edges' rects, never over their tiles.
    const cuts = [...placed.map((p) => p.hit), ...(data.virtual ? [] : [...(data.inward > 0 ? [] : edgeRects(t.edge)), ...bodies(t.edge)]), ...solid, ...chrome];
    let pieces: Rect[] = [t.hit];
    for (const cut of cuts) pieces = pieces.flatMap((p) => subtract(p, cut));
    if (pieces.length === 0) continue;
    if (t.kind === "refuse") {
      for (const p of pieces) placed.push({ ...t, hit: p });
      continue;
    }
    // A slot keeps the piece that holds its line (else its largest); its other pieces are refused for its zone, a virtual
    // edge's as a real one's, so clipping never leaves a hole the float fills.
    const held = t.keep ? pieces.filter((p) => contains(p, t.keep!)) : [];
    const kept = (held.length > 0 ? held : pieces).reduce((a, p) => (area(p) > area(a) ? p : a));
    // No sliver: a slot left under 1 px along its edge is no target (its piece is refused).
    const sliver = (t.vertical ? kept.height : kept.width) < 1;
    if (!sliver) placed.push({ ...t, hit: kept });
    for (const p of pieces) if (sliver || p !== kept) (data.virtual ? later : placed).push({ ...t, kind: "refuse", reason: "no-room", hit: p, keep: null });
  }
  for (const t of later) {
    let pieces: Rect[] = [t.hit];
    for (const cut of [...placed.map((p) => p.hit), ...solid, ...chrome]) pieces = pieces.flatMap((p) => subtract(p, cut));
    for (const p of pieces) placed.push({ ...t, hit: p });
  }

  const targets: SceneTarget[] = [];
  const refused: SceneRefusal[] = [];
  const homeAfter = (): SceneAfter => ({ scene, layout: now });
  // A zone's refusals are numbered by where they lie along the edge (then across it), not by clipping order, so a
  // refusal keeps its id from one frame to the next.
  const keyOf = (t: Tile): string => `refuse:${t.edge}:${t.zone}`;
  const pos = (t: Tile): [number, number] => (t.vertical ? [t.hit.y, t.hit.x] : [t.hit.x, t.hit.y]);
  const rank = new Map<Tile, number>();
  const byKey = new Map<string, Tile[]>();
  for (const t of placed) if (t.kind === "refuse") byKey.set(keyOf(t), [...(byKey.get(keyOf(t)) ?? []), t]);
  for (const group of byKey.values()) group.sort((a, b) => pos(a)[0] - pos(b)[0] || pos(a)[1] - pos(b)[1]).forEach((t, n) => rank.set(t, n));
  let ownHome: Rect | null = null;
  for (const t of placed) {
    if (t.kind === "refuse") {
      const n = rank.get(t)!;
      refused.push({ id: n === 0 ? keyOf(t) : `${keyOf(t)}:${n}`, edge: t.edge, zone: t.zone, hit: t.hit, reason: t.reason! });
      continue;
    }
    if (t.kind === "home") {
      if (t.order === 0) ownHome = t.hit;
      if (t.id === `home:${dragged}`) continue;
      targets.push({ id: t.id, priority: t.priority, hit: t.hit, item: dragged, place: { kind: "home" }, after: homeAfter });
      continue;
    }
    const result = t.result!;
    targets.push({ id: t.id, priority: t.priority, hit: t.hit, ...(t.slot ? { slot: t.slot } : {}), ...(t.marker ? { marker: t.marker } : {}), item: dragged, place: t.place!, after: () => result });
  }

  if (scene.floatKinds.includes(item.kind)) {
    const was = scene.floats.find((f) => f.id === dragged);
    const fo: Orient = options.floatOrient ?? was?.orient ?? floatOrientOf(item);
    const size = options.floatSize ?? (was ? { width: was.rect.width, height: was.rect.height } : floatSizeOf(item, fo));
    targets.push({
      id: `float:${dragged}`,
      priority: 3,
      free: true,
      hit: PLANE,
      item: dragged,
      place: { kind: "float" },
      after(point, grab) {
        const g = grab ?? { x: size.width / 2, y: size.height / 2 };
        const raw = rect(point.x - g.x, point.y - g.y, size.width, size.height);
        const first = solve(use(floatAt(scene, dragged, raw, options.floatOrient), dragged), prev);
        const at = first.items[dragged]?.rect ?? raw;
        return settle(use(floatAt(scene, dragged, rect(at.x, at.y, size.width, size.height), options.floatOrient), dragged));
      },
    });
  }

  // Filter (iv): `blocked` rects take the pointer and commit nothing.
  (scene.blocked ?? []).forEach((b, i) => {
    targets.push({ id: `none:${i}`, priority: 1, hit: rect(b.x, b.y, b.width, b.height), item: dragged, place: { kind: "none" }, after: homeAfter });
  });

  // `home:<id>`, for hosts that read it: over the item's own rect, inside home's tile (all of it when only it is home's).
  const own = now.items[dragged];
  if (own && !own.floating) targets.push({ id: `home:${dragged}`, priority: 1, hit: ownHome && !targets.some((t) => t.place.kind === "home") ? ownHome : own.rect, item: dragged, place: { kind: "home" }, after: homeAfter });
  return { targets, refusals: refused };
}

export function targets(scene: Scene, dragged: string, options: SceneTargetOptions = {}): SceneTarget[] {
  return generate(scene, dragged, options).targets;
}

/**
 * `refusals(scene, dragged, options?)`: the places a drop of `dragged` is refused, so a host can say so at the pointer
 * (a tint and "No room here") instead of showing a slot elsewhere: each slot the filter removed, over its own tile,
 * `not-accepted` where the edge or zone doesn't take the kind, `no-room` where the drop wouldn't fit. A release over a
 * refusal commits nothing: the item goes home.
 */
export function refusals(scene: Scene, dragged: string, options: SceneTargetOptions = {}): SceneRefusal[] {
  return generate(scene, dragged, options).refusals;
}

const SIDE_RANK: Record<string, number> = { left: 0, top: 1, bottom: 2, right: 3 };

/**
 * `stops(scene, id, options?)`: the places for "Move to ›" and the arrow keys, in reading order, from the same targets
 * (`home` and `none` left out): the left side outer to inner, the top bars, the bottom bars, the right side inner to
 * outer, floating last. Each stop is a target, so its `after` is the move.
 */
export function stops(scene: Scene, dragged: string, options: SceneTargetOptions = {}): SceneTarget[] {
  const list = targets(scene, dragged, options).filter((t) => t.place.kind !== "home" && t.place.kind !== "none");
  const sideOf = (t: SceneTarget): string => {
    const p = t.place;
    if (p.kind === "float") return "float";
    if (p.kind === "column" || p.kind === "rail") return p.side;
    if (p.kind === "gap") return scene.edges.find((e) => e.id === p.edge)?.side ?? "float";
    return "float";
  };
  const key = (t: SceneTarget): [number, number, number] => {
    const side = sideOf(t);
    const r = t.slot ?? t.hit;
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const rank = side === "float" ? 4 : SIDE_RANK[side]!;
    return side === "left" ? [rank, cx, cy] : side === "right" ? [rank, -cx, cy] : [rank, cy * (side === "bottom" ? -1 : 1), cx];
  };
  return list
    .map((t, i) => ({ t, i, k: key(t) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2] || a.i - b.i)
    .map((x) => x.t);
}
