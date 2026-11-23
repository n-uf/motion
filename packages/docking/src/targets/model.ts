/**
 * The targets' shapes: the public ones (`DockDrop`, `DockRefusal`, `DropPlace`, …) and the tiler's own (an edge
 * as the tiler reads it, its slots and tiles, the context every generator shares).
 */
import { EPS, type Point, type Rect, type Size } from "@n-uf/placement";
import type { Target } from "@n-uf/placement";
import type { ColumnPlace, RailPlace } from "../changes";
import type { DockEdge, Orient, DockState, DockLayout, Side, SolveOptions, Zone } from "../model";
import type { LayKey } from "../solve";
import type { EdgeKind } from "./kinds";

export type DropPlace =
  | { readonly kind: "gap"; readonly edge: string; readonly zone: Zone; readonly at: number }
  | ColumnPlace
  | RailPlace
  | { readonly kind: "side"; readonly edge: string; readonly side: Side }
  | { readonly kind: "float" }
  | { readonly kind: "home" }
  | { readonly kind: "none" };

export interface DropResult {
  readonly state: DockState;
  readonly layout: DockLayout;
}

export interface DockDrop extends Target {
  /** The item dragged. */
  readonly item: string;
  /**
   * Spring-loaded (a rail drop strip's targets): no target until the pointer dwells in it. Read only by
   * `@n-uf/motion/drag`'s drag intent (`DragTarget.arm`); the landing model and `dockDrag` don't read it.
   */
  readonly arm?: "dwell";
  /** With `arm`, its zone once armed (the strip grown by its magnet). */
  readonly armedHit?: Rect;
  /**
   * Its room opens as it shows: set on a target whose slot overlaps an item its drop moves (a rail pushing a column, a
   * new-column line, a bar's strip over the columns), and on a rail drop strip's targets, whose room opens once armed.
   * The drag intent then shows it and makes its room in one frame. Until it shows, a release still lands on it. Read
   * only by the drag intent (`DragTarget.opensRoom`).
   */
  readonly opensRoom?: true;
  /**
   * With `opensRoom`, how long it holds before it shows with its room, ms, in place of the drag intent's `roomAfter`: set
   * to `EDGE_ROOM_HOLD` on a rail target or a new-column line against the window's left or right edge.
   */
  readonly roomHold?: number;
  /**
   * With `opensRoom`, the zone it holds once its room is open: while the target shows with its room open, a drag intent
   * holds it wherever the pointer is in this rect. Set to the smallest rect holding `hit` and the slot (the landing
   * rect) on every target whose drop changes an edge's thickness (a side's width or a bar's height): strips,
   * new-column lines, rails and gaps. A rail drop strip (`armedHit`) doesn't carry it.
   */
  readonly roomHit?: Rect;
  /**
   * Where a release here puts the item. A host tells a home (nothing committed) by `place.kind === "home"`, never by the
   * id: a home keeps the id of the first of its edge's places that puts the item back (`gap:<edge>:<zone>:<at>` on a
   * real edge, `rail:<side>:<ring>` on its rail), and `home:<id>` alone covers the item's own rect.
   */
  readonly place: DropPlace;
  /** Gaps and strips: the line where the item's leading edge lands, zero thick, across the edge after the drop. */
  readonly marker?: Rect;
  /** A rail target under a kind's `DockState.railDrop` policy: the side's whole drop strip, for the host to draw. */
  readonly strip?: Rect;
  /** The state a release here commits and its layout. Only a float's depends on the pointer. */
  after(point: Point, grab?: Point): DropResult;
}

