/**
 * The state's pure changes. Each returns a new state and leaves the one it was given as it was; a change that can't
 * apply (an unknown item or edge, a fixed item, a kind the edge or the float layer doesn't take) returns the state
 * given, the same object, so `after === before` says nothing changed.
 *
 * - `moveTo(state, id, { edge, zone?, at })`: docks the item in that edge, before the `at`-th item of the zone (counting
 *   the zone's items without it, closed ones included), or at the zone's end. A zone named becomes the item's `align`
 *   where the edge offers a choice (`namesZone`: more than one zone takes the kind); on a one-zone edge, or with none
 *   named, the item keeps its own and docks in the zone it lies in there (`zoneIn`: its own where the edge takes it
 *   there, else the first that does). A new column, a rail and `dockHome` name none either: the item's zone is its own.
 *   `{ kind: "column", side, ring }` makes a new column from `state.columns[side]` at that ring (`Infinity`: the side's
 *   inner end, "Move to › Dock left"); `{ kind: "rail", side, ring }` does the same with the item folded by hand, so it
 *   shows in the rail (on a side with no declared rail, `DockState.rails`, its rail is its outermost column that takes the
 *   kind, "the column drawn as a rail": the item docks at the end of its start zone as a collapsed header, folded by
 *   hand, a rail tile once nothing there sets the width); `{ kind: "float", rect?, anchor? }` floats it. A dynamic column an item leaves empty is deleted
 *   and its side's rings are closed up.
 * - `homeFor(state, id, start)`: the place a start state gives the item, for `moveTo`.
 * - `floatAt(state, id, rect?, orient?)`: floats it on top at `rect` (its size becomes its `floatSizes` for the orient
 *   it floats in); with no rect, at its `floatSizeOf` size anchored to the content's top-right corner: its `floatSizes`
 *   for that orient, else its form's natural size along it (the float's, `orient`, else `floatOrientOf`), else the
 *   default size.
 * - `foldItem(state, id, on)`: folded by hand (`from: 1`) draws it in its folded form on the axis it lies along (a
 *   panel's `header`, a group's `fold`), and give-way steps down from there; unfolding clears `from`. Where it has no
 *   folded form (`canFold` false), folding changes nothing.
 * - `markUsed(state, id)`: the newest age. Under `previous` it reshapes nothing.
 * - `keepItem(state, id, on)`, `openItem(state, id)`, `closeItem(state, id)`, `liftItem(state, id)` (out of every edge
 *   and float).
 * - `raiseFloat(state, id)`: a float to the top of the stack; no use, no reshape.
 * - `orientFloat(state, id, orient)`: a float's axis. Its frame takes the size the new orient draws it at
 *   (`floatSizeOf`: the size kept for that orient, else the form's natural size), its place and anchor kept; turned
 *   back, it has its first orient's size again. An item that declares no `floatSizes` turns keeping its rect, as before
 *   the per-orient sizes.
 * - `resizeEdge(state, edge, size)`: the user's size across; a size that isn't a finite number clears it.
 * - `resizeFloat(state, id, rect, moving?)`: a float resized by hand, at `fitResize`'s rect (./float-resize).
 */
import { clampInto, type Rect, type Size } from "@n-uf/placement";
import { fitResize, type ResizeEdges } from "./float-resize";
import { axesOf, axisOf, columnFromTemplate, declaresFloatSizes, floatOrientOf, placingOf, floatShape, floatSizeOf, floatSizesOf, foldedIndex, formsOf, isHandFolded, isSideColumn, isSince, namesZone, railColumnOf, railModeOf, sizedByHand, zoneIn, zoneTakes } from "./helpers";
import { solve } from "./solve";
import { RAIL_MODES, type DockEdge, type FloatAnchorAt, type Orient, type RailMode, type DockState, type DockFloat, type DockItem, type Side, type Zone } from "./model";

/**
 * Where a docked item goes: before the `at`-th item of `zone` (default the item's own zone) in `edge`, keeping `space`
 * px free on its zone's open side (`DockItem.space`; absent or 0: none). Docked into the room a placed neighbor keeps,
 * it consumes that room: the neighbor keeps what is left and moves only by what the room lacks. (While the edge has
 * spare length to give every room; a squeezed edge shares its spare out, and its items may shift by a few px.)
 */
