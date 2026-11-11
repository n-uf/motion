import type { Rect } from "../shapes";

/**
 * How to draw a window whose rect is gliding without stretching its content.
 *
 * The content is laid out once at the target size and never scaled. The
 * window's element sits at its target in the layout; to draw it at the
 * gliding rect:
 *
 * - move the element by (`dx`, `dy`), so its top-left corner is the drawn rect's;
 * - draw the frame (background, border, shadow) at `width` × `height`: the drawn size;
 * - clip the content by `clipRight` and `clipBottom` so it fits a frame
 *   smaller than the target (CSS: `clip-path: inset(0 clipRight clipBottom 0)`).
 *
 * A window that shrinks shows a band of its own background closing in at the
 * right and bottom; one that grows reveals content already laid out at its
 * new size. Text is never stretched. One transform and one clip per frame, no
 * layout per frame.
 */
export interface RevealFrame {
  /** Move the element (laid out at the target) right by this much. */
  readonly dx: number;
  /** Move the element (laid out at the target) down by this much. */
  readonly dy: number;
  /** The frame's width: the drawn rect's. */
  readonly width: number;
  /** The frame's height: the drawn rect's. */
  readonly height: number;
  /** Clip this much off the content's right edge (0 when the frame is at least as wide as the target). */
  readonly clipRight: number;
  /** Clip this much off the content's bottom edge (0 when the frame is at least as tall as the target). */
  readonly clipBottom: number;
}

/** The {@link RevealFrame} for content laid out at `target` and drawn at `drawn`. */
export function reveal(drawn: Rect, target: Rect): RevealFrame {
  return {
    dx: drawn.x - target.x,
    dy: drawn.y - target.y,
    width: Math.max(0, drawn.width),
    height: Math.max(0, drawn.height),
    clipRight: Math.max(0, target.width - drawn.width),
    clipBottom: Math.max(0, target.height - drawn.height),
  };
}

/** A uniform pop-in (or pop-out, run backwards): scale about the centre and opacity. */
export interface PopIn {
  /** Scale about the window's centre: the same on both axes, so nothing is stretched. */
  readonly scale: number;
  readonly opacity: number;
}

/**
 * Opening and closing: the window grows from `from` of its size to full, about
 * its centre, while fading in. `progress` runs 0 to 1 (take it from a settle
 * on a number with `{ restDelta: 0.001 }`, since the default 0.1 is tuned for
 * pixels and would snap the last 10 %; or from a tween); closing runs it from
 * 1 to 0. Hyprland's default is `popin 87%`.
 */
export function popIn(progress: number, from = 0.87): PopIn {
  const p = Math.min(1, Math.max(0, progress));
  return { scale: from + (1 - from) * p, opacity: p };
}