export interface DockDropOptions {
  /** The layout before the drag: every `after` is solved with it, as the drop will be. */
  readonly previous?: DockLayout;
  /** How far the first and last gaps of an edge reach past its ends, px (default 0). */
  readonly endReach?: number;
  /** The float's size for the float target. */
  readonly floatSize?: Size;
  /**
   * The float target starts from the held item's rect (`heldRect`), kept inside the float region, before it is fitted, so
   * a host that draws the held item there sees what lands. Default: from the pointer's rect, wherever that lies.
   */
  readonly floatFromHeld?: boolean;
  /** The float's orient for the float target (default: its float's, else the item's `floatOrientOf`). */
  readonly floatOrient?: Orient;
  /** As `solve`'s: edge or item ids solved without `previous`, in every `after` too. */
  readonly fresh?: readonly string[];
  /**
   * Where the pointer holds the item, from its top left corner as it is now, px (what a target's `after(point, grab)`
   * takes): the press's, constant for the drag. On a bar or a toolbar rail, where the landings either side of a neighbor
   * overlap, the tiles are cut there by it, as `lanes()` cuts its spots (`aimCut`); default the item's middle.
   */
  readonly grab?: Point;
  /**
   * The pitch of a bar's free-stretch spots, px (default `SPOT_PITCH`), as `DockLaneOptions.pitch`: half of it is how far
   * past the overlap of two overlapping landings their cut may lie (`aimCut`), for the tiles and the lanes alike.
   */
  readonly pitch?: number;
}

/** Where a drop of the dragged item is refused: a host draws nothing there and may say "Can't go here" at the pointer. */
export interface DockRefusal {
  /**
   * `refuse:<edge>:<zone>`, with `:<n>` after it for a zone's second refused tile and on, numbered by where they lie
   * along the edge (then across it), so an id is stable from one frame to the next.
   */
  readonly id: string;
  readonly edge: string;
  readonly zone: Zone;
  /**
   * Where the pointer means it, never over a target's hit and never past the stage. An edge that takes the kind in no
   * zone gives one refusal (`n = 0`, zone `start`): its drawn rect, fixed items included, less what targets own. A
   * refused zone of an edge that takes the kind elsewhere: the refused slot's tile, inside the edge's ends.
   */
  readonly hit: Rect;
  /**
   * A wholly refused edge left in pieces by what targets own (a target in the middle of a bar): every piece, each at
   * least 1 px each way, `hit` the largest. Absent when the refusal is one rect. The pointer is in the refusal when it is
   * in any piece.
   */
  readonly hits?: readonly Rect[];
  /**
   * `no-room`: the zone takes the kind, but the drop there doesn't fit along the edge (a title bar at the title's
   * natural width, say): no length would be enough. `too-thick`: the zone takes the kind, but no form of the item
   * (the » menu aside) fits across the edge: each sets no cross size and has a `cross.min` over the edge's thickness
   * (a 30 px toolbar on a 28 px bar), so no length would help. `own-place`: the stretch beside an item alone in its
   * zone: there is room, but the zone's only place is the item's own (a release there puts it back). `not-accepted`:
   * the edge or zone doesn't take the kind.
   */
  readonly reason: "no-room" | "too-thick" | "own-place" | "not-accepted";
  /**
   * The stage: the refusal holds only points strictly inside it (`Target.bounds`), so a pointer a host clamps exactly
   * onto the window's edge is never in it. Set by `refusals()`; `refusalTargets` passes it on.
   */
  readonly bounds?: Rect;
}

/** One tile before clipping: a slot's, home's, or a refused slot's. */
export interface Tile {
  readonly edge: string;
  /** The edge it tiles, or null for home's own rect where no edge tiles it (its » entry). */
  readonly spec: EdgeSpec | null;
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
  readonly place?: DropPlace;
  readonly result?: DropResult;
  readonly reason?: DockRefusal["reason"];
  /**
   * The one refusal of an edge that takes the kind in no zone: its drawn rect in the stage, fixed items included. Only
   * what targets own is cut from it.
   */
  readonly whole?: boolean;
  readonly hit: Rect;
  /** A slot's tile left in pieces by clipping: every piece (`hit` the largest). */
  readonly hits?: readonly Rect[];
  /** The point the tile must keep through clipping (on its slot's line), or null for a refusal (its largest part). */
  readonly keep: Point | null;
  readonly marker?: Rect;
  readonly slot?: Rect;
}

