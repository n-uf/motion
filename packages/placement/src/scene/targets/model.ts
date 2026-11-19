/**
 * The targets' shapes: the public ones (`SceneTarget`, `SceneRefusal`, `ScenePlace`, …) and the tiler's own (an edge
 * as the tiler reads it, its slots and tiles, the context every generator shares).
 */
import { EPS, type Point, type Rect, type Size } from "../../geometry";
import type { Target } from "../../target";
import type { ColumnPlace, RailPlace } from "../changes";
import type { Edge, Orient, Scene, SceneLayout, Side, Zone } from "../model";
import type { LayKey } from "../solve";
import type { EdgeKind } from "./kinds";

export type ScenePlace =
  | { readonly kind: "gap"; readonly edge: string; readonly zone: Zone; readonly at: number }
  | ColumnPlace
  | RailPlace
  | { readonly kind: "side"; readonly edge: string; readonly side: Side }
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
  /** A rail target under a kind's `Scene.railDrop` policy: the side's whole drop strip, for the host to draw. */
  readonly strip?: Rect;
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

/** Where a drop of the dragged item is refused: a host draws nothing there and may say "Can't go here" at the pointer. */
export interface SceneRefusal {
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
   * `no-room`: the zone takes the kind, but the drop there doesn't fit (a title bar at the title's natural width, say).
   * `own-place`: the stretch beside an item alone in its zone: there is room, but the zone's only place is the item's
   * own (a release there puts it back). `not-accepted`: the edge or zone doesn't take the kind.
   */
  readonly reason: "no-room" | "own-place" | "not-accepted";
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
  readonly place?: ScenePlace;
  readonly result?: SceneAfter;
  readonly reason?: SceneRefusal["reason"];
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
  readonly targets: SceneTarget[];
  readonly refusals: SceneRefusal[];
  /** Slots the filter kept, with room in their zone, that end with no hit (none, by the property check). */
  readonly lost: string[];
  /** Each docked target's zone by id: its tiles with its edge tiled on its own (what it may grow to its minimum in). */
  readonly zones?: ReadonlyMap<string, readonly Rect[]>;
}

/** The context every edge's generator shares. */
export interface Ctx {
  readonly scene: Scene;
  /** Edges kept out of `scene` (its hidden ones): a drop's new column never repeats their ids (`moveAmong`). */
  readonly others: readonly Edge[];
  /** The scene with the item lifted: what a place counts in (a gap's `at`, a column's or rail's `ring`). */
  readonly rest: Scene;
  /** The seen geometry: the committed layout, the item in place. Every tile lies in it. */
  readonly now: SceneLayout;
  /** The layout with the item lifted: read only by the landing rules (fit, a title's natural width, fixed items). */
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
export interface Slot {
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
  /** The scene's edge, or null for a virtual edge. */
  readonly edge: Edge | null;
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
  /**
   * The seen spans of the edge's shown items other than the dragged one (fixed items aside), the items a pointer aims
   * at: tiles split at their midpoints, their leading half before them, their trailing half after them.
   */
  readonly cards: readonly Span[];
  /** The band across, `[from, to]`, as deep as the edge is seen or after `after`. */
  readonly across: (after?: SceneLayout) => Span;
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
