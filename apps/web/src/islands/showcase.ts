/**
 * The page's showcase controller: every automatic showcase (hero loops, card thumbnails, any auto-playing demo)
 * registers here, once per page.
 *
 * - The user's first action in any demo (pointerdown, a drag, a key on a demo control, a click on a case) pauses all
 *   of them at once; an interrupted animation stops where it is.
 * - They resume 10 s after the last action (every action restarts the timer), never during a drag, from a clean state.
 * - They also pause while the tab is hidden or the showcase is off screen. With reduced motion there is no auto-play.
 * - `[data-showcase-hint]` elements say so while paused.
 */
import { reduced } from "./motion";

export interface Showcase {
  /** Start (or resume, from a clean state) the automatic play. */
  start(): void;
  /** Stop where it is. */
  stop(): void;
}

const RESUME_AFTER = 10_000;
const entries: { el: Element; show: Showcase; visible: boolean; running: boolean }[] = [];
let pausedByUser = false, dragging = false, timer = 0, lastAction = 0;

function want(e: (typeof entries)[number]): boolean {
  return !reduced() && !pausedByUser && !dragging && e.visible && document.visibilityState === "visible";
}
function sync(): void {
  for (const e of entries) {
    const w = want(e);
    if (w && !e.running) { e.running = true; e.show.start(); }
    else if (!w && e.running) { e.running = false; e.show.stop(); }
  }
  document.querySelectorAll<HTMLElement>("[data-showcase-hint]").forEach((h) => (h.hidden = !pausedByUser));
  document.querySelectorAll<HTMLElement>("[data-showcase-idle]").forEach((h) => (h.hidden = pausedByUser));
}
function armResume(): void {
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    if (dragging) return armResume();
    pausedByUser = false;
    sync();
  }, RESUME_AFTER);
}

/** A user action in a demo: pause every showcase now, and resume 10 s after the last such action. */
export function userAction(): void {
  lastAction = performance.now();
  pausedByUser = true;
  sync();
  armResume();
}
/** A drag in progress keeps the showcases paused even past 10 s; its end counts as an action. */
export function setDragging(on: boolean): void {
  dragging = on;
  userAction();
}

/** Register a showcase that runs while `el` is on screen. */
export function registerShowcase(el: Element, show: Showcase): void {
  const e = { el, show, visible: false, running: false };
  entries.push(e);
  new IntersectionObserver(([entry]) => {
    e.visible = !!entry?.isIntersecting;
    sync();
  }).observe(el);
}

/** Watch `root` (a demo's figure) for user actions: pointerdown, keys on its controls, clicks on its cases. */
export function watchActions(root: Element): void {
  root.addEventListener("pointerdown", () => userAction(), { capture: true });
  root.addEventListener("keydown", (ev) => {
    const k = (ev as KeyboardEvent).key;
    if (k !== "Tab" && k !== "Shift") userAction();
  }, { capture: true });
}

document.addEventListener("visibilitychange", sync);
// A change of the reduced-motion preference starts or stops every auto-play at once, not at the next action.
matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", sync);

/** For checks: the controller's state. */
(window as unknown as Record<string, unknown>).__showcase = {
  state: () => ({ pausedByUser, dragging, running: entries.filter((e) => e.running).length, sinceAction: lastAction ? performance.now() - lastAction : null }),
};
