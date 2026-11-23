/**
 * Whether a drop on a pane leaves room: the rule a host asks before it offers a side of a pane as a drop place. See
 * docs/placement.md, Entry: tiling.
 */
import type { Rect } from "../geometry";
import type { Side } from "../side";
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
  const target = layoutSplit(removePane(tree, dragged), area, options).get(at);
  if (!target) return { ok: false, reason: `${region} rejected: no pane to split` };
  const room = canSplitPane(target, region, options);
  if (!room.ok) return room;
  return dropFits(layoutSplit(dropOnPane(tree, dragged, at, region), area, options), dragged, at, area, { min: options.min, side: region });
}

/** What `canSplitPane` reads: `min` (as in `DropOptions`) and the gutter's parts, `gap` and `handle`, px. */
export interface SplitRoomOptions {
  readonly min: number;
  readonly gap?: number;
  readonly handle?: number;
}

/**
 * The room rule: whether a pane of rect `target` can take another on `side`, both at least `options.min` wide and
 * high. Along the split (width for left and right, height for top and bottom) the pane needs `2 * min` plus the
 * gutter (`gap` plus `handle`), across it `min`. The rect is the pane's as the host measures it, where it will be
 * when the dragged pane is lifted out. `canDropOnPane`'s first rule, for a side.
 */
export function canSplitPane(target: Rect, side: Side, options: SplitRoomOptions): DropVerdict {
  const min = px(options.min);
  const gutter = px(options.gap) + px(options.handle);
  const horizontal = side === "left" || side === "right";
  const along = horizontal ? target.width : target.height;
  const across = horizontal ? target.height : target.width;
  const need = min * 2 + gutter;
  if (along < need) return { ok: false, reason: `${side} rejected: axis span ${along.toFixed(1)}px < min ${need.toFixed(1)}px (2 panes + gutter ${gutter}px)` };
  if (across < min) return { ok: false, reason: `${side} rejected: cross span ${across.toFixed(1)}px < min ${min.toFixed(1)}px` };
  return { ok: true };
}

/** What `dropFits` reads: the `min` (as in `DropOptions`) and the `side` of `at` the drop is on, for the reason. */
export interface DropFitsOptions {
  readonly min: number;
  readonly side: Side;
}

/**
 * The fit rule: in `projected`, the rect of every pane in the layout the drop makes (the host's own projection of
 * `dropOnPane`'s tree), whether `dragged` and `at` are both there and at least `options.min` wide and high. Fine
 * when `area` has no width or no height (there is nothing to measure). `canDropOnPane`'s last rule.
 */
export function dropFits<K>(projected: ReadonlyMap<K, Rect>, dragged: K, at: K, area: Rect, options: DropFitsOptions): DropVerdict {
  if (!(area.width > 0 && area.height > 0)) return { ok: true };
  const min = px(options.min);
  const fits = (r: Rect | undefined): boolean => !!r && r.width >= min && r.height >= min;
  return fits(projected.get(dragged)) && fits(projected.get(at)) ? { ok: true } : { ok: false, reason: `${options.side} rejected: projected footprint of the two panes violates min ${min}px` };
}
