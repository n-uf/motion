import type { TimerSource } from "../clock/port";
import { createMachine, type Deadline, type Machine } from "./machine";

/**
 * The dwell machine (spring-load): hold over the same target long enough and
 * it fires, once.
 *
 * ```text
 * idle ──hover(key)──► dwelling ──tick (t − since ≥ dwellMs)──► fired
 *   ▲        │ hover(other key) restarts `since`           │
 *   │        │ hover(null) ─► idle                         │
 *   └────────┴─────────────── reset ◄─────────────────────┘
 * ```
 *
 * `fired` holds until `reset`: neither a late tick nor a hover change can fire
 * it again or clear it while the host acts on it. Shapes come from
 * hypr-tiling's `springLoadReducer`, with its workspace tab generalised to
 * any `key` (the host passes `null` for anything that shouldn't dwell, such as
 * the active tab).
 */

/** Tunables of the dwell machine. */
export interface DwellConfig {
  /** How long in ms the pointer must stay over the same key. Default 500. */
  readonly dwellMs: number;
}

/** Defaults of {@link DwellConfig}. */
export const DWELL_DEFAULTS: DwellConfig = { dwellMs: 500 };

/** The dwell machine's state. `K` is the target key, `P` the payload carried into `fired`. */
export type DwellState<K = string, P = unknown> =
  | { readonly phase: "idle" }
  | { readonly phase: "dwelling"; readonly key: K; readonly since: number; readonly payload: P | undefined }
  | {
      readonly phase: "fired";
      readonly key: K;
      readonly since: number;
      readonly firedAt: number;
      readonly payload: P | undefined;
    };

/** Events of the dwell machine. `t` is the clock time in ms. */
export type DwellInput<K = string, P = unknown> =
  | { readonly type: "hover"; readonly t: number; readonly key: K | null; readonly payload?: P }
  | { readonly type: "tick"; readonly t: number }
  | { readonly type: "reset" };

/** The idle state (the same object every time). */
export const DWELL_IDLE: DwellState<never, never> = { phase: "idle" };

/** The dwell machine's pure transition function. */
export function dwellReducer<K, P>(
  state: DwellState<K, P>,
  event: DwellInput<K, P>,
  config: DwellConfig = DWELL_DEFAULTS,
): DwellState<K, P> {
  switch (event.type) {
    case "reset":
      return state.phase === "idle" ? state : DWELL_IDLE;
    case "hover":
      if (state.phase === "fired") return state;
      if (event.key === null) return state.phase === "idle" ? state : DWELL_IDLE;
      if (state.phase === "dwelling" && Object.is(state.key, event.key)) return state;
      return { phase: "dwelling", key: event.key, since: event.t, payload: event.payload };
    case "tick":
      if (state.phase !== "dwelling" || event.t - state.since < config.dwellMs) return state;
      return { phase: "fired", key: state.key, since: state.since, firedAt: event.t, payload: state.payload };
    default:
      return state;
  }
}

/** When a dwelling state fires, as a timer event; `null` outside `dwelling`. */
export function dwellDeadline<K, P>(
  state: DwellState<K, P>,
  config: DwellConfig = DWELL_DEFAULTS,
): Deadline<DwellInput<K, P>> | null {
  if (state.phase !== "dwelling") return null;
  return { at: state.since + config.dwellMs, event: (t) => ({ type: "tick", t }) };
}

/** Options of {@link createDwellMachine}. */
export interface DwellMachineOptions {
  readonly clock: TimerSource;
  readonly config?: Partial<DwellConfig>;
}

/** A dwell machine on a clock: the dwell timer is armed for you. */
export function createDwellMachine<K = string, P = unknown>(
  options: DwellMachineOptions,
): Machine<DwellState<K, P>, DwellInput<K, P>> {
  const config: DwellConfig = { ...DWELL_DEFAULTS, ...options.config };
  return createMachine<DwellState<K, P>, DwellInput<K, P>>({
    reducer: (state, event) => dwellReducer(state, event, config),
    initial: DWELL_IDLE,
    clock: options.clock,
    deadline: (state) => dwellDeadline(state, config),
  });
}
