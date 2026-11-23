/**
 * Lanes: the geometry of a docking drag for a landing model (`@n-uf/motion/drag`'s `createLandingModel`).
 *
 * A lane is one edge that takes the held item (a bar, a rail, a column) or a virtual one (a new column's line, a
 * declared rail). Its spots are the places a drop there lands, in order along it: before, between and after its items,
 * and, on a bar or a toolbar rail, one sliding spot per free stretch between items, which lands exactly where the hand
 * holds it (`DockSpot.slide`; `stretchPositions: "free"`, the default); with `stretchPositions: "pitched"`, spots at a
 * fixed pitch over those stretches instead (`SPOT_PITCH`), so a toolbar lands close to the hand. Each spot keys where its drop draws the other items (a change between two spots
 * with the same key moves only the held item), and each lane carries its place guides' marks in the layout as drawn.
 * Each spot has a stretch of the lane that picks it. In a panel column, between two spots that share a neighbor (the
 * item `Y` in `X|Y` and `Y|Z`), the boundary is that item's middle as drawn (with a spot held, in that spot's own layout:
 * `dockDrag`'s `spotsOf`, so a column takes a panel by halves of what is seen). On a bar or a toolbar rail, and between any two
 * other spots, it is halfway across the gap between their landings, each in its own layout, so the pointer is at the
 * landing it picks and a toolbar moved along an occupied lane stays at the hand. On a bar or a toolbar rail, two landings
 * that overlap (spots a pitch apart, the pointer inside both) are cut where the item is held (`options.grab`, read in each
 * landing's own form): halfway between the points the pointer would hold in each, so a pointer back at its press point picks the item's own place
 * however far from its middle it was pressed; landings apart are cut halfway across their gap whatever the grab. Cuts are
 * kept inside the lane and in order. The spots come from the same generation and filter as `targets()`, so a spot's
 * landing is exactly what its drop commits. Spot ids are keyed by the lane, zone and neighboring items, so they survive
 * the window resizing and most items opening or moving; virtual lanes are keyed by the column they lie beside, not
 * their ring. Remembered per state and options. The one layout of each held place of the drag (a held frame and its commit)
 * is `dockDrag`'s (./drag), built on these.
 */
import { EPS, area, clamp, rect, subtract, type Axis, type Point, type Rect, type Size } from "@n-uf/placement";
import { liftItem, type DockPlace } from "./changes";
import { SNAP_DISTANCE, SPOT_PITCH, aimCut, aimSlack, crossFreeCuts, cutsByHalves, len, lo, zoneIn } from "./aim";
import { aimOnce, grabKey, grabOf, grabResolver, liftOf, sizeOf, type DockGrab, type Grab } from "./grab";
import { givesWay, landsAt, neighbors, onEdge, slideRange, slideRoom, type SlideEdge, type SlideRoom } from "./slide";
import { axisOf, keepClearFor, floatRegion } from "./helpers";
import type { DockState, DockLayout, DockItemLayout, Zone } from "./model";
import { solve } from "./solve";
import { parseTargetId, targetsAndRefusals } from "./targets";
import { landedLayout } from "./targets/edges";
import type { DropResult, DockRefusal, DockDrop, DockDropOptions } from "./targets/model";

export { SPOT_PITCH };
/** The grain of a sliding spot's free start, px: whole pixels (`LaneSlide.step`). */
const STEP = 1;

/**
 * A sliding spot's range (`DockLaneOptions.stretchPositions: "free"`): where the landing's start may lie along the lane,
 * from flush against the neighbor before the stretch to flush against the one after it, and the starts it snaps to.
 */
export interface LaneSlide {
  readonly from: number;
  readonly to: number;
  /**
   * Its two ends, the item's own place where it lies here, and every other dock that lands inside, in order. Each is a
   * start that commits what lies there (a taken-over dock as it is), so none is dropped for lying near another, except
   * within twice the snap distance of the item's own place, where home wins.
   */
  readonly snaps: readonly number[];
  /** How near a snap point the landing's start snaps to it, px (`DockLaneOptions.snapDistance`). */
  readonly snapDistance: number;
  /**
   * The grain of a start that snaps to nothing, px: a multiple of `step` (whole px, 1) within `[from, to]`. The one rule
   * `target.after`, a landing model's frame and its release all read, so the frame shows what the drop commits:
   * with `c = clamp(raw, from, to)`, the start is the nearest snap point within `snapDistance` of `c`, else
   * `clamp(round(c / step) * step, from, to)`.
   */
  readonly step: number;
}

/** One place a drop in a lane lands. */
export interface DockSpot {
  /**
   * Stable across solves: `<lane>/<zone>/<item before or ^>|<item after or $>`; an empty edge's `<lane>/<zone>`; a
   * pitched spot `…@<pitches from its neighbor>`; a sliding spot `<lane>/<zone>/<before>|<after>@slide`, named by the
   * stretch; a virtual lane's `<lane>/line` or `<lane>/end`.
   */
  readonly id: string;
  /** Its stretch of the lane, along the lane's axis, inside the lane's range. */
  readonly along: readonly [number, number];
  /** Where the item lands (its rect after the drop). */
  readonly landing: Rect;
  /** The drop: its place and `after()` (the layout after it, the room). */
  readonly target: DockDrop;
  /**
   * The item's own place (a release there changes nothing). A spot's `target.place` is the dock at the spot's listed
   * landing (on the item's own sliding spot its own zone, index and `space`); a sliding spot commits through
   * `target.after(point, grab)`, and the landing release's `home` and `at` say where, never the place kind.
   */
  readonly home?: true;
  /** A spot at a pitch over a free stretch (`DockItem.space`). */
  readonly pitched?: true;
  /**
   * A free stretch as one sliding spot (`stretchPositions: "free"`): its drop lands where the pointer holds it, the
   * landing's start at the pointer less the grab along the lane (the grab in the form the item takes in the stretch;
   * where the landing there lies in another form, aimed once more with the grab in that form, never again), clamped to
   * `[from, to]` and snapped within `snapDistance`, and `target.after(point, grab)` commits that (a dock keeping the
   * `space` that puts it there). Its `landing` is the one at
   * the stretch's point nearest the item's own place (that place where it lies here), else at its start.
   */
  readonly slide?: LaneSlide;
  /**
   * Where its drop draws every item other than the held one, as a key: a change between two spots with the same key
   * moves only the held item; between two with different keys it reflows the window.
   */
  readonly others: string;
}

/** A stretch of a lane that takes no drop of the item, at least the item's length (a shorter one joins its spots). */
export interface LaneRefusal {
  readonly along: readonly [number, number];
  readonly reason: DockRefusal["reason"];
}

/**
 * A place guide's mark, in the lane's layout as drawn: a `line` across the lane between two items that touch (no room
 * between them but the edge's own gap; as thick as their gap allows, up to 2 px, so zero where they meet and the host
 * strokes it), a `box` over free room the item lands in, and a `hatch` over the part of a neighbor that gives way.
 * Where the free room is shorter than the item (a lane's end, a gap between items wider than the edge's gap), the spot
 * there is drawn as it lands: a box over the free room and a hatch over the rest of its landing (the edge of the
 * neighbor that will move), the two together the landing; with no free room at a lane's end, the hatch alone. A box
 * over another edge's docked items (an empty side rail over a column's outer strip) is a hatch there too: they move
 * aside when the lane opens. Never a box or a line over an item drawn there, nor anything over the held one; nothing in
 * a refused stretch; no two edge lanes' marks overlap (at a corner a lane not drawn gives way to a drawn one, and
 * between two not drawn the bar owns it; a virtual lane, a new column's line or a declared rail, is drawn over what it
 * would push). Marks lie in one layout: as seen the lifted item is drawn nowhere, so its own place is free room in its
 * lane; in a held place's layout (`after(held)`) every lane's marks lie in that layout, the held item where it draws it.
 */
export interface DockMark {
  /**
   * Stable while the items either side stay: `<lane>/line/<before>|<after>`, `<lane>/box/<before>|<after>` (`#<n>` for a
   * stretch's later pieces; `:before` or `:after` for the room beside the held item), `<lane>/hatch/<before>|<after>`
   * (`~2` for the second side), `^` and `$` at the lane's ends; a virtual lane's `<lane>/box/<spot id>`. Key a drawing by
   * it.
   */
  readonly id: string;
  readonly kind: "line" | "box" | "hatch";
  readonly rect: Rect;
  /**
   * A box's striped end (`hatch`, `HATCH_END`): the neighbor at that end that gives way when the item lands in the room
   * (it moves away, leaves the lane, or steps down to a shorter form). Data for a host and tests; nothing to show.
   */
  readonly givesWay?: string;
}

export interface DockLane {
  /** The edge's id, or a virtual lane's: `column:<side>:<the column it lies outside, or $>`, `rail:<side>`. */
  readonly id: string;
  readonly rect: Rect;
  /** The axis its spots run along. */
  readonly axis: Axis;
  readonly spots: readonly DockSpot[];
  readonly refused: readonly LaneRefusal[];
  /**
   * Its place guides' marks as seen: in the window as seen, the held item drawn nowhere (its own place is free room).
   * A held frame's marks, and the guides of a frame, are `dockDrag(...).after(held)` and `guides(frame)`'s (./drag).
   */
  readonly marks: readonly DockMark[];
  /**
   * Its rect is its own: a rail drop strip at the window's side (`DockState.railDrop`), which every other target of the drag
   * gives up. A landing model gives it the pointer inside it over any lane it overlaps (a flush column's edge).
   */
  readonly owns?: true;
}

/** Everything a landing model reads for one drag. */
export interface DockRegions {
  readonly lanes: readonly DockLane[];
  /** Refused places outside every lane ("Can't go here"). */
  readonly refused: readonly Rect[];
  /**
   * Where a float can land (`floatRegion`: the stage less the float insets), as a landing model's `content`: the open
   * space is it less `blocked`. So the gutter between a column and the pages is open (a release there floats), while
   * every drawn edge, docked item, chrome and drawn rail stays out of it.
   */
  readonly content: Rect;
  /** What the open space excludes: drawn edges, docked items, the chrome, a drawn declared rail, `DockState.blocked`. */
  readonly blocked: readonly Rect[];
  readonly stage: Rect;
  /** Where a float of the item may lie: the stage less the inset at its left and right (`heldRect`'s region). */
  readonly floatRegion: Rect;
  /** The held item's size as it is now. */
  readonly item: Size;
  /** The float target (its `after(point, grab)` is the float landing), or null where the item doesn't float. */
  readonly float: DockDrop | null;
  /** The drag's refusals, from the same generation as the spots (what `refusals()` gives), for a host that shows them. */
  readonly refusals: readonly DockRefusal[];
}

