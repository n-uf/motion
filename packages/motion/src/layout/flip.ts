import type { Rect } from "../shapes";
import type { LayoutItem } from "./motion";

/** A rect as a DOM rect reports it (`getBoundingClientRect()`): left, top, width, height. */
export interface RectLike {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Anything that can say where it is drawn: a DOM node, or a test's stand-in. */
export interface Measurable {
  getBoundingClientRect(): RectLike;
}

/** A {@link RectLike} as a {@link Rect}. */
export const rectOf = (r: RectLike): Rect => ({ x: r.left, y: r.top, width: r.width, height: r.height });

/** One member of a {@link flip}: an item, the node it draws, and where it goes once the DOM has changed. */
export interface FlipEntry {
  readonly item: LayoutItem;
  readonly node: Measurable;
  /**
   * Once the DOM has changed: the old rect (as measured before, in page coordinates) in the item's own coordinates
   * now, and its new place there.
   */
  readonly place: (before: Rect) => { readonly from: Rect; readonly to: Rect };
}

/**
 * FLIP for DOM groups, on settle: record where each node is drawn (first), change the DOM (`change`: move nodes to
 * other parents, reorder them), then each item is drawn at its old rect and settles to its new place (last, invert,
 * play). No transform tween: a settle from the rect it was drawn at, so it never jumps or overshoots, and its size
 * changes through reveal.
 */
export function flip(entries: readonly FlipEntry[], change: () => void): void {
  const before = entries.map((e) => rectOf(e.node.getBoundingClientRect()));
  change();
  entries.forEach((e, i) => {
    const { from, to } = e.place(before[i]!);
    e.item.glideFrom(from, to);
  });
}