export interface DockPlace {
  readonly kind?: "gap";
  readonly edge: string;
  readonly zone?: Zone;
  readonly at: number;
  readonly space?: number;
}
/** A new column on `side` at `ring` (the edges at that ring and inward move in one); `Infinity` is the side's inner end. */
export interface ColumnPlace {
  readonly kind: "column";
  readonly side: "left" | "right";
  readonly ring: number;
}
/** Docked folded: a new column at `ring` holding the item folded by hand, so it shows in the side's rail. */
export interface RailPlace {
  readonly kind: "rail";
  readonly side: "left" | "right";
  readonly ring: number;
}
/** Floating at `rect` (or, with none, at its last size anchored to the content). */
export interface FloatPlace {
  readonly kind: "float";
  readonly rect?: Rect;
  /** Following the content (only its size counts then), at an anchor's name or `{ at, dx?, dy? }`. */
  readonly anchor?: FloatAnchorAt;
  /** With `rect` and no anchor: it lies there over what it covers, only kept inside the stage (`DockFloat.stays`). */
  readonly stays?: true;
}
export type Place = DockPlace | ColumnPlace | RailPlace | FloatPlace;

const withItem = (state: DockState, item: DockItem): DockState => ({ ...state, items: { ...state.items, [item.id]: item } });
const itemOf = (state: DockState, id: string): DockItem | undefined => (Object.hasOwn(state.items, id) ? state.items[id] : undefined);

/** The side's edges with their rings closed up to 0, 1, 2… in their order (ring, then list order). */
export function closeRings(edges: readonly DockEdge[], sides: ReadonlySet<string>): DockEdge[] {
  const out = [...edges];
  for (const side of sides) {
    const idx = out.map((e, i) => ({ e, i })).filter((x) => x.e.side === side);
    idx.sort((a, b) => (a.e.ring === b.e.ring ? a.i - b.i : a.e.ring < b.e.ring ? -1 : 1));
    idx.forEach((x, ring) => {
      if (x.e.ring !== ring) out[x.i] = { ...x.e, ring };
    });
  }
  return out;
}

/** Dynamic columns left with no item are deleted, and their sides' rings closed up. */
export function prune(state: DockState): DockState {
  const gone = state.edges.filter((e) => e.column === true && e.items.length === 0);
  if (gone.length === 0) return state;
  const sides = new Set(gone.map((e) => e.side));
  return { ...state, edges: closeRings(state.edges.filter((e) => !gone.includes(e)), sides) };
}

/**
 * Each side's columns (`isSideColumn`) merged into one, for `DockState.sideColumns: "one"`: the outermost column (by ring)
 * keeps its id and takes every other column's items after its own, in ring order; the others are deleted and the side's
 * rings closed up. A side with one column or none is unchanged; the same state comes back when nothing merges. A host
 * calls it as it reads a stored layout, so what it stores is what it shows and what a drag reads.
 */
export function mergeSideColumns(state: DockState): DockState {
  let edges = [...state.edges];
  const sides = new Set<string>();
  for (const side of ["left", "right"] as const) {
    const cols = edges.filter((e) => e.side === side && isSideColumn(state, e)).sort((a, b) => a.ring - b.ring);
    if (cols.length < 2) continue;
    const [keep, ...rest] = cols;
    const merged: DockEdge = { ...keep!, items: [...keep!.items, ...rest.flatMap((e) => e.items)] };
    edges = edges.filter((e) => !rest.includes(e)).map((e) => (e === keep ? merged : e));
    sides.add(side);
  }
  return sides.size === 0 ? state : { ...state, edges: closeRings(edges, sides) };
}

/**
 * The state with the item out of every edge and every float (a dynamic column it leaves empty is deleted). The room it
 * held goes back to its stretch: the first placed item past it, away from its zone's own end (`DockItem.space`), takes
 * it back, so it stays where it was drawn; the flush items between close up toward the zone's own end. (While the edge
 * has spare length to give every room; a squeezed edge, or items stepping up to wider forms, may shift it by a few px.)
 */
export function liftItem(state: DockState, id: string): DockState {
  const inEdge = state.edges.some((e) => e.items.includes(id));
  const inFloat = state.floats.some((f) => f.id === id);
  if (!inEdge && !inFloat) return state;
  let s = state;
  const from = state.edges.find((e) => e.items.includes(id));
  const owner = from ? roomOwner(state, from, from.items.indexOf(id)) : undefined;
  if (from && owner) {
    const length = lengthOn(state, from, id);
    if (length > 0) s = withSpace(s, owner, (state.items[owner]!.space ?? 0) + (state.items[id]?.space ?? 0) + length + nonNegative(from.gap));
  }
  return prune({
    ...s,
    edges: inEdge ? s.edges.map((e) => (e.items.includes(id) ? { ...e, items: e.items.filter((x) => x !== id) } : e)) : s.edges,
    floats: inFloat ? s.floats.filter((f) => f.id !== id) : s.floats,
  });
}