export interface DockLaneOptions extends DockDropOptions {
  /**
   * The pitch of a bar's free-stretch spots, px (default `SPOT_PITCH`). 0 or less turns pitched spots off. Under `"free"` it only sets the sampling step that checks a
   * stretch's range (every `pitch` px; `SPOT_PITCH` when 0 or less), never a spot of its own.
   */
  readonly pitch?: number;
  /**
   * How a free stretch on a bar or a toolbar rail offers its range of landings, from flush against the neighbor before
   * it to flush against the one after it: `"free"` (the default), one sliding spot (`DockSpot.slide`) that lands where
   * the pointer holds the item, snapped to its ends and the item's own place within `snapDistance`; `"pitched"`, a
   * spot every `pitch` px, its ends included. Either way a step comes only where the order changes (passing a
   * neighbor), cut as between any two spots.
   */
  readonly stretchPositions?: "free" | "pitched";
  /** Under `"free"`, how near a snap point a landing snaps to it, px (default 8). */
  readonly snapDistance?: number;
  /**
   * Where the pointer holds the item (what a target's `after(point, grab)` takes), constant for the drag (each grab is
   * remembered as its own options: a function by its identity, so a host keeps one closure per drag). Either a point,
   * px from its top left corner as it is now (the press's), or a function of the form the item is laid in and its size
   * there giving that point in the laid rect's own coordinates (`DockGrab`): at the item's own form and size it gives
   * the press point; `undefined` for a form leaves it to the library's twin of the press. A point is that twin: in a
   * float the press in px; on a bar or a rail, along the item's own length (its longer side as it is now) the press's
   * share, across it the middle.
   *
   * On a bar or a toolbar rail the cut between two overlapping landings lies halfway between the points the pointer
   * would hold in each (the grab in each landing's own form), kept within half a pitch of their overlap, so a pointer
   * back at its press point picks the item's own place; landings with a gap between them (either side of a long
   * neighbor) are cut halfway across it whatever the grab, so the pointer is at the landing it picks. Panel
   * columns take a panel by halves of what is drawn either way. Where another lane's band overlaps the press point (an
   * empty bar's band over a rail's end) that lane can still take the pointer first.
   */
  readonly grab?: DockGrab;
  /**
   * How an empty lane's marks draw it (an empty bar or side rail, or a virtual lane, its room not open): `"real"` (the
   * default), boxes at the size it will take, lying over what moves aside (the page, a column); `"edge"`, each a thin
   * striped strip (`HATCH_EDGE`) on its window side. Where it lands is the same either way.
   */
  readonly emptyLanes?: EmptyLanes;
}

/**
 * How a place guide draws an empty lane (an empty bar or side rail, its room not open yet): `"real"`, a box at the size
 * the lane will take, over what moves aside; `"edge"`, a thin striped strip on the lane's window side. The landing is
 * the same either way ({@link DockLaneOptions.emptyLanes}).
 */
export type EmptyLanes = "real" | "edge";

const mid = (r: Rect, axis: Axis): number => lo(r, axis) + len(r, axis) / 2;
const hull = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return rect(x, y, Math.max(a.x + a.width, b.x + b.width) - x, Math.max(a.y + a.height, b.y + b.height) - y);
};
const nonNeg = (v: number | undefined): number => (Number.isFinite(v) && v! > 0 ? v! : 0);
const sameRect = (a: Rect, b: Rect): boolean => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height)) < 0.5;
const ORIGIN = { x: 0, y: 0 };

/**
 * The layout as seen with the held item lifted (its room given back to its stretch, `lift`): what the window showed
 * before this drop, the one layout stretches and `givesWay` compare a drop with.
 */
function liftedLayout(state: DockState, dragged: string, options: DockLaneOptions): DockLayout {
  return solve(liftItem(state, dragged), options.previous ? { previous: options.previous } : {});
}

/** A spot of a lane before its stretch is known. */
interface Raw {
  readonly lane: string;
  readonly edge: string | null;
  readonly axis: Axis;
  readonly id: string;
  readonly before: string;
  readonly next: string;
  readonly landing: Rect;
  readonly layout: DockLayout;
  readonly target: DockDrop;
  readonly hit: Rect;
  readonly home?: true;
  readonly pitched?: true;
  /** A sliding spot's range, with its landings at either end (what the cuts beside it read). */
  readonly slide?: LaneSlide & { readonly first: Rect; readonly last: Rect };
  /** A rail drop strip's spot (`DockState.railDrop`): its lane is the strip at the window's side, nothing more. */
  readonly strip?: true;
}

/** Where `layout` draws every item other than `dragged`, as a key (rects to the px; an item in a menu as `m`). */
function othersKey(layout: DockLayout, dragged: string): string {
  return Object.keys(layout.items)
    .filter((id) => id !== dragged)
    .sort()
    .map((id) => {
      const it = layout.items[id]!;
      return it.inMenu ? `${id}:m` : `${id}:${Math.round(it.rect.x)},${Math.round(it.rect.y)},${Math.round(it.rect.width)},${Math.round(it.rect.height)}`;
    })
    .join(";");
}

/** What one state, item and options give, before any spot is held (internal to the package). */
export interface Base {
  readonly raws: ReadonlyMap<string, readonly Raw[]>;
  readonly lanes: readonly DockLane[];
  readonly seen: DockLayout;
  readonly refusals: readonly DockRefusal[];
  readonly regions: Omit<DockRegions, "lanes">;
  /** The lanes cut by halves of the items drawn (panel columns). */
  readonly halves: ReadonlySet<string>;
  /** `options.grab` as the one function (`grabOf`): where the pointer holds the item in each form it is laid in. */
  readonly grab: Grab;
  /** Where the pointer holds the item along a raw spot's lane, px into its first landing (`end` false) or its last. */
  readonly held: Held;
  readonly marking: Marking;
}

/** Where the pointer holds the item along a raw spot's lane, px into its first or last landing (`aimCut`'s `heldA`/`heldB`). */
type Held = (r: Raw, end: boolean) => number;

/** What a lane's marks read beyond its spots. */
interface Marking {
  /** The pitch of a bar's or a toolbar rail's free-stretch spots (0: none). */
  readonly pitch: number;
  /** A growing item's natural length along `axis` (its drawn length past it is free stretch), else undefined. */
  readonly natural: (id: string, axis: Axis) => number | undefined;
  /** The edge's own gap between items, px: room no larger than it between two items is none (they touch). */
  readonly gap: (edge: string) => number;
  /**
   * The edges drawn in `over` standing across `edge`'s axis that take the held item (it has a lane there), their rects:
   * the ones an empty `edge`'s lane gives way to. A drawn edge that refuses the item leaves the corner to `edge`.
   */
  readonly crossing: (edge: string, over: DockLayout) => readonly Rect[];
}

/**
 * An empty edge's band less the drawn edges across it: along `axis` it stops at each one's side (the ones before its
 * middle cut its start, the others its end). Only a drawn edge that stands across the band's middle line cuts: one that
 * reaches a few pixels into the band (a rail starting below a drawn inner bar the empty band lies over) takes none of
 * the band's length, so its corner stays the band's.
 */
function clipAtDrawn(band: Rect, axis: Axis, cuts: readonly Rect[]): Rect {
  let a = lo(band, axis);
  let b = a + len(band, axis);
  const center = (a + b) / 2;
  const x = axis === "x" ? "y" : "x";
  const line = lo(band, x) + len(band, x) / 2;
  for (const c of cuts) {
    if (!(lo(c, x) < line - EPS && line < lo(c, x) + len(c, x) - EPS)) continue;
    const c0 = lo(c, axis);
    const c1 = c0 + len(c, axis);
    if ((c0 + c1) / 2 <= center) a = Math.max(a, c1);
    else b = Math.min(b, c0);
  }
  return b - a > EPS ? along(band, axis, a, b) : band;
}

const memo = new WeakMap<DockState, Map<string, Base>>();
const previousIds = new WeakMap<DockLayout, number>();
let nextPrevious = 1;
/** The options as a key: by value, `previous` by identity, a grab function by identity (`grabKey`). */
function keyOf(dragged: string, o: DockLaneOptions): string {
  const { previous, grab, ...rest } = o;
  let p = 0;
  if (previous) {
    if (!previousIds.has(previous)) previousIds.set(previous, nextPrevious++);
    p = previousIds.get(previous)!;
  }
  return `${dragged}\u0000${p}\u0000${JSON.stringify(rest)}\u0000${JSON.stringify(grabKey(grab))}`;
}

/**
 * The lanes and regions of a drag of `dragged`: every lane that takes it with its spots and stretches, the refused
 * places outside lanes, the content and what blocks it, the stage, the float region, the item's size and the float
 * target, each lane's marks as seen (at rest, the held item drawn nowhere). Remembered per state and options (`previous`
 * by identity). A held frame's lanes are `dockDrag(...).after(held)`'s (./drag).
 */
export function lanes(state: DockState, dragged: string, options: DockLaneOptions = {}): DockRegions {
  const base = baseOf(state, dragged, options);
  return { ...base.regions, lanes: base.lanes };
}

/** The drag's base, remembered per state and options (`previous` by identity). Internal to the package. */
export function baseOf(state: DockState, dragged: string, options: DockLaneOptions = {}): Base {
  const key = keyOf(dragged, options);
  let perState = memo.get(state);
  if (!perState) memo.set(state, (perState = new Map()));
  let base = perState.get(key);
  if (!base) perState.set(key, (base = build(state, dragged, options)));
  return base;
}

/** A lane's id with its marks in one layout. */
export interface LaneMarks {
  readonly lane: string;
  readonly axis: Axis;
  readonly marks: readonly DockMark[];
}

/**
 * Every lane's marks in the one layout `layout` (internal to the package): each lane laid out over `layout` as drawn
 * there, the held item drawn where `layout` draws it on an edge (`held`: a spot's layout) or nowhere (the layout as seen,
 * at rest; a float's), each neighbor's giving way judged in `layout` itself, every mark clipped to its lane's rect over
 * `layout` (decision 0002), and the corners settled between the lanes as `layout` draws them. Held on a sliding spot
 * (`"slide"`), the room beside the item is a box from `MIN_BOX`: the item lands anywhere in it, so any room is a place.
 */
export function marksIn(base: Base, state: DockState, dragged: string, layout: DockLayout, held: false | "spot" | "slide", emptyLanes: EmptyLanes | undefined): LaneMarks[] {
  const heldEdge = held ? layout.items[dragged] : undefined;
  const on = heldEdge && !heldEdge.floating && !heldEdge.inMenu ? heldEdge.edge : undefined;
  const built = base.lanes.flatMap((l) => {
    const raws = base.raws.get(l.id);
    const again = raws ? laneFrom(l.id, raws, layout, base.seen, dragged, base.refusals, base.halves.has(l.id), base.held, base.marking, l.id === on, l.id === on && held === "slide" ? MIN_BOX : undefined) : null;
    return again ? [{ lane: again, over: laneRectOver(raws!, layout, base.marking).rect }] : [];
  });
  const over = built.map(({ lane, over: r }) => ({ ...lane, rect: r }));
  const settled = built.map(({ lane, over: r }) => {
    const s = settle(lane, layout, state, dragged, over, emptyLanes, r);
    return { lane: s.id, axis: s.axis, marks: s.marks };
  });
  return newColumnsGiveWay(settled, (s) => s.lane, state);
}

