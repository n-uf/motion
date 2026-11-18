/**
 * The scene's pure changes. Each returns a new scene and leaves the one it was given as it was; a change that can't
 * apply (an unknown item or edge, a fixed item, a kind the edge or the float layer doesn't take) returns the scene
 * given, the same object, so `after === before` says nothing changed.
 *
 * - `moveTo(scene, id, { edge, zone?, at })`: docks the item in that edge, before the `at`-th item of the zone (counting
 *   the zone's items without it, closed ones included), or at the zone's end. A zone named becomes the item's `align`
 *   where the edge offers a choice (`namesZone`: more than one zone takes the kind); on a one-zone edge, or with none
 *   named, the item keeps its own and docks in the zone it lies in there (`zoneIn`: its own where the edge takes it
 *   there, else the first that does). A new column, a rail and `dockHome` name none either: the item's zone is its own.
 *   `{ kind: "column", side, ring }` makes a new column from `scene.columns[side]` at that ring (`Infinity`: the side's
 *   inner end, "Move to › Dock left"); `{ kind: "rail", side, ring }` does the same with the item folded by hand, so it
 *   shows in the rail (on a side with no declared rail, `Scene.rails`, its rail is its outermost column that takes the
 *   kind, "the column drawn as a rail": the item docks at the end of its start zone as a collapsed header, folded by
 *   hand, a rail tile once nothing there sets the width); `{ kind: "float", rect?, anchor? }` floats it. A dynamic column an item leaves empty is deleted
 *   and its side's rings are closed up.
 * - `homeFor(scene, id, start)`: the place a start scene gives the item, for `moveTo`.
 * - `floatAt(scene, id, rect?, orient?)`: floats it on top at `rect` (its size becomes `floatSize`); with no rect, at
 *   its `floatSizeOf` size anchored to the content's top-right corner: its `floatSize`, else its form's natural size
 *   along its orient (the float's, `orient`, else `floatOrientOf`), else the default size.
 * - `fold(scene, id, on)`: folded by hand (`from: 1`) draws it in its folded form on the axis it lies along (a panel's
 *   `header`, a group's `fold`), and give-way steps down from there; unfolding clears `from`. Where it has no folded
 *   form (`canFold` false), folding changes nothing.
 * - `use(scene, id)`: the newest age. Under `previous` it reshapes nothing.
 * - `keep(scene, id, on)`, `open(scene, id)`, `close(scene, id)`.
 * - `raise(scene, id)`: a float to the top of the stack; no use, no reshape.
 * - `orient(scene, id, orient)`: a float's axis.
 * - `resize(scene, edge, size)`: the user's size across; a size that isn't a finite number clears it.
 *   `resize(scene, id, rect, moving?)`: a float resized by hand, at `fitResize`'s rect (./float-resize).
 */
import { clampInto, type Rect } from "../geometry";
import { fitResize, type ResizeEdges } from "./float-resize";
import { axesOf, axisOf, columnFromTemplate, floatOrientOf, placingOf, floatShape, floatSizeOf, foldedIndex, formsOf, isHandFolded, isSince, namesZone, railColumnOf, railModeOf, zoneIn, zoneTakes } from "./helpers";
import { RAIL_MODES, type Edge, type FloatAnchorAt, type Orient, type RailMode, type Scene, type SceneFloat, type SceneItem, type Side, type Zone } from "./model";

/** Where a docked item goes: before the `at`-th item of `zone` (default the item's own zone) in `edge`. */
export interface DockPlace {
  readonly kind?: "gap";
  readonly edge: string;
  readonly zone?: Zone;
  readonly at: number;
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
}
export type Place = DockPlace | ColumnPlace | RailPlace | FloatPlace;

const withItem = (scene: Scene, item: SceneItem): Scene => ({ ...scene, items: { ...scene.items, [item.id]: item } });
const itemOf = (scene: Scene, id: string): SceneItem | undefined => (Object.hasOwn(scene.items, id) ? scene.items[id] : undefined);