/** What one drag can do: its targets and its refusals, from one generation. */
export interface Generated {
  readonly targets: DockDrop[];
  readonly refusals: DockRefusal[];
  /**
   * Slots the filter kept, with room in their zone, that end with no hit. Expected on a bar or a toolbar rail, where the
   * pointer takes the nearest landing: a gap whose landing is never the nearest has no hit, and is a place all the same
   * (`places`, so `stops` lists it). Elsewhere none, by the property check.
   */
  readonly lost: string[];
  /** The lost gaps' drops: places the item lands that no pointer reaches, which `stops` lists all the same. */
  readonly places?: DockDrop[];
  /** Each docked target's zone by id: its tiles with its edge tiled on its own (what it may grow to its minimum in). */
  readonly zones?: ReadonlyMap<string, readonly Rect[]>;
  /** The sliding ranges the tiles cut places over free room from, per edge (`../slide`): for the property check. */
  readonly slides?: readonly (TileRange & { readonly edge: string })[];
}

/**
 * A place's sliding range as the tiles read it (`slideRange`): its neighbors (none at the edge's ends), its first and
 * last landing starts, the item at either and the item's length.
 */
export interface TileRange {
  readonly before: string | undefined;
  readonly after: string | undefined;
  readonly from: number;
  readonly to: number;
  readonly w: number;
  readonly first: Rect;
  readonly last: Rect;
}

/** The context every edge's generator shares. */
export interface Ctx {
  readonly state: DockState;
  /** Edges kept out of `state` (its hidden ones): a drop's new column never repeats their ids (`moveAmong`). */
  readonly others: readonly DockEdge[];
  /** The state with the item lifted: what a place counts in (a gap's `at`, a column's or rail's `ring`). */
  readonly rest: DockState;
  /** The seen geometry: the committed layout, the item in place. Every tile lies in it. */
  readonly now: DockLayout;
  /**
   * The seen geometry with every movable grower on a bar at its natural length (`withoutBarGrowth`), solved once per
   * drag: what a bar's zone extents, slot lines and cards read, so a grower's growth, and what it pushes along, is spare
   * room. `now` itself where nothing grows so.
   */
  readonly room: DockLayout;
  /** The solve options every layout of the drag is solved under (`previous`, `fresh`). */
  readonly prev: SolveOptions;
  /** The layout with the item lifted: read only by the landing rules (fit, a title's natural width, fixed items). */
  readonly base: DockLayout;
  readonly dragged: string;
  readonly kind: string;
  readonly reach: number;
  readonly settle: (s: DockState) => DropResult;
  readonly isHome: (r: DropResult) => boolean;
  /** Whether a drop's layout fits the window (filter ii): what every edge checks; its own landing rule comes on top. */
  readonly sound: (after: DockLayout) => boolean;
  /** Where `solve` lays each edge of the state out. */
  readonly lay: ReadonlyMap<string, LayKey>;
  /** Where the pointer holds the item, as a share of its width and height (`grabShare` of `options.grab`). */
  readonly share: { readonly x: number; readonly y: number };
  /** How far past two overlapping landings' overlap their cut may lie, px: half the pitch (`aimSlack`). */
  readonly slack: number;
  /**
   * The sliding ranges the tiles have read in this generation, by edge and order (`<edge> <order>`): each edge is tiled
   * twice (on its own, then with ownership), and both read one range. Made with the context, so nothing carries over
   * to another call.
   */
  readonly slideRanges: Map<string, TileRange | null>;
}

