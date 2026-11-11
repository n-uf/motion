/**
 * The toolbar's grab: the pill drags from its empty space or from the grip at its start; its buttons stay buttons
 * (a press on one never lifts the toolbar). From the keyboard, Space on the grip picks it up; the page's drag does
 * the rest (arrows step through the targets, Enter drops, Escape cancels).
 *
 * Where it may go is toolbar-drops.ts; the drag itself (aiming, previews, release) is the page's, shared with the
 * panels.
 */
import type { Rect } from "@n-uf/motion";
import type { Point } from "../shared/geometry";

/** Where the grip sits in the pill: its centre, from the pill's left edge (vertically: the pill's middle). */
export const GRIP_X = 14;

/** Where the pointer (or the keyboard) holds the toolbar when it is lifted by its grip. */
export const toolbarGrip = (r: Rect): Point => ({ x: r.x + GRIP_X, y: r.y + r.height / 2 });

const DOTS = `<svg width="8" height="14" viewBox="0 0 8 14" aria-hidden="true">${[0, 1]
  .flatMap((c) => [0, 1, 2].map((rw) => `<circle cx="${2 + c * 4}" cy="${2 + rw * 5}" r="1.3" fill="currentColor"/>`))
  .join("")}</svg>`;

export interface ToolbarGrab {
  /** A press that may lift the toolbar (the page tracks it: a click until the threshold, then a drag). */
  press(e: PointerEvent): void;
  /** A key on the grip: Space picks the toolbar up, held by its grip. */
  key(e: KeyboardEvent): void;
}

/** Give the toolbar its grip and its grab: a press on its empty space or the grip, not on a button. */
export function wireToolbar(el: HTMLElement, content: HTMLElement, h: ToolbarGrab): void {
  const grip = document.createElement("button");
  grip.type = "button";
  grip.className = "tb-grip";
  grip.title = "Move the toolbar (drag, or Space then the arrow keys)";
  grip.setAttribute("aria-label", "Move the toolbar");
  grip.innerHTML = DOTS;
  content.prepend(grip);
  el.addEventListener("pointerdown", (e) => {
    // A button is a button: its press is a click, never a drag.
    if ((e.target as Element).closest(".tb-cell")) return;
    h.press(e);
  });
  grip.addEventListener("keydown", (e) => h.key(e));
}