/**
 * A lane of no edge (a new column beside one) marks its landing in its own layout, the layout that creates it: it gives
 * way to the marks of the lanes the layout lays out, so every lane's marks share that one layout's room.
 */
function newColumnsGiveWay<L extends { readonly axis: Axis; readonly marks: readonly DockMark[] }>(ls: readonly L[], idOf: (l: L) => string, state: DockState): L[] {
  const hasEdge = (id: string): boolean => state.edges.some((e) => e.id === id);
  // (Not the lines: a joint between two panels lies across the room the new column takes as its column moves aside.)
  const laid = ls.filter((l) => hasEdge(idOf(l))).flatMap((l) => l.marks.filter((m) => m.kind !== "line").map((m) => m.rect));
  return ls.map((l) => (hasEdge(idOf(l)) ? l : { ...l, marks: marksLess(l.marks, l.axis, laid) }));
}

/** The lane `id`'s spots with their stretches cut in `layout` (a panel column by halves of what `layout` draws), or null. Internal. */
export function spotsIn(base: Base, id: string, layout: DockLayout, dragged: string): readonly DockSpot[] | null {
  const raws = base.raws.get(id);
  return raws ? (laneFrom(id, raws, layout, base.seen, dragged, base.refusals, base.halves.has(id), base.held, base.marking)?.spots ?? null) : null;
}

/** The raw spot `id` of the drag (internal): its lane, its target, and the layout its drop draws at rest. */
export function rawSpot(base: Base, id: string): { readonly lane: string; readonly target: DockDrop; readonly layout: DockLayout; readonly home?: true; readonly slide?: boolean } | null {
  for (const [lane, list] of base.raws) {
    const r = list.find((x) => x.id === id);
    if (r) return { lane, target: r.target, layout: r.layout, ...(r.home ? { home: true as const } : {}), ...(r.slide ? { slide: true } : {}) };
  }
  return null;
}

function build(state: DockState, dragged: string, options: DockLaneOptions): Base {
  const seen = solve(state, options.previous ? { previous: options.previous } : {});
  const { targets: ts, refusals: rs, places } = targetsAndRefusals(state, dragged, options);
  // (Held, a movable grower is its natural length: `landedLayout`.)
  const own = landedLayout(state, seen, dragged, options.previous ? { previous: options.previous } : {}).items[dragged];
  const ownEdge = own && !own.floating && !own.inMenu ? own.edge : undefined;
  const pitch = options.pitch === undefined ? SPOT_PITCH : options.pitch;
  // The grab as one function over the lift (`grabOf`): what every sliding spot, cut and held frame reads.
  const lift = liftOf(state, seen, dragged, own?.rect);
  const raws: Raw[] = [];
  const axisOfEdge = (id: string): Axis => {
    const e = state.edges.find((x) => x.id === id);
    return e && axisOf(e.side) === "column" ? "y" : "x";
  };
  // A virtual lane is keyed by the column it lies outside (or `$`, the side's inner end), not by its ring.
  const columnKey = (side: string, ring: number): string => state.edges.find((e) => e.side === side && e.column === true && e.ring === ring)?.id ?? "$";
  // Every place the item lands: the targets and the places no tile reaches (`stops`), which the cuts below may leave
  // no stretch either, as one rule (`aimCut`), but which still lie in the lane and draw their marks.
  for (const t of [...ts, ...places]) {
    if (t.free) continue;
    const p = t.place;
    if (p.kind === "gap" || (p.kind === "home" && ownEdge)) {
      const edge = p.kind === "gap" ? p.edge : ownEdge!;
      const axis = axisOfEdge(edge);
      const layout = p.kind === "home" ? seen : t.after(ORIGIN, ORIGIN).layout;
      const landing = p.kind === "home" ? own!.rect : layout.items[dragged]?.rect;
      if (!landing) continue;
      const zone = p.kind === "gap" ? p.zone : (own?.zone ?? "start");
      const n = neighbors(layout, edge, dragged, axis);
      const id = n.before === "^" && n.next === "$" ? `${edge}/${zone}` : `${edge}/${zone}/${n.before}|${n.next}`;
      raws.push({ lane: edge, edge, axis, id, ...n, landing, layout, target: t, hit: t.hit, ...(p.kind === "home" ? { home: true as const } : {}) });
    } else if (p.kind === "column" || p.kind === "rail") {
      const layout = t.after(ORIGIN, ORIGIN).layout;
      const landing = layout.items[dragged]?.rect;
      if (!landing) continue;
      const lane = p.kind === "column" ? `column:${p.side}:${columnKey(p.side, p.ring)}` : `rail:${p.side}`;
      // A rail drop strip's lane is the strip at the window's side (`railStripWidth`), even where a column lies there:
      // never its hit band or its landing (the column drawn as a rail), so a plain drop in that column goes by halves.
      const strip = p.kind === "rail" && t.strip ? t.strip : undefined;
      raws.push({ lane, edge: null, axis: "y", id: `${lane}/${p.kind === "rail" ? "end" : "line"}`, before: "^", next: "$", landing, layout, target: t, hit: strip ?? t.hit, ...(strip ? { strip: true as const } : {}) });
    }
  }
  // The layout as seen with the held item lifted: solved once per lift, read by every stretch and by the marks.
  const lifted = liftedLayout(state, dragged, options);
  // A bar's free stretches: one sliding spot each, which takes over the docks landing inside it; else spots at `pitch`,
  // each a dock keeping `space` (`DockItem.space`).
  if (options.stretchPositions !== "pitched") {
    const { spots, absorbed } = slidingSpots(state, dragged, options, seen, lifted, raws, pitch > 0 ? pitch : SPOT_PITCH, grabResolver(lift));
    for (let i = raws.length - 1; i >= 0; i--) if (absorbed.has(raws[i]!)) raws.splice(i, 1);
    raws.push(...spots);
  } else if (pitch > 0) raws.push(...pitchedSpots(state, dragged, options, seen, lifted, raws, pitch));
  // Over a neighbor itself, the item takes its place and the neighbor gives way, in either mode (`takeoverSpots`).
  raws.push(...takeoverSpots(state, dragged, options, seen, lifted, raws, pitch > 0 ? pitch : SPOT_PITCH));
  const byLane = new Map<string, Raw[]>();
  for (const r of raws) byLane.set(r.lane, [...(byLane.get(r.lane) ?? []), r]);
  // Panel columns take a panel by halves of the panels drawn; bars and toolbar rails by the gap between landings.
  const halves = new Set(state.edges.filter(cutsByHalves).map((e) => e.id));
  // A growing fixed item's drawn length past its natural one (a title filling its bar) is free stretch for the marks, as
  // it is for pitched spots. A movable grower's is not: in the layout a frame draws (its release's commit) it has taken
  // that stretch, so a mark there would lie over it. Its growth is spare room for the drops (the targets count it at its
  // natural length), and the frame that lands one beside it draws it given way, as the commit does.
  const marking: Marking = {
    pitch,
    natural: (id, axis) => {
      const it = state.items[id];
      const main = it?.forms[axis === "x" ? "row" : "column"]?.[0]?.main;
      return it?.fixed && main?.grows ? main.natural : undefined;
    },
    gap: (edge) => nonNeg(state.edges.find((e) => e.id === edge)?.gap),
    crossing: (edge, over) => state.edges.filter((e) => e.id !== edge && byLane.has(e.id) && (over.edges[e.id]?.cross ?? 0) > EPS && axisOfEdge(e.id) !== axisOfEdge(edge)).map((e) => over.edges[e.id]!.rect),
  };
  // Where the pointer holds the item along each spot's lane: the grab in the form of each of its end landings (the
  // twin of a press point: along the item's own length its share, across it the middle). Read once per raw spot.
  const grab = grabOf(lift, options.grab, options.onGrabNote);
  const heldAt = new WeakMap<Raw, readonly [number, number]>();
  const held: Held = (r, end) => {
    let both = heldAt.get(r);
    if (!both) {
      const laid = r.layout.items[dragged];
      const at = (x: Rect): number => grab(laid ? { ...laid, rect: x } : undefined, sizeOf(x), "lane")[r.axis];
      heldAt.set(r, (both = [at(r.slide?.first ?? r.landing), at(r.slide?.last ?? r.landing)]));
    }
    return both[end ? 1 : 0];
  };
  const built = [...byLane].map(([id, list]) => laneFrom(id, list, seen, seen, dragged, rs, halves.has(id), held, marking)).filter((l): l is DockLane => !!l);
  // Each lane's marks as seen: the window as seen is one layout (`marksIn`'s rule over it), the held item drawn nowhere.
  // `dockDrag`'s rest reads these.
  const laneList = newColumnsGiveWay(built.map((l) => settle(l, seen, state, dragged, built, options.emptyLanes)), (l) => l.id, state).map((l) => clearOfRail(l, seen, byLane.get(l.id)));
  const onLanes = new Set(laneList.map((l) => l.id));
  const rails = Object.values(seen.rails).flatMap((r) => (r && r.rect.width > EPS && r.rect.height > EPS ? [r.rect] : []));
  const blocked = [
    ...Object.values(seen.edges).filter((e) => e.cross > EPS).map((e) => e.rect),
    ...Object.entries(seen.items).filter(([id, it]) => id !== dragged && !it.floating && !it.inMenu).map(([, it]) => it.rect),
    ...keepClearFor(state, seen, "targets"),
    ...rails,
    // A held tile's own rail: every stop is home's in `targets()`, with the new-column lines about its folded column
    // joined to it (the strip beside the rail). A home place takes no float, so it is blocked as `targets()` has it.
    ...(own?.rail ? ts.filter((t) => t.place.kind === "home" && parseTargetId(t.id)?.kind === "rail").flatMap((t) => t.hits ?? [t.hit]) : []),
    // Spots where a release cancels (`DockState.blocked`): no float lands there.
    ...(state.blocked ?? []),
  ];
  return {
    raws: byLane,
    lanes: laneList,
    seen,
    refusals: rs,
    halves,
    grab,
    held,
    marking,
    regions: {
      refused: rs.filter((f) => !onLanes.has(f.edge)).flatMap((f) => f.hits ?? [f.hit]),
      content: floatRegion(state, dragged),
      blocked,
      stage: state.stage,
      floatRegion: floatRegion(state, dragged),
      item: own ? { width: own.rect.width, height: own.rect.height } : { width: 0, height: 0 },
      float: ts.find((t) => t.free) ?? null,
      refusals: rs,
    },
  };
}

/**
 * A new column's lane gives way to the side's drawn rail, as the layout as seen draws it: the rail owns its rect (a
 * column line's zone starts where the rail ends, and the rest of the rail is the rail's, home for a tile of it), so the
 * lane's hit rect is what is left of it less the rail (the largest piece, as a target's `hit` is), never over the rail,
 * though the column's box lands where a lifted tile's rail was. Only the hit rect (what a pointer is in) is cut; the
 * lane's marks are laid in the layout that makes the column. A new column's lane is one whose spots' drops are a
 * `column` place (`raws`: the lane's raw spots).
 */