/**
 * The placed item that absorbs a change at `edge.items[k]`: away from the zone's own end (after the item in a start
 * zone, before it in an end zone), past the flush items that follow it, the first that keeps room (`DockItem.space`:
 * before an item in a start zone, after it in an end zone). The flush items between move with the change; the room
 * owner's room takes it, so it stays where it is. None in a center zone or where no placed item follows in the zone.
 */
function roomOwner(state: DockState, edge: DockEdge, k: number): string | undefined {
  const id = edge.items[k];
  if (id === undefined) return undefined;
  const zone = zoneAt(state, edge, id);
  if (zone === "center") return undefined;
  const step = zone === "start" ? 1 : -1;
  // The edge's list may hold zones in any order (the solver sorts by zone): another zone's items, and closed items
  // (they take no room), are passed over.
  for (let j = k + step; j >= 0 && j < edge.items.length; j += step) {
    const nb = edge.items[j]!;
    if (zoneAt(state, edge, nb) !== zone || state.items[nb]?.closed) continue;
    if ((state.items[nb]?.space ?? 0) > 0) return nb;
  }
  return undefined;
}

/** The item's length along `edge` as `state` lays it out (0 where it isn't drawn on that edge). */
function lengthOn(state: DockState, edge: DockEdge, id: string): number {
  const it = solve(state).items[id];
  if (!it || it.inMenu || it.edge !== edge.id) return 0;
  return axisOf(edge.side) === "column" ? it.rect.height : it.rect.width;
}

const nonNegative = (n: number | undefined): number => (Number.isFinite(n) && n! > 0 ? n! : 0);

/** The state with the item keeping `space` (none at 0 or less). */
function withSpace(state: DockState, id: string, space: number): DockState {
  const { space: _old, ...bare } = state.items[id]!;
  return { ...state, items: { ...state.items, [id]: space > 1e-6 ? { ...bare, space } : bare } };
}

/**
 * A new column edge from the side's template, or null when the side has none or it doesn't take the kind. Its id is
 * chosen against the state's edges and `others`: edges kept out of `state` (its hidden ones, when `state` is what the
 * window shows), so it never repeats an id the stored state has.
 */
function newColumn(state: DockState, side: "left" | "right", kind: string, ring: number, items: readonly string[], others: readonly DockEdge[]): DockEdge | null {
  const t = state.columns?.[side];
  if (!t || !t.accepts.includes(kind)) return null;
  const taken = new Set([...state.edges, ...others].map((e) => e.id));
  let n = 0;
  while (taken.has(`${side}-${n}`)) n++;
  return columnFromTemplate(t, `${side}-${n}`, side, ring, items);
}

/**
 * The rings of a side's edges as they lie, outer first, 0 up with no ties (by ring, then by their order in the state):
 * the numbers column and rail places count in.
 */
export function sideRings(edges: readonly DockEdge[], side: string): Map<string, number> {
  return new Map(closeRings(edges, new Set([side])).filter((e) => e.side === side).map((e) => [e.id, e.ring]));
}

/** The first ring a new column may take on `side`: inside every static edge outer to the side's dynamic columns. */
function columnFloor(edges: readonly DockEdge[], side: string): number {
  const mine = edges.filter((e) => e.side === side).sort((a, b) => a.ring - b.ring);
  let n = 0;
  while (n < mine.length && mine[n]!.column !== true) n++;
  // With no dynamic column, every static edge on the side is outer to the new one.
  return n;
}

/**
 * `state` with a new column holding `id` at `ring` on `side` (already lifted out). The side's rings are made distinct
 * first; static edges keep their place, so a new column goes no further out than just inside the static edges outer to
 * the side's dynamic columns (a bar or an anchor at the window edge stays there).
 */
function insertColumn(state0: DockState, id: string, side: "left" | "right", ring: number, others: readonly DockEdge[]): DockState | null {
  const state: DockState = { ...state0, edges: closeRings(state0.edges, new Set([side])) };
  const kind = state.items[id]!.kind;
  const mine = state.edges.filter((e) => e.side === side);
  const floor = columnFloor(state.edges, side);
  const r = Math.max(floor, Math.min(Number.isNaN(ring) ? Infinity : Math.floor(ring), mine.length === 0 ? 0 : Math.max(...mine.map((e) => e.ring)) + 1));
  const col = newColumn(state, side, kind, r, [id], others);
  if (!col) return null;
  // A kind never opens a column on its own unless the column's start zone takes it (a group never opens a panel column
  // whose tray is its end zone).
  if (!zoneTakes(col, "start", kind)) return null;
  // The item keeps its own zone (`align`): it lies in it where the new column takes it there, else in the first zone
  // that does (`zoneIn`), as in any edge.
  const shifted = state.edges.map((e) => (e.side === side && e.ring >= r ? { ...e, ring: e.ring + 1 } : e));
  return { ...state, edges: closeRings([...shifted, col], new Set([side])) };
}

