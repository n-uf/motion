/**
 * Floats for the edge stack: an item that isn't docked lies above the pages in the stage's own px (view space), so the
 * pages scrolling under it never move it. A float has no pinned flag: there is one kind of float, and it is in view
 * space. Pure, like the rest of `./stack`.
 *
 * - `fitFloat(rect, stage, avoid)`: the rect a float gets. It is moved (never resized) to lie inside the stage, then
 *   beside whatever docked content it would cover: the nearest place inside the stage that is clear of every `avoid`
 *   rect (the docked items' rects, in the same px). One larger than the stage keeps its top-left corner on the
 *   stage's; if no clear place exists the float stays where it covers the least and `covers` says which rects.
 *   A clear place is found whenever one exists: the x's are tried nearest first and, for each, the blocked stretches of
 *   y are merged and skipped, so no clear place is missed however many places lie between. Cost (measured in a test
 *   run on a laptop): about 100 docked rects 0.1 ms, 300 a few ms even when no place is clear (6 ms median, 15 ms
 *   worst), 1,000 about 17 ms; a safety net stops the clear search after 3 million rect tests and says so in
 *   `searchCapped`; a stage with no clear place looks at the 2,048 nearest places for the least covered.
 * - `stackFloatTarget(input)`: a drop target in the shape `@n-uf/motion/drag` takes, free (no room is made for it),
 *   `kind` `"float"`, id `float:<item>`, whose `hit` covers the whole plane, so a pointer past the stage's edge still
 *   hits it (a float drop never cancels), at priority 3 so a docked stack's gaps win where they are. `make(point,
 *   grab)` is the one answer for the preview and the drop: the float's rect with the pointer holding it at `grab`,
 *   clamped and clear of the docked content.
 * - `storeFloats` / `readFloats`: the stored form, `{ v: 1, floats: [{ id, x, y, width, height }] }`, in stacking
 *   order (the last is on top). It writes no `pinned`; one an old store has is read, ignored and listed.
 */
import { clampInto, rect, type Point, type Rect, type Size } from "../geometry";
import type { Target } from "../targets/target";
import { versionWords } from "./store";

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
  /**
   * Indexes into `avoid` of the rects it still covers. Empty whenever a clear place was found, which is whenever one
   * exists (unless `searchCapped`); not empty only when the stage has no clear place for the float, and then it stays
   * where it covers the least among the 2,048 nearest candidate places.
   */
  readonly covers: readonly number[];
  /** The safety net on the clear search was hit (thousands of rects): the place found may not be the nearest, or a clear place may exist that was not found. Normally false. */
  readonly searchCapped: boolean;
}

const EPS = 1e-3;
const finite = (x: number, fallback: number): number => (Number.isFinite(x) ? x : fallback);

/** Whether two rects share an area (touching edges don't). */
const overlaps = (a: Rect, b: Rect): boolean => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > EPS && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > EPS;
const shared = (a: Rect, b: Rect): number =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/** `r` with a non-number replaced and no negative size. */
const clean = (r: Rect, at: Rect): Rect => rect(finite(r.x, at.x), finite(r.y, at.y), Math.max(0, finite(r.width, 0)), Math.max(0, finite(r.height, 0)));

/** A safety net on the clear search, in rect tests (only thousands of rects reach it), and the places the least-covered search looks at. */
const WORK = 3_000_000;
const COVERED_PLACES = 2048;

type Triple = [number, number, number];

/** A binary min-heap of `[index, index, distance]` triples, by distance then indexes (a fixed order). */
class Nearest {
  private readonly h: Triple[] = [];
  private less(a: Triple, b: Triple): boolean {
    return a[2] !== b[2] ? a[2] < b[2] : a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1];
  }
  get size(): number {
    return this.h.length;
  }
  push(t: Triple): void {
    const h = this.h;
    let i = h.push(t) - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(h[i]!, h[p]!)) break;
      [h[i], h[p]] = [h[p]!, h[i]!];
      i = p;
    }
  }
  pop(): Triple {
    const h = this.h;
    const top = h[0]!;
    const last = h.pop()!;
    if (h.length > 0) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && this.less(h[l]!, h[m]!)) m = l;
        if (r < h.length && this.less(h[r]!, h[m]!)) m = r;
        if (m === i) break;
        [h[i], h[m]] = [h[m]!, h[i]!];
        i = m;
      }
    }
    return top;
  }
}

/** The places `xs` crossed with `ys`, nearest to `(fx, fy)` first (Euclidean), without building the cross product. */
function* byDistance(xs: readonly number[], ys: readonly number[], fx: number, fy: number): Generator<{ x: number; y: number; far: number }> {
  const sx = [...xs].sort((a, b) => Math.abs(a - fx) - Math.abs(b - fx) || a - b);
  const sy = [...ys].sort((a, b) => Math.abs(a - fy) - Math.abs(b - fy) || a - b);
  const q = new Nearest();
  const d = (i: number, j: number): number => Math.hypot(sx[i]! - fx, sy[j]! - fy);
  // Each x starts at its nearest y; popping a place pushes the same x's next y.
  if (sy.length > 0) for (let i = 0; i < sx.length; i++) q.push([i, 0, d(i, 0)]);
  while (q.size > 0) {
    const [i, j, far] = q.pop();
    yield { x: sx[i]!, y: sy[j]!, far };
    if (j + 1 < sy.length) q.push([i, j + 1, d(i, j + 1)]);
  }
}

