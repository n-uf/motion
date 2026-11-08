import type { TimerSource } from "../clock/port";
import type { Point } from "../shapes";
import { createMachine, type Deadline, type Machine } from "./machine";

/**
 * The press machine: tap or long-press.
 *
 * ```text
 * idle ──down──► pressed ──long-press (timer)──► held ──up / cancel──► idle
 *                  │ up ─► idle (a tap)
 *                  │ move past tolerance / cancel ─► idle
 * ```
 *
 * The long-press is a timer event (`pressDeadline`), never a timer inside the
 * reducer. {@link classifyPress} names what a transition meant.
 */

/** Tunables of the press machine. */
export interface PressConfig {
  /** Hold time in ms before a press becomes a long-press. Default 500. */
  readonly longPressMs: number;
  /** Travel in px that cancels a press that hasn't become a long-press. Default 10. */
  readonly tolerance: number;
}

/** Defaults of {@link PressConfig}. */
export const PRESS_DEFAULTS: PressConfig = { longPressMs: 500, tolerance: 10 };

/** The press machine's state. */
export type PressState =
  | { readonly phase: "idle" }
  | { readonly phase: "pressed"; readonly pointerId: number; readonly origin: Point; readonly downAt: number }
  | {
      readonly phase: "held";
      readonly pointerId: number;
      readonly origin: Point;
      readonly downAt: number;
      readonly heldAt: number;
    };

/** Events of the press machine. `t` is the clock time in ms. */
export type PressInput =
  | { readonly type: "down"; readonly t: number; readonly pointerId: number; readonly point: Point }
  | { readonly type: "move"; readonly t: number; readonly pointerId: number; readonly point: Point }
  | { readonly type: "long-press"; readonly t: number; readonly pointerId: number }
  | { readonly type: "up"; readonly t: number; readonly pointerId: number }
  | { readonly type: "cancel"; readonly t: number; readonly pointerId?: number };

/** The idle state (the same object every time). */
export const PRESS_IDLE: PressState = { phase: "idle" };

/** The press machine's pure transition function. */
export function pressReducer(state: PressState, event: PressInput, config: PressConfig = PRESS_DEFAULTS): PressState {
  if (state.phase !== "idle" && "pointerId" in event && event.pointerId !== undefined && event.pointerId !== state.pointerId) {
    return state;
  }
  switch (state.phase) {
    case "idle":
      return event.type === "down"
        ? { phase: "pressed", pointerId: event.pointerId, origin: event.point, downAt: event.t }
        : state;
    case "pressed":
      switch (event.type) {
        case "move":
          return Math.hypot(event.point.x - state.origin.x, event.point.y - state.origin.y) > config.tolerance
            ? PRESS_IDLE
            : state;
        case "long-press":
          return { phase: "held", pointerId: state.pointerId, origin: state.origin, downAt: state.downAt, heldAt: event.t };
        case "up":
        case "cancel":
          return PRESS_IDLE;
        default:
          return state;
      }
    case "held":
      return event.type === "up" || event.type === "cancel" ? PRESS_IDLE : state;
    default:
      return state;
  }
}

/** The long-press timer a pressed state needs. */
export function pressDeadline(state: PressState, config: PressConfig = PRESS_DEFAULTS): Deadline<PressInput> | null {
  if (state.phase !== "pressed") return null;
  const pointerId = state.pointerId;
  return { at: state.downAt + config.longPressMs, event: (t) => ({ type: "long-press", t, pointerId }) };
}

/** What a press transition meant. */
export type PressOutcome = "tap" | "long-press" | "release" | "cancel";

/**
 * Name a transition: `"tap"` (pressed, then up), `"long-press"` (it became
 * held), `"release"` (up after a hold), `"cancel"` (moved away or
 * interrupted). `null` for transitions that mean nothing yet.
 */
export function classifyPress(previous: PressState, next: PressState, event: PressInput): PressOutcome | null {
  if (previous.phase === "pressed" && next.phase === "held") return "long-press";
  if (next.phase !== "idle" || previous.phase === "idle") return null;
  if (event.type === "up") return previous.phase === "pressed" ? "tap" : "release";
  return "cancel";
}

/** Options of {@link createPressMachine}. */
export interface PressMachineOptions {
  readonly clock: TimerSource;
  readonly config?: Partial<PressConfig>;
}

/** A press machine on a clock: the long-press timer is armed for you. */
export function createPressMachine(options: PressMachineOptions): Machine<PressState, PressInput> {
  const config: PressConfig = { ...PRESS_DEFAULTS, ...options.config };
  return createMachine<PressState, PressInput>({
    reducer: (state, event) => pressReducer(state, event, config),
    initial: PRESS_IDLE,
    clock: options.clock,
    deadline: (state) => pressDeadline(state, config),
  });
}