/** The zone item `id` lies in on `edge` (`zoneIn`); its own when it is unknown. */
const zoneAt = (state: DockState, edge: DockEdge, id: string): Zone => {
  const it = itemOf(state, id);
  return it ? zoneIn(edge, it) : "start";
};

/** The index in `edge.items` where the `at`-th item of `zone` is (or where the zone ends), by the zones items lie in. */
function insertIndex(state: DockState, edge: DockEdge, zone: Zone, at: number): number {
  const rank = { start: 0, center: 1, end: 2 } as const;
  const inZone = edge.items.map((id, i) => ({ id, i })).filter((x) => zoneAt(state, edge, x.id) === zone);
  const k = Math.min(Math.max(0, Math.floor(Number.isFinite(at) ? at : inZone.length)), inZone.length);
  if (k < inZone.length) return inZone[k]!.i;
  if (inZone.length > 0) return inZone[inZone.length - 1]!.i + 1;
  // An empty zone: after the last item of an earlier zone, else before the first of a later one.
  let idx = 0;
  edge.items.forEach((id, i) => {
    if (rank[zoneAt(state, edge, id)] < rank[zone]) idx = i + 1;
  });
  return idx;
}

export function moveTo(state: DockState, id: string, place: Place): DockState {
  return moveAmong(state, id, place, []);
}

/**
 * `moveTo`, with `others`: edges kept out of `state` that a new column's id must not repeat. A drop's result is made on
 * the state the window shows (its hidden edges left out), and its hidden edges are passed here.
 */
export function moveAmong(state: DockState, id: string, place: Place, others: readonly DockEdge[]): DockState {
  const item = itemOf(state, id);
  if (!item || item.fixed) return state;
  if (place.kind === "float") {
    const out = floatAt(state, id, place.rect);
    const anchor = place.anchor;
    // Left over content by the hand (`DockFloat.stays`): only with a rect of its own.
    const stays = place.stays === true && !anchor && !!place.rect;
    if ((!anchor && !stays) || out === state) return out;
    return { ...out, floats: out.floats.map((f) => (f.id === id ? (anchor ? { ...f, anchor } : { ...f, stays: true as const }) : f)) };
  }
  // A side with no declared rail: its rail is its outermost column that takes the kind (`railColumnOf`), the item docked
  // at the end of the zone it lies in there (its own where the column takes it there, else the first), folded by hand.
  // The rail names no zone: the item keeps its own.
  const railColumn = place.kind === "rail" ? railColumnOf(state, place.side, item.kind) : undefined;
  if (railColumn) {
    const docked = moveAmong(state, id, { edge: railColumn.id, at: Infinity }, others);
    return docked === state ? state : withItem(docked, { ...docked.items[id]!, from: Math.max(1, item.from ?? 0) });
  }
  if (place.kind === "column" || place.kind === "rail") {
    if (place.kind === "rail" && !state.rails?.[place.side]?.accepts.includes(item.kind)) return state;
    // Its zone goes with it: `insertColumn` keeps it where the new column takes the kind there.
    // A new column keeps no bar space (`DockItem.space`).
    const { space: _space, ...unspaced } = item;
    const folded: DockItem = place.kind === "rail" ? { ...unspaced, from: Math.max(1, item.from ?? 0) } : unspaced;
    const made = insertColumn(withItem(liftItem(state, id), folded), id, place.side, place.ring, others);
    return made ?? state;
  }
  const edge = state.edges.find((e) => e.id === place.edge);
  // A hidden edge takes nothing, as one that doesn't take the kind.
  if (!edge || edge.hidden === true || !edge.accepts.includes(item.kind)) return state;
  // The zone asked for, else the one it lies in there (`zoneIn`: its own, or the first that takes its kind), must take
  // the kind (`zoneAccepts`). The item's zone is its own fact: a zone asked for becomes its `align` only where the edge
  // offers a choice (`namesZone`: more than one of its zones takes the kind). On a one-zone edge (a rail that takes the
  // kind at its start only) it docks in that zone and keeps its own.
  const zone = place.zone ?? zoneIn(edge, item);
  if (!zoneTakes(edge, zone, item.kind)) return state;
  // A dock move keeps the space it names, or none.
  const { space: _space, ...unspaced } = item;
  const { align: _drop, ...rest } = unspaced;
  const kept = Number.isFinite(place.space) && place.space! > 0 ? { space: place.space! } : {};
  const moved: DockItem = { ...(place.zone === undefined || !namesZone(edge, item.kind) ? unspaced : zone === "start" ? rest : { ...rest, align: zone }), ...kept };
  const lifted = withItem(liftItem(state, id), moved);
  const target = lifted.edges.find((e) => e.id === place.edge);
  // The item's own column, deleted when it was lifted out of it.
  if (!target) return state;
  const k = insertIndex(lifted, target, zone, place.at);
  const into = { ...target, items: [...target.items.slice(0, k), id, ...target.items.slice(k)] };
  const placed: DockState = { ...lifted, edges: lifted.edges.map((e) => (e === target ? into : e)) };
  // Docked into the room a placed neighbor keeps (`DockItem.space`): the dock consumes that room. The item lies flush
  // against its zone's own end of the room (its start in a start zone, its end in an end zone), or where its own `space`
  // puts it, and the neighbor keeps what is left, so it moves only by what the room lacks. A flush neighbor is pushed
  // along by the item.
  const owner = roomOwner(placed, into, k);
  if (!owner) return placed;
  const length = lengthOn(placed, into, id);
  if (length <= 0) return placed;
  const room = placed.items[owner]!.space ?? 0;
  return withSpace(placed, owner, room - (placed.items[id]!.space ?? 0) - length - nonNegative(into.gap));
}

