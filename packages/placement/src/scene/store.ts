/**
 * The scene's stored form. `storeScene(scene)` gives plain JSON-safe data; `readScene(data, base)` reads it back over
 * `base` (the host's scene as it starts: its item definitions, edges, kinds and stage) and never throws.
 *
 * ```ts
 * interface StoredScene {
 *   v: 1;
 *   edges: { id: string; side: Side; ring: number; items: string[]; size?: number }[];
 *   floats: { id: string; x: number; y: number; width: number; height: number; orient?: "row" | "column"; anchor?: FloatAnchor }[];
 *   items: Record<string, { used: number; kept?: true; from?: number; closed?: true; align?: "center" | "end"; floatSize?: { width: number; height: number } }>;
 * }
 * ```
 *
 * Nothing about kinds, forms or limits is stored: those are the host's (`base`). An edge is matched by its id: its
 * side, ring and limits come from `base`, its order of items and its `size` from the store. No float has a pinned
 * field: one an old store has is listed and ignored.
 *
 * Reading is lenient: anything but an object of version 1 gives `base` back with the reason in `error`. Inside one,
 * whatever can't be used is dropped and listed in `dropped` (an unknown edge `edge:<id>`, an unknown or repeated item,
 * an item an edge doesn't accept `edge:<edge>:<id>`, a fixed item placed elsewhere, a float of a kind that doesn't
 * float `float:<id>`, a bad field `item:<id>:<field>`, an unknown top-level field `<field>`). Fixed items stay where
 * `base` has them: trailing ones (window controls) stay last. An item the store places nowhere goes where `base` has it.
 * A float's rect is clamped into the stage on read.
 */
import { rect, type Size } from "../geometry";
import { clampFloat } from "./changes";
import { SIDES, type Edge, type FloatAnchor, type Orient, type Scene, type SceneFloat, type SceneItem, type Side } from "./model";

export interface StoredSceneEdge {
  readonly id: string;
  readonly side: Side;
  readonly ring: number;
  readonly items: readonly string[];
  readonly size?: number;
}

export interface StoredSceneFloat {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly orient?: Orient;
  readonly anchor?: FloatAnchor;
}

export interface StoredSceneItem {
  readonly used: number;
  readonly kept?: true;
  readonly from?: number;
  readonly closed?: true;
  readonly align?: "center" | "end";
  readonly floatSize?: Size;
}

export interface StoredScene {
  readonly v: 1;
  readonly edges: readonly StoredSceneEdge[];
  readonly floats: readonly StoredSceneFloat[];
  readonly items: Readonly<Record<string, StoredSceneItem>>;
}

export interface SceneRead {
  readonly scene: Scene;
  /** What was left out, as listed in the module's docs. */
  readonly dropped: readonly string[];
  /** Set when nothing could be read: `scene` is `base`. */
  readonly error?: string;
}

const ANCHORS: readonly FloatAnchor[] = ["content-top-left", "content-top", "content-top-right", "content-right", "content-bottom-right", "content-bottom", "content-bottom-left", "content-left"];
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isSize = (x: unknown): x is number => isNum(x) && x > 0;
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
/** Records with no prototype, so an id such as `constructor` is only a key; `__proto__` is refused. */
const record = <T>(): Record<string, T> => Object.create(null) as Record<string, T>;

export function storeScene(scene: Scene): StoredScene {
  const items = record<StoredSceneItem>();
  for (const [id, it] of Object.entries(scene.items)) {
    if (id === "__proto__") continue;
    items[id] = {
      used: isNum(it.used) ? it.used : 0,
      ...(it.kept ? { kept: true as const } : {}),
      ...(isNum(it.from) && it.from >= 1 ? { from: Math.floor(it.from) } : {}),
      ...(it.closed ? { closed: true as const } : {}),
      ...(it.align === "center" || it.align === "end" ? { align: it.align } : {}),
      ...(it.floatSize && isSize(it.floatSize.width) && isSize(it.floatSize.height) ? { floatSize: { width: it.floatSize.width, height: it.floatSize.height } } : {}),
    };
  }
  return {
    v: 1,
    edges: scene.edges.map((e) => ({ id: e.id, side: e.side, ring: e.ring, items: [...e.items], ...(isNum(e.size) ? { size: e.size } : {}) })),
    floats: scene.floats
      .filter((f) => isNum(f.rect.x) && isNum(f.rect.y) && isSize(f.rect.width) && isSize(f.rect.height))
      .map((f) => ({ id: f.id, x: f.rect.x, y: f.rect.y, width: f.rect.width, height: f.rect.height, ...(f.orient ? { orient: f.orient } : {}), ...(f.anchor ? { anchor: f.anchor } : {}) })),
    items,
  };
}

