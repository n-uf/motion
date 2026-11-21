/**
 * Whether a drop on a pane leaves room: the rule a host asks before it offers a side of a pane as a drop place. See
 * docs/placement.md, Entry: tiling.
 */
import type { Rect } from "../geometry";
import { layoutSplit, type SplitOptions } from "./layout";
import type { PaneRegion } from "./regions";
import { dropOnPane, panesOf, removePane, type Split } from "./split";

/** The layout options a drop is judged under, and `min`: the least width and height, px, a pane must keep. */
export interface DropOptions<K> extends SplitOptions<K> {
  readonly min: number;
}

/** A drop's verdict: `ok`, or not, with its `reason`. */
export interface DropVerdict {
  readonly ok: boolean;
  readonly reason?: string;
}

const px = (v: number | undefined): number => (v !== undefined && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * Whether dropping `dragged` on pane `at`'s `region` leaves both at least `options.min` wide and high.
 *
 * - The center is fine unless `dragged` is `at`, or `at` is not in the tree (nothing to swap with).
 * - A side needs, in the layout of the tree without `dragged` (so `at` is measured where it will be when `dragged` is
 *   lifted out), a span of `at` along the split of at least `2 * min` plus the gutter (the options' gap plus handle)
 *   and across it of at least `min`; and in the layout of `dropOnPane(tree, dragged, at, region)` both `dragged` and
 *   `at` at least `min` wide and high. That check is skipped when `area` has no width or no height. A pane that is
 *   not in the tree counts as one being added; an `at` that is not in it (or is `dragged`) has no place to split.
 */
export function canDropOnPane<K>(tree: Split<K> | null, dragged: K, at: K, region: PaneRegion, area: Rect, options: DropOptions<K>): DropVerdict {
  if (region === "center") {
    if (dragged === at) return { ok: false, reason: "center swap blocked: a pane dropped on itself" };
    return panesOf(tree).includes(at) ? { ok: true } : { ok: false, reason: "center rejected: no pane to swap" };
  }
  const min = px(options.min);
  const gutter = px(options.gap) + px(options.handle);
  const target = layoutSplit(removePane(tree, dragged), area, options).get(at);
  if (!target) return { ok: false, reason: `${region} rejected: no pane to split` };
  const horizontal = region === "left" || region === "right";
  const along = horizontal ? target.width : target.height;
  const across = horizontal ? target.height : target.width;
  const need = min * 2 + gutter;
  if (along < need) return { ok: false, reason: `${region} rejected: axis span ${along.toFixed(1)}px < min ${need.toFixed(1)}px (2 panes + gutter ${gutter}px)` };
  if (across < min) return { ok: false, reason: `${region} rejected: cross span ${across.toFixed(1)}px < min ${min.toFixed(1)}px` };
  if (!(area.width > 0 && area.height > 0)) return { ok: true };
  const after = layoutSplit(dropOnPane(tree, dragged, at, region), area, options);
  const fits = (r: Rect | undefined): boolean => !!r && r.width >= min && r.height >= min;
  return fits(after.get(dragged)) && fits(after.get(at)) ? { ok: true } : { ok: false, reason: `${region} rejected: projected footprint of the two panes violates min ${min}px` };
}
