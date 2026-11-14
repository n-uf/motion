/**
 * The scene's pure changes. Each returns a new scene and leaves the one it was given as it was; a change that can't
 * apply (an unknown item or edge, a fixed item, a kind the edge or the float layer doesn't take) returns the scene
 * given, the same object, so `after === before` says nothing changed.
 *
 * - `moveTo(scene, id, { edge, zone?, at })`: docks the item in that edge, before the `at`-th item of the zone (counting
 *   the zone's items without it, closed ones included), or at the zone's end. The zone becomes the item's `align`.
 *   `{ kind: "column", side, ring }` makes a new column from `scene.columns[side]` at that ring (`Infinity`: the side's
 *   inner end, "Move to › Dock left"); `{ kind: "rail", side, ring }` does the same with the item folded by hand, so it
 *   shows in the rail; `{ kind: "float", rect?, anchor? }` floats it. A dynamic column an item leaves empty is deleted
 *   and its side's rings are closed up.
 * - `homeFor(scene, id, start)`: the place a start scene gives the item, for `moveTo`.
 * - `floatAt(scene, id, rect?, orient?)`: floats it on top at `rect` (its size becomes `floatSize`); with no rect, at
 *   its `floatSize` (or the default size) anchored to the content's top-right corner.
 * - `fold(scene, id, on)`: folded by hand starts it at its second form (`from: 1`); unfolding clears `from`.
 * - `use(scene, id)`: the newest age. Under `previous` it reshapes nothing.
 * - `keep(scene, id, on)`, `open(scene, id)`, `close(scene, id)`.
 * - `raise(scene, id)`: a float to the top of the stack; no use, no reshape.
 * - `orient(scene, id, orient)`: a float's axis.
 * - `resize(scene, edge, size)`: the user's size across; a size that isn't a finite number clears it.
 */
import { clampInto, type Rect } from "../geometry";
import { DEFAULT_FLOAT_SIZE, zoneOf, type Edge, type FloatAnchor, type Orient, type Scene, type SceneFloat, type SceneItem, type Zone } from "./model";

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
  /** Following the content (only its size counts then). */
  readonly anchor?: FloatAnchor;
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

/** A new column edge from the side's template, or null when the side has none or it doesn't take the kind. */
function newColumn(scene: Scene, side: "left" | "right", kind: string, ring: number, items: readonly string[]): Edge | null {
  const t = scene.columns?.[side];
  if (!t || !t.accepts.includes(kind)) return null;
  const taken = new Set(scene.edges.map((e) => e.id));
  let n = 0;
  while (taken.has(`${side}-${n}`)) n++;
  return {
    id: `${side}-${n}`,
    side,
    ring,
    accepts: t.accepts,
    items,
    cross: t.cross,
    ...(t.gap !== undefined ? { gap: t.gap } : {}),
    ...(t.pad ? { pad: t.pad } : {}),
    ...(t.menu ? { menu: t.menu } : {}),
    column: true,
  };
}

/** `scene` with a new column holding `id` at `ring` on `side` (already lifted out). */
function insertColumn(scene: Scene, id: string, side: "left" | "right", ring: number): Scene | null {
  const kind = scene.items[id]!.kind;
  const mine = scene.edges.filter((e) => e.side === side);
  const r = Math.max(0, Math.min(Number.isNaN(ring) ? Infinity : Math.floor(ring), mine.length === 0 ? 0 : Math.max(...mine.map((e) => e.ring)) + 1));
  const col = newColumn(scene, side, kind, r, [id]);
  if (!col) return null;
  const shifted = scene.edges.map((e) => (e.side === side && e.ring >= r ? { ...e, ring: e.ring + 1 } : e));
  return { ...scene, edges: closeRings([...shifted, col], new Set([side])) };
}

/** The index in `edge.items` where the `at`-th item of `zone` is (or where the zone ends). */
function insertIndex(scene: Scene, edge: Edge, zone: Zone, at: number): number {
  const rank = { start: 0, center: 1, end: 2 } as const;
  const inZone = edge.items.map((id, i) => ({ id, i })).filter((x) => zoneOf(itemOf(scene, x.id)) === zone);
  const k = Math.min(Math.max(0, Math.floor(Number.isFinite(at) ? at : inZone.length)), inZone.length);
  if (k < inZone.length) return inZone[k]!.i;
  if (inZone.length > 0) return inZone[inZone.length - 1]!.i + 1;
  // An empty zone: after the last item of an earlier zone, else before the first of a later one.
  let idx = 0;
  edge.items.forEach((id, i) => {
    if (rank[zoneOf(itemOf(scene, id))] < rank[zone]) idx = i + 1;
  });
  return idx;
}