export function fitFloat(want: Rect, stage: Rect, avoid: readonly Rect[] = []): FloatFit {
  const area = clean(stage, rect(0, 0, 0, 0));
  const r = clean(want, area);
  const inside = clampInto(r, area);
  // Compared with what was asked, so a position that wasn't a number (and was replaced) counts as moved.
  const clamped = inside.x !== want.x || inside.y !== want.y;
  // Only rects that can touch the float wherever the stage lets it be: its reach.
  const reach = rect(area.x, area.y, Math.max(area.width, r.width), Math.max(area.height, r.height));
  const near: { at: Rect; index: number }[] = [];
  avoid.forEach((a, index) => {
    const at = clean(a, area);
    if (at.width > EPS && at.height > EPS && overlaps(at, reach)) near.push({ at, index });
  });
  const under = (cand: Rect): number[] => near.filter((n) => overlaps(cand, n.at)).map((n) => n.index);
  const blocked = (cand: Rect): boolean => near.some((n) => overlaps(cand, n.at));
  if (!blocked(inside)) return { rect: inside, clamped, snapped: false, covers: [], searchCapped: false };

  // The places to look at: every x that puts the float against an edge of the stage or of a rect (or where it is),
  // crossed with every y that does; a clear place exists if one does at all, as a float slid against edges.
  const lo = (v: number, from: number, to: number): number => Math.min(Math.max(v, from), Math.max(from, to));
  const xs = [inside.x, area.x, area.x + area.width - r.width];
  const ys = [inside.y, area.y, area.y + area.height - r.height];
  for (const { at } of near) {
    xs.push(at.x - r.width, at.x + at.width);
    ys.push(at.y - r.height, at.y + at.height);
  }
  const places = (list: number[], from: number, size: number, extent: number): number[] => [...new Set(list.map((v) => lo(v, from, from + extent - size)))];
  const px = places(xs, area.x, r.width, area.width);
  const py = places(ys, area.y, r.height, area.height);
  // Nearest clear place: the x's nearest first; for each, the rects that overlap that x block open stretches of y, and
  // the nearest clear y is the wanted one if it is clear, else the end of the stretch it is in (the stretches are
  // merged, so a whole blocked run is skipped at once). A later x can't beat a clear place at least as far as its x
  // alone, so the search stops there. `WORK` bounds the rect tests as a safety net.
  const ylo = area.y;
  const yhi = Math.max(area.y, area.y + area.height - r.height);
  const byX = [...px].sort((a, b) => Math.abs(a - inside.x) - Math.abs(b - inside.x) || a - b);
  let clear: { x: number; y: number; far: number } | null = null;
  let work = 0;
  let searchCapped = false;
  for (const x of byX) {
    const dx = Math.abs(x - inside.x);
    if (clear && dx >= clear.far) break;
    work += near.length + 1;
    if (work > WORK) {
      searchCapped = true;
      break;
    }
    const stretches: [number, number][] = [];
    for (const { at } of near) {
      if (Math.min(x + r.width, at.x + at.width) - Math.max(x, at.x) > EPS) stretches.push([at.y - r.height, at.y + at.height]);
    }
    stretches.sort((a, b) => a[0] - b[0]);
    // The clear y's are the closed gaps between the merged open stretches, within the stage.
    let cursor = ylo;
    let bestY: number | null = null;
    const gap = (from: number, to: number): void => {
      if (from > to) return;
      const y = Math.min(Math.max(inside.y, from), to);
      if (bestY === null || Math.abs(y - inside.y) < Math.abs(bestY - inside.y)) bestY = y;
    };
    for (const [a, b] of stretches) {
      gap(cursor, Math.min(a, yhi));
      cursor = Math.max(cursor, b);
      if (cursor > yhi) break;
    }
    if (cursor <= yhi) gap(cursor, yhi);
    if (bestY === null) continue;
    const far = Math.hypot(dx, bestY - inside.y);
    if (!clear || far < clear.far) clear = { x, y: bestY, far };
  }
  if (clear) return { rect: rect(clear.x, clear.y, r.width, r.height), clamped, snapped: clear.far > EPS, covers: [], searchCapped };
  // None is clear: the nearest places that cover the least.
  let best: { rect: Rect; left: number; far: number; hits: number[] } | null = null;
  let tried = 0;
  for (const p of byDistance(px, py, inside.x, inside.y)) {
    if (tried++ >= COVERED_PLACES) break;
    const cand = rect(p.x, p.y, r.width, r.height);
    const left = near.reduce((s, n) => s + shared(cand, n.at), 0);
    if (!best || left < best.left - EPS) best = { rect: cand, left, far: p.far, hits: under(cand) };
  }
  const out = best ?? { rect: inside, far: 0, hits: under(inside) };
  return { rect: out.rect, clamped, snapped: out.far > EPS, covers: out.hits, searchCapped };
}

// --- the drop target ---------------------------------------------------------------------------------------------

/** What a float drop makes: the same answer for the preview and for the release. */
export interface FloatDrop {
  /** The float's rect in view space. */
  readonly rect: Rect;
  readonly fit: FloatFit;
}

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

/** A zone that covers any pointer the page can see: large and finite (an infinite rect has no far edge to compare). */
const PLANE = rect(-1e9, -1e9, 2e9, 2e9);

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

export interface StoredFloats {
  readonly v: 1;
  readonly floats: { id: string; x: number; y: number; width: number; height: number }[];
}

export type FloatsRead = { readonly ok: true; readonly floats: StackFloat[]; readonly dropped: readonly string[] } | { readonly ok: false; readonly error: string };

const isSize = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
const isAt = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/**
 * The floats as plain JSON-safe data, in the order given (the stacking order, the last on top). Never a `pinned`.
 * What it can't read back is left out, silently: a float whose position isn't a finite number or whose size isn't over
 * 0 (a zero-size float), and an earlier entry of a repeated id (the last readable entry of an id is the one on top,
 * so it stays, at its own place in the order).
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