/**
 * One more than the largest `since` among the state's floats (a missing or unusable one counts as 0); 1 when there are
 * none. Never past `Number.MAX_SAFE_INTEGER`.
 */
function nextSince(state: DockState): number {
  const most = state.floats.reduce((m, f) => Math.max(m, isSince(f.since) ? f.since : 0), 0);
  return Math.min(most + 1, Number.MAX_SAFE_INTEGER);
}

/** The anchored floats' rects as `state` draws them, remembered per state. */
const anchoredDrawn = new WeakMap<DockState, readonly { readonly id: string; readonly rect: Rect }[]>();

/**
 * Whether `r`, where the hand puts float `id`, lies over an anchored float as drawn now. Only then does the hand's float
 * win over it (a renewed `since`): what the hand covers it wins, what it doesn't cover never moves.
 */
function overAnchored(state: DockState, id: string, r: Rect): boolean {
  if (!state.floats.some((f) => f.anchor && f.id !== id)) return false;
  let drawn = anchoredDrawn.get(state);
  if (!drawn) {
    const l = solve(state);
    drawn = state.floats.filter((f) => f.anchor && l.items[f.id]?.floating).map((f) => ({ id: f.id, rect: l.items[f.id]!.rect }));
    anchoredDrawn.set(state, drawn);
  }
  const touch = 1e-3;
  return drawn.some((d) => d.id !== id && Math.min(r.x + r.width, d.rect.x + d.rect.width) - Math.max(r.x, d.rect.x) > touch && Math.min(r.y + r.height, d.rect.y + d.rect.height) - Math.max(r.y, d.rect.y) > touch);
}

export function floatAt(state: DockState, id: string, at?: Rect, orient?: Orient): DockState {
  const item = itemOf(state, id);
  if (!item || item.fixed || !state.floatKinds.includes(item.kind)) return state;
  const was = state.floats.find((f) => f.id === id);
  const o: Orient | undefined = orient ?? was?.orient;
  const fo = o ?? floatOrientOf(item);
  const size = floatSizeOf(item, fo);
  // Placed at a rect over an anchored float (a drop: the hand placed it there), it comes after every float there, so it
  // wins over that anchored float (`DockFloat.since`); placed clear of every anchored float, or re-anchored with no
  // rect, a float that floats already keeps its `since`, so nothing it doesn't cover moves.
  const since = was && !(at && overAnchored(state, id, at)) ? was.since : nextSince(state);
  const seq = since !== undefined ? { since } : {};
  const float: DockFloat = at
    ? { id, rect: { x: at.x, y: at.y, width: at.width, height: at.height }, ...(o ? { orient: o } : {}), ...seq }
    : { id, rect: { x: 0, y: 0, width: size.width, height: size.height }, anchor: "content-top-right", ...(o ? { orient: o } : {}), ...seq };
  // A float keeps no bar space (`DockItem.space`). Lifted first, as it lies, so the room it held (its own space
  // included) goes back to its stretch.
  const { space: _space, ...unspaced } = item;
  // A rect sets the size for the orient it floats in (`floatSizes`). With no rect, an item that declares none keeps
  // declaring none, framed at its stored rect.
  const set = at && at.width > 0 && at.height > 0 ? { orient: fo, size: { width: at.width, height: at.height } } : undefined;
  const next = set || declaresFloatSizes(item) ? withFloatSizes(unspaced, set) : unspaced;
  const lifted = withItem(liftItem(state, id), next);
  return { ...lifted, floats: [...lifted.floats, float] };
}