export function moveTo(scene: Scene, id: string, place: Place): Scene {
  const item = itemOf(scene, id);
  if (!item || item.fixed) return scene;
  if (place.kind === "float") {
    const out = floatAt(scene, id, place.rect);
    const anchor = place.anchor;
    if (!anchor || out === scene) return out;
    return { ...out, floats: out.floats.map((f) => (f.id === id ? { ...f, anchor } : f)) };
  }
  if (place.kind === "column" || place.kind === "rail") {
    if (place.kind === "rail" && !scene.rails?.[place.side]?.accepts.includes(item.kind)) return scene;
    const { align: _a, ...plain } = item;
    const folded: SceneItem = place.kind === "rail" ? { ...plain, from: Math.max(1, plain.from ?? 0) } : plain;
    const made = insertColumn(withItem(lift(scene, id), folded), id, place.side, place.ring);
    return made ?? scene;
  }
  const edge = scene.edges.find((e) => e.id === place.edge);
  if (!edge || !edge.accepts.includes(item.kind)) return scene;
  const zone = place.zone ?? zoneOf(item);
  const { align: _drop, ...rest } = item;
  const moved: SceneItem = zone === "start" ? rest : { ...rest, align: zone };
  const lifted = withItem(lift(scene, id), moved);
  const target = lifted.edges.find((e) => e.id === place.edge);
  // The item's own column, deleted when it was lifted out of it.
  if (!target) return scene;
  const k = insertIndex(lifted, target, zone, place.at);
  return { ...lifted, edges: lifted.edges.map((e) => (e === target ? { ...e, items: [...e.items.slice(0, k), id, ...e.items.slice(k)] } : e)) };
}

export function floatAt(scene: Scene, id: string, at?: Rect, orient?: Orient): Scene {
  const item = itemOf(scene, id);
  if (!item || item.fixed || !scene.floatKinds.includes(item.kind)) return scene;
  const was = scene.floats.find((f) => f.id === id);
  const o: Orient | undefined = orient ?? was?.orient;
  const size = item.floatSize ?? DEFAULT_FLOAT_SIZE;
  const float: SceneFloat = at
    ? { id, rect: { x: at.x, y: at.y, width: at.width, height: at.height }, ...(o ? { orient: o } : {}) }
    : { id, rect: { x: 0, y: 0, width: size.width, height: size.height }, anchor: "content-top-right", ...(o ? { orient: o } : {}) };
  const next = at && at.width > 0 && at.height > 0 ? { ...item, floatSize: { width: at.width, height: at.height } } : item;
  const lifted = lift(withItem(scene, next), id);
  return { ...lifted, floats: [...lifted.floats, float] };
}

export function fold(scene: Scene, id: string, on: boolean): Scene {
  const item = itemOf(scene, id);
  if (!item || item.fixed) return scene;
  if (on) return (item.from ?? 0) >= 1 ? scene : withItem(scene, { ...item, from: 1 });
  if (item.from === undefined) return scene;
  const { from: _f, ...rest } = item;
  return withItem(scene, rest);
}

/** The newest age in the scene, plus one. */
export const nextAge = (scene: Scene): number => Object.values(scene.items).reduce((m, it) => Math.max(m, Number.isFinite(it.used) ? it.used : 0), 0) + 1;

export function use(scene: Scene, id: string): Scene {
  const item = itemOf(scene, id);
  if (!item) return scene;
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
  if (i < 0 || (scene.floats[i]!.orient ?? "column") === to) return scene;
  return { ...scene, floats: scene.floats.map((f, k) => (k === i ? { ...f, orient: to } : f)) };
}

export function resize(scene: Scene, edgeId: string, size: number): Scene {
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
 * The place `start` (a scene as it began: the host's start or reset scene) gives an item, for Dock, Put back and Reset
 * position: its zone and place in the same edge (before the first item that followed it there and is still there), a
 * new column at its ring when its column is gone, or its float rect (and anchor). Null when `start` places it nowhere
 * or in an edge `scene` no longer has that isn't a column. `moveTo(scene, id, place)` puts it there.
 */
export function homeFor(scene: Scene, id: string, start: Scene): Place | null {
  for (const e of start.edges) {
    const k = e.items.indexOf(id);
    if (k < 0) continue;
    const zone = zoneOf(itemOf(start, id) ?? itemOf(scene, id));
    const here = scene.edges.find((x) => x.id === e.id);
    if (here) {
      const now = here.items.filter((x) => x !== id && zoneOf(itemOf(scene, x)) === zone);
      const next = e.items.slice(k + 1).find((x) => now.includes(x));
      return { kind: "gap", edge: e.id, zone, at: next ? now.indexOf(next) : now.length };
    }
    if (e.column === true && (e.side === "left" || e.side === "right")) return { kind: "column", side: e.side, ring: e.ring };
    return null;
  }
  const f = start.floats.find((x) => x.id === id);
  if (f) return { kind: "float", rect: f.rect, ...(f.anchor ? { anchor: f.anchor } : {}) };
  return null;
}

/** A float's rect moved (never resized) into the stage; one larger than the stage is cut to it. */
export function clampFloat(r: Rect, stage: Rect): Rect {
  const sized = { ...r, width: Math.min(r.width, stage.width), height: Math.min(r.height, stage.height) };
  return clampInto(sized, stage);
}
