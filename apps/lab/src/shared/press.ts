/**
 * A press that may become a drag: a click until the pointer has moved DRAG_THRESHOLD stage px, then a drag.
 * Escape (cancelPress) ends the whole press: its later moves lift nothing. A pointercancel (the system took the
 * pointer) cancels like Escape.
 */
import type { Point } from "./geometry";

/** A press is a click until the pointer has moved this far (stage px); only then is anything lifted. */
export const DRAG_THRESHOLD = 5;

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
 * On touch, a press lifts only after a long press: held for `hold` ms, then moved `lift` px. Moving that far
 * before the hold is over is not a drag (the press lifts nothing).
 */
export interface TouchLift {
  readonly hold: number;
  readonly lift: number;
}

/** Track a primary-button press on its target until release (`touch`: a long press first, on touch input). */
export function trackPress(e: PointerEvent, h: PressHandlers, touch?: TouchLift): void {
  if (e.button !== 0 || e.ctrlKey) return;
  e.preventDefault();
  const target = e.currentTarget as HTMLElement;
  target.setPointerCapture(e.pointerId);
  const start = h.point(e);
  const t0 = performance.now();
  const long = touch && e.pointerType === "touch" ? touch : null;
  let refused = false;
  gestureCancelled = false;
  const move = (ev: PointerEvent): void => {
    if (gestureCancelled || refused) return;
    const q = h.point(ev);
    if (!h.lifted()) {
      const far = Math.hypot(q.x - start.x, q.y - start.y);
      if (long && performance.now() - t0 < long.hold) {
        if (far >= long.lift) refused = true;
        return;
      }
      if (far < (long ? long.lift : DRAG_THRESHOLD)) return;
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
