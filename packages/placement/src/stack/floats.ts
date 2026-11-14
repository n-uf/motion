/**
 * Floats for the edge stack: an item that isn't docked lies above the pages in the stage's own px (view space), so the
 * pages scrolling under it never move it. A float has no pinned flag: there is one kind of float, and it is in view
 * space. Pure, like the rest of `./stack`.
 *
 * - `fitFloat(rect, stage, avoid)`: the rect a float gets. It is moved (never resized) to lie inside the stage, then
 *   beside whatever docked content it would cover: the nearest place inside the stage that is clear of every `avoid`
 *   rect (the docked items' rects, in the same px). One larger than the stage keeps its top-left corner on the
 *   stage's; if no clear place exists the float stays where it covers the least and `covers` says which rects.
 * - `floatTarget(input)`: a drop target in the shape `@n-uf/motion/drag` takes, free (no room is made for it), whose
 *   `hit` covers the whole plane, so a pointer past the stage's edge still hits it (a float drop never cancels), at
 *   priority 3 so a docked stack's gaps win where they are. `make(point, grab)` is the one answer for the preview
 *   and the drop: the float's rect with the pointer holding it at `grab`, clamped and clear of the docked content.
 * - `storeFloats` / `readFloats`: the stored form, `{ v: 1, floats: [{ id, x, y, width, height }] }`, in stacking
 *   order (the last is on top). It writes no `pinned`; one an old store has is read, ignored and listed.
 */
import { clampInto, rect, type Point, type Rect, type Size } from "../geometry";
import type { Target } from "../targets/target";

/** A float: the item's id and its rect in view space (the stage's px). */
export interface StackFloat {
  readonly id: string;
  readonly rect: Rect;
}

export interface FloatFit {
  /** The float's rect: inside the stage and clear of the docked content where a clear place exists. */
  readonly rect: Rect;
  /** It was moved to lie inside the stage. */
  readonly clamped: boolean;
  /** It was moved beside the docked content it would have covered. */
  readonly snapped: boolean;
  /** Indexes into `avoid` of the rects it still covers (none unless the stage has no clear place for it). */
  readonly covers: readonly number[];
}

const EPS = 1e-3;
const finite = (x: number, fallback: number): number => (Number.isFinite(x) ? x : fallback);

/** Whether two rects share an area (touching edges don't). */
const overlaps = (a: Rect, b: Rect): boolean => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > EPS && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > EPS;
const shared = (a: Rect, b: Rect): number =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/** `r` with a non-number replaced and no negative size. */
const clean = (r: Rect, at: Rect): Rect => rect(finite(r.x, at.x), finite(r.y, at.y), Math.max(0, finite(r.width, 0)), Math.max(0, finite(r.height, 0)));

export function fitFloat(want: Rect, stage: Rect, avoid: readonly Rect[] = []): FloatFit {
  const area = clean(stage, rect(0, 0, 0, 0));
  const r = clean(want, area);
  const inside = clampInto(r, area);
  const clamped = inside.x !== r.x || inside.y !== r.y;
  const others = avoid.map((a) => clean(a, area));
  const under = (at: Rect): number[] => others.flatMap((a, i) => (a.width > EPS && a.height > EPS && overlaps(at, a) ? [i] : []));
  if (under(inside).length === 0) return { rect: inside, clamped, snapped: false, covers: [] };

  // The nearest place that is clear: every x that puts the float against an edge of the stage or of a rect (or where
  // it is), crossed with every such y. A clear place exists if one does at all, as a float slid against edges.
  const lo = (v: number, from: number, to: number): number => Math.min(Math.max(v, from), Math.max(from, to));
  const xs = [inside.x, area.x, area.x + area.width - r.width];
  const ys = [inside.y, area.y, area.y + area.height - r.height];
  for (const a of others) {
    xs.push(a.x - r.width, a.x + a.width);
    ys.push(a.y - r.height, a.y + a.height);
  }
  const at = (list: number[], from: number, size: number, extent: number): number[] => [...new Set(list.map((v) => lo(v, from, from + extent - size)))];
  let best: { rect: Rect; left: number; far: number; hits: number[] } | null = null;
  for (const y of at(ys, area.y, r.height, area.height)) {
    for (const x of at(xs, area.x, r.width, area.width)) {
      const cand = rect(x, y, r.width, r.height);
      const hits = under(cand);
      const left = hits.reduce((s, i) => s + shared(cand, others[i]!), 0);
      const far = Math.hypot(x - inside.x, y - inside.y);
      // Least still covered first (none, normally), then the shortest move.
      if (!best || left < best.left - EPS || (Math.abs(left - best.left) <= EPS && far < best.far - EPS)) best = { rect: cand, left, far, hits };
    }
  }
  const out = best!;
  return { rect: out.rect, clamped, snapped: out.far > EPS, covers: out.hits };
}

