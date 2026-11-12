/**
 * Placing a popup (a drop label, a menu, a tooltip) the way Wayland's xdg-positioner does: an anchor point on the
 * anchor rect, a gravity, an offset, then the constraint adjustments in order per axis: flip, slide, resize.
 */
import type { Point, Rect, Size } from "./geometry";

/** -1: the start edge (left or top), 0: the centre, 1: the end edge. */
export type Align = -1 | 0 | 1;

/**
 * A rule: the popup's anchor point on the anchor rect, the direction it extends from there (gravity), an offset,
 * and which adjustments are allowed: flip (mirror anchor, gravity and offset; kept only if that fits), then slide
 * (move inside, the start edge winning), then resize (cut to the bounds).
 */
export interface PositionerRule {
  readonly anchor: { readonly x: Align; readonly y: Align };
  readonly gravity: { readonly x: Align; readonly y: Align };
  readonly offset: Point;
  readonly flip: boolean;
  readonly slide: boolean;
  readonly resize: boolean;
}

export interface Positioned {
  readonly rect: Rect;
  readonly flipped: { readonly x: boolean; readonly y: boolean };
  readonly slid: { readonly x: boolean; readonly y: boolean };
  readonly resized: boolean;
}

function placeAxis(a0: number, alen: number, anchor: Align, gravity: Align, offset: number, size: number): number {
  const point = a0 + ((anchor + 1) / 2) * alen + offset;
  return gravity === 1 ? point : gravity === -1 ? point - size : point - size / 2;
}

/** Where a popup of `size` goes for `anchorRect` by `rule`, kept inside `bounds` as far as the rule allows. */
export function positionPopup(anchorRect: Rect, size: Size, bounds: Rect, rule: PositionerRule): Positioned {
  const axes = [
    { a0: anchorRect.x, alen: anchorRect.width, anchor: rule.anchor.x, gravity: rule.gravity.x, offset: rule.offset.x, size: size.width, b0: bounds.x, blen: bounds.width },
    { a0: anchorRect.y, alen: anchorRect.height, anchor: rule.anchor.y, gravity: rule.gravity.y, offset: rule.offset.y, size: size.height, b0: bounds.y, blen: bounds.height },
  ];
  const out = axes.map((ax) => {
    const fits = (start: number, len: number): boolean => start >= ax.b0 - 0.01 && start + len <= ax.b0 + ax.blen + 0.01;
    let start = placeAxis(ax.a0, ax.alen, ax.anchor, ax.gravity, ax.offset, ax.size);
    let len = ax.size;
    let flipped = false;
    let slid = false;
    let resized = false;
    if (!fits(start, len) && rule.flip && (ax.anchor !== 0 || ax.gravity !== 0)) {
      const mirrored = placeAxis(ax.a0, ax.alen, -ax.anchor as Align, -ax.gravity as Align, -ax.offset, ax.size);
      if (fits(mirrored, len)) {
        start = mirrored;
        flipped = true;
      }
    }
    if (!fits(start, len) && rule.slide) {
      if (start + len > ax.b0 + ax.blen) start = ax.b0 + ax.blen - len;
      if (start < ax.b0) start = ax.b0;
      slid = true;
    }
    if (!fits(start, len) && rule.resize) {
      const end = Math.min(start + len, ax.b0 + ax.blen);
      start = Math.max(start, ax.b0);
      len = Math.max(0, end - start);
      resized = true;
    }
    return { start, len, flipped, slid, resized };
  });
  const [x, y] = out as [(typeof out)[0], (typeof out)[0]];
  return {
    rect: { x: x.start, y: y.start, width: x.len, height: y.len },
    flipped: { x: x.flipped, y: y.flipped },
    slid: { x: x.slid, y: y.slid },
    resized: x.resized || y.resized,
  };
}

/** Below the anchor's bottom-left corner, extending right and down, 6 px apart; flips, slides and resizes. */
export const BELOW_LEFT: PositionerRule = {
  anchor: { x: -1, y: 1 },
  gravity: { x: 1, y: 1 },
  offset: { x: 0, y: 6 },
  flip: true,
  slide: true,
  resize: true,
};