/** `item` with its usable `floatSizes`, and `set`'s size kept for its orient when given. */
export function withFloatSizes(item: DockItem, set?: { readonly orient: Orient; readonly size: Size }): DockItem {
  const { floatSizes: _sizes, ...rest } = item;
  const sizes = { ...floatSizesOf(item), ...(set ? { [set.orient]: set.size } : {}) };
  return sizes.row || sizes.column ? { ...rest, floatSizes: sizes } : rest;
}

/**
 * Whether a hand fold of `id` means anything where it lies now: it has a folded form (a panel's `header`, a group's
 * `fold`; a fixed item on a `foldable` edge, a thumbnail anchor, its `rail` tile) among the forms of the axis it lies
 * along (its edge's, its float's orient; either when it lies nowhere). Where it is false, `foldItem(on)` changes nothing: a
 * host leaves the grip's double-click off. An item folded by hand can always be unfolded.
 */
export function canFold(state: DockState, id: string): boolean {
  const item = itemOf(state, id);
  if (!item || (item.fixed && !state.edges.some((e) => e.foldable === true && e.items.includes(id)))) return false;
  // A lent item folds as it is drawn: along the edge it shows in (`placingOf`).
  const edge = placingOf(state, id).edges.find((e) => e.items.includes(id));
  return axesOf(state, id).some((a) => foldedIndex(item, formsOf(item, a), edge) >= 0);
}

export function foldItem(state: DockState, id: string, on: boolean): DockState {
  const item = itemOf(state, id);
  // A fixed item folds only on an edge that allows it (`DockEdge.foldable`).
  if (!item || (item.fixed && !state.edges.some((e) => e.foldable === true && e.items.includes(id)))) return state;
  // Folded by hand (`from: 1`): solve draws it in its folded form on the axis it lies along (`startOf`), never one
  // step down the ladder. With no folded form there, a hand fold is nothing.
  if (on) return isHandFolded(state, id) || !canFold(state, id) ? state : withItem(state, { ...item, from: 1 });
  if (item.from === undefined) return state;
  const { from: _f, ...rest } = item;
  return withItem(state, rest);
}

/** The newest age in the state, plus one. */
const nextAge =(state: DockState): number => Object.values(state.items).reduce((m, it) => Math.max(m, Number.isFinite(it.used) ? it.used : 0), 0) + 1;

/**
 * The item made the newest (`used`: the newest age plus one). Idempotent: an item already strictly newer than every
 * other gives back the state itself, so a press on it changes nothing (a tie with another item is not newest, and
 * bumps). A drop's result is marked used the same way.
 */
export function markUsed(state: DockState, id: string): DockState {
  const item = itemOf(state, id);
  if (!item) return state;
  const age = (it: DockItem): number => (Number.isFinite(it.used) ? it.used : 0);
  if (Number.isFinite(item.used) && Object.values(state.items).every((it) => it.id === id || age(it) < item.used)) return state;
  return withItem(state, { ...item, used: nextAge(state) });
}

export function keepItem(state: DockState, id: string, on: boolean): DockState {
  const item = itemOf(state, id);
  if (!item || !!item.kept === on) return state;
  if (on) return withItem(state, { ...item, kept: true });
  const { kept: _k, ...rest } = item;
  return withItem(state, rest);
}

export function openItem(state: DockState, id: string): DockState {
  const item = itemOf(state, id);
  if (!item || !item.closed) return state;
  const { closed: _c, ...rest } = item;
  return withItem(state, rest);
}

export function closeItem(state: DockState, id: string): DockState {
  const item = itemOf(state, id);
  if (!item || item.closed || item.fixed) return state;
  return withItem(state, { ...item, closed: true });
}

export function raiseFloat(state: DockState, id: string): DockState {
  const i = state.floats.findIndex((f) => f.id === id);
  if (i < 0 || i === state.floats.length - 1) return state;
  return { ...state, floats: [...state.floats.slice(0, i), ...state.floats.slice(i + 1), state.floats[i]!] };
}