// --- the drop target ---------------------------------------------------------------------------------------------

/** What a float drop makes: the same answer for the preview and for the release. */
export interface FloatDrop {
  /** The float's rect in view space. */
  readonly rect: Rect;
  readonly fit: FloatFit;
}

export interface FloatTargetInput {
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

export interface FloatTarget extends Target {
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

/** A zone that covers any pointer the page can see: large and finite (an infinite rect has no far edge to compare). */
const PLANE = rect(-1e9, -1e9, 2e9, 2e9);

export function floatTarget(input: FloatTargetInput): FloatTarget {
  const { stage, size } = input;
  const avoid = input.avoid ?? [];
  const w = Math.max(0, finite(size.width, 0));
  const h = Math.max(0, finite(size.height, 0));
  return {
    id: "float",
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

export interface StoredFloats {
  readonly v: 1;
  readonly floats: { id: string; x: number; y: number; width: number; height: number }[];
}

export type FloatsRead = { readonly ok: true; readonly floats: StackFloat[]; readonly dropped: readonly string[] } | { readonly ok: false; readonly error: string };

const isSize = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
const isAt = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** The floats as plain JSON-safe data, in the order given (the stacking order, the last on top). Never a `pinned`. */
export function storeFloats(floats: readonly StackFloat[]): StoredFloats {
  const seen = new Set<string>();
  const out: StoredFloats["floats"] = [];
  for (const f of floats) {
    const r = f.rect;
    if (seen.has(f.id) || !isAt(r.x) || !isAt(r.y) || !isSize(r.width) || !isSize(r.height)) continue;
    seen.add(f.id);
    out.push({ id: f.id, x: r.x, y: r.y, width: r.width, height: r.height });
  }
  return { v: 1, floats: out };
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const FIELDS = ["id", "x", "y", "width", "height"];

/**
 * Reads parsed data back; never throws. Anything but an object of version 1 with a `floats` array is `{ ok: false,
 * error }`. Inside one it is lenient: a float that isn't an object, has no string id, repeats an id, isn't one the
 * consumer has (with `known`) or has a position or size that isn't a finite number (a size over 0) is dropped and
 * listed in `dropped` as `float:<id>` (or `a <type> where a float goes`); a top-level field this version doesn't
 * know is listed as `"<field>"`, and so is a float's own (`float:<id>:<field>`) while the float itself is kept.
 * A `pinned` key (an old store's flag, whatever its value) is ignored: the float loads as a plain float, in view
 * space as stored, and `pinned:<id>` is listed.
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
  if (data.v !== 1) return { ok: false, error: `unknown version ${typeof data.v === "number" ? data.v : typeof data.v} (this reads version 1)` };
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
    if ((known && !known.includes(id)) || floats.some((f) => f.id === id) || !isAt(x.x) || !isAt(x.y) || !isSize(x.width) || !isSize(x.height)) {
      drop(`float:${id}`);
      continue;
    }
    for (const k of Object.keys(x)) {
      if (k === "pinned") drop(`pinned:${id}`);
      else if (!FIELDS.includes(k)) drop(`float:${id}:${k}`);
    }
    floats.push({ id, rect: rect(x.x, x.y, x.width, x.height) });
  }
  return { ok: true, floats, dropped };
}
