/**
 * Floats for the edge stack: an item that isn't docked lies above the pages in the stage's own px (view space), so the
 * pages scrolling under it never move it. A float has no pinned flag: there is one kind of float, and it is in view
 * space. Pure, like the rest of `./stack`.
 *
 * Deprecated: floats belong to the window. The Scene fits them (`solve`, `Scene.floats`), offers the float target
 * (`targets()`, `float:<id>`) and stores them (`storeScene` / `readScene`); `fitFloat` is exported by `./scene`. These
 * names stay until the next breaking release.
 *
 * - `fitFloat(rect, stage, avoid)`: the rect a float gets, moved inside the stage and clear of the docked content.
 * - `stackFloatTarget(input)`: a drop target in the shape `@n-uf/motion/drag` takes, free (no room is made for it),
 *   `kind` `"float"`, id `float:<item>`, whose `hit` covers the whole plane, so a pointer past the stage's edge still
 *   hits it (a float drop never cancels), at priority 3 so a docked stack's gaps win where they are. `make(point,
 *   grab)` is the one answer for the preview and the drop: the float's rect with the pointer holding it at `grab`,
 *   clamped and clear of the docked content.
 * - `storeFloats` / `readFloats`: the stored form, `{ v: 1, floats: [{ id, x, y, width, height }] }`, in stacking
 *   order (the last is on top). It writes no `pinned`; one an old store has is read, ignored and listed.
 */
import { fitFloat as fit, type FloatFit as Fit } from "../float-fit";
import { PLANE, rect, type Point, type Rect, type Size } from "../geometry";
import type { Target } from "../target";
import { versionWords } from "./store";

/**
 * A float: the item's id and its rect in view space (the stage's px).
 * @deprecated A Scene's floats are `SceneFloat`s (`Scene.floats`), from `@n-uf/placement/scene`.
 */
export interface StackFloat {
  readonly id: string;
  readonly rect: Rect;
}

/** @deprecated Use `FloatFit` from `@n-uf/placement/scene`. */
export type FloatFit = Fit;

/**
 * The rect a float gets: inside the stage, clear of the docked content where a clear place exists.
 * @deprecated Use `fitFloat` from `@n-uf/placement/scene`; a Scene's floats are fitted by `solve`.
 */
export const fitFloat: (want: Rect, stage: Rect, avoid?: readonly Rect[]) => FloatFit = fit;

const finite = (x: number, fallback: number): number => (Number.isFinite(x) ? x : fallback);

// --- the drop target ---------------------------------------------------------------------------------------------

/**
 * What a float drop makes: the same answer for the preview and for the release.
 * @deprecated A Scene's float target is `float:<id>` from `targets()` in `@n-uf/placement/scene`.
 */
export interface FloatDrop {
  /** The float's rect in view space. */
  readonly rect: Rect;
  readonly fit: FloatFit;
}

/** @deprecated A Scene's float target is `float:<id>` from `targets()` in `@n-uf/placement/scene`. */
export interface StackFloatTargetInput {
  /** The item dragged. */
  readonly id: string;
  /** The stage, in view space. */
  readonly stage: Rect;
  /** The float's size: it is never resized. */
  readonly size: Size;
  /** The docked content to stay clear of: the docked items' rects (and the » entries'), in view space. */
  readonly avoid?: readonly Rect[];
  /** What the target is called (default "Float here"). */
  readonly label?: string;
}

/** @deprecated A Scene's float target is `float:<id>` from `targets()` in `@n-uf/placement/scene`. */
export interface FloatTarget extends Target {
  /** What kind of place it is, for a consumer that holds targets of several kinds. */
  readonly kind: "float";
  readonly priority: 3;
  readonly free: true;
  /** The item dragged. */
  readonly item: string;
  /**
   * The drop with the pointer at `point` holding the float at `grab` (its offset from the float's top-left corner,
   * default the middle): `rect` is the preview and the landing, clamped into the stage and clear of the docked content.
   */
  make(point: Point, grab?: Point): FloatDrop;
}

/** @deprecated Use `targets(scene, id)` from `@n-uf/placement/scene`: its `float:<id>` target (`floatKinds`). */
export function stackFloatTarget(input: StackFloatTargetInput): FloatTarget {
  const { stage, size } = input;
  const avoid = input.avoid ?? [];
  const w = Math.max(0, finite(size.width, 0));
  const h = Math.max(0, finite(size.height, 0));
  return {
    // Not "float": `./desk` has a target of that id, and a consumer may hold both.
    id: `float:${input.id}`,
    kind: "float",
    priority: 3,
    free: true,
    hit: PLANE,
    label: input.label ?? "Float here",
    item: input.id,
    make(point, grab) {
      const g = grab ?? { x: w / 2, y: h / 2 };
      const fit = fitFloat(rect(point.x - g.x, point.y - g.y, w, h), stage, avoid);
      return { rect: fit.rect, fit };
    },
  };
}