function clearOfRail(lane: DockLane, seen: DockLayout, raws: readonly Raw[] | undefined): DockLane {
  const place = raws?.[0]?.target.place;
  const rail = place?.kind === "column" ? seen.rails[place.side] : undefined;
  if (!rail || rail.segments.length === 0) return lane;
  const pieces = subtract(lane.rect, rail.rect);
  if (pieces.length === 0) return lane;
  const largest = pieces.reduce((m, p) => (area(p) > area(m) ? p : m));
  return largest === lane.rect ? lane : { ...lane, rect: largest };
}

/**
 * A lane's rect over the layout `over`: the edge as drawn there, else (an empty edge, a virtual lane) the band its drops
 * are drawn at. At a corner an empty edge's lane gives way to a drawn edge across it, as its marks do (`settle`): the
 * band is clipped along its axis to stop at that edge's side, so a pointer on the drawn edge is in that edge's lane.
 * Between two edges not drawn the corner is as it was. `band`: the band whole, for an empty edge.
 *
 * One layout (decision 0002): whether and where the lane gives way is read in `over` itself. Over the layout as seen it
 * is the lane's hit rect; over a state's layout, the rect its marks are clipped to there.
 */
function laneRectOver(list: readonly Raw[], over: DockLayout, marking: Marking): { rect: Rect; band?: Rect } {
  const first = list[0]!;
  const axis = first.axis;
  const edgeLayout = first.edge ? over.edges[first.edge] : undefined;
  const band = list.map((r) => r.landing).reduce(hull);
  if (!edgeLayout) return { rect: list.every((r) => r.strip) ? list.map((r) => r.hit).reduce(hull) : list.map((r) => r.hit).reduce(hull, band) };
  const drawnAt = drawnRect(over, first.edge!);
  if (drawnAt) return { rect: drawnAt };
  const whole = axis === "x" ? rect(edgeLayout.rect.x, band.y, edgeLayout.rect.width, band.height) : rect(band.x, edgeLayout.rect.y, band.width, edgeLayout.rect.height);
  return { rect: clipAtDrawn(whole, axis, marking.crossing(first.edge!, over)), band: whole };
}

/** Whether `layout` draws the edge `id`: open (wider than nothing across), or a column folded into its side's rail. Internal. */
export function drawnIn(layout: DockLayout, id: string): boolean {
  return drawnRect(layout, id) !== undefined;
}

/**
 * Where `layout` draws the edge `id`: its rect when open; when folded into its side's rail, the run of its tiles there (the
 * hull of its segments, as `targets()` cuts it: the rest of the rail is other columns' tiles, or nothing); else undefined.
 */
function drawnRect(layout: DockLayout, id: string): Rect | undefined {
  const e = layout.edges[id];
  if (!e) return undefined;
  if (e.cross > EPS) return e.rect;
  if (!e.folded) return undefined;
  const run = Object.values(layout.rails).flatMap((r) => r?.segments.filter((g) => g.edge === id).map((g) => g.rect) ?? []);
  return run.length > 0 ? run.reduce(hull) : undefined;
}

/**
 * One lane from its spots: its hit rect and its spots in order with their stretches (both as seen; a panel column cut
 * by halves of what `drawn` draws), its refused stretches, and its marks in `drawn`: the held item among its items where
 * `showsHeld` (a spot's layout that draws it here), else drawn nowhere; each neighbor's giving way judged in `drawn`.
 * `besideFloor`: the shortest room beside the held item that is a box (a sliding spot's: any).
 */
function laneFrom(id: string, list: readonly Raw[], drawn: DockLayout, seen: DockLayout, dragged: string, rs: readonly DockRefusal[], halves: boolean, held: Held, marking: Marking, showsHeld = false, besideFloor?: number): DockLane | null {
  if (list.length === 0) return null;
  const first = list[0]!;
  const axis = first.axis;
  // The lane's rect as seen, and the band an empty edge's marks are laid over (`settle` cuts them at the drawn edges).
  const { rect: laneRect, band: markBand } = laneRectOver(list, seen, marking);
  // In order; one landing is one spot (the item's own place where it is one of them); one id is one spot.
  // A sliding spot lies in order by its first landing (at its stretch's start), and cuts by its landing at either end.
  const firstOf = (r: Raw): Rect => r.slide?.first ?? r.landing;
  const lastOf = (r: Raw): Rect => r.slide?.last ?? r.landing;
  // At one landing the item's own place first, then the dock in the zone of the neighbor before it (a drop flush after the
  // last start-zone item stays in the start zone), as a sliding spot's snap points break it.
  const besideZone = (r: Raw): number => (r.target.place.kind === "gap" && r.target.place.zone === zoneIn(seen, r.before) ? 0 : 1);
  const sorted = [...list].sort((a, b) => mid(firstOf(a), axis) - mid(firstOf(b), axis) || (a.home ? -1 : b.home ? 1 : 0) || besideZone(a) - besideZone(b));
  // On a bar or a toolbar rail the item's own place is one landing for half a pitch around it: another spot landing
  // that near (a center dock beside a place near the middle) is home's, so away and back to the press point is home.
  const homeAt = halves ? undefined : list.find((r) => r.home)?.landing;
  const nearHome = (r: Raw): boolean => !!homeAt && !r.home && !r.slide && Math.abs(lo(r.landing, axis) - lo(homeAt, axis)) < Math.max(0, marking.pitch) / 2;
  // Each against the spots kept so far (not one dropped as home's), the item's own place winning its landing: a dock
  // landing a fraction of a pixel before it (sorted first) never takes its place.
  const unique: Raw[] = [];
  for (const x of sorted) {
    if (nearHome(x)) continue;
    const k = unique.findIndex((y) => (!x.slide && !y.slide && sameRect(y.landing, x.landing)) || y.id === x.id);
    if (k < 0) unique.push(x);
    else if (x.home && !unique[k]!.home && !unique.some((y) => y.id === x.id && y !== unique[k])) unique[k] = x;
  }
  const start = lo(laneRect, axis);
  const end = start + len(laneRect, axis);
  // The cuts are made over the lane's band whole (an empty edge's before its clip at a drawn edge), then the stretches are
  // clipped to the lane: the clip hands the drawn edge only the stretch that lies on it. A spot whose stretch lies there
  // whole is that edge's (the pointer there is in its lane); the spot whose stretch the clip falls in starts at the clip,
  // so the clip leaves no spot with no stretch, and none a pointer off the drawn edge reached goes.
  const whole = markBand ?? laneRect;
  const bandStart = lo(whole, axis);
  const bandEnd = bandStart + len(whole, axis);
  // The cut between two spots. In a panel column (`halves`), between two spots sharing a neighbor, that item's middle in
  // `drawn` (the upper half above it, the lower half below); else halfway across the gap between their landings (each in
  // its own layout), so the pointer is at the landing it picks, or as near one as the other: a toolbar moved along a bar
  // or a rail stays at the hand however wide its neighbors (R12: a long neighbor between two landings puts a gap between
  // them, and halfway across it the pointer is at the landing it picks). Off a panel column, where two landings overlap
  // (spots a pitch apart over a free stretch, the pointer inside both) the cut is measured where the item is held:
  // halfway between the points the pointer holds in each (the grab in each landing's own form), and a pointer at its
  // press point lies on the item's own place. Kept inside the lane and in order.
  const drawnItems = first.edge && halves ? new Map(onEdge(drawn, first.edge, dragged, axis).map((o) => [o.id, o.r])) : new Map<string, Rect>();
  const cutOf = (a: Raw, b: Raw): number => {
    const shared = a.next === b.before && a.next !== "$" ? drawnItems.get(a.next) : undefined;
    const [la, lb] = [lastOf(a), firstOf(b)];
    // (A sliding spot's facing end: its landing flush against the neighbor between them.)
    // Overlapping landings: at the grab, kept within half a pitch of their overlap (the pointer never further than that
    // from the landing it picks: two spots far apart that overlap a little cut near the overlap, as apart). Apart (a gap
    // between them): halfway across the gap, the grab aside. The one rule `targets()` cuts its tiles by (`aimCut`).
    return aimCut(la, lb, axis, halves ? len(la, axis) / 2 : held(a, true), halves ? len(lb, axis) / 2 : held(b, false), aimSlack(marking.pitch), shared);
  };
  // On a bar or a toolbar rail a spot whose cut after it would lie before its cut before it is nearer no pointer (its
  // stretch between the landing cuts is empty): it is left out of the cutting, and its neighbors cut between themselves,
  // so it moves no other spot's cut. It keeps a spot with no stretch, at that cut. (Never the item's own place; in a
  // panel column, none.) The tiles cut the same way (`crossFreeCuts`).
  const cuts = crossFreeCuts(unique.length, (i, j) => cutOf(unique[i]!, unique[j]!), (i) => halves || !!unique[i]!.home, bandStart, bandEnd);
  const spots: DockSpot[] = unique.flatMap((x, i) => {
    const a = i === 0 ? bandStart : cuts[i - 1]!;
    const b = i === unique.length - 1 ? bandEnd : cuts[i]!;
    const along = [clamp(a, start, end), clamp(b, start, end)] as const;
    // Left out only where the clip took its whole stretch (never the item's own place).
    return along[1] - along[0] > EPS || b - a <= EPS || x.home ? [{ x, along }] : [];
  }).map(({ x, along }) => ({
    id: x.id,
    along,
    landing: x.landing,
    // A sliding spot's target holds the pointer over its stretch only (its range of landings runs past the cuts either
    // side, over the neighbors' stretches).
    target:
      x.slide && along[1] - along[0] > EPS
        ? { ...x.target, hit: axis === "x" ? rect(along[0], x.target.hit.y, along[1] - along[0], x.target.hit.height) : rect(x.target.hit.x, along[0], x.target.hit.width, along[1] - along[0]) }
        : x.target,
    ...(x.home ? { home: true as const } : {}),
    ...(x.pitched ? { pitched: true as const } : {}),
    ...(x.slide ? { slide: { from: x.slide.from, to: x.slide.to, snaps: x.slide.snaps, snapDistance: x.slide.snapDistance, step: x.slide.step } } : {}),
    others: othersKey(x.layout, dragged),
  }));
  // The item's length along the lane: its shortest landing here. A refused stretch shorter than it joins its spots.
  const itemLen = Math.min(...unique.map((x) => len(x.landing, axis)));
  const refused: LaneRefusal[] = first.edge
    ? rs
        .filter((f) => f.edge === first.edge)
        .flatMap((f) => (f.hits ?? [f.hit]).map((h) => ({ along: [clamp(lo(h, axis), start, end), clamp(lo(h, axis) + len(h, axis), start, end)] as const, reason: f.reason })))
        .filter((f) => f.along[1] - f.along[0] >= itemLen - EPS)
    : [];
  // The places a drop here lands: its spots' neighbors (`<before>|<after>`), so a mark lies only where one lands.
  const places = new Set(unique.map((x) => `${x.before}|${x.next}`));
  // Marks lie in the layout as drawn, so on the edge as drawn there: a held spot's room can move the whole edge (a bar
  // it leaves empty lets a rail start higher), and its items with it.
  // An edge `drawn` doesn't draw lays its marks along its band in `drawn` too (one layout); the band as seen is the hit
  // rect's only. A column `drawn` folds into its side's rail (zero wide, its items the rail's segments) lays them along
  // that rail: the band it is drawn in there, not the open column's.
  const drawnEdge = first.edge ? drawn.edges[first.edge] : undefined;
  const markRect = (first.edge ? drawnRect(drawn, first.edge) : undefined) ?? laneRectOver(list, drawn, marking).band ?? markBand ?? laneRect;
  // The items as drawn, a growing one (a title filling the bar) at its natural length: what it draws past that is free
  // stretch, as pitched spots take it (the head of a title bar).
  // (Bars and toolbar rails only: a panel filling its column is drawn there.) Off the held lane the lifted item is
  // drawn nowhere on it (it is at the pointer or in another lane): its own place is free stretch like any other.
  const marked = first.edge
    ? onEdge(drawn, first.edge, showsHeld ? "" : dragged, axis).map((o) => {
        const n = o.id === dragged || halves ? undefined : marking.natural(o.id, axis);
        return n !== undefined && n < len(o.r, axis) ? { ...o, r: along(o.r, axis, lo(o.r, axis), lo(o.r, axis) + n) } : o;
      })
    : [];
  // Where each place lands (`<before>|<after>`, not a pitched spot's): a short room is drawn as its spot lands. On bars
  // and toolbar rails only; a panel column keeps its lines.
  const landings = new Map<string, { landing: Rect; layout: DockLayout }>();
  // A sliding spot's layout is its stretch's: every landing in it leaves its neighbors in the same forms and places.
  if (!halves) for (const x of unique) if (!x.pitched && !x.home && !landings.has(`${x.before}|${x.next}`)) landings.set(`${x.before}|${x.next}`, { landing: x.landing, layout: x.layout });
  // An item's extent along the lane as marks read it: a growing one at its natural length.
  const extent = (iid: string, r: Rect): [number, number] => {
    const n = halves ? undefined : marking.natural(iid, axis);
    return [lo(r, axis), lo(r, axis) + (n !== undefined && n < len(r, axis) ? n : len(r, axis))];
  };
  // (An edge `drawn` has no trace of, a dynamic column it deletes, marks nothing there: the layout that creates it does.)
  const marks = first.edge && !drawnEdge ? [] : first.edge
    ? edgeMarks(id, markRect, axis, marked, refused, itemLen, (pair) => places.has(pair) || pair.split("|").includes(dragged), dragged, {
        besideMin: besideFloor ?? (halves || marking.pitch <= 0 ? itemLen : marking.pitch),
        gap: marking.gap(first.edge),
        landingOf: (pair) => landings.get(pair),
        // Judged against the layout the marks are drawn in: one layout, the screen's.
        givesWay: (iid, side, after) => givesWay(drawn.items[iid], after.items[iid], id, side, (r) => extent(iid, r)),
      })
    : virtualMarks(id, unique, drawn.items[dragged]);
  return { id, rect: laneRect, axis, spots, refused, marks, ...(list.every((r) => r.strip) ? { owns: true as const } : {}) };
}

