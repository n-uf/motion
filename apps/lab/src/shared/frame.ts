/**
 * Drawing a window by the proposed rules (reveal: content laid out at the target size, the frame at the drawn size,
 * clipped; never a non-uniform scale) and reading back what the page shows, for the checks.
 */
import { popIn, reveal, type Rect } from "@n-uf/motion";
import type { ScaleSample } from "@n-uf/motion/testing";
import type { Point } from "./geometry";

/** A drawn window: its element (laid out at the target rect), its frame (chrome) and its content. */
export interface Drawn {
  readonly el: HTMLElement;
  readonly frame: HTMLElement;
  readonly content: HTMLElement;
}

/** Lay `w` out at `target` (where its content's size comes from). */
export function layOut(w: Drawn, target: Rect): void {
  Object.assign(w.el.style, { left: `${target.x}px`, top: `${target.y}px`, width: `${target.width}px`, height: `${target.height}px` });
}

/** Proposed: translate to the drawn place, the frame at the drawn size, the content clipped to it; `pop` scales uniformly. */
export function drawRevealed(w: Drawn, drawn: Rect, target: Rect, pop = 1): void {
  const r = reveal(drawn, target);
  const pi = popIn(pop);
  const cx = drawn.width / 2;
  const cy = drawn.height / 2;
  w.el.style.transform = `translate(${r.dx}px, ${r.dy}px) translate(${cx}px, ${cy}px) scale(${pi.scale}) translate(${-cx}px, ${-cy}px)`;
  w.el.style.opacity = String(pi.opacity);
  w.frame.style.width = `${r.width}px`;
  w.frame.style.height = `${r.height}px`;
  w.content.style.clipPath = `inset(0 ${r.clipRight}px ${r.clipBottom}px 0)`;
}

/** What the page draws, read back from the DOM: the element's scale and the frame's rect in stage units. */
export function measureFrame(stage: HTMLElement, stageW: number, w: Drawn, time: number): { scale: ScaleSample; frame: Rect } {
  const css = getComputedStyle(w.el).transform;
  const m = css && css !== "none" ? new DOMMatrixReadOnly(css) : new DOMMatrixReadOnly();
  const s = stage.getBoundingClientRect();
  const f = w.frame.getBoundingClientRect();
  const k = stageW / s.width;
  // The stage has a 1 px border; its content box starts inside it.
  const frame = { x: (f.left - s.left - stage.clientLeft) * k, y: (f.top - s.top - stage.clientTop) * k, width: f.width * k, height: f.height * k };
  return { scale: { t: time, a: m.a, d: m.d }, frame };
}

/**
 * Whether the topmost element at stage point `want` belongs to `w`: null when it does, a failure message when
 * something else is on top, undefined when no point of it can be hit-tested (outside the stage's visible content
 * box or the browser's viewport). The point is moved into the part of the frame that can be hit. `nameOf` names
 * what covers it.
 */
export function onTopAt(
  stage: HTMLElement,
  stageW: number,
  w: { readonly el: HTMLElement; readonly name: string },
  want: Point,
  frame: Rect,
  time: number,
  nameOf: (top: Element) => string | null,
): string | null | undefined {
  const s = stage.getBoundingClientRect();
  const k = s.width / stageW;
  const ox = s.left + stage.clientLeft;
  const oy = s.top + stage.clientTop;
  // The visible box in stage units: the stage's content box, cut to the viewport.
  const vx0 = Math.max(0, -ox / k);
  const vy0 = Math.max(0, -oy / k);
  const vx1 = Math.min(stage.clientWidth / k, (window.innerWidth - ox) / k);
  const vy1 = Math.min(stage.clientHeight / k, (window.innerHeight - oy) / k);
  const x0 = Math.max(frame.x, vx0) + 1;
  const y0 = Math.max(frame.y, vy0) + 1;
  const x1 = Math.min(frame.x + frame.width, vx1) - 1;
  const y1 = Math.min(frame.y + frame.height, vy1) - 1;
  if (x1 <= x0 || y1 <= y0) return undefined;
  const at = { x: Math.min(Math.max(want.x, x0), x1), y: Math.min(Math.max(want.y, y0), y1) };
  const top = document.elementFromPoint(ox + at.x * k, oy + at.y * k);
  if (!top) return undefined;
  if (w.el.contains(top)) return null;
  const other = nameOf(top);
  return `t=${Math.round(time)} ${w.name} is under ${other ?? (top.className || "something")} at (${Math.round(at.x)}, ${Math.round(at.y)})`;
}
