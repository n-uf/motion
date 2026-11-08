import type { TimerSource } from "../clock/port";
import type { Point } from "../shapes";
import { createMachine, type Deadline, type Machine } from "./machine";

/**
 * The drag machine: one press, from pointer-down to the end of its settle.
 *
 * ```text
 * idle ──down──► armed ──move past threshold / long-press──► dragging ──up / cancel──► settling ──settled──► idle
 *   │              │ up / cancel / scroll-escape ─► idle              │                    │ down ─► armed
 *   └──rearm───────┴──────────────────────────────────────────────────┘
 * ```
 *
 * - `armed`: the pointer is down but hasn't travelled `threshold`; an `up`
 *   here is a click. Touch also waits for a long-press, and a touch that
 *   travels along the scroll axis first is handed back to the page (idle).
 * - `dragging`: the drag is live; `velocity` follows the pointer.
 * - `settling`: the drag ended with an outcome; the host animates whatever it
 *   animates (a spring's `onSettle` is the natural trigger) and sends `settled`.
 * - `rearm` starts a drag straight from idle under a pointer that is still
 *   down (hypr-tiling's spring-loaded continuation).
 *
 * Every non-idle state has a way back to idle, and an event a state doesn't
 * handle returns the same state object. Events carry their time `t` (ms, from
 * the clock), so the reducer needs no clock. Shapes come from hypr-tiling's
 * `dragMachineReducer`; what it knows about panes, footprints and drop
 * targets stays in the host, which passes its own `data` along.
 */

/** Pointer device classes. */
export type PointerKind = "mouse" | "pen" | "touch";

/** The page scroll axis a touch may escape along before a long-press; `"none"` never escapes. */
export type ScrollAxis = "vertical" | "horizontal" | "none";

/** How a drag ended. `claimed`: the host took the drop elsewhere (no fly-back). */
export type DragOutcome = "commit" | "cancel" | "claimed";

/** Why a drag was cancelled. Open-ended: hosts may add their own. */
export type DragCancelReason =
  | "pointer-cancel"
  | "escape"
  | "blur"
  | "hidden"
  | "lost-capture"
  | "watchdog"
  | (string & {});

/** How a drag started. */
export type DragStart = "threshold" | "long-press" | "rearm";

/** Tunables of the drag machine. Defaults in {@link DRAG_DEFAULTS}. */
export interface DragConfig {
  /** Travel in px from the press before it becomes a drag. Default 6. */
  readonly threshold: number;
  /** Touch: hold time in ms that starts a drag in place. Default 220. */
  readonly longPressMs: number;
  /** Touch: travel along the scroll axis, before the long-press, that hands the gesture to the page. Default 10. */
  readonly scrollEscape: number;
  /** Touch: the page's scroll axis. Default `"vertical"`. */
  readonly scrollAxis: ScrollAxis;
  /** A release this long (ms) after the last move counts as still: velocity 0. Default 80. */
  readonly stillMs: number;
  /** Time constant (ms) of the velocity smoothing. Default 40. */
  readonly velocitySmoothingMs: number;
  /** Cancel a drag with no event for this long (ms), reason `"watchdog"`. Default `null` (off). */
  readonly idleTimeoutMs: number | null;
}

/** Defaults of {@link DragConfig}. */
export const DRAG_DEFAULTS: DragConfig = {
  threshold: 6,
  longPressMs: 220,
  scrollEscape: 10,
  scrollAxis: "vertical",
  stillMs: 80,
  velocitySmoothingMs: 40,
  idleTimeoutMs: null,
};

/** Merge a partial config over {@link DRAG_DEFAULTS}. */
export function resolveDragConfig(config?: Partial<DragConfig> | null): DragConfig {
  return { ...DRAG_DEFAULTS, ...config };
}

/** The drag machine's state. `D` is whatever the host attaches at `down` (what is being dragged). */
export type DragState<D = unknown> =
  | { readonly phase: "idle" }
  | {
      readonly phase: "armed";
      readonly pointerId: number;
      readonly pointer: PointerKind;
      readonly data: D;
      /** Where the press went down. */
      readonly origin: Point;
      /** The latest pointer position. */
      readonly point: Point;
      readonly downAt: number;
    }
  | {
      readonly phase: "dragging";
      readonly pointerId: number;
      readonly pointer: PointerKind;
      readonly data: D;
      readonly origin: Point;
      readonly point: Point;
      readonly via: DragStart;
      readonly startedAt: number;
      /** Time of the last event that moved or started the drag. */
      readonly lastAt: number;
      /** Smoothed pointer velocity, px per second. */
      readonly velocity: Point;
    }
  | {
      readonly phase: "settling";
      readonly outcome: DragOutcome;
      /** Set when `outcome` is `"cancel"` because of a cancel event. */
      readonly reason: DragCancelReason | null;
      readonly pointerId: number;
      readonly pointer: PointerKind;
      readonly data: D;
      readonly origin: Point;
      /** Where the pointer was when the drag ended. */
      readonly point: Point;
      /** Release velocity, px per second; zero after a still release. */
      readonly velocity: Point;
      readonly endedAt: number;
    };