/** A rect spanning `[a, b]` along `axis` and `r` across it. */
const along = (r: Rect, axis: Axis, a: number, b: number): Rect => (axis === "x" ? rect(a, r.y, b - a, r.height) : rect(r.x, a, r.width, b - a));
const LINE = 2;

/** Below this a box piece isn't drawn (a host insets a box 2 px a side). */
const MIN_BOX = 8;
/**
 * The striped end inside a box whose room partly fits, px: a cue that the neighbor there gives way, never a measure
 * (about 6 px drawn, inside a box a host insets 2 px).
 */
export const HATCH_END = 8;
/**
 * A striped column edge's thickness, px: where an empty lane's band lies over items that move aside when it opens
 * (about 6 px drawn, 2 px clear of the window's edge).
 */
export const HATCH_EDGE = 8;

/**
 * An edge lane's marks, its items as drawn (the held one included): a box over each free stretch at least the item's
 * length, less its refused stretches. Beside the held item the room left of its free stretch is a box from `besideMin`
 * (a pitch on a bar or a toolbar rail, where the item slides there by a spot a pitch over; the item's length in a
 * panel column), named `:before` or `:after` it so the box keeps its id while the item glides along the stretch. Room
 * that partly fits (from a pitch, shorter than the item; bars and toolbar rails, where its spot's landing is known): a
 * box over it with a striped end (`HATCH_END`) inside it at each side whose neighbor gives way. Room under a pitch
 * (none free but the edge's gap, at a lane's end too): a line at the middle of the gap. Only where a drop lands
 * (`lands(<before>|<after>)`: a spot between those two, or beside the held item): none beside fixed chrome nothing lands
 * next to. A mark never covers an item.
 */
