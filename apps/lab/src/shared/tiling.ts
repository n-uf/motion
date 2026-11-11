/**
 * The tiling layouts both lab pages use, over any area: Hyprland's master and dwindle, plus equal columns and a
 * grid. Pure: ids and an area in, a rect per id out.
 */
import type { Rect } from "@n-uf/motion";

/** Equal columns, full height. */
export function columns(ids: readonly number[], area: Rect, gap: number): Map<number, Rect> {
  const out = new Map<number, Rect>();
  const n = ids.length;
  const w = (area.width - gap * (n - 1)) / Math.max(1, n);
  ids.forEach((id, i) => out.set(id, { x: area.x + i * (w + gap), y: area.y, width: w, height: area.height }));
  return out;
}

/** A grid as square as the count allows; the last row's cells widen to fill it. */
export function grid(ids: readonly number[], area: Rect, gap: number): Map<number, Rect> {
  const out = new Map<number, Rect>();
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

/** Master and stack: the first window on the left half, the rest stacked on the right. */
export function masterStack(ids: readonly number[], area: Rect, gap: number): Map<number, Rect> {
  const out = new Map<number, Rect>();
  const W = area.width;
  const H = area.height;
  if (ids.length === 0) return out;
  if (ids.length === 1) {
    out.set(ids[0]!, { ...area });
    return out;
  }
  const mw = (W - gap) / 2;
  out.set(ids[0]!, { x: area.x, y: area.y, width: mw, height: H });
  const k = ids.length - 1;
  const sh = (H - gap * (k - 1)) / k;
  ids.slice(1).forEach((id, i) => out.set(id, { x: area.x + gap + mw, y: area.y + i * (sh + gap), width: mw, height: sh }));
  return out;
}

/**
 * Dwindle (Hyprland's default) is a split tree: a new window splits the focused one in two, along its
 * longer side, and a closed window's sibling takes its parent's place.
 */
export type Tree = { readonly leaf: number } | { readonly a: Tree; readonly b: Tree };

export function layoutTree(node: Tree | null, r: Rect, gap: number, out = new Map<number, Rect>()): Map<number, Rect> {
  if (!node) return out;
  if ("leaf" in node) {
    out.set(node.leaf, r);
    return out;
  }
  if (r.width >= r.height) {
    const w = (r.width - gap) / 2;
    layoutTree(node.a, { x: r.x, y: r.y, width: w, height: r.height }, gap, out);
    layoutTree(node.b, { x: r.x + w + gap, y: r.y, width: w, height: r.height }, gap, out);
  } else {
    const h = (r.height - gap) / 2;
    layoutTree(node.a, { x: r.x, y: r.y, width: r.width, height: h }, gap, out);
    layoutTree(node.b, { x: r.x, y: r.y + h + gap, width: r.width, height: h }, gap, out);
  }
  return out;
}

export const leafIds = (node: Tree | null): number[] => (!node ? [] : "leaf" in node ? [node.leaf] : [...leafIds(node.a), ...leafIds(node.b)]);

/** `node` with leaf `target` split in two: the new window first (left/top) or second (right/bottom). */
export function splitLeaf(node: Tree | null, target: number | null, id: number, first: boolean): Tree {
  const fresh: Tree = { leaf: id };
  if (!node) return fresh;
  if ("leaf" in node) {
    if (node.leaf !== target) return node;
    return first ? { a: fresh, b: node } : { a: node, b: fresh };
  }
  return { a: splitLeaf(node.a, target, id, first), b: splitLeaf(node.b, target, id, first) };
}

export function removeLeaf(node: Tree | null, id: number): Tree | null {
  if (!node) return null;
  if ("leaf" in node) return node.leaf === id ? null : node;
  const a = removeLeaf(node.a, id);
  const b = removeLeaf(node.b, id);
  return a && b ? { a, b } : (a ?? b);
}

export function swapLeaves(node: Tree | null, x: number, y: number): Tree | null {
  if (!node) return null;
  if ("leaf" in node) return node.leaf === x ? { leaf: y } : node.leaf === y ? { leaf: x } : node;
  return { a: swapLeaves(node.a, x, y)!, b: swapLeaves(node.b, x, y)! };
}

/** A dwindle tree for `ids` as if each had been opened with the one before it focused. */
export function treeFromOrder(ids: readonly number[]): Tree | null {
  let t: Tree | null = null;
  ids.forEach((id, i) => {
    t = splitLeaf(t, i > 0 ? ids[i - 1]! : null, id, false);
  });
  return t;
}