/** Events of the drag machine. `t` is the clock time in ms. */
export type DragInput<D = unknown> =
  | {
      readonly type: "down";
      readonly t: number;
      readonly pointerId: number;
      readonly pointer: PointerKind;
      readonly point: Point;
      readonly data: D;
    }
  | { readonly type: "move"; readonly t: number; readonly pointerId: number; readonly point: Point }
  | { readonly type: "long-press"; readonly t: number; readonly pointerId: number }
  | {
      readonly type: "up";
      readonly t: number;
      readonly pointerId: number;
      /** The release position, when it differs from the last move. */
      readonly point?: Point;
      /** The host took the drop (outcome `"claimed"`). */
      readonly claimed?: boolean;
      /** `false`: the release isn't over anything that accepts it (outcome `"cancel"`). */
      readonly commit?: boolean;
    }
  | { readonly type: "cancel"; readonly t: number; readonly pointerId?: number; readonly reason: DragCancelReason }
  | {
      readonly type: "rearm";
      readonly t: number;
      readonly pointerId: number;
      readonly pointer: PointerKind;
      readonly point: Point;
      readonly data: D;
    }
  | { readonly type: "settled"; readonly t: number };

/** The idle state (the same object every time). */
export const DRAG_IDLE: DragState<never> = { phase: "idle" };

const ZERO: Point = { x: 0, y: 0 };

/** Euclidean travel from `origin` to `point` has reached `threshold`. */
export function hasCrossedThreshold(origin: Point, point: Point, threshold: number): boolean {
  return Math.hypot(point.x - origin.x, point.y - origin.y) >= threshold;
}

/** What an armed touch's move means: wait, start the drag, or give the gesture to the page. */
export type TouchMoveResolution = "hold" | "pickup" | "scroll-escape";

/**
 * Classify a touch move before the long-press (hypr-tiling's
 * `resolveTouchArmedMove`): travel mostly along the scroll axis past
 * `scrollEscape` is a scroll; travel past `threshold` otherwise is a drag;
 * anything less is finger jitter.
 */
export function resolveTouchMove(origin: Point, point: Point, config: DragConfig = DRAG_DEFAULTS): TouchMoveResolution {
  if (config.scrollAxis !== "none") {
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const along = config.scrollAxis === "vertical" ? dy : dx;
    const across = config.scrollAxis === "vertical" ? dx : dy;
    if (Math.abs(along) >= config.scrollEscape && Math.abs(along) > Math.abs(across)) return "scroll-escape";
  }
  return hasCrossedThreshold(origin, point, config.threshold) ? "pickup" : "hold";
}

/** Pointer travel since the press: `point - origin`; zero when idle. */
export function dragOffset(state: DragState<unknown>): Point {
  if (state.phase === "idle") return ZERO;
  return { x: state.point.x - state.origin.x, y: state.point.y - state.origin.y };
}

function smoothVelocity(previous: Point, from: Point, to: Point, dt: number, smoothingMs: number): Point {
  if (!(dt > 0)) return previous;
  const ix = ((to.x - from.x) / dt) * 1000;
  const iy = ((to.y - from.y) / dt) * 1000;
  const alpha = smoothingMs > 0 ? 1 - Math.exp(-dt / smoothingMs) : 1;
  return { x: previous.x + alpha * (ix - previous.x), y: previous.y + alpha * (iy - previous.y) };
}

function armed<D>(event: Extract<DragInput<D>, { type: "down" }>): DragState<D> {
  return {
    phase: "armed",
    pointerId: event.pointerId,
    pointer: event.pointer,
    data: event.data,
    origin: event.point,
    point: event.point,
    downAt: event.t,
  };
}

function startDrag<D>(state: Extract<DragState<D>, { phase: "armed" }>, point: Point, via: DragStart, t: number): DragState<D> {
  return {
    phase: "dragging",
    pointerId: state.pointerId,
    pointer: state.pointer,
    data: state.data,
    origin: state.origin,
    point,
    via,
    startedAt: t,
    lastAt: t,
    velocity: ZERO,
  };
}

