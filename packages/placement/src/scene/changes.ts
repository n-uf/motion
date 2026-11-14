/**
 * The scene's pure changes. Each returns a new scene and leaves the one it was given as it was; a change that can't
 * apply (an unknown item or edge, a fixed item, a kind the edge or the float layer doesn't take) returns the scene
 * given, the same object, so `after === before` says nothing changed.
 *
 * - `moveTo(scene, id, { edge, zone?, at })`: docks the item in that edge, before the `at`-th item of the zone (counting
 *   the zone's items without it, closed ones included), or at the zone's end. The zone becomes the item's `align`.
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
import { DEFAULT_FLOAT_SIZE, zoneOf, type Edge, type Orient, type Scene, type SceneFloat, type SceneItem, type Zone } from "./model";

/** Where a docked item goes: before the `at`-th item of `zone` (default the item's own zone) in `edge`. */
export interface DockPlace {
  readonly edge: string;
  readonly zone?: Zone;
  readonly at: number;
}

const withItem = (scene: Scene, item: SceneItem): Scene => ({ ...scene, items: { ...scene.items, [item.id]: item } });
const itemOf = (scene: Scene, id: string): SceneItem | undefined => (Object.hasOwn(scene.items, id) ? scene.items[id] : undefined);

/** The scene with the item out of every edge and every float. */
export function lift(scene: Scene, id: string): Scene {
  const inEdge = scene.edges.some((e) => e.items.includes(id));
  const inFloat = scene.floats.some((f) => f.id === id);
  if (!inEdge && !inFloat) return scene;
  return {
    ...scene,
    edges: inEdge ? scene.edges.map((e) => (e.items.includes(id) ? { ...e, items: e.items.filter((x) => x !== id) } : e)) : scene.edges,
    floats: inFloat ? scene.floats.filter((f) => f.id !== id) : scene.floats,
  };
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

export function moveTo(scene: Scene, id: string, place: DockPlace): Scene {
  const item = itemOf(scene, id);
  const edge = scene.edges.find((e) => e.id === place.edge);
  if (!item || item.fixed || !edge || !edge.accepts.includes(item.kind)) return scene;
  const zone = place.zone ?? zoneOf(item);
  const { align: _drop, ...rest } = item;
  const moved: SceneItem = zone === "start" ? rest : { ...rest, align: zone };
  const lifted = withItem(lift(scene, id), moved);
  const target = lifted.edges.find((e) => e.id === place.edge)!;
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

/** A float's rect moved (never resized) into the stage; one larger than the stage is cut to it. */
export function clampFloat(r: Rect, stage: Rect): Rect {
  const sized = { ...r, width: Math.min(r.width, stage.width), height: Math.min(r.height, stage.height) };
  return clampInto(sized, stage);
}
