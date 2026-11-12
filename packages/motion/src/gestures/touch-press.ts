import type { TimerSource } from "../clock/port";
import type { Point } from "../shapes";
import { createMachine, type Deadline, type Machine } from "./machine";

/**
 * A touch press on something draggable that sits in a scrolling page: is it a drag, or a scroll?
 *
 * ```text
 * idle ──press──► pressed ──move: mostly along the scroll direction, ≥ scrollEscape──► scrolled (never lifts)
 *                    │ ──move: mostly across it, ≥ lift px────────────────────────────► lifted
 *                    │ ──tick: held still holdMs─────────────────────────────────────► lifted (where it was pressed)
 *                    └ ──move: along it short of the escape, or across it below lift px: stays pressed
 * any ──release──► idle
 * ```
 *
 * Before the hold has elapsed, a finger that travels mostly along the page's scroll direction is a scroll: the touch
 * goes back to the page and stays a scroll until it is released; short of the escape it waits, never lifting.
 * Travel past the lift distance mostly across the scroll direction is a deliberate drag. Once the hold has elapsed
 * the press lifts where it is. `scrolled` and `lifted`
 * hold until `release`.
 */

/** Tunables of the touch press. */
export interface TouchPressConfig {
  /** px of travel that lifts a press that is not a scroll. Default 6. */
  readonly lift: number;
  /** px of travel along the scroll direction that makes the press a scroll. Default 10. */
  readonly scrollEscape: number;
  /** The page's scroll direction: `"y"` (a vertical page, the default) or `"x"`. */
  readonly scroll: "x" | "y";
  /** ms a still finger holds before the press lifts where it is. Default 220. */
  readonly holdMs: number;
}

/** Defaults of {@link TouchPressConfig}. */
export const TOUCH_PRESS_DEFAULTS: TouchPressConfig = { lift: 6, scrollEscape: 10, scroll: "y", holdMs: 220 };

/** The touch press's state. `from` is where the finger went down, `at` where it lifted. */
export type TouchPressState =
  | { readonly phase: "idle" }
  | { readonly phase: "pressed"; readonly from: Point; readonly since: number }
  | { readonly phase: "lifted"; readonly from: Point; readonly at: Point }
  | { readonly phase: "scrolled"; readonly from: Point };

/** Events of the touch press. `t` is the clock time in ms. */
export type TouchPressInput =
  | { readonly type: "press"; readonly t: number; readonly point: Point }
  | { readonly type: "move"; readonly point: Point }
  | { readonly type: "tick"; readonly t: number }
  | { readonly type: "release" };

/** The idle state (the same object every time). */
export const TOUCH_PRESS_IDLE: TouchPressState = { phase: "idle" };

/** The touch press's pure transition function. */
export function touchPressReducer(state: TouchPressState, event: TouchPressInput, config: TouchPressConfig = TOUCH_PRESS_DEFAULTS): TouchPressState {
  switch (event.type) {
    case "release":
      return state.phase === "idle" ? state : TOUCH_PRESS_IDLE;
    case "press":
      return state.phase === "idle" ? { phase: "pressed", from: { x: event.point.x, y: event.point.y }, since: event.t } : state;
    case "tick":
      if (state.phase !== "pressed" || event.t - state.since < config.holdMs) return state;
      return { phase: "lifted", from: state.from, at: state.from };
    case "move": {
      if (state.phase !== "pressed") return state;
      const dx = event.point.x - state.from.x;
      const dy = event.point.y - state.from.y;
      const along = Math.abs(config.scroll === "y" ? dy : dx);
      const across = Math.abs(config.scroll === "y" ? dx : dy);
      // Mostly along the scroll direction is never a lift: a scroll once it reaches the escape, until then waiting
      // (a finger scroll is reported a few px at a time, and would pass the lift distance first).
      if (along > across) return along >= config.scrollEscape ? { phase: "scrolled", from: state.from } : state;
      if (Math.hypot(dx, dy) >= config.lift) return { phase: "lifted", from: state.from, at: { x: event.point.x, y: event.point.y } };
      return state;
    }
    default:
      return state;
  }
}

/** When a pressed state lifts by holding, as a timer event; `null` outside `pressed`. */
export function touchPressDeadline(state: TouchPressState, config: TouchPressConfig = TOUCH_PRESS_DEFAULTS): Deadline<TouchPressInput> | null {
  if (state.phase !== "pressed") return null;
  return { at: state.since + config.holdMs, event: (t) => ({ type: "tick", t }) };
}

/** Options of {@link createTouchPress}. */
export interface TouchPressOptions {
  readonly clock: TimerSource;
  readonly config?: Partial<TouchPressConfig>;
}

/** A touch press on a clock: the hold timer is armed for you. */
export function createTouchPress(options: TouchPressOptions): Machine<TouchPressState, TouchPressInput> {
  const config: TouchPressConfig = { ...TOUCH_PRESS_DEFAULTS, ...options.config };
  return createMachine<TouchPressState, TouchPressInput>({
    reducer: (state, event) => touchPressReducer(state, event, config),
    initial: TOUCH_PRESS_IDLE,
    clock: options.clock,
    deadline: (state) => touchPressDeadline(state, config),
  });
}