export function orientFloat(state: DockState, id: string, to: Orient): DockState {
  const i = state.floats.findIndex((f) => f.id === id);
  const item = state.items[id];
  const f = state.floats[i];
  if (!f || !item) return state;
  const from = f.orient ?? floatOrientOf(item);
  if (from === to) return state;
  // An item that declares no `floatSizes` turns as before the per-orient sizes: its rect kept as it is.
  if (!declaresFloatSizes(item)) return { ...state, floats: state.floats.map((g, k) => (k === i ? { ...g, orient: to } : g)) };
  // The orient it leaves keeps the size it is drawn at where the user sizes it (`sizedByHand`), so turning back
  // restores that rect; a toolbar group's size is its form's, known without being kept.
  const grows = sizedByHand(formsOf(item, from)[0]);
  const kept = withFloatSizes(item, grows && f.rect.width > 0 && f.rect.height > 0 ? { orient: from, size: { width: f.rect.width, height: f.rect.height } } : undefined);
  // The frame takes the size the new orient draws at, where its anchor (if any) already puts it: its place is kept.
  const size = drawnFloatSize(kept, { rect: { ...f.rect, ...floatSizeOf(kept, to) }, orient: to });
  const turned: DockFloat = { ...f, rect: { x: f.rect.x, y: f.rect.y, width: size.width, height: size.height }, orient: to };
  return withItem({ ...state, floats: state.floats.map((g, k) => (k === i ? turned : g)) }, kept);
}

/**
 * A float resized by hand: the rect `fitResize(state, floatId, rect, moving)` gives (default `moving`: right and
 * bottom), so a host's preview from `fitResize` is what this commits. The float keeps its stacking order and orient,
 * loses its anchor, and the size becomes the item's `floatSizes` for that orient (stored with the state). The state
 * given back where `fitResize` refuses (a toolbar group, a folded float, anything not floating).
 */
export function resizeFloat(state: DockState, floatId: string, rect: Rect, moving: ResizeEdges = { right: true, bottom: true }): DockState {
  const fit = fitResize(state, floatId, rect, moving);
  const i = state.floats.findIndex((f) => f.id === floatId);
  const item = itemOf(state, floatId);
  if (!fit || i < 0 || !item) return state;
  const { anchor: _a, ...plain } = state.floats[i]!;
  // A hand resize grown over an anchored float comes after every float there (`DockFloat.since`), so it wins over it;
  // one that stays clear of every anchored float keeps its `since`.
  const renew = overAnchored(state, floatId, fit.rect);
  const float: DockFloat = renew ? { ...plain, rect: fit.rect, since: nextSince(state) } : { ...plain, rect: fit.rect };
  const fo = float.orient ?? floatOrientOf(item);
  return withItem({ ...state, floats: state.floats.map((g, k) => (k === i ? float : g)) }, withFloatSizes(item, { orient: fo, size: { width: fit.rect.width, height: fit.rect.height } }));
}

/** The user's size across an edge; a size that isn't finite clears it. */
export function resizeEdge(state: DockState, edgeId: string, size: number): DockState {
  const edge = state.edges.find((e) => e.id === edgeId);
  if (!edge) return state;
  if (!Number.isFinite(size)) {
    if (edge.size === undefined) return state;
    const { size: _s, ...rest } = edge;
    return { ...state, edges: state.edges.map((e) => (e === edge ? rest : e)) };
  }
  return { ...state, edges: state.edges.map((e) => (e === edge ? { ...e, size } : e)) };
}

/**
 * The side's rails show their items as `mode` (`DockState.railModes`): their titles while they fit, or their tiles only.
 * Unchanged for a side other than left or right, an unknown mode, or the mode the side has already.
 */
export function setRailMode(state: DockState, side: "left" | "right", mode: RailMode): DockState {
  if ((side !== "left" && side !== "right") || !RAIL_MODES.includes(mode) || railModeOf(state, side) === mode) return state;
  return { ...state, railModes: { ...state.railModes, [side]: mode } };
}

/**
 * The edge moved to the other side of its axis (left ⇄ right, top ⇄ bottom), as its side's outermost edge: ring 0, before
 * that side's other edges (whose rings close up behind it; the side it left closes up too). Its items, size and options
 * go with it. Unchanged for an unknown edge, the side it is on, or a side across its axis. Like every change it does not
 * tick the use clock: a host that moves an edge by hand calls `markUsed()` on its items afterwards, as a drop does.
 */
