/**
 * A press that may become a drag: a click until the lift rule of @n-uf/motion/drag says it lifts (a mouse at 5 stage
 * px; with `longPress`, a touch only after a hold). Escape (cancelPress) ends the whole press: its later moves lift
 * nothing. A pointercancel (the system took the pointer) cancels like Escape.
 */
import { liftDecision } from "@n-uf/motion/drag";
import type { Point } from "./geometry";

/** Escape ended the current press: its later moves lift nothing. */
let gestureCancelled = false;

/** End the current press for good (Escape): the page cancels its drag itself. */
export function cancelPress(): void {
  gestureCancelled = true;
}

export interface PressHandlers {
  /** The pointer in stage units. */
  point(e: PointerEvent): Point;
  /** This press lifted something (a drag is running for it). */
  lifted(): boolean;
  /** Past the threshold: lift, at the press's start point. */
  begin(start: Point): void;
  move(at: Point): void;
  /** Released (cancel false) or cancelled by the system (true); called only when this press lifted something. */
  end(cancel: boolean): void;
}

/**
 * Track a primary-button press on its target until release. `longPress`: on touch input, the press lifts only
 * after a hold, and moving before the hold is over is not a drag (the press lifts nothing).
 */
export function trackPress(e: PointerEvent, h: PressHandlers, longPress = false): void {
  if (e.button !== 0 || e.ctrlKey) return;
  e.preventDefault();
  const target = e.currentTarget as HTMLElement;
  target.setPointerCapture(e.pointerId);
  const start = h.point(e);
  const t0 = performance.now();
  const touch = longPress && e.pointerType === "touch";
  let refused = false;
  gestureCancelled = false;
  const move = (ev: PointerEvent): void => {
    if (gestureCancelled || refused) return;
    const q = h.point(ev);
    if (!h.lifted()) {
      const decision = liftDecision({ touch, distance: Math.hypot(q.x - start.x, q.y - start.y), elapsed: performance.now() - t0 });
      if (decision === "refuse") refused = true;
      if (decision !== "lift") return;
      h.begin(start);
    }
    h.move(q);
  };
  const up = (ev: PointerEvent): void => {
    target.removeEventListener("pointermove", move);
    target.removeEventListener("pointerup", up);
    target.removeEventListener("pointercancel", up);
    // A click (never past the threshold) lifted nothing, so there is nothing to drop.
    if (h.lifted()) h.end(ev.type === "pointercancel");
  };
  target.addEventListener("pointermove", move);
  target.addEventListener("pointerup", up);
  target.addEventListener("pointercancel", up);
}