/** A slot: an insertion line along an edge and the drop it makes. */
export interface Slot {
  readonly zone: Zone;
  /** Its line along the edge. */
  readonly line: number;
  readonly id: string;
  readonly place: Extract<DropPlace, { kind: "gap" }> | ColumnPlace | RailPlace;
  readonly result: DropResult;
  /** A drop here puts the item back where it is. */
  readonly home: boolean;
  /** It passes the filter: home, or the item lands where the slot aims and the window fits. */
  readonly ok: boolean;
  /**
   * A real edge's slot: its place in the order of the edge's shown items, the item taken out (how many of them, across
   * every zone, lie before it). Slots of one order are the same aim, whatever their zone.
   */
  readonly order?: number;
}

/** `[a, b]` along an edge. */
export type Span = readonly [number, number];

/**
 * What an edge's zones lose along it: `cuts`, what other edges own across its whole depth (no room); `bodies`, its
 * panel bodies (no drop place, but the tiles run across them and clipping takes them out).
 */
export interface Room {
  readonly cuts: readonly Span[];
  readonly bodies: readonly Span[];
}

/** Spans along an edge less other spans along it. */
export const less = (spans: readonly Span[], away: readonly Span[]): Span[] =>
  away.reduce<Span[]>((acc, [ra, rb]) => acc.flatMap(([a, b]) => (rb <= a || ra >= b ? [[a, b] as Span] : ([[a, Math.max(a, ra)], [Math.min(b, rb), b]] as Span[]).filter(([u, w]) => w - u > EPS))), [...spans]);

/**
 * One edge as the tiler reads it, a real edge or a virtual one alike: its kind (`EDGE_KINDS`), its axis, its zones'
 * extents along it, its slots, the item's own rect on it (its interval along the edge is home's tile), the spans no
 * tile takes, its band across and its markers.
 */
export interface EdgeSpec {
  /** The edge id its targets and refusals name (a side's column lines share one, one spec per line). */
  readonly id: string;
  /** The state's edge, or null for a virtual edge. */
  readonly edge: DockEdge | null;
  readonly kind: EdgeKind;
  /** Where `solve` lays it out (`layKeys`): what it owns ranks by this. */
  readonly lay: LayKey;
  /** It runs along y (side edges, the rail), not x (bars, the column lines). */
  readonly vertical: boolean;
  readonly zones: readonly { readonly zone: Zone; readonly a: number; readonly b: number }[];
  readonly slots: readonly Slot[];
  /** Why a stretch of `zone` with no slot is refused, or null where it is no drop place at all. */
  readonly refuse: (zone: Zone) => DockRefusal["reason"] | null;
  /** The item's own rect on this edge, or null. */
  readonly own: Rect | null;
  /** The item lies on this edge now (drawn, or in its » menu): its home slot gets no tile, home is only its own rect. */
  readonly holds: boolean;
  readonly reserved: readonly Span[];
  /**
   * The seen spans of the edge's shown items other than the dragged one (fixed items aside), the items a pointer aims
   * at: tiles split at their midpoints, their leading half before them, their trailing half after them.
   */
  readonly cards: readonly Span[];
  /** The priority of its home tiles where it is not its kind's (the held tile's column in a rail: its home is the rail stop's). */
  readonly homePriority?: 1 | 2;
  /** The band across, `[from, to]`, as deep as the edge is seen or after `after`. */
  readonly across: (after?: DockLayout) => Span;
  /** The part of the band across it owns: its seen thickness, or an undrawn edge's thin band at its boundary. */
  readonly owned: Span;
  /** Along it, what it owns, where that is less than its zones (a column line's band about its line); else null. */
  readonly ownedAlong: Span | null;
  /** It is drawn in the seen geometry; else what it owns is a band of its place (where it lands once filled). */
  readonly drawn: boolean;
  /**
   * An empty rail or bar, which owns the depth a drop draws it at (`owned`): the thin band at its boundary within that.
   * Past the thin band it never takes the zones of a drawn edge that take the item (a drawn rail beside an empty bar,
   * a column's first gap under it, keep their places).
   */
  readonly thinOwned?: Span;
  /** A slot's marker: the zero-thick line where the item's leading edge lands. */
  readonly marker: (s: Slot) => Rect;
}