function settle<D>(
  state: Extract<DragState<D>, { phase: "dragging" }>,
  outcome: DragOutcome,
  reason: DragCancelReason | null,
  point: Point,
  velocity: Point,
  t: number,
): DragState<D> {
  return {
    phase: "settling",
    outcome,
    reason,
    pointerId: state.pointerId,
    pointer: state.pointer,
    data: state.data,
    origin: state.origin,
    point,
    velocity,
    endedAt: t,
  };
}

/** The drag machine's pure transition function. */
export function dragReducer<D>(state: DragState<D>, event: DragInput<D>, config: DragConfig = DRAG_DEFAULTS): DragState<D> {
  // A second pointer can neither fork nor steal a live press.
  if (
    (state.phase === "armed" || state.phase === "dragging") &&
    "pointerId" in event &&
    event.pointerId !== undefined &&
    event.pointerId !== state.pointerId
  ) {
    return state;
  }

  switch (state.phase) {
    case "idle":
      if (event.type === "down") return armed(event);
      if (event.type === "rearm") {
        return {
          phase: "dragging",
          pointerId: event.pointerId,
          pointer: event.pointer,
          data: event.data,
          origin: event.point,
          point: event.point,
          via: "rearm",
          startedAt: event.t,
          lastAt: event.t,
          velocity: ZERO,
        };
      }
      return state;

    case "armed":
      switch (event.type) {
        case "move": {
          if (state.pointer === "touch") {
            const resolution = resolveTouchMove(state.origin, event.point, config);
            if (resolution === "scroll-escape") return DRAG_IDLE;
            if (resolution === "hold") return { ...state, point: event.point };
          } else if (!hasCrossedThreshold(state.origin, event.point, config.threshold)) {
            return { ...state, point: event.point };
          }
          return startDrag(state, event.point, "threshold", event.t);
        }
        case "long-press":
          return state.pointer === "touch" ? startDrag(state, state.point, "long-press", event.t) : state;
        case "up":
        case "cancel":
          // Released or interrupted before the threshold: a click, or nothing.
          return DRAG_IDLE;
        case "down":
          // The same pointer pressed again (its up was lost): start over.
          return armed(event);
        default:
          return state;
      }

    case "dragging":
      switch (event.type) {
        case "move":
          return {
            ...state,
            point: event.point,
            lastAt: event.t,
            velocity: smoothVelocity(state.velocity, state.point, event.point, event.t - state.lastAt, config.velocitySmoothingMs),
          };
        case "up": {
          const point = event.point ?? state.point;
          const still = event.t - state.lastAt > config.stillMs;
          const velocity = still
            ? ZERO
            : event.point === undefined
              ? state.velocity
              : smoothVelocity(state.velocity, state.point, point, event.t - state.lastAt, config.velocitySmoothingMs);
          const outcome: DragOutcome = event.claimed === true ? "claimed" : event.commit === false ? "cancel" : "commit";
          return settle(state, outcome, null, point, velocity, event.t);
        }
        case "cancel":
          return settle(state, "cancel", event.reason, state.point, state.velocity, event.t);
        default:
          return state;
      }

    case "settling":
      if (event.type === "settled") return DRAG_IDLE;
      // A new press cuts a lingering settle short.
      if (event.type === "down") return armed(event);
      return state;

    default:
      return state;
  }
}

/**
 * The timer event a drag state needs: the long-press of an armed touch, and
 * the idle watchdog of a drag when `idleTimeoutMs` is set.
 */
export function dragDeadline<D>(state: DragState<D>, config: DragConfig = DRAG_DEFAULTS): Deadline<DragInput<D>> | null {
  if (state.phase === "armed" && state.pointer === "touch") {
    const pointerId = state.pointerId;
    return { at: state.downAt + config.longPressMs, event: (t) => ({ type: "long-press", t, pointerId }) };
  }
  if (state.phase === "dragging" && config.idleTimeoutMs !== null) {
    const pointerId = state.pointerId;
    return {
      at: state.lastAt + config.idleTimeoutMs,
      event: (t) => ({ type: "cancel", t, pointerId, reason: "watchdog" }),
    };
  }
  return null;
}

/** Options of {@link createDragMachine}. */
export interface DragMachineOptions {
  readonly clock: TimerSource;
  readonly config?: Partial<DragConfig>;
}

/** A drag machine on a clock: long-press and watchdog timers are armed for you. */
export function createDragMachine<D = unknown>(options: DragMachineOptions): Machine<DragState<D>, DragInput<D>> {
  const config = resolveDragConfig(options.config);
  return createMachine<DragState<D>, DragInput<D>>({
    reducer: (state, event) => dragReducer(state, event, config),
    initial: DRAG_IDLE,
    clock: options.clock,
    deadline: (state) => dragDeadline(state, config),
  });
}