// --- the stored form ---------------------------------------------------------------------------------------------

/** @deprecated Use `storeScene` / `readScene` from `@n-uf/placement/scene`: a stored scene holds its floats. */
export interface StoredFloats {
  readonly v: 1;
  readonly floats: { id: string; x: number; y: number; width: number; height: number }[];
}

/** @deprecated Use `storeScene` / `readScene` from `@n-uf/placement/scene`: a stored scene holds its floats. */
export type FloatsRead = { readonly ok: true; readonly floats: StackFloat[]; readonly dropped: readonly string[] } | { readonly ok: false; readonly error: string };

const isSize = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
const isAt = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/**
 * The floats as plain JSON-safe data, in the order given (the stacking order, the last on top). Never a `pinned`.
 * What it can't read back is left out, silently: a float whose position isn't a finite number or whose size isn't over
 * 0 (a zero-size float), and an earlier entry of a repeated id (the last readable entry of an id is the one on top,
 * so it stays, at its own place in the order).
 * @deprecated Use `storeScene` from `@n-uf/placement/scene`: a stored scene holds its floats.
 */
export function storeFloats(floats: readonly StackFloat[]): StoredFloats {
  const last = new Map<string, number>();
  floats.forEach((f, i) => {
    const r = f.rect;
    if (isAt(r.x) && isAt(r.y) && isSize(r.width) && isSize(r.height)) last.set(f.id, i);
  });
  const out: StoredFloats["floats"] = [];
  floats.forEach((f, i) => {
    if (last.get(f.id) === i) out.push({ id: f.id, x: f.rect.x, y: f.rect.y, width: f.rect.width, height: f.rect.height });
  });
  return { v: 1, floats: out };
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const FIELDS = ["id", "x", "y", "width", "height"];

/**
 * Reads parsed data back; never throws. Anything but an object of version 1 with a `floats` array is `{ ok: false,
 * error }`. Inside one it is lenient: a float that isn't an object, has no string id, isn't one the
 * consumer has (with `known`) or has a position or size that isn't a finite number (a size over 0) is dropped and
 * listed in `dropped` as `float:<id>` (or `a <type> where a float goes`); a top-level field this version doesn't
 * know is listed as `"<field>"`, and so is a float's own (`float:<id>:<field>`) while the float itself is kept.
 * A `pinned` key (an old store's flag, whatever its value) is ignored: the float loads as a plain float, in view
 * space as stored, and `pinned:<id>` is listed. A repeated id keeps its last readable entry (the list is in stacking
 * order, the last on top); the earlier ones are dropped and listed as `float:<id>`.
 * @deprecated Use `readScene` from `@n-uf/placement/scene`: a stored scene holds its floats.
 */
export function readFloats(data: unknown, known?: readonly string[]): FloatsRead {
  try {
    return read(data, known);
  } catch (e) {
    // A getter that throws, a proxy: still no throw.
    return { ok: false, error: `unreadable: ${e instanceof Error ? e.message : typeof e}` };
  }
}

function read(data: unknown, known?: readonly string[]): FloatsRead {
  if (!isObject(data)) return { ok: false, error: "not an object" };
  if (data.v !== 1) return { ok: false, error: `unknown version ${versionWords(data.v)} (this reads version 1)` };
  if (!Array.isArray(data.floats)) return { ok: false, error: "floats is missing" };
  const dropped: string[] = [];
  const drop = (what: string): void => {
    if (!dropped.includes(what)) dropped.push(what);
  };
  for (const k of Object.keys(data)) if (k !== "v" && k !== "floats") drop(k);
  const floats: StackFloat[] = [];
  for (const x of data.floats as unknown[]) {
    if (!isObject(x)) {
      drop(`a ${x === null ? "null" : Array.isArray(x) ? "list" : typeof x} where a float goes`);
      continue;
    }
    const id = x.id;
    if (typeof id !== "string") {
      drop("a float with no id");
      continue;
    }
    if ((known && !known.includes(id)) || !isAt(x.x) || !isAt(x.y) || !isSize(x.width) || !isSize(x.height)) {
      drop(`float:${id}`);
      continue;
    }
    for (const k of Object.keys(x)) {
      if (k === "pinned") drop(`pinned:${id}`);
      else if (!FIELDS.includes(k)) drop(`float:${id}:${k}`);
    }
    // A repeated id: the last readable entry is the one on top (the list is in stacking order), the earlier is dropped.
    const before = floats.findIndex((f) => f.id === id);
    if (before >= 0) {
      floats.splice(before, 1);
      drop(`float:${id}`);
    }
    floats.push({ id, rect: rect(x.x, x.y, x.width, x.height) });
  }
  return { ok: true, floats, dropped };
}
