/**
 * The split tree laid out: the rect of every pane of a `Split` tree in an area. See docs/placement.md, Entry: tiling.
 */
import type { Rect } from "../geometry";
import type { TileOptions } from "./order";
import type { Split } from "./split";

/** A px option: a finite number, never below 0 (anything else is 0). */
const px = (v: number | undefined): number => (v !== undefined && Number.isFinite(v) && v > 0 ? v : 0);

/** A ratio: clamped to 0..1; one that is not finite is 0.5. */
const unit = (v: number | undefined): number => (v === undefined || !Number.isFinite(v) ? 0.5 : Math.min(1, Math.max(0, v)));

/**
 * The rect of every pane of `tree` in `area`, `gap` px between the two sides of each split. A split's `ratio` is
 * clamped to 0..1 (one that is not finite is 0.5), and the middle of the gap sits at `extent * ratio`: the first side
 * is `extent * ratio` less half the gap, the second starts half a gap past it and is the rest less half the gap. No
 * size is ever negative: a side too short for half the gap is 0 along the axis, and the second side of a split with no
 * room may then start up to half a gap past the rect's end. At ratio 0.5 both sides are equal.
 */
export function layoutSplit<K>(tree: Split<K> | null, area: Rect, options: TileOptions = {}): Map<K, Rect> {
  const out = new Map<K, Rect>();
  lay(tree, area, px(options.gap), out);
  return out;
}

function lay<K>(tree: Split<K> | null, area: Rect, gap: number, out: Map<K, Rect>): void {
  if (!tree) return;
  if ("pane" in tree) {
    out.set(tree.pane, { ...area });
    return;
  }
  const ratio = unit(tree.ratio);
  const off = gap / 2;
  if ((tree.axis ?? (area.width >= area.height ? "x" : "y")) === "x") {
    lay(tree.a, { x: area.x, y: area.y, width: Math.max(0, area.width * ratio - off), height: area.height }, gap, out);
    lay(tree.b, { x: area.x + area.width * ratio + off, y: area.y, width: Math.max(0, area.width * (1 - ratio) - off), height: area.height }, gap, out);
  } else {
    lay(tree.a, { x: area.x, y: area.y, width: area.width, height: Math.max(0, area.height * ratio - off) }, gap, out);
    lay(tree.b, { x: area.x, y: area.y + area.height * ratio + off, width: area.width, height: Math.max(0, area.height * (1 - ratio) - off) }, gap, out);
  }
}
