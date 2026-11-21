/**
 * The split tree laid out: the rect of every pane of a `Split` tree in an area, and the geometry of the splits that
 * have an id. See docs/placement.md, Entry: tiling.
 */
import type { Rect } from "../geometry";
import type { TileOptions } from "./order";
import type { Split } from "./split";

/** A px option: a finite number, never below 0 (anything else is 0). */
const px = (v: number | undefined): number => (v !== undefined && Number.isFinite(v) && v > 0 ? v : 0);

/** A ratio: clamped to 0..1; one that is not finite is 0.5. */
const unit = (v: number | undefined): number => (v === undefined || !Number.isFinite(v) ? 0.5 : Math.min(1, Math.max(0, v)));

/** A laid-out split: the box it divides, its axis and ratio in effect, and the strip between its two sides. */
export interface SplitGeometry {
  readonly rect: Rect;
  readonly axis: "x" | "y";
  /** The first side's share in effect: the middle of the gutter lies at `rect`'s start plus extent times this. */
  readonly ratio: number;
  /** The gutter between the two sides, as a rect inside `rect`; null where the split has none. */
  readonly divider: Rect | null;
}

/** A tree laid out: every pane's rect, and the geometry of each split that has an `id`. */
export interface SplitLayout<K> {
  readonly panes: Map<K, Rect>;
  readonly splits: Map<string, SplitGeometry>;
}

interface Ctx<K> {
  readonly gap: number;
  readonly handle: number;
  readonly panes: Map<K, Rect>;
  readonly splits: Map<string, SplitGeometry>;
}

/**
 * The rect of every pane of `tree` in `area`. Each split's gutter is its gap (its own `gap`, else `options.gap`) plus
 * `options.handle`. A split's `ratio` is clamped to 0..1 (one that is not finite is 0.5), and the middle of the gutter
 * sits at `extent * ratio`: the first side is `extent * ratio` less half the gutter, the second starts half a gutter
 * past it and is the rest less half the gutter. No size is ever negative: a side too short for half the gutter is 0
 * along the axis, and the second side of a split with no room may then start up to half a gutter past the rect's end.
 * At ratio 0.5 both sides are equal.
 */
export function layoutSplit<K>(tree: Split<K> | null, area: Rect, options: TileOptions = {}): Map<K, Rect> {
  return layoutSplitTree(tree, area, options).panes;
}

/**
 * `layoutSplit` and the geometry of every split that has an `id` (a repeated id keeps the last): the box it divides,
 * its axis and ratio in effect, and its divider, the gutter strip between its two sides.
 */
export function layoutSplitTree<K>(tree: Split<K> | null, area: Rect, options: TileOptions = {}): SplitLayout<K> {
  const ctx: Ctx<K> = { gap: px(options.gap), handle: px(options.handle), panes: new Map(), splits: new Map() };
  lay(tree, area, ctx);
  return { panes: ctx.panes, splits: ctx.splits };
}

/** The strip `gutter` wide centered on `mid` across `box`, clipped to it. */
function strip(box: Rect, x: boolean, mid: number, gutter: number): Rect {
  const lo = Math.max(x ? box.x : box.y, mid - gutter / 2);
  const hi = Math.min(x ? box.x + box.width : box.y + box.height, mid + gutter / 2);
  const length = Math.max(0, hi - lo);
  return x ? { x: lo, y: box.y, width: length, height: box.height } : { x: box.x, y: lo, width: box.width, height: length };
}

function lay<K>(tree: Split<K> | null, area: Rect, ctx: Ctx<K>): void {
  if (!tree) return;
  if ("pane" in tree) {
    ctx.panes.set(tree.pane, { ...area });
    return;
  }
  const x = (tree.axis ?? (area.width >= area.height ? "x" : "y")) === "x";
  const gutter = (tree.gap === undefined ? ctx.gap : px(tree.gap)) + ctx.handle;
  const ratio = unit(tree.ratio);
  const off = gutter / 2;
  if (tree.id !== undefined) {
    const mid = x ? area.x + area.width * ratio : area.y + area.height * ratio;
    ctx.splits.set(tree.id, { rect: { ...area }, axis: x ? "x" : "y", ratio, divider: strip(area, x, mid, gutter) });
  }
  if (x) {
    lay(tree.a, { x: area.x, y: area.y, width: Math.max(0, area.width * ratio - off), height: area.height }, ctx);
    lay(tree.b, { x: area.x + area.width * ratio + off, y: area.y, width: Math.max(0, area.width * (1 - ratio) - off), height: area.height }, ctx);
  } else {
    lay(tree.a, { x: area.x, y: area.y, width: area.width, height: Math.max(0, area.height * ratio - off) }, ctx);
    lay(tree.b, { x: area.x, y: area.y + area.height * ratio + off, width: area.width, height: Math.max(0, area.height * (1 - ratio) - off) }, ctx);
  }
}
