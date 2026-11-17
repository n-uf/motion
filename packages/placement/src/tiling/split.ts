/**
 * The split tree: how panes divide an area. A node is a pane, or a split of its rect in two (`a` then `b`). A split
 * with an `axis` divides along it (`"x"`: `a` left of `b`; `"y"`: `a` above `b`) at `ratio`; one without divides
 * along the rect's longer side in halves, which is dwindle (split along the longer side). Pure: trees in, trees out.
 */
import type { Rect } from "../geometry";
import type { TileOptions } from "./order";
import type { PaneRegion, PaneSide } from "./regions";

export type Split<K> =
  | { readonly pane: K }
  | { readonly a: Split<K>; readonly b: Split<K>; readonly axis?: "x" | "y"; readonly ratio?: number };

/** The rect of every pane of `tree` in `area`, `gap` px between the two sides of each split. */
export function layoutSplit<K>(tree: Split<K> | null, area: Rect, options: TileOptions = {}, out = new Map<K, Rect>()): Map<K, Rect> {
  if (!tree) return out;
  if ("pane" in tree) {
    out.set(tree.pane, { ...area });
    return out;
  }
  const gap = options.gap ?? 0;
  const ratio = tree.ratio ?? 0.5;
  if ((tree.axis ?? (area.width >= area.height ? "x" : "y")) === "x") {
    const w = (area.width - gap) * ratio;
    layoutSplit(tree.a, { x: area.x, y: area.y, width: w, height: area.height }, options, out);
    layoutSplit(tree.b, { x: area.x + w + gap, y: area.y, width: area.width - w - gap, height: area.height }, options, out);
  } else {
    const h = (area.height - gap) * ratio;
    layoutSplit(tree.a, { x: area.x, y: area.y, width: area.width, height: h }, options, out);
    layoutSplit(tree.b, { x: area.x, y: area.y + h + gap, width: area.width, height: area.height - h - gap }, options, out);
  }
  return out;
}

/** The panes of `tree` in order (`a` before `b`). */
export const panesOf = <K>(tree: Split<K> | null): K[] => (!tree ? [] : "pane" in tree ? [tree.pane] : [...panesOf(tree.a), ...panesOf(tree.b)]);

const has = <K>(tree: Split<K> | null, pane: K): boolean => panesOf(tree).includes(pane);

/** `tree` with each pane node `fn` gives a replacement for replaced. */
function mapPanes<K>(tree: Split<K>, fn: (pane: K) => Split<K>): Split<K> {
  if ("pane" in tree) return fn(tree.pane);
  return { ...tree, a: mapPanes(tree.a, fn), b: mapPanes(tree.b, fn) };
}

/**
 * `tree` with pane `at` split in two, `pane` on its `side`. A side writes an explicit axis and ratio 0.5, so the side
 * means the same whatever the pane's shape; no side splits along the longer side, `pane` second (dwindle). An empty
 * tree becomes `pane` alone; an `at` that isn't in the tree (or null) splits the whole tree, so no pane is lost.
 */
export function splitPane<K>(tree: Split<K> | null, at: K | null, pane: K, side?: PaneSide): Split<K> {
  const fresh: Split<K> = { pane };
  const split = (node: Split<K>): Split<K> => {
    if (!side) return { a: node, b: fresh };
    const axis = side === "left" || side === "right" ? "x" : "y";
    const first = side === "left" || side === "top";
    return first ? { a: fresh, b: node, axis, ratio: 0.5 } : { a: node, b: fresh, axis, ratio: 0.5 };
  };
  if (!tree) return fresh;
  if (at === null || !has(tree, at)) return split(tree);
  return mapPanes(tree, (p) => (p === at ? split({ pane: p }) : { pane: p }));
}

/** `tree` without `pane`: its sibling takes their parent's place. */
export function removePane<K>(tree: Split<K> | null, pane: K): Split<K> | null {
  if (!tree) return null;
  if ("pane" in tree) return tree.pane === pane ? null : tree;
  const a = removePane(tree.a, pane);
  const b = removePane(tree.b, pane);
  return a && b ? { ...tree, a, b } : (a ?? b);
}

/** `tree` with panes `x` and `y` in each other's place. */
export function swapPanes<K>(tree: Split<K> | null, x: K, y: K): Split<K> | null {
  if (!tree) return null;
  return mapPanes(tree, (p) => ({ pane: p === x ? y : p === y ? x : p }));
}

/** A dwindle tree for `panes`: each one splits the one before it along the longer side. */
export function splitFromOrder<K>(panes: readonly K[]): Split<K> | null {
  let t: Split<K> | null = null;
  panes.forEach((id, i) => {
    t = splitPane(t, i > 0 ? panes[i - 1]! : null, id);
  });
  return t;
}

/**
 * A drop of `dragged` on pane `at`'s `region`. A side splits `at` on that side (`dragged` taken out of its old place
 * first). The center swaps the two when `dragged` is in the tree; a pane from outside takes `at`'s place, with `at`
 * split off after it along the longer side. The set of panes is kept: the tree's, plus `dragged`.
 */
export function dropOnPane<K>(tree: Split<K> | null, dragged: K, at: K, region: PaneRegion): Split<K> {
  if (dragged === at || !tree) return tree ?? { pane: dragged };
  if (region !== "center") return splitPane(removePane(tree, dragged), at, dragged, region);
  if (has(tree, dragged)) return swapPanes(tree, dragged, at)!;
  return mapPanes(tree, (p) => (p === at ? { a: { pane: dragged }, b: { pane: p } } : { pane: p }));
}
