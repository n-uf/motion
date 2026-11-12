/**
 * Tiling: ids and an area in, a rect per id out. Equal columns, a grid, master and stack, dwindle (as a plain
 * order or as a split tree with its operations), stacked columns whose items keep their minimums, and the
 * minimum-size give-way: the newest tile that breaks a minimum floats.
 *
 * Every layout here tiles its area exactly: the rects never overlap, keep `gap` px apart, and reach the area's
 * edges.
 */
import type { Rect, Size } from "../geometry";

/** Equal columns, full height. */
export function columns<K>(ids: readonly K[], area: Rect, gap: number): Map<K, Rect> {
  const out = new Map<K, Rect>();
  const n = ids.length;
  const w = (area.width - gap * (n - 1)) / Math.max(1, n);
  ids.forEach((id, i) => out.set(id, { x: area.x + i * (w + gap), y: area.y, width: w, height: area.height }));
  return out;
}

/** A grid as square as the count allows; the last row's cells widen to fill it. */
export function grid<K>(ids: readonly K[], area: Rect, gap: number): Map<K, Rect> {
  const out = new Map<K, Rect>();
  const n = ids.length;
  if (n === 0) return out;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const h = (area.height - gap * (rows - 1)) / rows;
  ids.forEach((id, i) => {
    const row = Math.floor(i / cols);
    const inRow = row === rows - 1 ? n - cols * (rows - 1) : cols;
    const col = i - row * cols;
    const w = (area.width - gap * (inRow - 1)) / inRow;
    out.set(id, { x: area.x + col * (w + gap), y: area.y + row * (h + gap), width: w, height: h });
  });
  return out;
}

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

// --- the split tree ------------------------------------------------------------------------------------------------

/**
 * Dwindle as a split tree: a new tile splits the focused one in two along its longer side, and a removed tile's
 * sibling takes its parent's place. A split's `ratio` is its first child's share (default one half).
 */
export type Tree<K = number> = { readonly leaf: K } | { readonly a: Tree<K>; readonly b: Tree<K>; readonly ratio?: number };

/** The tree laid out in `r`: each split along its longer side, `gap` px between its two halves. */
export function layoutTree<K>(node: Tree<K> | null, r: Rect, gap: number, out = new Map<K, Rect>()): Map<K, Rect> {
  if (!node) return out;
  if ("leaf" in node) {
    out.set(node.leaf, r);
    return out;
  }
  const ratio = node.ratio ?? 0.5;
  if (r.width >= r.height) {
    const w = (r.width - gap) * ratio;
    layoutTree(node.a, { x: r.x, y: r.y, width: w, height: r.height }, gap, out);
    layoutTree(node.b, { x: r.x + w + gap, y: r.y, width: r.width - w - gap, height: r.height }, gap, out);
  } else {
    const h = (r.height - gap) * ratio;
    layoutTree(node.a, { x: r.x, y: r.y, width: r.width, height: h }, gap, out);
    layoutTree(node.b, { x: r.x, y: r.y + h + gap, width: r.width, height: r.height - h - gap }, gap, out);
  }
  return out;
}

/** The tree's leaves, first to last. */
export const leafIds = <K>(node: Tree<K> | null): K[] => (!node ? [] : "leaf" in node ? [node.leaf] : [...leafIds(node.a), ...leafIds(node.b)]);

/** `node` with leaf `target` split in two (insert beside it): the new id first (left or top) or second. */
export function splitLeaf<K>(node: Tree<K> | null, target: K | null, id: K, first: boolean): Tree<K> {
  const fresh: Tree<K> = { leaf: id };
  if (!node) return fresh;
  if ("leaf" in node) {
    if (node.leaf !== target) return node;
    return first ? { a: fresh, b: node } : { a: node, b: fresh };
  }
  return { ...node, a: splitLeaf(node.a, target, id, first), b: splitLeaf(node.b, target, id, first) };
}

/** `node` without leaf `id`: its sibling takes their parent's place. */
export function removeLeaf<K>(node: Tree<K> | null, id: K): Tree<K> | null {
  if (!node) return null;
  if ("leaf" in node) return node.leaf === id ? null : node;
  const a = removeLeaf(node.a, id);
  const b = removeLeaf(node.b, id);
  return a && b ? { ...node, a, b } : (a ?? b);
}

/** `node` with leaves `x` and `y` trading places. */
export function swapLeaves<K>(node: Tree<K> | null, x: K, y: K): Tree<K> | null {
  if (!node) return null;
  if ("leaf" in node) return node.leaf === x ? { leaf: y } : node.leaf === y ? { leaf: x } : node;
  return { ...node, a: swapLeaves(node.a, x, y)!, b: swapLeaves(node.b, x, y)! };
}

/** `node` with leaf `id` taken out and put beside `target` (first or second); unchanged when `id` is `target`. */
export function moveLeaf<K>(node: Tree<K> | null, id: K, target: K, first: boolean): Tree<K> | null {
  if (id === target || !leafIds(node).includes(target)) return node;
  return splitLeaf(removeLeaf(node, id), target, id, first);
}

/**
 * `node` with the split right above leaf `id` given a new ratio: `ratio` is the leaf's own share of that split
 * (kept between 0.05 and 0.95).
 */
export function setSplitRatio<K>(node: Tree<K> | null, id: K, ratio: number): Tree<K> | null {
  if (!node || "leaf" in node) return node;
  const r = Math.min(0.95, Math.max(0.05, ratio));
  if ("leaf" in node.a && node.a.leaf === id) return { ...node, ratio: r };
  if ("leaf" in node.b && node.b.leaf === id) return { ...node, ratio: 1 - r };
  return { ...node, a: setSplitRatio(node.a, id, ratio)!, b: setSplitRatio(node.b, id, ratio)! };
}

/** A split tree for `ids` as if each had been opened with the one before it focused. */
export function treeFromOrder<K>(ids: readonly K[]): Tree<K> | null {
  let t: Tree<K> | null = null;
  ids.forEach((id, i) => {
    t = splitLeaf(t, i > 0 ? ids[i - 1]! : null, id, false);
  });
  return t;
}

// --- the give-way --------------------------------------------------------------------------------------------------

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