export function setSide(state: DockState, edgeId: string, side: Side): DockState {
  const edge = state.edges.find((e) => e.id === edgeId);
  if (!edge || edge.side === side || axisOf(edge.side) !== axisOf(side)) return state;
  const moved: DockEdge = { ...edge, side, ring: 0 };
  const others = state.edges.filter((e) => e !== edge).map((e) => (e.side === side ? { ...e, ring: e.ring + 1 } : e));
  return { ...state, edges: closeRings([moved, ...others], new Set([edge.side, side])) };
}

/**
 * The place `start` (a state as it began: the host's start or reset state) gives an item, for Dock, Put back and Reset
 * position: its zone and place in the same edge (before the first item that followed it there and is still there), a
 * new column at its ring when its column is gone (a column under the same id that holds none of the start column's
 * items is another column), or its float rect (and anchor). Null when `start` places it nowhere
 * or in an edge `state` no longer has that isn't a column. `moveTo(state, id, place)` puts it there.
 */
export function homeFor(state: DockState, id: string, start: DockState): Place | null {
  for (const e of start.edges) {
    const k = e.items.indexOf(id);
    if (k < 0) continue;
    const own = itemOf(start, id) ?? itemOf(state, id);
    // A dynamic column's id is reused once it is pruned: the edge under that id is home only while it still holds one of
    // the start column's items (the item itself, or another). Static edges match by id.
    const found = state.edges.find((x) => x.id === e.id);
    const here = found && (e.column !== true || found.items.some((x) => e.items.includes(x))) ? found : undefined;
    if (here) {
      // The zone it lies in there, by its start `align` (`zoneIn`); the others by where they lie.
      const zone = own ? zoneIn(here, own) : "start";
      const now = here.items.filter((x) => x !== id && zoneAt(state, here, x) === zone);
      const next = e.items.slice(k + 1).find((x) => now.includes(x));
      return { kind: "gap", edge: e.id, zone, at: next ? now.indexOf(next) : now.length };
    }
    // Its ring as the start state's side lay (no ties); `insertColumn` keeps it inside the static edges outer to it.
    if (e.column === true && (e.side === "left" || e.side === "right")) return { kind: "column", side: e.side, ring: sideRings(start.edges, e.side).get(e.id) ?? e.ring };
    return null;
  }
  const f = start.floats.find((x) => x.id === id);
  if (f) return { kind: "float", rect: f.rect, ...(f.anchor ? { anchor: f.anchor } : f.stays ? { stays: true as const } : {}) };
  return null;
}

/**
 * Dock, Put back and Reset position: the item where `start` (the loaded state) has it, fold included. It goes to
 * `homeFor`'s place and takes `start`'s `from` (unfolded when `start` has none), so a "Move to › rail" (which folds it)
 * followed by Dock brings it back open. The state given back unchanged when `start` places it nowhere.
 */
export function dockHome(state: DockState, id: string, start: DockState): DockState {
  const place = homeFor(state, id, start);
  if (!place) return state;
  // An item already at its home place (the only item of its own column, which `moveTo` can't re-dock into) keeps its
  // place and still takes the start fold.
  const moved = moveTo(state, id, place);
  const item = itemOf(moved, id);
  if (!item) return state;
  // Home names no zone of its own: the item takes `start`'s zone (`align`) back, as its fold.
  const was = itemOf(start, id);
  const from = was?.from;
  let out = item;
  if (was && out.align !== was.align) {
    const { align: _a, ...plain } = out;
    out = was.align === undefined ? plain : { ...plain, align: was.align };
  }
  if (out.from !== from) {
    const { from: _f, ...plain } = out;
    out = from === undefined ? plain : { ...plain, from };
  }
  return out === item ? moved : withItem(moved, out);
}

/**
 * A float's rect moved (never resized) so that what `solve` draws of it lies in the stage: `drawn` is its drawn size (the
 * bar's when it is folded). As in `solve`, one drawn larger than the stage keeps its top-left corner on the stage's.
 */
export function clampFloat(r: Rect, stage: Rect, drawn: { readonly width: number; readonly height: number } = r): Rect {
  const at = clampInto({ x: r.x, y: r.y, width: drawn.width, height: drawn.height }, stage);
  return { x: at.x, y: at.y, width: r.width, height: r.height };
}

/** The size `solve` draws a float at (`floatShape`): its rect's, its bar's when folded, its icons' when vertical. */
export function drawnFloatSize(item: DockItem, f: { readonly rect: Rect; readonly orient?: Orient }): { width: number; height: number } {
  const s = floatShape(item, f);
  return { width: s.width, height: s.height };
}
