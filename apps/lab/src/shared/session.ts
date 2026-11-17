/**
 * The lab's one drag session wiring: what every page that drags an item by its grip shares, so no page wires its own.
 *
 * - A grip's press (`@n-uf/motion/drag`'s `createGripPress`): past the lift distance a drag, else a click or the second
 *   click of a double. The press's window listeners (move, up, cancel, keys, context menu) live from the press to the
 *   end of the drag, and every end (a drop, Escape, a reset mid-drag) removes them.
 * - While a drag is on, the root carries `data-drag-session="<kind>"` (one base CSS rule turns hover, resize handles and
 *   selection off under it), and the page's `frame(now)` runs on animation frames, unless the checks drive the frames
 *   themselves (`drive(true)`).
 * - The click that follows a drag's pointer-up is the drag's (`swallowClick`), never a press on what lies under it.
 * - ⌘/Ctrl and Alt belong to the drag while it lasts: no context menu and no browser shortcut.
 *
 * The page keeps what is its own: the drag intent and its targets, the held copy, the slot and what a drop commits.
 */
import { createGripPress, type DragKeys, type GripRelease } from "@n-uf/motion/drag";
import type { Point } from "@n-uf/placement";

/** The modifier keys an event says are held. */
const keysOf =(e: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean; metaKey: boolean }): DragKeys => ({ shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey });

/** The click that follows a drag's pointer-up is the drag's, not a press on whatever lies under the pointer. */
export function swallowClick(): void {
  const eat = (e: Event): void => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener("click", eat, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", eat, { capture: true }), 0);
}

/**
 * A press's window listeners, from the press to its end: pointer moves, the pointer let go or cancelled, keys down and
 * up, and (with `noMenu`) no context menu. Returns the function that removes them all.
 */
export function followPointer(on: { move(e: PointerEvent): void; up(e: PointerEvent): void; key?(e: KeyboardEvent): void; noMenu?: boolean }): () => void {
  const key = (e: KeyboardEvent): void => on.key?.(e);
  const noMenu = (e: Event): void => e.preventDefault();
  window.addEventListener("pointermove", on.move);
  window.addEventListener("pointerup", on.up);
  window.addEventListener("pointercancel", on.up);
  window.addEventListener("keydown", key);
  window.addEventListener("keyup", key);
  if (on.noMenu) window.addEventListener("contextmenu", noMenu, true);
  return () => {
    window.removeEventListener("pointermove", on.move);
    window.removeEventListener("pointerup", on.up);
    window.removeEventListener("pointercancel", on.up);
    window.removeEventListener("keydown", key);
    window.removeEventListener("keyup", key);
    window.removeEventListener("contextmenu", noMenu, true);
  };
}

/** What a grip's press does at each step: the page's half of the session. */
export interface GripHandlers {
  /** Past the lift distance: lift, pressed at `start`, the pointer now at `p`. False: nothing lifts (the press ends). */
  lift(start: Point, p: Point, keys: DragKeys): boolean;
  /** The pointer moved during the drag, with the keys held now. */
  move(p: Point, keys: DragKeys): void;
  /** Let go (`cancel` false), or the system took the pointer (`cancel` true). */
  release(p: Point, keys: DragKeys, cancel: boolean): void;
  /** Escape during the drag. */
  escape(): void;
  /** A modifier pressed or let go during the drag. */
  keys(keys: DragKeys): void;
  /** The press ended without a lift: a click, or the second click of a double. */
  ended(how: Exclude<GripRelease, null>): void;
}

export interface DragSessionOptions {
  /** The element that carries `data-drag-session` while a drag is on. */
  readonly root: HTMLElement;
  /** An event's point in the page's own px. */
  point(e: { clientX: number; clientY: number }): Point;
  /** One frame of the drag in progress. */
  frame(now: number): void;
}

export function createDragSession(o: DragSessionOptions) {
  const gripPress = createGripPress();
  /** What the last grip press was on: a double pairs two presses on the same thing only. */
  let lastOn: string | null = null;
  /** Removes the listeners of the press in progress: every end of a drag calls it. */
  let endInput: (() => void) | null = null;
  let kind: string | null = null;
  let raf = 0;
  /** Checks drive the drag themselves: no animation frames then. */
  let driven = false;

  /** A drag of a `k` item is on: the root says so, and frames run (unless driven). */
  function started(k: string, now: number): void {
    kind = k;
    o.root.dataset.dragSession = k;
    o.frame(now);
    if (driven) return;
    const loop = (): void => {
      if (kind === null) return;
      o.frame(performance.now());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  /** The drag is over: no frames, no session mark, and the press's listeners gone. */
  function ended(): void {
    cancelAnimationFrame(raf);
    kind = null;
    delete o.root.dataset.dragSession;
    endInput?.();
  }

  /**
   * A primary press on a grip, on `on` (an id: a double pairs two presses on the same one). It tracks the press until
   * it ends, through `h`.
   */
  function press(e: PointerEvent, on: string, h: GripHandlers): void {
    e.preventDefault();
    const start = o.point(e);
    let lifted = false;
    if (lastOn !== on) gripPress.cancel();
    lastOn = on;
    gripPress.down(start, performance.now());
    const mv = (ev: PointerEvent): void => {
      const p = o.point(ev);
      if (!lifted) {
        if (gripPress.move(p, performance.now()) !== "lift") return;
        lifted = h.lift(start, p, keysOf(ev));
        if (!lifted) {
          gripPress.cancel();
          return stop();
        }
      }
      h.move(p, keysOf(ev));
    };
    const stop = (): void => {
      unlisten();
      if (endInput === stop) endInput = null;
    };
    endInput = stop;
    const up = (ev: PointerEvent): void => {
      stop();
      if (ev.type !== "pointerup") gripPress.cancel();
      const how = ev.type === "pointerup" ? gripPress.up(o.point(ev), performance.now()) : null;
      if (lifted && kind !== null) {
        swallowClick();
        h.release(o.point(ev), keysOf(ev), ev.type === "pointercancel");
      } else if (how) h.ended(how);
    };
    const key = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape" && kind !== null) {
        h.escape();
        stop();
        return;
      }
      // The drag's keys (⌘/Ctrl, Alt) fire no browser shortcut while it lasts.
      if (ev.type === "keydown" && (ev.key === "Control" || ev.key === "Meta" || ev.key === "Alt" || ev.ctrlKey || ev.metaKey)) ev.preventDefault();
      if (kind !== null && (ev.key === "Shift" || ev.key === "Alt" || ev.key === "Control" || ev.key === "Meta")) h.keys(keysOf(ev));
    };
    // ⌘/Ctrl is a drag key: while a press is on it never opens a context menu (a Ctrl-click on macOS).
    const unlisten = followPointer({ move: mv, up, key, noMenu: true });
  }

  return {
    press,
    started,
    ended,
    /** The listeners of the press in progress, removed (a resize or a reset takes the pointer over). */
    endPress(): void {
      endInput?.();
    },
    /** Another press (a resize handle's) owns the pointer: its stop is what the next end calls. */
    holdInput(stop: () => void): void {
      endInput = stop;
    },
    /** Whether `stop` is the press in progress. */
    releaseInput(stop: () => void): void {
      if (endInput === stop) endInput = null;
    },
    /** A pause between gestures: the next press is a first click, never the second of a double. */
    pause(): void {
      gripPress.cancel();
      lastOn = null;
    },
    /** The checks drive the frames themselves while `on`. */
    drive(on: boolean): void {
      driven = on;
    },
    get driven(): boolean {
      return driven;
    },
  };
}
