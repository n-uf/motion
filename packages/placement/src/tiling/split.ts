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

/**
 * The rect of every pane of `tree` in `area`, `gap` px between the two sides of each split. A split's `ratio` is
 * clamped to 0..1; each side gets its share of the room the gap leaves (none when the gap is wider than the rect), so
 * no size is ever negative, and at ratio 0.5 both sides are exactly equal. A split with no room lays both sides at no
 * size inside its rect: the first at its start, the second at its end, never past it.
 */
export function layoutSplit<K>(tree: Split<K> | null, area: Rect, options: TileOptions = {}): Map<K, Rect> {
  const out = new Map<K, Rect>();
  lay(tree, area, Math.max(0, options.gap ?? 0), out);
  return out;
}

function lay<K>(tree: Split<K> | null, area: Rect, gap: number, out: Map<K, Rect>): void {
  if (!tree) return;
  if ("pane" in tree) {
    out.set(tree.pane, { ...area });
    return;
  }
  const ratio = Math.min(1, Math.max(0, tree.ratio ?? 0.5));
  if ((tree.axis ?? (area.width >= area.height ? "x" : "y")) === "x") {
    const room = Math.max(0, area.width - gap);
    const w = room * ratio;
    lay(tree.a, { x: area.x, y: area.y, width: w, height: area.height }, gap, out);
    // With no room, the second side sits at the rect's end, not a gap past its start.
    const bx = room > 0 ? area.x + w + gap : area.x + Math.max(0, area.width);
    lay(tree.b, { x: bx, y: area.y, width: room * (1 - ratio), height: area.height }, gap, out);
  } else {
    const room = Math.max(0, area.height - gap);
    const h = room * ratio;
    lay(tree.a, { x: area.x, y: area.y, width: area.width, height: h }, gap, out);
    const by = room > 0 ? area.y + h + gap : area.y + Math.max(0, area.height);
    lay(tree.b, { x: area.x, y: by, width: area.width, height: room * (1 - ratio) }, gap, out);
  }
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
