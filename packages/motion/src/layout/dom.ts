import type { Rect } from "../shapes";
import type { Drawable, DrawFrame } from "./motion";

/**
 * The style properties the layout motion writes, as strings (a DOM node's `style` has them all). Structural: the
 * library needs no DOM types.
 */
export interface StyleLike {
  left: string;
  top: string;
  width: string;
  height: string;
  transform: string;
  opacity: string;
  clipPath: string;
  visibility: string;
}

/** Something with a writable {@link StyleLike} `style`: a DOM node. */
export interface Styled {
  readonly style: StyleLike;
}

/**
 * The nodes of a drawn box: `node` is laid out at the box and moved to the drawn rect; `frame` (background, border,
 * shadow) is drawn at the drawn size; `content` is clipped to it. With no `frame` and `content`, `node` itself is
 * clipped (its content laid out at the box, never stretched).
 */
export interface BoxNodes {
  readonly node: Styled;
  readonly frame?: Styled;
  readonly content?: Styled;
}

/** Lay `node` out at `box`: its position and size, in its offset parent's coordinates. */
export function layOutBox(node: Styled, box: Rect): void {
  const s = node.style;
  s.left = `${box.x}px`;
  s.top = `${box.y}px`;
  s.width = `${box.width}px`;
  s.height = `${box.height}px`;
}

/**
 * Draw one frame of a box laid out by {@link layOutBox}: one transform (the move to the drawn rect, and the uniform
 * appearance about its centre), the frame at the drawn size, the content clipped (reveal); hidden when gone.
 */
export function drawBox(nodes: BoxNodes, frame: DrawFrame): void {
  const { reveal: r, pop } = frame;
  const cx = frame.drawn.width / 2;
  const cy = frame.drawn.height / 2;
  const s = nodes.node.style;
  s.transform =
    pop.scale === 1 ? `translate(${r.dx}px, ${r.dy}px)` : `translate(${r.dx}px, ${r.dy}px) translate(${cx}px, ${cy}px) scale(${pop.scale}) translate(${-cx}px, ${-cy}px)`;
  s.opacity = pop.opacity === 1 ? "" : String(pop.opacity);
  if (nodes.frame) {
    nodes.frame.style.width = `${r.width}px`;
    nodes.frame.style.height = `${r.height}px`;
  }
  const clipped = nodes.content ?? (nodes.frame ? null : nodes.node);
  if (clipped) clipped.style.clipPath = r.clipRight || r.clipBottom ? `inset(0 ${r.clipRight}px ${r.clipBottom}px 0)` : "";
  // All the way gone: out of sight and out of the way of the pointer.
  s.visibility = frame.gone ? "hidden" : "";
}

/** A {@link Drawable} for DOM nodes: {@link layOutBox} on a new box, {@link drawBox} on every frame. */
export function domDrawable(nodes: BoxNodes): Drawable {
  return {
    layOut: (box) => layOutBox(nodes.node, box),
    draw: (frame) => drawBox(nodes, frame),
  };
}