function edgeMarks(
  lane: string,
  laneRect: Rect,
  axis: Axis,
  items: readonly { id: string; r: Rect }[],
  refused: readonly LaneRefusal[],
  itemLen: number,
  lands: (pair: string) => boolean,
  held: string,
  more: {
    readonly besideMin: number;
    readonly gap: number;
    /** The spot between `<before>|<after>`: where the item lands and the layout after its drop. */
    readonly landingOf: (pair: string) => { readonly landing: Rect; readonly layout: DockLayout } | undefined;
    /** Whether a neighbor `side` of a room gives way in `after`, the layout after a drop there (`givesWay`). */
    readonly givesWay: (id: string, side: "before" | "after", after: DockLayout) => unknown;
  },
): DockMark[] {
  const { besideMin } = more;
  /** The striped ends inside the box piece `[p, q]` of the room `[a, b]`, at the ends that touch a neighbor that gives way. */
  const hatches = (pair: string, a: number, b: number, p: number, q: number, gl: string | null, gr: string | null): void => {
    if (gl && Math.abs(p - a) < EPS) out.push({ id: `${lane}/hatch/${pair}:before`, kind: "hatch", rect: along(laneRect, axis, p, p + Math.min(HATCH_END, (q - p) / 2)), givesWay: gl });
    if (gr && Math.abs(q - b) < EPS) out.push({ id: `${lane}/hatch/${pair}:after`, kind: "hatch", rect: along(laneRect, axis, q - Math.min(HATCH_END, (q - p) / 2), q), givesWay: gr });
  };
  const heldAt = items.find((o) => o.id === held);
  const heldSpan: [number, number] | null = heldAt ? [lo(heldAt.r, axis), lo(heldAt.r, axis) + len(heldAt.r, axis)] : null;
  const out: DockMark[] = [];
  const start = lo(laneRect, axis);
  const end = start + len(laneRect, axis);
  const ends = [{ id: "^", a: start, b: start }, ...items.map((o) => ({ id: o.id, a: lo(o.r, axis), b: lo(o.r, axis) + len(o.r, axis) })), { id: "$", a: end, b: end }];
  const isRefused = (v: number): boolean => refused.some((f) => v >= f.along[0] && v <= f.along[1]);
  for (let i = 0; i + 1 < ends.length; i++) {
    // Kept inside the lane: an item drawn past its end (a rider, a lent edge) leaves no mark outside it.
    const a = clamp(ends[i]!.b, start, end);
    const b = clamp(ends[i + 1]!.a, start, end);
    const pair = `${ends[i]!.id}|${ends[i + 1]!.id}`;
    if (ends[i + 1]!.a < start - EPS || ends[i]!.b > end + EPS || !lands(pair)) continue;
    // Named by what it separates other than the held item (that is the held item's own place, and it moves): a mark
    // keeps its id while the held item hops past it.
    const left = ends[i]!.id === held ? (ends[i - 1]?.id ?? "^") : ends[i]!.id;
    const right = ends[i + 1]!.id === held ? (ends[i + 2]?.id ?? "$") : ends[i + 1]!.id;
    const named = `${left}|${right}`;
    // The room before or after the held item (the rest of the free stretch it lies in): a box from `besideMin`.
    const beside = ends[i + 1]!.id === held ? "before" : ends[i]!.id === held ? "after" : null;
    const min = beside ? Math.min(itemLen, besideMin) : itemLen;
    // The neighbors that give way when the item lands in this room (`givesWay`: it moves away, leaves the lane or steps
    // down to a shorter form), each a striped end (`HATCH_END`) inside the room's box at its side, whether or not the
    // room as seen is shorter than the item; where none does, the box is plain. Nothing is drawn on the neighbor. Not
    // beside the held item (its own place), not in a refused stretch.
    const spot = !beside && named === pair && items.length > 0 && !isRefused((a + b) / 2) ? more.landingOf(pair) : undefined;
    const gl = spot && left !== "^" && more.givesWay(left, "before", spot.layout) ? left : null;
    const gr = spot && right !== "$" && more.givesWay(right, "after", spot.layout) ? right : null;
    if (b - a < min - EPS) {
      // Room that partly fits (at least a pitch, shorter than the item): a box over the free room, its striped ends at
      // the neighbors that give way. Under a pitch, a line (below: no free room).
      if (spot && b - a >= besideMin - EPS) {
        // Less what a refused stretch takes, and never under the held item.
        let ps: [number, number][] = [[a, b]];
        for (const f of refused) ps = ps.flatMap(([p, q]): [number, number][] => [[p, Math.min(q, f.along[0])], [Math.max(p, f.along[1]), q]]);
        if (heldSpan) ps = ps.flatMap(([p, q]): [number, number][] => [[p, Math.min(q, heldSpan[0])], [Math.max(p, heldSpan[1]), q]]);
        ps = ps.filter(([p, q]) => q - p >= MIN_BOX - EPS);
        ps.forEach(([p, q], k) => {
          out.push({ id: `${lane}/box/${pair}${k ? `#${k}` : ""}`, kind: "box", rect: along(laneRect, axis, p, q) });
          hatches(pair, a, b, p, q, gl, gr);
        });
        if (ps.length > 0) continue;
      }
      // As thick as the gap allows, up to `LINE`: zero between items with no gap (the host strokes it). Also at an end
      // of the lane next to an item where nothing above draws it, unless refused there; none where the lane holds
      // nothing, and none beside the held item (its own edge, not a place).
      const t = Math.max(0, Math.min(LINE, b - a)) / 2;
      if (items.length > 0 && named === pair && !isRefused((a + b) / 2)) out.push({ id: `${lane}/line/${pair}`, kind: "line", rect: along(laneRect, axis, (a + b) / 2 - t, (a + b) / 2 + t) });
      continue;
    }
    // The free stretch less its refused parts: one box per piece the item still fits in.
    let pieces: [number, number][] = [[a, b]];
    for (const f of refused) pieces = pieces.flatMap(([p, q]) => [[p, Math.min(q, f.along[0])] as [number, number], [Math.max(p, f.along[1]), q] as [number, number]]).filter(([p, q]) => q - p > EPS);
    let k = 0;
    for (const [p, q] of pieces) {
      if (q - p < min - EPS) continue;
      // Beside the held item, named by its side of it; else the held item between two free stretches would name both
      // alike (the one after it is the second).
      const base = `${lane}/box/${named}${beside ? `:${beside}` : ""}${k++ ? `#${k - 1}` : ""}`;
      out.push({ id: out.some((m) => m.id === base) ? `${base}~2` : base, kind: "box", rect: along(laneRect, axis, p, q) });
      hatches(pair, a, b, p, q, gl, gr);
    }
  }
  return out;
}

/**
 * A virtual lane's marks: a box at each landing; where the held item is drawn over it, a line instead, along the
 * landing's side away from the item.
 */
function virtualMarks(lane: string, spots: readonly Raw[], held: { rect: Rect; floating?: boolean } | undefined): DockMark[] {
  return spots.map((s) => {
    const l = s.landing;
    if (!held || held.floating || !overlaps(l, held.rect)) return { id: `${lane}/box/${s.id}`, kind: "box" as const, rect: l };
    const x = mid(held.rect, "x") < mid(l, "x") ? l.x + l.width : l.x;
    return { id: `${lane}/line/${s.id}`, kind: "line" as const, rect: rect(x, l.y, 0, l.height) };
  });
}

/**
 * The lane with its marks clipped to `r`, its rect in the layout they are drawn in, the pieces left empty dropped; a
 * line (a joint, kept whole or not at all) is kept only if it lies inside. The lane itself when nothing changes.
 */
function inLane(l: DockLane, r: Rect): DockLane {
  const marks = l.marks.flatMap((m): DockMark[] => {
    const x0 = Math.max(m.rect.x, r.x);
    const y0 = Math.max(m.rect.y, r.y);
    const x1 = Math.min(m.rect.x + m.rect.width, r.x + r.width);
    const y1 = Math.min(m.rect.y + m.rect.height, r.y + r.height);
    if (m.kind === "line") return x1 - x0 >= m.rect.width - EPS && y1 - y0 >= m.rect.height - EPS ? [m] : [];
    if (x1 - x0 <= EPS || y1 - y0 <= EPS) return [];
    return x1 - x0 >= m.rect.width - EPS && y1 - y0 >= m.rect.height - EPS ? [m] : [{ ...m, rect: rect(x0, y0, x1 - x0, y1 - y0) }];
  });
  return marks.length === l.marks.length && marks.every((m, i) => m === l.marks[i]) ? l : { ...l, marks };
}

/**
 * A lane's marks against the others in `drawn`, so no two lanes' guides overlap and each follows the layout:
 * - At a corner, a lane not drawn (an empty bar or rail, a virtual lane: only the band its drops would draw at) gives
 *   way to a drawn edge across it; between two not drawn, a bar owns the corner (as it does once drawn).
 * - A lane not drawn is drawn by `emptyLanes`: `"real"`, its boxes as they are, at the size it will take, over what
 *   moves aside (the page, a column's panels); `"edge"`, each box a thin striped strip (`HATCH_EDGE`) on its window
 *   side. Either way never over an item docked in a bar or a toolbar rail (it stays where it is): cut around it.
 * - Every mark first lies inside its lane's rect in the layout the marks are drawn in (`inLane`, `within`): a mark shows
 *   where a drop goes, and a drop is possible only where the lane takes the pointer. So the corner rules above compare
 *   lanes by what each really covers. As seen, that is the lane's rect. In a held frame every lane is drawn in the held
 *   spot's own layout, where the drop may move its edge (a rail starting higher once a bar is left empty, a column
 *   pushed aside by a rail that opens): every lane is clipped to its rect over the spot's layout (`laneRectOver` that
 *   layout, `within`); its hit `rect`, for the landing model, stays as seen.
 */
function settle(lane: DockLane, drawn: DockLayout, state: DockState, dragged: string, all: readonly DockLane[], emptyLanes: "real" | "edge" = "real", within: Rect = lane.rect): DockLane {
  const l = inLane(lane, within);
  const edgeOf = (id: string) => state.edges.find((e) => e.id === id);
  const isDrawn = (id: string): boolean => !!edgeOf(id) && drawnIn(drawn, id);
  const across = (side: string | undefined): Axis => (side === "top" || side === "bottom" ? "x" : "y");
  const cuts: Rect[] = [];
  if (!isDrawn(l.id)) {
    for (const e of state.edges) {
      const de = e.id !== l.id && across(e.side) !== l.axis ? drawnRect(drawn, e.id) : undefined;
      if (de) cuts.push(de);
    }
    if (l.axis === "y") for (const o of all) if (o.id !== l.id && o.axis === "x" && !isDrawn(o.id)) cuts.push(o.rect);
  }
  const empty = !isDrawn(l.id);
  // What an empty lane's marks never cover: items docked in a bar or a toolbar rail (they don't move aside when it opens,
  // unlike the page or a column's panels).
  const barOrRail = (edge: string | undefined): boolean => {
    const e = edge ? edgeOf(edge) : undefined;
    return !!e && (e.side === "top" || e.side === "bottom" || !!e.compact);
  };
  const stays = empty
    ? Object.entries(drawn.items)
        .filter(([id, it]) => id !== dragged && it.edge !== l.id && barOrRail(it.edge) && !it.floating && !it.inMenu && it.rect.width > EPS && it.rect.height > EPS)
        .map(([, it]) => it.rect)
    : [];
  if (cuts.length === 0 && !(empty && (emptyLanes === "edge" || l.marks.some((m) => m.kind === "box" && stays.some((s) => overlaps(m.rect, s)))))) return l;
  const cut = (r: Rect, cs: readonly Rect[]): [number, number][] => piecesLess(r, l.axis, cs);
  const marks: DockMark[] = [];
  for (const m of l.marks) {
    const kept = cut(m.rect, m.kind === "box" ? [...cuts, ...stays] : cuts);
    if (m.kind === "line") {
      // A line is kept whole or not at all (it marks a joint).
      if (kept.length === 1 && Math.abs(kept[0]![1] - kept[0]![0] - len(m.rect, l.axis)) < EPS) marks.push(m);
      continue;
    }
    kept.forEach(([p, q], i) => {
      const piece = along(m.rect, l.axis, p, q);
      const id = i ? `${m.id}~c${i}` : m.id;
      // A lane drawn, or an empty one drawn at its real size: the box as it is (an empty lane's lies over what moves
      // aside: the page, a column).
      if (m.kind !== "box" || !empty || emptyLanes === "real") return void marks.push({ ...m, id, rect: piece });
      // `"edge"`: a thin striped strip (`HATCH_EDGE`) on the lane's window side, its own side where it has one (an edge's,
      // a virtual lane's `<kind>:<side>`), else the side nearer the stage's edge.
      const side = edgeOf(l.id)?.side ?? (/^(rail|column):/.test(l.id) ? l.id.split(":")[1] : undefined);
      const st = state.stage;
      let r: Rect;
      if (l.axis === "y") {
        const outerRight = side === "right" ? true : side === "left" ? false : Math.abs(piece.x + piece.width - (st.x + st.width)) <= Math.abs(piece.x - st.x);
        const t = Math.min(HATCH_EDGE, piece.width);
        r = rect(outerRight ? piece.x + piece.width - t : piece.x, piece.y, t, piece.height);
      } else {
        const outerBottom = side === "bottom" ? true : side === "top" ? false : Math.abs(piece.y + piece.height - (st.y + st.height)) <= Math.abs(piece.y - st.y);
        const t = Math.min(HATCH_EDGE, piece.height);
        r = rect(piece.x, outerBottom ? piece.y + piece.height - t : piece.y, piece.width, t);
      }
      marks.push({ id: id.replace("/box/", "/hatch/"), kind: "hatch", rect: r });
    });
  }
  return { ...l, marks };
}

/** `r`'s pieces along `axis` less `cs`: each one that crosses it (overlaps it across `axis`) takes its span along `axis`. */
function piecesLess(r: Rect, axis: Axis, cs: readonly Rect[]): [number, number][] {
  const span = (x: Rect): [number, number] => [lo(x, axis), lo(x, axis) + len(x, axis)];
  const crosses = (c: Rect): boolean => (axis === "x" ? c.y < r.y + r.height - EPS && r.y < c.y + c.height - EPS : c.x < r.x + r.width - EPS && r.x < c.x + c.width - EPS);
  let ps: [number, number][] = [span(r)];
  for (const c of cs) {
    if (!crosses(c)) continue;
    const [c0, c1] = span(c);
    ps = ps.flatMap(([p, q]): [number, number][] => [[p, Math.min(q, c0)], [Math.max(p, c1), q]]).filter(([p, q]) => q - p > EPS);
  }
  return ps;
}

/**
 * The one rect subtraction for marks (internal to the package; the guides' and the sweep's too): marks less the rects
 * `cs` they overlap, along `axis`, a box or a hatch into its pieces (the first keeps its id, the others `<id><suffix><n>`).
 * Marks `cs` doesn't overlap stay as they are. Options:
 * - `suffix` (default `~c`, `settle`'s): the later pieces' id suffix;
 * - `minBox` (default 0): a box piece the cut leaves this long or shorter is dropped (before the pieces are numbered);
 * - `lines` (default `"whole"`): a line is kept whole or not at all (`"whole"`: dropped where any rect cuts it;
 *   `"covered"`: dropped only where the rects cover it).
 */
export function marksLess<M extends DockMark>(marks: readonly M[], axis: Axis, cs: readonly Rect[], options: { readonly suffix?: string; readonly minBox?: number; readonly lines?: "whole" | "covered" } = {}): M[] {
  const suffix = options.suffix ?? "~c";
  const minBox = options.minBox ?? 0;
  return marks.flatMap((m): M[] => {
    const over = cs.filter((c) => overlaps(m.rect, c));
    if (over.length === 0) return [m];
    const kept = piecesLess(m.rect, axis, over);
    if (m.kind === "line") return (options.lines === "covered" ? kept.length > 0 : kept.length === 1 && Math.abs(kept[0]![1] - kept[0]![0] - len(m.rect, axis)) < EPS) ? [m] : [];
    return kept.filter(([p, q]) => m.kind !== "box" || q - p > minBox).map(([p, q], i) => ({ ...m, id: i ? `${m.id}${suffix}${i}` : m.id, rect: along(m.rect, axis, p, q) }));
  });
}

const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.width - EPS && b.x < a.x + a.width - EPS && a.y < b.y + b.height - EPS && b.y < a.y + a.height - EPS;

/**
 * Spots at `pitch` over the free stretches of a bar or a toolbar rail (a compact edge), along its axis: the room a drop
 * between two items makes (`stretches`; an empty one: its whole length less its padding), a start-zone dock keeping `space` before it where the
 * stretch follows a start item (or the edge's start), an end-zone dock keeping `space` after it where it precedes an end
 * item (or the edge's end). Kept only where the drop lands where it was aimed (within 1 px) and not on another spot's
 * landing. A stretch too short for the item has none, nor one bounded on both sides by zones the item cannot dock in
 * (no start-zone item or edge start before it, no end-zone item or edge end after it: no zone can take it).
 */
function pitchedSpots(state: DockState, dragged: string, options: DockLaneOptions, seen: DockLayout, lifted: DockLayout, raws: readonly Raw[], pitch: number): Raw[] {
  const out: Raw[] = [];
  stretches(state, dragged, options, seen, lifted, raws, (run) => {
    const { e, axis, gap, middle } = run;
    const taken = run.mine.map((r) => r.landing);
    /**
     * One spot: a dock in `zone` before its `at`-th item keeping `space` (`DockPlace.space`), kept if it lands at `x0`
     * (within 1 px), every fixed item stays put, and it is not on another spot's landing. `flush` names the neighbor a
     * stretch's end lies against. Whether it was kept.
     */
    const emit = (zone: Zone, at: number, space: number, x0: number, flush?: string): boolean => {
      const hit = landsAt(run, { edge: e.id, zone, at, space }, x0);
      if (!hit) return false;
      const { next, layout } = hit;
      const landed = layout.items[dragged]!;
      // A stretch's end lies against its neighbor as dropped.
      const nb = flush !== undefined ? layout.items[flush] : undefined;
      if (nb && Math.abs(lo(nb.rect, axis) + len(nb.rect, axis) + gap - lo(landed.rect, axis)) > 1 && Math.abs(lo(landed.rect, axis) + len(landed.rect, axis) + gap - lo(nb.rect, axis)) > 1) return false;
      const n = neighbors(layout, e.id, dragged, axis);
      if (taken.some((r) => Math.abs(lo(r, axis) - lo(landed.rect, axis)) < pitch / 2)) return true;
      taken.push(landed.rect);
      const result = { state: next, layout };
      const kept = Math.round(next.items[dragged]?.space ?? 0);
      const target: DockDrop = { id: `pitch:${e.id}:${zone}:${at}:${Math.round(space)}`, priority: 2, hit: landed.rect, slot: landed.rect, item: dragged, place: { kind: "gap", edge: e.id, zone, at }, after: () => result };
      // Keyed by its neighbors and how many pitches it keeps from the one it is spaced from (a stretch's end keeping
      // some: the neighbor it lies against): stable while they stay.
      const id = `${e.id}/${zone}/${n.before}|${n.next}@${flush !== undefined && kept > 0 ? `to:${flush}` : Math.round(kept / pitch)}`;
      out.push({ lane: e.id, edge: e.id, axis, id, ...n, landing: landed.rect, layout, target, hit: landed.rect, pitched: true });
      return true;
    };
    return ({ a, b, w, zones, atOf, spaceAt, before, after }) => {
      // The stretch's two ends, the item flush against each neighbor (or the edge's end), the near zone first. Each is a
      // spot of the stretch's own: on the held item's own stretch the plain dock beside a neighbor is its own place.
      const end = (x0: number, order: readonly Zone[], flush: string): void => {
        for (const zone of order) if (spaceAt(zone, x0) >= -EPS && emit(zone, atOf(zone), Math.max(0, spaceAt(zone, x0)), x0, flush)) return;
      };
      end(a, zones, before?.id ?? "^");
      if (b - w > a + EPS) end(b - w, [...zones].reverse(), after?.id ?? "$");
      if (b - a < w + pitch) return;
      for (let x0 = a + pitch; x0 + w <= b - pitch + EPS; x0 += pitch) {
        const zone: Zone = x0 + w / 2 < middle ? "start" : "end";
        if (!zones.includes(zone)) continue;
        emit(zone, atOf(zone), spaceAt(zone, x0), x0);
      }
    };
  });
  return out;
}

/** One bar or toolbar rail as its free stretches read it (`SlideEdge`), with its gap and the spots it already has. */
interface StretchEdge extends SlideEdge {
  readonly gap: number;
  /** The spots this edge already has (from `targets()`). */
  readonly mine: readonly Raw[];
}

/**
 * One free stretch: the room a drop between two neighbors makes (`slideRoom`: flush after the neighbor before it, flush
 * before the one after it, each in the form the drop leaves it in), the zones a dock there takes, and its place.
 */
interface Stretch extends Omit<SlideRoom, "before" | "after"> {
  /** The neighbors either side, as the drop finds them (the held item lifted), drawn as seen. */
  readonly before: { readonly id: string; readonly r: Rect } | undefined;
  readonly after: { readonly id: string; readonly r: Rect } | undefined;
  /** The room itself, as `slideRange` reads it. */
  readonly room: SlideRoom;
}

/**
 * Every free stretch of every bar and toolbar rail (a compact edge) that has spots, in order along each: between the
 * items as the drop finds them, the layout with the held item lifted. Its room goes back to its stretch (a placed
 * neighbor stays where it is drawn, `lift`), so every other item lies where the person sees it. A stretch is the room
 * a drop there makes, not only the room as seen: where the edge has no room for the item beside a neighbor's form as
 * seen, the drop steps that neighbor (or another item) down to a shorter form, and the stretch runs from flush after
 * the neighbor before it to flush before the one after it as the drop leaves them. `lifted` is `liftedLayout`'s, solved
 * once per lift. `visit` is called once per edge and gives what to do with each of its stretches.
 */
function stretches(state: DockState, dragged: string, options: DockLaneOptions, seen: DockLayout, lifted: DockLayout, raws: readonly Raw[], visit: (edge: StretchEdge) => (stretch: Stretch) => void): void {
  if (!state.items[dragged]) return;
  const prev = options.previous ? { previous: options.previous } : {};
  const base = lifted;
  for (const e of state.edges) {
    const bar = e.side === "top" || e.side === "bottom";
    if (!bar && !e.compact) continue;
    const axis: Axis = bar ? "x" : "y";
    const mine = raws.filter((r) => r.edge === e.id);
    const drawn = base.edges[e.id] ?? seen.edges[e.id];
    if (mine.length === 0 || !drawn) continue;
    const others = onEdge(base, e.id, dragged, axis);
    const run: StretchEdge = { state, dragged, e, axis, base, drawn: drawn.rect, gap: nonNeg(e.gap), middle: mid(drawn.rect, axis), mine, fixed: others.filter((o) => state.items[o.id]?.fixed), prev };
    const each = visit(run);
    // The held item's length where no dock in a stretch lands there: a landing on this edge.
    const w = len(mine[0]!.landing, axis);
    for (let i = 0; i <= others.length; i++) {
      const before = others[i - 1];
      const after = others[i];
      // The room the drop makes, not only the room as seen (`slideRoom`): a dock here keeping no space, laid out, its
      // neighbors in the forms it leaves them in (a neighbor steps down to a shorter form where the edge has no room for
      // the item beside its form as seen) and the item in its own. The forms don't depend on the space a dock keeps
      // (space comes out of the spare length), so every dock in the stretch finds them so. The one room the tiles cut
      // a place over free room from.
      const room = slideRoom(run, before?.id, after?.id, others.slice(0, i).map((o) => o.id), w);
      if (room) each({ ...room, before, after, room });
    }
  }
}

/**
 * Where the pointer stops decides: over a stretch's free room a dock consumes the room (its ends and pitched or sliding
 * spots, the neighbors staying put), and over a neighbor itself the item takes that neighbor's place and the neighbor
 * gives way by the item's length. These are the takeover spots, one per neighbor of a stretch on its zone's side: the
 * item at the start of the start-zone item after the stretch, or at the end of the end-zone item before it, keeping the
 * space that puts it there (the neighbor keeps no room, `moveTo`). So passing a neighbor longer than the room beside
 * it, the landings either side are never further apart than the item, and the item stays at the hand. Kept where it
 * lands there with every fixed item kept and not on another spot's landing.
 */
function takeoverSpots(state: DockState, dragged: string, options: DockLaneOptions, seen: DockLayout, lifted: DockLayout, raws: readonly Raw[], pitch: number): Raw[] {
  const out: Raw[] = [];
  stretches(state, dragged, options, seen, lifted, raws, (run) => {
    const { e, axis } = run;
    const taken = [...run.mine.map((r) => r.landing)];
    const emit = (zone: Zone, at: number, space: number, x0: number, nb: string): void => {
      const hit = landsAt(run, { edge: e.id, zone, at, space }, x0);
      if (!hit) return;
      const { next, layout } = hit;
      const landed = layout.items[dragged]!;
      if (taken.some((r) => Math.abs(lo(r, axis) - lo(landed.rect, axis)) < pitch / 2)) return;
      taken.push(landed.rect);
      const n = neighbors(layout, e.id, dragged, axis);
      const result = { state: next, layout };
      const target: DockDrop = { id: `pitch:${e.id}:${zone}:${at}:in:${nb}`, priority: 2, hit: landed.rect, slot: landed.rect, item: dragged, place: { kind: "gap", edge: e.id, zone, at }, after: () => result };
      out.push({ lane: e.id, edge: e.id, axis, id: `${e.id}/${zone}/${n.before}|${n.next}@in:${nb}`, ...n, landing: landed.rect, layout, target, hit: landed.rect });
    };
    return ({ w, zones, atOf, spaceAt, before, after }) => {
      // A neighbor's zone is where it lies (`zoneIn`), not its stored `align`: one whose zone takes no item of its kind
      // lies in another.
      const zoneOf = (id: string): Zone => zoneIn(run.base, id);
      // The item at the start of the start-zone neighbor after the stretch.
      if (after && zones.includes("start") && zoneOf(after.id) === "start" && !state.items[after.id]?.fixed) {
        const x0 = lo(after.r, axis);
        emit("start", atOf("start"), Math.max(0, spaceAt("start", x0)), x0, after.id);
      }
      // The item at the end of the end-zone neighbor before it.
      if (before && zones.includes("end") && zoneOf(before.id) === "end" && !state.items[before.id]?.fixed) {
        const x0 = lo(before.r, axis) + len(before.r, axis) - w;
        emit("end", atOf("end"), Math.max(0, spaceAt("end", x0)), x0, before.id);
      }
    };
  });
  return out;
}

/**
 * One sliding spot per free stretch of a bar or a toolbar rail (`stretchPositions: "free"`): the same stretches as
 * `pitchedSpots` (between the items as the drop finds them with the held item lifted, in the forms the drop leaves them
 * in, a start zone after a start item or the edge's start, an end zone before an end item or the edge's end), as one
 * range of landings from flush against the neighbor
 * before it to flush against the one after it. A landing is a dock keeping the `space` that puts the item there: in the
 * start zone left of the edge's middle, the end zone right of it (the other where the stretch has only one). The range
 * holds the landings that land where they were aimed (within 1 px) with every fixed item kept, checked at its ends and
 * every `sample` px between. The docks that land inside it with its neighbors either side (the item's own place, a plain
 * dock, a center dock) are taken over: each is a snap point that commits that dock as it is, so a center dock's snap
 * moves its center neighbor by design (the center zone re-centers its items), where a plain dock leaves its neighbors
 * put. A stretch is the room the drop makes (`stretches`: a neighbor stepping down to a shorter form counts). One
 * shorter than the item has none, nor one bounded on both sides by zones the item cannot dock in (no
 * start-zone item or edge start before it, no end-zone item or edge end after it: no zone can take it); next to a center
 * item a stretch still has one wherever a zone can take the item, and its plain docks stay spots of their own where it
 * has none.
 */
function slidingSpots(state: DockState, dragged: string, options: DockLaneOptions, seen: DockLayout, lifted: DockLayout, raws: readonly Raw[], sample: number, grabs: (grab: DockGrab | undefined) => Grab): { spots: Raw[]; absorbed: Set<Raw> } {
  const spots: Raw[] = [];
  const absorbed = new Set<Raw>();
  const snapDistance = Number.isFinite(options.snapDistance) && options.snapDistance! >= 0 ? options.snapDistance! : SNAP_DISTANCE;
  const own = landedLayout(state, seen, dragged, options.previous ? { previous: options.previous } : {}).items[dragged];
  const ownEdge = own && !own.floating && !own.inMenu ? own.edge : undefined;
  stretches(state, dragged, options, seen, lifted, raws, (run) => ({ w, zones, atOf, spaceAt, before, after, room }) => {
    const { e, axis, mine } = run;
    // (A stretch shorter than the item still offers its start, flush after the neighbor before it, where a dock there
    // lands: a point, below, as a pitched stretch's end gives it.)
    if (zones.length === 0) return;
    {
      // The range (`slideRange`): the landings that land where aimed, at its ends and every `sample` px between. The one
      // range the tiles cut a place over free room from.
      const range = slideRange(run, room, sample);
      if (!range) return;
      const { from, to, land } = range;
      const bId = before?.id ?? "^";
      const nId = after?.id ?? "$";
      // Room for the item at a single start (no room past it, or a range under a pixel, the grain a free start lands on:
      // `STEP`) is a point, no range: a plain dock there, as a pitched stretch's end gives, unless one lands there already
      // (the item's own place, say), which stays a spot of its own. Every landing a room offers has a spot.
      if (to - from < STEP) {
        if (mine.some((r) => !r.slide && Math.abs(lo(r.landing, axis) - from) <= 1)) return;
        // Its zone as a pitched stretch's end takes it: the start zone first (flush after the neighbor before it).
        const firstZone = ((): { place: DockPlace; result: DropResult } | null => {
          for (const zone of zones) {
            const space = spaceAt(zone, from);
            if (space < -EPS) continue;
            const place: DockPlace = { edge: e.id, zone, at: atOf(zone), space: Math.max(0, space) };
            const hit = landsAt(run, place, from);
            if (hit) return { place, result: { state: hit.next, layout: hit.layout } };
          }
          return null;
        })();
        const { place, result } = firstZone ?? range.start;
        const landed = result.layout.items[dragged]!.rect;
        const n = neighbors(result.layout, e.id, dragged, axis);
        const zone = place.zone as Zone;
        const isHome = ownEdge === e.id && !!own && Math.abs(lo(own.rect, axis) - lo(landed, axis)) <= 1 && Math.abs(len(own.rect, axis) - len(landed, axis)) <= 1;
        const target: DockDrop = { id: `pitch:${e.id}:${zone}:${place.at}:${Math.round(place.space ?? 0)}`, priority: 2, hit: landed, slot: landed, item: dragged, place: { kind: "gap", edge: e.id, zone, at: place.at }, after: () => result };
        // Its id: the plain dock's, or where a dock between the same neighbors has that one (landing elsewhere, the item
        // in another form), a pitched spot's (`@<pitches kept>`).
        const plain = `${e.id}/${zone}/${n.before}|${n.next}`;
        const id = mine.some((r) => r.id === plain) ? `${plain}@${Math.round((place.space ?? 0) / sample)}` : plain;
        spots.push({ lane: e.id, edge: e.id, axis, id, ...n, landing: landed, layout: result.layout, target, hit: landed, ...(isHome ? { home: true as const } : {}) });
        return;
      }
      // The docks landing inside it, its neighbors either side: snap points that commit as they are.
      const inside = mine.filter((r) => !r.slide && r.before === bId && r.next === nId && Math.abs(len(r.landing, axis) - w) <= 1 && lo(r.landing, axis) >= from - 1 && lo(r.landing, axis) <= to + 1);
      for (const r of inside) absorbed.add(r);
      const homeRaw = inside.find((r) => r.home);
      // Snap points are keyed by what they commit: a taken-over dock as it is (`raw`), else the plain dock at that start.
      // Two points are one only where they lie on the same start, the taken-over dock then winning (the item's own place
      // first), so a dock that lies near an end without lying on it keeps its own point and stays reachable.
      const points: { at: number; raw?: Raw }[] = [];
      const put = (at: number, raw?: Raw): void => {
        const same = points.find((p) => Math.abs(p.at - at) < 1e-6);
        if (!same) points.push({ at, ...(raw ? { raw } : {}) });
        else if (raw && !same.raw) same.raw = raw;
      };
      put(from);
      put(to);
      // Two docks at one start: the item's own place first, then the dock in the zone of the neighbor before the stretch
      // (a drop flush after the last start-zone item stays in the start zone), as the tiles break it (`./targets/tiles`).
      const beforeZone = zoneIn(run.base, before?.id);
      const rank = (r: Raw): number => (r.home ? 0 : r.target.place.kind === "gap" && r.target.place.zone === beforeZone ? 1 : 2);
      for (const r of [...inside].sort((p, q) => rank(p) - rank(q))) put(lo(r.landing, axis), r);
      // The item's own place wins near it: no other snap point within twice the snap distance of it, so every start
      // within the snap distance of home snaps home (a press, a wobble and a release is home).
      const homeAt = homeRaw ? lo(homeRaw.landing, axis) : undefined;
      const kept = points.filter((p) => homeAt === undefined || Math.abs(p.at - homeAt) < 1e-6 || Math.abs(p.at - homeAt) > 2 * snapDistance).sort((p, q) => p.at - q.at);
      const snaps = kept.map((p) => p.at);
      /** The taken-over dock that commits at `x0`, if `x0` is a snap point of one. */
      const dockAt = (x0: number): Raw | undefined => kept.find((p) => Math.abs(p.at - x0) < 1e-6)?.raw;
      const { at } = range;
      /** The nearest snap point to `x0` within the snap distance, else `x0`. */
      const snapped = (x0: number): number => {
        let best = x0;
        let d = Infinity;
        for (const q of snaps) if (Math.abs(q - x0) <= snapDistance && Math.abs(q - x0) < d) [best, d] = [q, Math.abs(q - x0)];
        return best;
      };
      /** The start a pointer holding the item at `raw` lands at: `LaneSlide.step`'s rule, read by the landing model too. */
      const startAt = (raw: number): number => {
        const c = clamp(raw, from, to);
        const s = snapped(c);
        return snaps.includes(s) ? s : clamp(Math.round(c / STEP) * STEP, from, to);
      };
      const results = new Map<string, DropResult>();
      /** What a drop with the item's start at `x0` commits: a taken-over dock's own drop there, else the dock to `x0`. */
      const commitAt = (x0: number): DropResult => {
        const r = dockAt(x0);
        const k = `${r ? "dock " : ""}${Math.round(x0 * 1000) / 1000}`;
        const known = results.get(k);
        if (known) return known;
        const result = r ? r.target.after(ORIGIN, ORIGIN) : (land(x0) ?? range.nearest(x0)).result;
        results.set(k, result);
        return result;
      };
      // The landing as listed: at the item's own place where it lies here, else the stretch's point nearest it, else
      // its start.
      const rest = homeRaw ? lo(homeRaw.landing, axis) : ownEdge === e.id && own ? snapped(clamp(lo(own.rect, axis), from, to)) : from;
      const restResult = commitAt(rest);
      // Its place is the dock at that landing: the item's own (its zone and index) where it rests at home, a taken-over
      // dock's own, else the plain dock there.
      const ownZone = own?.zone as Zone | undefined;
      const restPlace = ((): { zone?: Zone; at: number; space?: number } | undefined => {
        if (homeRaw) return ownZone && zones.includes(ownZone) ? { zone: ownZone, at: atOf(ownZone), space: Math.max(0, spaceAt(ownZone, rest)) } : land(rest)?.place;
        const p = dockAt(rest)?.target.place;
        return p && p.kind === "gap" ? p : land(rest)?.place;
      })();
      const landing = homeRaw ? homeRaw.landing : (restResult.layout.items[dragged]?.rect ?? at(rest));
      // The grab in the form the item takes in the stretch (its listed landing's form, at its own length there, `w`, by
      // its landing's cross); a landing that lies in another form is aimed once more (`aimOnce`), never again.
      const restLaid: DockItemLayout | undefined = restResult.layout.items[dragged];
      const cross = restLaid?.rect ?? landing;
      const inStretch = axis === "x" ? { width: w, height: cross.height } : { width: cross.width, height: w };
      const aimed = new Map<string, DropResult>();
      const withGrab = (r: DropResult, g: Point, x0: number): DropResult => {
        const k = `${Math.round(x0 * 1000) / 1000} ${g.x} ${g.y}`;
        let out = aimed.get(k);
        if (!out || out.state !== r.state) aimed.set(k, (out = { ...r, grab: g }));
        return out;
      };
      const target: DockDrop = {
        id: `slide:${e.id}:${bId}|${nId}`,
        priority: 2,
        hit: hull(at(from), at(to)),
        slot: landing,
        item: dragged,
        place: { kind: "gap", edge: e.id, zone: restPlace?.zone ?? zones[0]!, at: restPlace?.at ?? atOf(zones[0]!), ...(restPlace?.space ? { space: restPlace.space } : {}) },
        after: (point: Point, grab?: DockGrab) => {
          const p = axis === "x" ? point.x : point.y;
          // The start the pointer less the grab puts it at, and what that commits; re-aimed at most once (`aimOnce`).
          const aimAt = (g: Point): { x0: number; r: DropResult } => {
            const x0 = startAt(p - g[axis]);
            return { x0, r: commitAt(x0) };
          };
          const { result, grab: g } = aimOnce(grabs(grab), "lane", { laid: restLaid, size: inStretch }, aimAt, (a) => a.r.layout.items[dragged], (l) => sizeOf(l.rect));
          return withGrab(result.r, g, result.x0);
        },
      };
      const zone = zones[0]!;
      spots.push({
        lane: e.id,
        edge: e.id,
        axis,
        id: `${e.id}/${zone}/${bId}|${nId}@slide`,
        before: bId,
        next: nId,
        landing,
        layout: restResult.layout,
        target,
        hit: target.hit,
        ...(homeRaw ? { home: true as const } : {}),
        // Its stretch of the lane is cut from its range's end landings, where its drop lands at the hand: a range that runs
        // into a growing neighbor's slack (the room the drop makes; the neighbor gives way) cuts from there too.
        slide: { from, to, snaps, snapDistance, step: STEP, first: at(from), last: at(to) },
      });
    }
  });
  return { spots, absorbed };
}