/** The side's edges with their rings closed up to 0, 1, 2… in their order (ring, then list order). */
export function closeRings(edges: readonly Edge[], sides: ReadonlySet<string>): Edge[] {
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
export function prune(scene: Scene): Scene {
  const gone = scene.edges.filter((e) => e.column === true && e.items.length === 0);
  if (gone.length === 0) return scene;
  const sides = new Set(gone.map((e) => e.side));
  return { ...scene, edges: closeRings(scene.edges.filter((e) => !gone.includes(e)), sides) };
}

/** The scene with the item out of every edge and every float (a dynamic column it leaves empty is deleted). */
export function lift(scene: Scene, id: string): Scene {
  const inEdge = scene.edges.some((e) => e.items.includes(id));
  const inFloat = scene.floats.some((f) => f.id === id);
  if (!inEdge && !inFloat) return scene;
  return prune({
    ...scene,
    edges: inEdge ? scene.edges.map((e) => (e.items.includes(id) ? { ...e, items: e.items.filter((x) => x !== id) } : e)) : scene.edges,
    floats: inFloat ? scene.floats.filter((f) => f.id !== id) : scene.floats,
  });
}

/**
 * A new column edge from the side's template, or null when the side has none or it doesn't take the kind. Its id is
 * chosen against the scene's edges and `others`: edges kept out of `scene` (its hidden ones, when `scene` is what the
 * window shows), so it never repeats an id the stored scene has.
 */
function newColumn(scene: Scene, side: "left" | "right", kind: string, ring: number, items: readonly string[], others: readonly Edge[]): Edge | null {
  const t = scene.columns?.[side];
  if (!t || !t.accepts.includes(kind)) return null;
  const taken = new Set([...scene.edges, ...others].map((e) => e.id));
  let n = 0;
  while (taken.has(`${side}-${n}`)) n++;
  return columnFromTemplate(t, `${side}-${n}`, side, ring, items);
}

/**
 * The rings of a side's edges as they lie, outer first, 0 up with no ties (by ring, then by their order in the scene):
 * the numbers column and rail places count in.
 */
export function sideRings(edges: readonly Edge[], side: string): Map<string, number> {
  return new Map(closeRings(edges, new Set([side])).filter((e) => e.side === side).map((e) => [e.id, e.ring]));
}

/** The first ring a new column may take on `side`: inside every static edge outer to the side's dynamic columns. */
function columnFloor(edges: readonly Edge[], side: string): number {
  const mine = edges.filter((e) => e.side === side).sort((a, b) => a.ring - b.ring);
  let n = 0;
  while (n < mine.length && mine[n]!.column !== true) n++;
  // With no dynamic column, every static edge on the side is outer to the new one.
  return n;
}

/**
 * `scene` with a new column holding `id` at `ring` on `side` (already lifted out). The side's rings are made distinct
 * first; static edges keep their place, so a new column goes no further out than just inside the static edges outer to
 * the side's dynamic columns (a bar or an anchor at the window edge stays there).
 */
function insertColumn(scene0: Scene, id: string, side: "left" | "right", ring: number, others: readonly Edge[]): Scene | null {
  const scene: Scene = { ...scene0, edges: closeRings(scene0.edges, new Set([side])) };
  const kind = scene.items[id]!.kind;
  const mine = scene.edges.filter((e) => e.side === side);
  const floor = columnFloor(scene.edges, side);
  const r = Math.max(floor, Math.min(Number.isNaN(ring) ? Infinity : Math.floor(ring), mine.length === 0 ? 0 : Math.max(...mine.map((e) => e.ring)) + 1));
  const col = newColumn(scene, side, kind, r, [id], others);
  if (!col) return null;
  // A kind never opens a column on its own unless the column's start zone takes it (a group never opens a panel column
  // whose tray is its end zone).
  if (!zoneTakes(col, "start", kind)) return null;
  // The item keeps its own zone (`align`): it lies in it where the new column takes it there, else in the first zone
  // that does (`zoneIn`), as in any edge.
  const shifted = scene.edges.map((e) => (e.side === side && e.ring >= r ? { ...e, ring: e.ring + 1 } : e));
  return { ...scene, edges: closeRings([...shifted, col], new Set([side])) };
}

/** The zone item `id` lies in on `edge` (`zoneIn`); its own when it is unknown. */
const zoneAt = (scene: Scene, edge: Edge, id: string): Zone => {
  const it = itemOf(scene, id);
  return it ? zoneIn(edge, it) : "start";
};

/** The index in `edge.items` where the `at`-th item of `zone` is (or where the zone ends), by the zones items lie in. */
function insertIndex(scene: Scene, edge: Edge, zone: Zone, at: number): number {
  const rank = { start: 0, center: 1, end: 2 } as const;
  const inZone = edge.items.map((id, i) => ({ id, i })).filter((x) => zoneAt(scene, edge, x.id) === zone);
  const k = Math.min(Math.max(0, Math.floor(Number.isFinite(at) ? at : inZone.length)), inZone.length);
  if (k < inZone.length) return inZone[k]!.i;
  if (inZone.length > 0) return inZone[inZone.length - 1]!.i + 1;
  // An empty zone: after the last item of an earlier zone, else before the first of a later one.
  let idx = 0;
  edge.items.forEach((id, i) => {
    if (rank[zoneAt(scene, edge, id)] < rank[zone]) idx = i + 1;
  });
  return idx;
}

export function moveTo(scene: Scene, id: string, place: Place): Scene {
  return moveAmong(scene, id, place, []);
}

/**
 * `moveTo`, with `others`: edges kept out of `scene` that a new column's id must not repeat. A drop's result is made on
 * the scene the window shows (its hidden edges left out), and its hidden edges are passed here.
 */
export function moveAmong(scene: Scene, id: string, place: Place, others: readonly Edge[]): Scene {
  const item = itemOf(scene, id);
  if (!item || item.fixed) return scene;
  if (place.kind === "float") {
    const out = floatAt(scene, id, place.rect);
    const anchor = place.anchor;
    if (!anchor || out === scene) return out;
    return { ...out, floats: out.floats.map((f) => (f.id === id ? { ...f, anchor } : f)) };
  }
  // A side with no declared rail: its rail is its outermost column that takes the kind (`railColumnOf`), the item docked
  // at the end of the zone it lies in there (its own where the column takes it there, else the first), folded by hand.
  // The rail names no zone: the item keeps its own.
  const railColumn = place.kind === "rail" ? railColumnOf(scene, place.side, item.kind) : undefined;
  if (railColumn) {
    const docked = moveAmong(scene, id, { edge: railColumn.id, at: Infinity }, others);
    return docked === scene ? scene : withItem(docked, { ...docked.items[id]!, from: Math.max(1, item.from ?? 0) });
  }
  if (place.kind === "column" || place.kind === "rail") {
    if (place.kind === "rail" && !scene.rails?.[place.side]?.accepts.includes(item.kind)) return scene;
    // Its zone goes with it: `insertColumn` keeps it where the new column takes the kind there.
    const folded: SceneItem = place.kind === "rail" ? { ...item, from: Math.max(1, item.from ?? 0) } : item;
    const made = insertColumn(withItem(lift(scene, id), folded), id, place.side, place.ring, others);
    return made ?? scene;
  }
  const edge = scene.edges.find((e) => e.id === place.edge);
  // A hidden edge takes nothing, as one that doesn't take the kind.
  if (!edge || edge.hidden === true || !edge.accepts.includes(item.kind)) return scene;
  // The zone asked for, else the one it lies in there (`zoneIn`: its own, or the first that takes its kind), must take
  // the kind (`zoneAccepts`). The item's zone is its own fact: a zone asked for becomes its `align` only where the edge
  // offers a choice (`namesZone`: more than one of its zones takes the kind). On a one-zone edge (a rail that takes the
  // kind at its start only) it docks in that zone and keeps its own.
  const zone = place.zone ?? zoneIn(edge, item);
  if (!zoneTakes(edge, zone, item.kind)) return scene;
  const { align: _drop, ...rest } = item;
  const moved: SceneItem = place.zone === undefined || !namesZone(edge, item.kind) ? item : zone === "start" ? rest : { ...rest, align: zone };
  const lifted = withItem(lift(scene, id), moved);
  const target = lifted.edges.find((e) => e.id === place.edge);
  // The item's own column, deleted when it was lifted out of it.
  if (!target) return scene;
  const k = insertIndex(lifted, target, zone, place.at);
  return { ...lifted, edges: lifted.edges.map((e) => (e === target ? { ...e, items: [...e.items.slice(0, k), id, ...e.items.slice(k)] } : e)) };
}

/**
 * One more than the largest `since` among the scene's floats (a missing or unusable one counts as 0); 1 when there are
 * none. Never past `Number.MAX_SAFE_INTEGER`.
 */
function nextSince(scene: Scene): number {
  const most = scene.floats.reduce((m, f) => Math.max(m, isSince(f.since) ? f.since : 0), 0);
  return Math.min(most + 1, Number.MAX_SAFE_INTEGER);
}

export function floatAt(scene: Scene, id: string, at?: Rect, orient?: Orient): Scene {
  const item = itemOf(scene, id);
  if (!item || item.fixed || !scene.floatKinds.includes(item.kind)) return scene;
  const was = scene.floats.find((f) => f.id === id);
  const o: Orient | undefined = orient ?? was?.orient;
  const size = floatSizeOf(item, o ?? floatOrientOf(item));
  // A float moved keeps its `since`; one newly floated comes after every float there.
  const since = was ? was.since : nextSince(scene);
  const seq = since !== undefined ? { since } : {};
  const float: SceneFloat = at
    ? { id, rect: { x: at.x, y: at.y, width: at.width, height: at.height }, ...(o ? { orient: o } : {}), ...seq }
    : { id, rect: { x: 0, y: 0, width: size.width, height: size.height }, anchor: "content-top-right", ...(o ? { orient: o } : {}), ...seq };
  const next = at && at.width > 0 && at.height > 0 ? { ...item, floatSize: { width: at.width, height: at.height } } : item;
  const lifted = lift(withItem(scene, next), id);
  return { ...lifted, floats: [...lifted.floats, float] };
}

/**
 * Whether a hand fold of `id` means anything where it lies now: it has a folded form (a panel's `header`, a group's
 * `fold`; a fixed item on a `foldable` edge, a thumbnail anchor, its `rail` tile) among the forms of the axis it lies
 * along (its edge's, its float's orient; either when it lies nowhere). Where it is false, `fold(on)` changes nothing: a
 * host leaves the grip's double-click off. An item folded by hand can always be unfolded.
 */
export function canFold(scene: Scene, id: string): boolean {
  const item = itemOf(scene, id);
  if (!item || (item.fixed && !scene.edges.some((e) => e.foldable === true && e.items.includes(id)))) return false;
  // A lent item folds as it is drawn: along the edge it shows in (`placingOf`).
  const edge = placingOf(scene, id).edges.find((e) => e.items.includes(id));
  return axesOf(scene, id).some((a) => foldedIndex(item, formsOf(item, a), edge) >= 0);
}

export function fold(scene: Scene, id: string, on: boolean): Scene {
  const item = itemOf(scene, id);
  // A fixed item folds only on an edge that allows it (`Edge.foldable`).
  if (!item || (item.fixed && !scene.edges.some((e) => e.foldable === true && e.items.includes(id)))) return scene;
  // Folded by hand (`from: 1`): solve draws it in its folded form on the axis it lies along (`startOf`), never one
  // step down the ladder. With no folded form there, a hand fold is nothing.
  if (on) return isHandFolded(scene, id) || !canFold(scene, id) ? scene : withItem(scene, { ...item, from: 1 });
  if (item.from === undefined) return scene;
  const { from: _f, ...rest } = item;
  return withItem(scene, rest);
}

/** The newest age in the scene, plus one. */
const nextAge =(scene: Scene): number => Object.values(scene.items).reduce((m, it) => Math.max(m, Number.isFinite(it.used) ? it.used : 0), 0) + 1;

/**
 * The item made the newest (`used`: the newest age plus one). Idempotent: an item already strictly newer than every
 * other gives back the scene itself, so a press on it changes nothing (a tie with another item is not newest, and
 * bumps). A drop's result is `use`d the same way.
 */
export function use(scene: Scene, id: string): Scene {
  const item = itemOf(scene, id);
  if (!item) return scene;
  const age = (it: SceneItem): number => (Number.isFinite(it.used) ? it.used : 0);
  if (Number.isFinite(item.used) && Object.values(scene.items).every((it) => it.id === id || age(it) < item.used)) return scene;
  return withItem(scene, { ...item, used: nextAge(scene) });
}

export function keep(scene: Scene, id: string, on: boolean): Scene {
  const item = itemOf(scene, id);
  if (!item || !!item.kept === on) return scene;
  if (on) return withItem(scene, { ...item, kept: true });
  const { kept: _k, ...rest } = item;
  return withItem(scene, rest);
}

export function open(scene: Scene, id: string): Scene {
  const item = itemOf(scene, id);
  if (!item || !item.closed) return scene;
  const { closed: _c, ...rest } = item;
  return withItem(scene, rest);
}

export function close(scene: Scene, id: string): Scene {
  const item = itemOf(scene, id);
  if (!item || item.closed || item.fixed) return scene;
  return withItem(scene, { ...item, closed: true });
}

export function raise(scene: Scene, id: string): Scene {
  const i = scene.floats.findIndex((f) => f.id === id);
  if (i < 0 || i === scene.floats.length - 1) return scene;
  return { ...scene, floats: [...scene.floats.slice(0, i), ...scene.floats.slice(i + 1), scene.floats[i]!] };
}

export function orient(scene: Scene, id: string, to: Orient): Scene {
  const i = scene.floats.findIndex((f) => f.id === id);
  const item = scene.items[id];
  if (i < 0 || !item || (scene.floats[i]!.orient ?? floatOrientOf(item)) === to) return scene;
  return { ...scene, floats: scene.floats.map((f, k) => (k === i ? { ...f, orient: to } : f)) };
}

/**
 * The user's size across an edge (`size` a number; one that isn't finite clears it). Or, with a rect, a float resized
 * by hand: the rect `fitResize(scene, floatId, rect, moving)` gives (default `moving`: right and bottom), so a host's
 * preview from `fitResize` is what this commits. The float keeps its stacking order and orient, loses its anchor, and
 * the size becomes the item's `floatSize` (stored with the scene). The scene given back where `fitResize` refuses (a
 * toolbar group, a folded float, anything not floating).
 */
export function resize(scene: Scene, edgeId: string, size: number): Scene;
export function resize(scene: Scene, floatId: string, rect: Rect, moving?: ResizeEdges): Scene;
export function resize(scene: Scene, id: string, size: number | Rect, moving: ResizeEdges = { right: true, bottom: true }): Scene {
  if (typeof size === "number") return resizeEdge(scene, id, size);
  const fit = fitResize(scene, id, size, moving);
  const i = scene.floats.findIndex((f) => f.id === id);
  const item = itemOf(scene, id);
  if (!fit || i < 0 || !item) return scene;
  const { anchor: _a, ...plain } = scene.floats[i]!;
  const float: SceneFloat = { ...plain, rect: fit.rect };
  return withItem({ ...scene, floats: scene.floats.map((g, k) => (k === i ? float : g)) }, { ...item, floatSize: { width: fit.rect.width, height: fit.rect.height } });
}

function resizeEdge(scene: Scene, edgeId: string, size: number): Scene {
  const edge = scene.edges.find((e) => e.id === edgeId);
  if (!edge) return scene;
  if (!Number.isFinite(size)) {
    if (edge.size === undefined) return scene;
    const { size: _s, ...rest } = edge;
    return { ...scene, edges: scene.edges.map((e) => (e === edge ? rest : e)) };
  }
  return { ...scene, edges: scene.edges.map((e) => (e === edge ? { ...e, size } : e)) };
}

/**
 * The side's rails show their items as `mode` (`Scene.railModes`): their titles while they fit, or their tiles only.
 * Unchanged for a side other than left or right, an unknown mode, or the mode the side has already.
 */
export function setRailMode(scene: Scene, side: "left" | "right", mode: RailMode): Scene {
  if ((side !== "left" && side !== "right") || !RAIL_MODES.includes(mode) || railModeOf(scene, side) === mode) return scene;
  return { ...scene, railModes: { ...scene.railModes, [side]: mode } };
}

/**
 * The edge moved to the other side of its axis (left ⇄ right, top ⇄ bottom), as its side's outermost edge: ring 0, before
 * that side's other edges (whose rings close up behind it; the side it left closes up too). Its items, size and options
 * go with it. Unchanged for an unknown edge, the side it is on, or a side across its axis. Like every change it does not
 * tick the use clock: a host that moves an edge by hand calls `use()` on its items afterwards, as a drop does.
 */
export function setSide(scene: Scene, edgeId: string, side: Side): Scene {
  const edge = scene.edges.find((e) => e.id === edgeId);
  if (!edge || edge.side === side || axisOf(edge.side) !== axisOf(side)) return scene;
  const moved: Edge = { ...edge, side, ring: 0 };
  const others = scene.edges.filter((e) => e !== edge).map((e) => (e.side === side ? { ...e, ring: e.ring + 1 } : e));
  return { ...scene, edges: closeRings([moved, ...others], new Set([edge.side, side])) };
}

/**
 * The place `start` (a scene as it began: the host's start or reset scene) gives an item, for Dock, Put back and Reset
 * position: its zone and place in the same edge (before the first item that followed it there and is still there), a
 * new column at its ring when its column is gone (a column under the same id that holds none of the start column's
 * items is another column), or its float rect (and anchor). Null when `start` places it nowhere
 * or in an edge `scene` no longer has that isn't a column. `moveTo(scene, id, place)` puts it there.
 */
export function homeFor(scene: Scene, id: string, start: Scene): Place | null {
  for (const e of start.edges) {
    const k = e.items.indexOf(id);
    if (k < 0) continue;
    const own = itemOf(start, id) ?? itemOf(scene, id);
    // A dynamic column's id is reused once it is pruned: the edge under that id is home only while it still holds one of
    // the start column's items (the item itself, or another). Static edges match by id.
    const found = scene.edges.find((x) => x.id === e.id);
    const here = found && (e.column !== true || found.items.some((x) => e.items.includes(x))) ? found : undefined;
    if (here) {
      // The zone it lies in there, by its start `align` (`zoneIn`); the others by where they lie.
      const zone = own ? zoneIn(here, own) : "start";
      const now = here.items.filter((x) => x !== id && zoneAt(scene, here, x) === zone);
      const next = e.items.slice(k + 1).find((x) => now.includes(x));
      return { kind: "gap", edge: e.id, zone, at: next ? now.indexOf(next) : now.length };
    }
    // Its ring as the start scene's side lay (no ties); `insertColumn` keeps it inside the static edges outer to it.
    if (e.column === true && (e.side === "left" || e.side === "right")) return { kind: "column", side: e.side, ring: sideRings(start.edges, e.side).get(e.id) ?? e.ring };
    return null;
  }
  const f = start.floats.find((x) => x.id === id);
  if (f) return { kind: "float", rect: f.rect, ...(f.anchor ? { anchor: f.anchor } : {}) };
  return null;
}

/**
 * Dock, Put back and Reset position: the item where `start` (the loaded scene) has it, fold included. It goes to
 * `homeFor`'s place and takes `start`'s `from` (unfolded when `start` has none), so a "Move to › rail" (which folds it)
 * followed by Dock brings it back open. The scene given back unchanged when `start` places it nowhere.
 */
export function dockHome(scene: Scene, id: string, start: Scene): Scene {
  const place = homeFor(scene, id, start);
  if (!place) return scene;
  // An item already at its home place (the only item of its own column, which `moveTo` can't re-dock into) keeps its
  // place and still takes the start fold.
  const moved = moveTo(scene, id, place);
  const item = itemOf(moved, id);
  if (!item) return scene;
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
export function drawnFloatSize(item: SceneItem, f: { readonly rect: Rect; readonly orient?: Orient }): { width: number; height: number } {
  const s = floatShape(item, f);
  return { width: s.width, height: s.height };
}
