/**
 * The arrangers the desk constructions build on, internal to `./dock`: master and stack for the documents, dwindle
 * for the tiling tree's centre, stacked columns at natural heights, and the minimum-size give-way (the newest tile
 * that breaks a minimum floats). A public `./tiling` will come from a merge with a full split-tree model; these stay
 * the dock's own until then.
 */
import type { Rect, Size } from "../geometry";

/**
 * Master and stack: the first id takes the left part (`ratio` of the width less the gap), the rest stack on the
 * right in equal rows. One id takes the whole area.
 */
export function masterStack<K>(ids: readonly K[], area: Rect, gap: number, ratio = 0.5): Map<K, Rect> {
  const out = new Map<K, Rect>();
  if (ids.length === 0) return out;
  if (ids.length === 1) {
    out.set(ids[0]!, { ...area });
    return out;
  }
  const mw = (area.width - gap) * ratio;
  out.set(ids[0]!, { x: area.x, y: area.y, width: mw, height: area.height });
  const k = ids.length - 1;
  const sh = (area.height - gap * (k - 1)) / k;
  ids.slice(1).forEach((id, i) => out.set(id, { x: area.x + mw + gap, y: area.y + i * (sh + gap), width: area.width - mw - gap, height: sh }));
  return out;
}

/** Dwindle over an order: each tile but the last splits the space left in two along its longer side. */
export function dwindle(area: Rect, n: number, gap: number): Rect[] {
  const out: Rect[] = [];
  let cur = { ...area };
  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      out.push(cur);
      break;
    }
    if (cur.width >= cur.height) {
      const w = (cur.width - gap) / 2;
      out.push({ x: cur.x, y: cur.y, width: w, height: cur.height });
      cur = { x: cur.x + w + gap, y: cur.y, width: w, height: cur.height };
    } else {
      const h = (cur.height - gap) / 2;
      out.push({ x: cur.x, y: cur.y, width: cur.width, height: h });
      cur = { x: cur.x, y: cur.y + h + gap, width: cur.width, height: h };
    }
  }
  return out;
}

/**
 * Heights for a column of items stacked in `avail` with gaps: each at its minimum (its natural height), the last
 * taking the rest. When the minimums don't fit, an even share instead, so the ones that break their minimum show.
 */
export function columnHeights(avail: number, mins: readonly number[], gap: number): number[] {
  const room = avail - gap * (mins.length - 1);
  const need = mins.reduce((a, b) => a + b, 0);
  if (need > room) return mins.map(() => room / mins.length);
  return mins.map((m, i) => (i === mins.length - 1 ? room - need + m : m));
}

/**
 * Lengths for items sharing `avail`: each gets at least its minimum, the rest of the room is shared in proportion
 * to the minimums (when the minimums don't fit, each gets its minimum).
 */
export function share(avail: number, mins: readonly number[]): number[] {
  const need = mins.reduce((a, b) => a + b, 0);
  const spare = Math.max(0, avail - need);
  return mins.map((m) => m + (need > 0 ? (spare * m) / need : spare / mins.length));
}

/**
 * The minimum-size give-way: while a tile is laid out below its minimum, the newest tile (highest `age`) floats and
 * the rest are laid out again. Stops when every tile keeps its minimum or one tile is left. `layout` lays out the
 * kept keys; the result says which are kept (in their order) and which float (newest first).
 */
export function giveWay<K>(keys: readonly K[], layout: (kept: readonly K[]) => ReadonlyMap<K, Rect>, min: (key: K) => Size, age: (key: K) => number): { kept: K[]; floats: K[] } {
  let kept = [...keys];
  const floats: K[] = [];
  for (;;) {
    const res = layout(kept);
    const broken = [...res].some(([k, r]) => r.width < min(k).width - 0.5 || r.height < min(k).height - 0.5);
    if (!broken || kept.length <= 1) return { kept, floats };
    const newest = kept.reduce((a, b) => (age(b) > age(a) ? b : a));
    kept = kept.filter((k) => k !== newest);
    floats.push(newest);
  }
}
