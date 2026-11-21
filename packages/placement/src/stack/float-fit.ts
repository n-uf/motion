/**
 * `fitFloat(rect, stage, avoid)`: the rect a float gets. It is moved (never resized) to lie inside the stage, then beside
 * whatever docked content it would cover: the nearest place inside the stage that is clear of every `avoid` rect (the
 * docked items' rects, in the same px). One larger than the stage keeps its top-left corner on the stage's; if no clear
 * place exists the float stays where it covers the least and `covers` says which rects.
 *
 * A clear place is found whenever one exists: the x's are tried nearest first and, for each, the blocked stretches of y
 * are merged and skipped, so no clear place is missed however many places lie between. Cost (measured in a test run on
 * a laptop): about 100 docked rects 0.1 ms, 300 a few ms even when no place is clear (6 ms median, 15 ms worst), 1,000
 * about 17 ms; a safety net stops the clear search after 3 million rect tests and says so in `searchCapped`; a stage
 * with no clear place looks at the 2,048 nearest places for the least covered.
 *
 * With `{ stay: true }` it is only moved inside the stage: it lies where it is asked, and `covers` says which `avoid`
 * rects it covers there (a float a person left over content on purpose).
 *
 * A window model fits its floats with it.
 */
import { clampInto, overlap, overlaps, rect, type Rect } from "../geometry";

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

export interface FloatFitOptions {
  /**
   * Only moved inside the stage, never beside what it covers: `rect` is the asked rect clamped into the stage, `snapped`
   * is false and `covers` lists every `avoid` rect it covers there. Default false.
   */
  readonly stay?: boolean;
}

/** How far floats compare loosely: a float's px are rounded, so a thousandth is touching. */
const EPS = 1e-3;
const finite = (x: number, fallback: number): number => (Number.isFinite(x) ? x : fallback);

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

export function fitFloat(want: Rect, stage: Rect, avoid: readonly Rect[] = [], options: FloatFitOptions = {}): FloatFit {
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
    if (at.width > EPS && at.height > EPS && overlaps(at, reach, EPS)) near.push({ at, index });
  });
  const under = (cand: Rect): number[] => near.filter((n) => overlaps(cand, n.at, EPS)).map((n) => n.index);
  const blocked = (cand: Rect): boolean => near.some((n) => overlaps(cand, n.at, EPS));
  if (options.stay) return { rect: inside, clamped, snapped: false, covers: under(inside), searchCapped: false };
  if (!blocked(inside))return { rect: inside, clamped, snapped: false, covers: [], searchCapped: false };

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
    const left = near.reduce((s, n) => s + overlap(cand, n.at), 0);
    if (!best || left < best.left - EPS) best = { rect: cand, left, far: p.far, hits: under(cand) };
  }
  const out = best ?? { rect: inside, far: 0, hits: under(inside) };
  return { rect: out.rect, clamped, snapped: out.far > EPS, covers: out.hits, searchCapped };
}
