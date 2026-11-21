/**
 * The split tree: how panes divide an area. A node is a pane, or a split of its rect in two (`a` then `b`). A split
 * with an `axis` divides along it (`"x"`: `a` left of `b`; `"y"`: `a` above `b`) at `ratio`; one without divides
 * along the rect's longer side in halves, which is dwindle (split along the longer side). Pure: trees in, trees out.
 */
import type { PaneRegion, PaneSide } from "./regions";

/**
 * A pane, or a split of its rect in two, `a` then `b`. A split takes its `axis` and its `ratio` (the first side's
 * share); `gap` replaces the layout's gap for this split (the handle stays global); `id` names the split so
 * `layoutSplitTree` reports its geometry.
 */
export type Split<K> =
  | { readonly pane: K }
  | { readonly a: Split<K>; readonly b: Split<K>; readonly axis?: "x" | "y"; readonly ratio?: number; readonly gap?: number; readonly id?: string };

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

/** `tree` with panes `x` and `y` in each other's place; unchanged unless both are in it. */
export function swapPanes<K>(tree: Split<K> | null, x: K, y: K): Split<K> | null {
  if (!tree || !has(tree, x) || !has(tree, y)) return tree;
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
 * split off after it along the longer side. An `at` that isn't in the tree (or is `dragged` itself) changes nothing
 * but adding `dragged` when it is missing, as `splitPane` does. The set of panes is kept: the tree's, plus `dragged`.
 */
export function dropOnPane<K>(tree: Split<K> | null, dragged: K, at: K, region: PaneRegion): Split<K> {
  if (!tree) return { pane: dragged };
  if (dragged === at || !has(tree, at)) return has(tree, dragged) ? tree : splitPane(tree, null, dragged);
  if (region !== "center") return splitPane(removePane(tree, dragged), at, dragged, region);
  if (has(tree, dragged)) return swapPanes(tree, dragged, at)!;
  return mapPanes(tree, (p) => (p === at ? { a: { pane: dragged }, b: { pane: p } } : { pane: p }));
}
