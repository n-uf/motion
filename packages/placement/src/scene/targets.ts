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
 *   reason (`refusals()`). (iii) Space ownership and clipping (`EDGE_KINDS`): owned > virtual > overreach. A zone's
 *   room loses its panel bodies, its reserved rects and what edges ranked before it own (in `solve`'s laying order); a
 *   zone with no room, or a slot with none in reach, isn't offered. Each tile's owned part is cut clear of the tiles
 *   before it, of what outranks its edge, of every fixed item that doesn't grow and of the chrome, keeping the part
 *   that holds its slot's line (its other parts refused); then the virtual edges take what no edge owns; then each
 *   overreach takes what is left and joins its owned part where it meets it whole. Slots that are the same move are
 *   one. (iv) `blocked` rects are `none:<i>`.
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
import { layKeys, pushes, solve, type LayKey } from "./solve";

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
 * - `inward`: how far hits reach inward past the edge's thickness (overreach, below).
 * - Space ownership, one ordering: **owned > virtual > overreach**. A drawn edge owns its current rect; an empty edge
 *   owns only `place` px of its strip, at the boundary where it would appear (the side's rail likewise, where it lies
 *   or would lie, `railPlaces`). Owned rects rank in the order `solve` lays edges out (`layKeys`, `pushes`): an edge
 *   laid first, whose filling pushes the other, wins; between edges laid independently a drawn rect wins over an empty
 *   edge's band. `layer` orders the owned tiles where they meet. The virtual edges (the column lines) come next and get
 *   only space no edge owns. `overreach` orders the parts of tiles past their owned rect (the depth after a drop, an
 *   empty strip past its band, a compact rail's inward reach), which yield to the virtual edges and to every other
 *   edge's owned rect.
 * - `priority`: its targets' priority. `reach`: how far a slot's tile reaches each way from its line, px.
 * - `virtual`: an edge that owns nothing (the column lines). Its refused stretches take only what every other tile
 *   leaves.
 */
const EDGE_KINDS = {
  bar: { zoneExtent: "thirds", opens: "any", inward: 0, place: DEFAULT_HIT_BAND / 2, layer: 10, overreach: 30, priority: 2, reach: Infinity, virtual: false },
  sideBar: { zoneExtent: "thirds", opens: "any", inward: 0, place: DEFAULT_HIT_BAND / 2, layer: 11, overreach: 31, priority: 2, reach: Infinity, virtual: false },
  column: { zoneExtent: "solved", opens: "start", inward: 0, place: DEFAULT_HIT_BAND / 2, layer: 12, overreach: 32, priority: 2, reach: Infinity, virtual: false },
  barBetween: { zoneExtent: "thirds", opens: "any", inward: 0, place: DEFAULT_HIT_BAND / 2, layer: 13, overreach: 33, priority: 2, reach: Infinity, virtual: false },
  rail: { zoneExtent: "thirds", opens: "any", inward: RAIL_REACH, place: DEFAULT_HIT_BAND / 2, layer: 14, overreach: 34, priority: 2, reach: Infinity, virtual: false },
  railStop: { zoneExtent: "whole", opens: "any", inward: 0, place: DEFAULT_HIT_BAND / 2, layer: 9, overreach: 39, priority: 1, reach: Infinity, virtual: false },
  columnLine: { zoneExtent: "whole", opens: "any", inward: 0, place: DEFAULT_HIT_BAND / 2, layer: 21, overreach: 41, priority: 2, reach: COLUMN_REACH, virtual: true },
} as const satisfies Record<
  string,
  {
    readonly zoneExtent: "thirds" | "solved" | "whole";
    readonly opens: "any" | "start";
    readonly inward: number;
    readonly place: number;
    readonly layer: number;
    readonly overreach: number;
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
  /** Its spec's `key`. */
  readonly key: string;
  /** Its edge's kind, set by the edge's description (a virtual edge's too): never read from an edge's id. */
  readonly edgeKind: EdgeKind;
  /** Its edge runs along y. */
  readonly vertical: boolean;
  readonly zone: Zone;
  /** Clipping precedence: lower first. */
  readonly order: number;
  /** `reach`: the overreach of the tile `of` (its part past its edge's owned rect), clipped after the virtual edges. */
  readonly kind: "slot" | "home" | "refuse" | "reach";
  readonly of?: Tile;
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
  /** Slots the filter kept, with room in their zone, that end with no hit (none, by the property check). */
  readonly lost: string[];
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
  /** Where `solve` lays each edge of the scene out. */
  readonly lay: ReadonlyMap<string, LayKey>;
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
  /** Unique among the specs (a side's column lines share their edge's id, one spec per line). */
  readonly key: string;
  readonly kind: EdgeKind;
  /** Where `solve` lays it out (`layKeys`): what it owns ranks by this. */
  readonly lay: LayKey;
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
  /** The part of the band across it owns: its current thickness, or an empty edge's thin band at its boundary. */
  readonly owned: Span;
  /** Along it, what it owns, where that is less than its zones (a column line's band about its line); else null. */
  readonly ownedAlong: Span | null;
  /** It draws now; else what it owns is a band of its place (where it lands once filled). */
  readonly drawn: boolean;
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

/** Spans along an edge less other spans along it. */
const less = (spans: readonly Span[], away: readonly Span[]): Span[] =>
  away.reduce<Span[]>((acc, [ra, rb]) => acc.flatMap(([a, b]) => (rb <= a || ra >= b ? [[a, b] as Span] : ([[a, Math.max(a, ra)], [Math.min(b, rb), b]] as Span[]).filter(([u, w]) => w - u > EPS))), [...spans]);

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

/**
 * One edge's tiles, every kind alike: each zone's extent less the item's own interval, split halfway between its slots'
 * lines (projected into it), a slot's tile reaching at most its kind's `reach` from its line. A stretch with no slot is
 * refused (`spec.refuse`), a slot the filter removed is refused over its own tile, and the own interval is home's
 * (across, the edge's band and the own rect), named after the home slot when there is one. Where the item has no rect
 * on the edge, home's tile is its slot's.
 */
function tileEdge(c: Ctx, spec: EdgeSpec, cuts: readonly Span[], lost: string[]): Tile[] {
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
  const tile = (zone: Zone, hit: Rect, more: More): Tile => ({ edge: spec.id, key: spec.key, edgeKind: spec.kind, vertical: v, zone, hit, ...more });
  const refused = (zone: Zone, hit: Rect, reason: SceneRefusal["reason"]): Tile => tile(zone, hit, { kind: "refuse", id: "", order: data.layer, priority: data.priority, keep: null, reason });
  const reserved = spec.reserved;
  // A tile's part across that its edge owns, and the rest, its overreach: clipped after the virtual edges, then joined
  // back where it still meets the owned part whole.
  const split = (t: Tile): Tile[] => {
    const h = t.hit;
    const [h0, h1] = v ? [h.x, h.x + h.width] : [h.y, h.y + h.height];
    const [c0, c1] = [Math.max(h0, spec.owned[0]), Math.min(h1, spec.owned[1])];
    const part = (a: number, b: number): Rect => (v ? rect(a, h.y, b - a, h.height) : rect(h.x, a, h.width, b - a));
    const beyond = less([[h0, h1]], [spec.owned]);
    if (beyond.length === 0) return [t];
    if (c1 - c0 <= EPS) return [{ ...t, order: data.overreach }];
    const core: Tile = { ...t, hit: part(c0, c1), keep: t.keep && keepAt(v ? t.keep.y : t.keep.x, part(c0, c1)) };
    return [core, ...beyond.map(([a, b]): Tile => ({ ...t, kind: "reach", of: core, order: data.overreach, hit: part(a, b), keep: null }))];
  };
  // Slots that are the same move are one slot, the first (the lowest `at`) keeping it: one line and one landing, or
  // both home (both put the item back, wherever their lines lie).
  const landing = (s: Slot): Rect | undefined => s.result.layout.items[c.dragged]?.rect;
  const sameMove = (a: Slot, b: Slot): boolean => {
    if (a.zone !== b.zone) return false;
    if (a.home && b.home) return true;
    const [p, q] = [landing(a), landing(b)];
    return Math.abs(a.line - b.line) < EPS && (!p || !q ? p === q : Math.abs(p.x - q.x) + Math.abs(p.y - q.y) + Math.abs(p.width - q.width) + Math.abs(p.height - q.height) < 0.01);
  };
  const slots = spec.slots.filter((s, i) => !spec.slots.slice(0, i).some((o) => sameMove(o, s)));
  const out: Tile[] = [];
  for (const z of spec.zones) {
    // The zone's extent less its reserved rects and what other edges own: a zone left with nothing has no slot.
    const room = less([[z.a, z.b]], [...cuts, ...reserved]).filter(([a, b]) => b - a > EPS);
    if (room.length === 0) continue;
    // Less the own interval, which home owns: a zone wholly under the item's own place has no room left either.
    const pieces = own ? less(room, [own]) : room;
    // A slot with no room within its kind's reach of its line isn't offered.
    const mine = slots.filter((s) => s.zone === z.zone && !(spec.holds && s.home) && pieces.some(([a, b]) => b > s.line - data.reach + EPS && a < s.line + data.reach - EPS));
    const reason = spec.refuse(z.zone);
    for (const [pa, pb] of pieces) {
      // Lines spread into the zone's extent less its reserved rects when they lie past it: their share of the span
      // the lines and the extent cover, laid along the extent's free pieces end to end.
      const lines = mine.map((s) => s.line);
      const lo = Math.min(z.a, ...lines);
      const hi = Math.max(z.b, ...lines);
      const free = less([[z.a, z.b]], reserved);
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
      // A line left outside the zone's pieces (under what another edge owns) goes to the nearest point of one.
      const proj = (x: number): number => {
        const q = reserved.reduce((r, s) => nearer(r, s), past ? spread(x) : x);
        const p = own ? nearer(q, own) : q;
        if (pieces.some(([a, b]) => p >= a - EPS && p <= b + EPS)) return p;
        return pieces.map(([a, b]) => Math.min(Math.max(p, a), b)).reduce((m, y) => (Math.abs(y - p) < Math.abs(m - p) ? y : m));
      };
      const inPiece = mine.filter((s) => proj(s.line) >= pa - EPS && proj(s.line) <= pb + EPS).sort((a, b) => proj(a.line) - proj(b.line) || a.line - b.line);
      // Where projection lays two different moves on one point (lines under the own place or another edge's), the
      // piece's lines are laid out in their order along it instead, one share each.
      const projected = inPiece.map((s) => proj(s.line));
      const at = projected.some((p, i) => i > 0 && p - projected[i - 1]! <= EPS) ? inPiece.map((_, i) => pa + ((i + 0.5) * (pb - pa)) / inPiece.length) : projected;
      if (inPiece.length === 0) {
        // A stretch of a zone with no slot of its own is refused: home is only over the item's own place, and no stretch
        // is handed to another zone's slot. Beside a lone item (the zone's only slot is home) there is room, but no
        // place other than its own: `own-place`.
        // A stretch out of every slot's reach is no part of this edge.
        const lone = reason === "no-room" && mine.length === 0 && slots.some((s) => s.zone === z.zone && s.home);
        const near = mine.length === 0 || mine.some((s) => pb > s.line - data.reach + EPS && pa < s.line + data.reach - EPS);
        if (reason && near) out.push(...split(refused(z.zone, band(pa, pb), lone ? "own-place" : reason)));
        continue;
      }
      inPiece.forEach((s, i) => {
        // Halfway between neighbouring lines, the piece's ends at its ends (the own interval's ends are one), and no
        // further from its line than the kind's reach.
        const p = at[i]!;
        const a = Math.max(i === 0 ? pa : (at[i - 1]! + p) / 2, p - data.reach);
        const b = Math.min(i === inPiece.length - 1 ? pb : (p + at[i + 1]!) / 2, p + data.reach);
        if (b - a <= EPS) {
          if (s.ok) lost.push(s.id);
          return;
        }
        const line = Math.min(Math.max(p, a), b);
        const hit = band(a, b, s.result.layout);
        if (!s.ok) out.push(...split(refused(z.zone, hit, "no-room")));
        else if (s.home) out.push(...split(tile(z.zone, hit, { kind: "home", id: s.id, order: data.layer, priority: data.priority, keep: keepAt(line, hit), place: { kind: "home" } })));
        else out.push(...split(tile(z.zone, hit, { kind: "slot", id: s.id, order: data.layer, priority: data.priority, keep: keepAt(line, hit), place: s.place, result: s.result, marker: spec.marker(s), slot: s.result.layout.items[c.dragged]!.rect })));
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
function columnLines(c: Ctx, side: "left" | "right"): EdgeSpec[] {
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
    lay: { phase: 2, side, at: l.at },
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
    key: `rail:${side}`,
    kind: "railStop",
    // The rail lies outside every edge on its side: laid first among them.
    lay: { phase: 2, side, at: -1 },
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

function generate(scene: Scene, dragged: string, options: SceneTargetOptions): Generated {
  const item = Object.hasOwn(scene.items, dragged) ? scene.items[dragged] : undefined;
  if (!item || item.fixed || item.closed) return { targets: [], refusals: [], lost: [] };
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
  const c: Ctx = { scene, rest, now, base, dragged, kind: item.kind, reach: Math.max(0, Number.isFinite(options.endReach) ? options.endReach! : 0), settle, isHome: (r) => placeKey(r.scene, dragged) === here, sound, lay: layKeys(scene) };

  // The edges as the tiler reads them: every real edge, then each side's column lines and rail, only for kinds the
  // side's template opens with (its start zone).
  const specs: (EdgeSpec | null)[] = rest.edges.map((edge) => edgeSpec(c, edge));
  for (const side of ["left", "right"] as const) {
    const template = scene.columns?.[side];
    if (!template || !zoneTakes(template, "start", item.kind)) continue;
    specs.push(...columnLines(c, side));
    if (scene.rails?.[side]?.accepts.includes(item.kind)) specs.push(railStops(c, side));
  }
  // Space ownership. A drawn edge owns its current rect, with the item lifted or as it is now (but for the item's own
  // edge as it is now: the item has left it); an empty edge owns a thin band of its place at its boundary; the rail
  // likewise. Owned rects rank in the order `solve` lays edges out: one laid before another and pushing it when filled
  // wins (outer before inner, full bars before the sides they push, the rail before its side); between edges laid
  // independently a drawn rect wins over an empty edge's band, two drawn rects yield to each other, and of two bands
  // the one laid first wins. Home's tile is owned before all. A virtual edge owns nothing and yields to every owner.
  const ownEdge = now.items[dragged]?.edge;
  const live = specs.filter((s): s is EdgeSpec => s !== null);
  const bandOf = (s: EdgeSpec): Rect => {
    const a = Math.min(...s.zones.map((z) => z.a));
    const b = Math.max(...s.zones.map((z) => z.b));
    return s.vertical ? rect(s.owned[0], a, s.owned[1] - s.owned[0], b - a) : rect(a, s.owned[0], b - a, s.owned[1] - s.owned[0]);
  };
  // What it owns: its band, limited along it where it owns less than its zones (a column line's place).
  const ownedRectOf = (s: EdgeSpec): Rect => {
    const b = bandOf(s);
    if (!s.ownedAlong) return b;
    const [a0, a1] = s.ownedAlong;
    return s.vertical ? rect(b.x, a0, b.width, a1 - a0) : rect(a0, b.y, a1 - a0, b.height);
  };
  interface Owner {
    readonly id: string;
    readonly key: string;
    readonly rect: Rect;
    readonly lay: LayKey;
    readonly place: boolean;
  }
  const ownRect = now.items[dragged];
  // Home's tile: the item's own rect, and, along it, its edge's band (the own interval across the band).
  const homeRect = ((): Rect | null => {
    if (!ownRect || ownRect.floating || !ownEdge) return null;
    const o = ownRect.rect;
    const s = live.find((x) => x.id === ownEdge);
    if (!s || ownRect.inMenu) return o;
    const [c0, c1] = s.across();
    return s.vertical ? rect(Math.min(c0, o.x), o.y, Math.max(c1, o.x + o.width) - Math.min(c0, o.x), o.height) : rect(o.x, Math.min(c0, o.y), o.width, Math.max(c1, o.y + o.height) - Math.min(c0, o.y));
  })();
  const owners: Owner[] = [
    // Home first: its tile is its own, for every edge but its own (which tiles it as its own interval).
    ...(homeRect && ownEdge ? [{ id: ownEdge, key: ownEdge, rect: homeRect, lay: { phase: -1, side: "", at: -Infinity }, place: false }] : []),
    // Every edge the tiler reads: what it owns, drawn or a band of its place (a column line's band about its line).
    ...live.map((s) => ({ id: s.id, key: s.key, rect: ownedRectOf(s), lay: s.lay, place: !s.drawn })).filter((o) => area(o.rect) > EPS),
    // Every drawn rect, with the item lifted and as it is now (the item's own edge only lifted): the edges the tiler
    // doesn't read (folded, riding, taking nothing) and the ones that move when the item lifts.
    ...[...Object.entries(base.edges), ...Object.entries(now.edges).filter(([id]) => id !== ownEdge)]
      .filter(([id, e]) => area(e.rect) > EPS && c.lay.has(id))
      .map(([id, e]) => ({ id, key: id, rect: e.rect, lay: c.lay.get(id)!, place: false })),
  ];
  const wins = (o: Owner, s: EdgeSpec): boolean => {
    if (o.key === s.key) return false;
    if (pushes(o.lay, s.lay)) return true;
    if (pushes(s.lay, o.lay)) return false;
    const place = !s.drawn;
    return o.place === place ? !place || o.lay.at < s.lay.at : !o.place;
  };
  // What each edge yields: the owners that win over it; a virtual edge (a column line) also every other owner's rect
  // outside its own band, where its tile is overreach.
  const taken = new Map(
    live.map((s) => [
      s.key,
      [
        ...owners.filter((o) => wins(o, s)).map((o) => o.rect),
        ...(EDGE_KINDS[s.kind].virtual ? owners.filter((o) => o.key !== s.key && !wins(o, s)).flatMap((o) => subtract(o.rect, ownedRectOf(s))) : []),
      ],
    ]),
  );
  // Panel bodies (an open item's), but for `hitBand / 2` at each end: no drop place of their edge, so no part of its
  // zones' room.
  const bodySpans = (id: string): Span[] => {
    const e = rest.edges.find((x) => x.id === id);
    const bandOpt = e?.hitBand ?? DEFAULT_HIT_BAND;
    if (!e || bandOpt === "middle") return [];
    const column = axisOf(e.side) === "column";
    const half = Math.max(0, Number.isFinite(bandOpt) ? bandOpt : DEFAULT_HIT_BAND) / 2;
    return Object.entries(base.items)
      .filter(([iid, p]) => p.edge === id && p.formKind === "open" && iid !== dragged)
      .map(([, p]): Span => (column ? [p.rect.y + half, p.rect.y + p.rect.height - half] : [p.rect.x + half, p.rect.x + p.rect.width - half]))
      .filter(([a, b]) => b - a > EPS);
  };
  // A zone's room: less its panel bodies, and less the stretches where the owners that win over its edge together hold
  // the edge's whole depth (a thinner owner, an empty rail's band over a column, clips its tiles instead).
  const cutsOf = (s: EdgeSpec): Span[] => {
    const b = bandOf(s);
    const along = (r: Rect): Span => (s.vertical ? [r.y, r.y + r.height] : [r.x, r.x + r.width]);
    const across = (r: Rect): Span => (s.vertical ? [r.x, r.x + r.width] : [r.y, r.y + r.height]);
    const rs = taken.get(s.key)!.filter((r) => overlaps(r, b));
    const ends = [...new Set([...along(b), ...rs.flatMap(along)])].filter((x) => x >= along(b)[0] && x <= along(b)[1]).sort((p, q) => p - q);
    const owned: Span[] = [];
    for (let k = 1; k < ends.length; k++) {
      const [u, w] = [ends[k - 1]!, ends[k]!];
      const over = rs.filter((r) => along(r)[0] <= u + EPS && along(r)[1] >= w - EPS).map(across);
      if (w - u > EPS && less([across(b)], over).length === 0) owned.push([u, w]);
    }
    return [...owned, ...bodySpans(s.id)];
  };
  const lost: string[] = [];
  const tiles: Tile[] = live.flatMap((spec) => tileEdge(c, spec, cutsOf(spec), lost));
  // The item's own place is home's even where no edge tiles it (its column, deleted by the lift; its » entry).
  const homeEdge = scene.edges.find((e) => e.id === ownRect?.edge);
  if (ownRect && homeEdge && !ownRect.floating && !tiles.some((t) => t.order === 0))
    tiles.push({ edge: homeEdge.id, key: homeEdge.id, edgeKind: edgeKindOf(scene, homeEdge), vertical: axisOf(homeEdge.side) === "column", zone: zoneOf(item), order: 0, kind: "home", id: `home:${dragged}`, priority: 1, place: { kind: "home" }, hit: ownRect.rect, keep: null });

  // Filter (iii), clipping in precedence order: each tile clear of the ones before it, of the other edges' rects (with
  // the item lifted, and as they are now), of the fixed items that don't grow and of the chrome.
  const grows = (l: SceneLayout, id: string): boolean => {
    const it = l.items[id]!;
    const e = it.edge ? l.edges[it.edge] : undefined;
    return !!e && !!formsOf(scene.items[id]!, axisOf(e.side))[it.form]?.main.grows;
  };
  const solid = [...new Set([now, base])].flatMap((l) => Object.entries(l.items).filter(([id, it]) => it.fixed && !grows(l, id)).map(([, it]) => it.rect));
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
    return [...reserved, ...bodySpans(id).map(([a, b]) => across(a, b))].filter((b) => area(b) > EPS);
  };
  const placed: Tile[] = [];
  // A virtual edge's refused stretches (its refused slots, its slots' clipped-off pieces) come after every other tile:
  // they take only what no tile takes, never a real edge's room.
  const later: Tile[] = [];
  const clip = (r: Rect, cuts: readonly Rect[]): Rect[] => cuts.reduce<Rect[]>((ps, cut) => ps.flatMap((p) => subtract(p, cut)), [r]);
  // Where each owned part landed in `placed` (its overreach joins it there), and the slots whose owned part went whole.
  const landed = new Map<Tile, number[]>();
  const gone = new Set<Tile>();
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
    if (t.kind === "reach") {
      // Overreach: what the virtual edges and every other edge's owned rect leave, joined to its owned part where it
      // meets that part along the part's whole length. The rest is nobody's (the float's).
      const of = t.of!;
      const pieces = clip(t.hit, [...placed.map((p) => p.hit), ...owners.filter((o) => o.key !== t.key).map((o) => o.rect), ...bodies(t.edge), ...solid, ...chrome]);
      const at = landed.get(of) ?? [];
      if (at.length === 0 && gone.has(of)) {
        // Its owned part went whole: the overreach stands in for it, the piece on its line (else its largest).
        const line = t.vertical ? of.keep!.y : of.keep!.x;
        const on = pieces.filter((p) => (t.vertical ? p.y <= line + EPS && line <= p.y + p.height + EPS : p.x <= line + EPS && line <= p.x + p.width + EPS));
        const kept = (on.length > 0 ? on : pieces).reduce<Rect | null>((a, p) => (!a || area(p) > area(a) ? p : a), null);
        if (kept) {
          placed.push({ ...of, hit: kept });
          gone.delete(of);
        }
        continue;
      }
      for (const i of at) {
        const h = placed[i]!.hit;
        const joint = pieces.find((p) =>
          t.vertical
            ? p.y <= h.y + EPS && p.y + p.height >= h.y + h.height - EPS && (Math.abs(p.x - h.x - h.width) < EPS || Math.abs(p.x + p.width - h.x) < EPS)
            : p.x <= h.x + EPS && p.x + p.width >= h.x + h.width - EPS && (Math.abs(p.y - h.y - h.height) < EPS || Math.abs(p.y + p.height - h.y) < EPS),
        );
        if (!joint) continue;
        const merged = t.vertical
          ? rect(Math.min(h.x, joint.x), h.y, Math.max(h.x + h.width, joint.x + joint.width) - Math.min(h.x, joint.x), h.height)
          : rect(h.x, Math.min(h.y, joint.y), h.width, Math.max(h.y + h.height, joint.y + joint.height) - Math.min(h.y, joint.y));
        placed[i] = { ...placed[i]!, hit: merged };
        break;
      }
      continue;
    }
    // An owned part: clear of the tiles before it, of the owners that win over its edge, its panel bodies, solid items
    // and chrome. A virtual edge's tile: clear of the tiles before it and of every owner.
    const cuts = [...placed.map((p) => p.hit), ...(taken.get(t.key) ?? []), ...(data.virtual ? [] : bodies(t.edge)), ...solid, ...chrome];
    const pieces = clip(t.hit, cuts);
    if (pieces.length === 0) {
      if (t.kind !== "refuse") gone.add(t);
      continue;
    }
    if (t.kind === "refuse") {
      landed.set(t, pieces.map((_, k) => placed.length + k));
      for (const p of pieces) placed.push({ ...t, hit: p });
      continue;
    }
    // A slot keeps the piece that holds its line (else its largest); its other pieces are refused for its zone, a virtual
    // edge's as a real one's, so clipping never leaves a hole the float fills.
    const held = t.keep ? pieces.filter((p) => contains(p, t.keep!)) : [];
    const kept = (held.length > 0 ? held : pieces).reduce((a, p) => (area(p) > area(a) ? p : a));
    // No sliver: a slot left under 1 px along its edge is no target (its piece is refused).
    const sliver = (t.vertical ? kept.height : kept.width) < 1;
    if (!sliver) {
      landed.set(t, [placed.length]);
      placed.push({ ...t, hit: kept });
    }
    for (const p of pieces) if (sliver || p !== kept) (data.virtual ? later : placed).push({ ...t, kind: "refuse", reason: "no-room", hit: p, keep: null });
  }
  for (const t of gone) lost.push(t.id);
  for (const t of later) for (const p of clip(t.hit, [...placed.map((q) => q.hit), ...solid, ...chrome])) placed.push({ ...t, hit: p });

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
  return { targets, refusals: refused, lost };
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

/**
 * `lostSlots(scene, dragged, options?)`: the ids of slots the filter kept, with room in their zone, that clipping left
 * with no hit. None: the property check holds it at zero.
 */
export function lostSlots(scene: Scene, dragged: string, options: SceneTargetOptions = {}): string[] {
  return generate(scene, dragged, options).lost;
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