export function readScene(data: unknown, base: Scene): SceneRead {
  try {
    return read(data, base);
  } catch (e) {
    return { scene: base, dropped: [], error: `unreadable: ${e instanceof Error ? e.message : typeof e}` };
  }
}

const words = (v: unknown): string => (typeof v === "number" ? String(v) : typeof v === "string" ? JSON.stringify(v.length > 24 ? `${v.slice(0, 24)}…` : v) : typeof v);

/** Fixed items of `baseIds` put back into `movable` at their places: leading ones from the start, trailing ones from the end. */
export function withFixed(baseIds: readonly string[], movable: readonly string[], isFixed: (id: string) => boolean): string[] {
  const out = [...movable];
  let tail = baseIds.length;
  while (tail > 0 && isFixed(baseIds[tail - 1]!)) tail--;
  const lead: [number, string][] = [];
  baseIds.forEach((id, i) => {
    if (isFixed(id) && i < tail) lead.push([i, id]);
  });
  for (const [i, id] of lead) out.splice(Math.min(i, out.length), 0, id);
  return [...out, ...baseIds.slice(tail)];
}

function read(data: unknown, base: Scene): SceneRead {
  if (!isObject(data)) return { scene: base, dropped: [], error: "not an object" };
  if (data.v !== 1) return { scene: base, dropped: [], error: `unknown version ${words(data.v)} (this reads version 1)` };
  const dropped: string[] = [];
  const drop = (what: string): void => {
    if (!dropped.includes(what)) dropped.push(what);
  };
  for (const k of Object.keys(data)) if (!["v", "edges", "floats", "items"].includes(k)) drop(k);
  const known = (id: unknown): id is string => typeof id === "string" && id !== "__proto__" && Object.hasOwn(base.items, id);
  const isFixed = (id: string): boolean => known(id) && base.items[id]!.fixed === true;

  // The items' states.
  const items: Record<string, SceneItem> = { ...base.items };
  if (data.items !== undefined && !isObject(data.items)) drop("items");
  else if (isObject(data.items)) {
    for (const id of Object.keys(data.items)) {
      const s = data.items[id];
      if (!known(id) || !isObject(s)) {
        drop(`item:${id}`);
        continue;
      }
      const b = base.items[id]!;
      const { kept: _k, from: _f, closed: _c, align: _a, floatSize: _s, ...plain } = b;
      let it: SceneItem = { ...plain, used: b.used };
      for (const k of Object.keys(s)) if (!["used", "kept", "from", "closed", "align", "floatSize"].includes(k)) drop(`item:${id}:${k}`);
      if (isNum(s.used)) it = { ...it, used: s.used };
      else if (s.used !== undefined) drop(`item:${id}:used`);
      if (s.kept === true) it = { ...it, kept: true };
      else if (s.kept !== undefined && s.kept !== false) drop(`item:${id}:kept`);
      if (isNum(s.from) && Number.isInteger(s.from) && s.from >= 1 && !b.fixed) it = { ...it, from: s.from };
      else if (s.from !== undefined) drop(`item:${id}:from`);
      if (b.fixed && b.from !== undefined) it = { ...it, from: b.from };
      if (s.closed === true && !b.fixed) it = { ...it, closed: true };
      else if (s.closed !== undefined && s.closed !== false) drop(`item:${id}:closed`);
      if (s.align === "center" || s.align === "end") it = { ...it, align: s.align };
      else if (s.align !== undefined && s.align !== "start") drop(`item:${id}:align`);
      if (b.fixed && b.align) it = { ...it, align: b.align };
      const fs = s.floatSize;
      if (isObject(fs) && isSize(fs.width) && isSize(fs.height)) it = { ...it, floatSize: { width: fs.width, height: fs.height } };
      else if (fs !== undefined) drop(`item:${id}:floatSize`);
      items[id] = it;
    }
  }

  // Where they are: stored edges by id, then stored floats.
  const placed = new Set<string>();
  const order = new Map<string, string[]>();
  const sizes = new Map<string, number | undefined>();
  if (data.edges !== undefined && !Array.isArray(data.edges)) drop("edges");
  for (const e of Array.isArray(data.edges) ? (data.edges as unknown[]) : []) {
    if (!isObject(e) || typeof e.id !== "string") {
      drop("an edge with no id");
      continue;
    }
    const edge = base.edges.find((x) => x.id === e.id);
    if (!edge || order.has(edge.id)) {
      drop(`edge:${e.id}`);
      continue;
    }
    if (e.side !== undefined && !SIDES.includes(e.side as Side)) drop(`edge:${e.id}:side`);
    const ids: string[] = [];
    for (const id of Array.isArray(e.items) ? (e.items as unknown[]) : []) {
      if (!known(id) || placed.has(id)) drop(`edge:${edge.id}:${String(id)}`);
      else if (isFixed(id)) continue; // fixed items stay where base has them
      else if (!edge.accepts.includes(items[id]!.kind)) drop(`edge:${edge.id}:${id}`);
      else {
        ids.push(id);
        placed.add(id);
      }
    }
    order.set(edge.id, ids);
    if (isNum(e.size)) sizes.set(edge.id, e.size);
    else if (e.size !== undefined) drop(`edge:${edge.id}:size`);
    else sizes.set(edge.id, undefined);
  }
  const floats: SceneFloat[] = [];
  if (data.floats !== undefined && !Array.isArray(data.floats)) drop("floats");
  for (const f of Array.isArray(data.floats) ? (data.floats as unknown[]) : []) {
    if (!isObject(f) || typeof f.id !== "string") {
      drop("a float with no id");
      continue;
    }
    const id = f.id;
    if (!known(id) || placed.has(id) || isFixed(id) || !base.floatKinds.includes(items[id]!.kind) || !isNum(f.x) || !isNum(f.y) || !isSize(f.width) || !isSize(f.height)) {
      drop(`float:${id}`);
      continue;
    }
    for (const k of Object.keys(f)) if (k === "pinned") drop(`pinned:${id}`);
    else if (!["id", "x", "y", "width", "height", "orient", "anchor"].includes(k)) drop(`float:${id}:${k}`);
    const o = f.orient === "row" || f.orient === "column" ? f.orient : undefined;
    if (f.orient !== undefined && !o) drop(`float:${id}:orient`);
    const a = ANCHORS.includes(f.anchor as FloatAnchor) ? (f.anchor as FloatAnchor) : undefined;
    if (f.anchor !== undefined && !a) drop(`float:${id}:anchor`);
    placed.add(id);
    floats.push({ id, rect: clampFloat(rect(f.x, f.y, f.width, f.height), base.stage), ...(o ? { orient: o } : {}), ...(a ? { anchor: a } : {}) });
  }

  // Each base edge: its stored order (fixed items at their base places), then its base items the store placed nowhere.
  const edges: Edge[] = base.edges.map((edge) => {
    const stored = order.get(edge.id);
    const rest = edge.items.filter((id) => !isFixed(id) && !placed.has(id));
    for (const id of rest) placed.add(id);
    const movable = [...(stored ?? []), ...rest];
    const items1 = withFixed(edge.items, movable, isFixed);
    const size = sizes.has(edge.id) ? sizes.get(edge.id) : edge.size;
    const { size: _s, ...plain } = edge;
    return { ...plain, items: items1, ...(size !== undefined ? { size } : {}) };
  });
  // Base floats the store placed nowhere keep their base place.
  for (const f of base.floats) if (!placed.has(f.id)) floats.push(f);
  return { scene: { ...base, items, edges, floats }, dropped };
}
