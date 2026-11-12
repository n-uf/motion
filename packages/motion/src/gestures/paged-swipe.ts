import type { TimerSource } from "../clock/port";
import { createMachine, type Deadline, type Machine } from "./machine";
import type { ModifierKey, Modifiers } from "./types";

/**
 * A paged swipe: a trackpad's two-finger scroll or a finger swipes from one page to the previous or the next, the
 * pages following it, and commits or snaps back when it ends.
 *
 * ```text
 * idle ──wheel / touch-move (arming rules pass)──► armed ──travel ≥ thresholdPx──► tracking
 *   ▲                                               │                                │
 *   │                                   rule breach / idle / end                 gesture end
 *   │                                               ▼                                ▼
 *   └──────── lockoutMs elapsed ◄── lockout ◄── settled (commit) ◄───────────── settling
 *   └──────────────────────────────────────── settled (cancel) ◄───────────────────┘
 * ```
 *
 * - **Arming:** nothing else owns the pointer (`blocked`), the movement runs mostly along the swipe (more than twice
 *   the cross movement), no Ctrl (a pinch), the configured modifier is held, nothing under the pointer can still
 *   scroll that way (`canScrollFurther`), and there is a page on that side (or `wrap`). A wheel run that breaks a
 *   rule belongs to scrolling until the wheel has been idle `idleMs`.
 * - **Tracking:** `progress` is the travel over the page size, −1 to 1, held at 0 towards a side with no page.
 * - **Ending:** a touch ends when the finger lifts, a wheel run after `idleMs` without samples. It commits when
 *   `|progress| ≥ commitFraction`, or the peak speed towards the target reached `commitVelocity` (the peak starts
 *   over when the travel crosses zero, so a fast fling out and a pull back does not commit the way back).
 * - **Settling** lasts as long as the host's page transition; the host sends `settled` when it is done (or `cancel`,
 *   which goes straight back to idle, when it stops the transition). After a commit, `lockout` swallows the
 *   trackpad's momentum for `lockoutMs`, and the run stays claimed after it.
 *
 * Pure and timer-free: {@link pagedSwipeDeadline} says when the next `tick` is due ({@link createPagedSwipe} arms it).
 * Signs: a wheel delta > 0 along the swipe heads to `next`; a finger moving towards smaller x (or y) heads to `next`.
 */

/** Which side of the current page a swipe heads to. */
export type SwipeSide = "prev" | "next";

/** Tunables of the paged swipe. */
export interface PagedSwipeConfig {
  /** px of travel before an armed swipe tracks. Default 24. */
  readonly thresholdPx: number;
  /** The share of the page size that commits at the end. Default 0.35. */
  readonly commitFraction: number;
  /** px/ms: a peak speed towards the target that commits at the end. Default 0.6. */
  readonly commitVelocity: number;
  /** ms without a wheel sample that ends a wheel run. Default 120. */
  readonly idleMs: number;
  /** ms after a commit during which wheel samples are swallowed (momentum). Default 350. */
  readonly lockoutMs: number;
  /** Past the last page comes the first, and back. Default false. */
  readonly wrap: boolean;
  /** The page size in px when no sample or context gives one. Default 800. */
  readonly size: number;
  /** A modifier the wheel needs held to swipe (`null`: none). Touch never needs one. Default null. */
  readonly modifier: ModifierKey | null;
  /** The swipe's direction: `"x"` (the default) or `"y"`. */
  readonly along: "x" | "y";
}

/** Defaults of {@link PagedSwipeConfig}. */
export const PAGED_SWIPE_DEFAULTS: PagedSwipeConfig = {
  thresholdPx: 24,
  commitFraction: 0.35,
  commitVelocity: 0.6,
  idleMs: 120,
  lockoutMs: 350,
  wrap: false,
  size: 800,
  modifier: null,
  along: "x",
};

/** What the host knows about the pages now. */
export interface PagedSwipeContext {
  readonly hasPrev: boolean;
  readonly hasNext: boolean;
  /** The page size in px, or null (the config's). */
  readonly size: number | null;
  /** Something else owns the pointer (a drag): nothing arms, and a swipe in progress gives way. */
  readonly blocked: boolean;
}

/** The context before the host has said anything. */
export const PAGED_SWIPE_EMPTY_CONTEXT: PagedSwipeContext = { hasPrev: false, hasNext: false, size: null, blocked: false };

type Input = "wheel" | "touch";
interface Base {
  readonly context: PagedSwipeContext;
  /** −1 to 1; negative towards `prev`. */
  readonly progress: number;
  readonly target: SwipeSide | null;
}

/** The paged swipe's state. Every phase has a way back to `idle`. */
export type PagedSwipeState =
  | (Base & {
      readonly phase: "idle";
      /** The last wheel sample of the current run (null: none, or the run went idle). */
      readonly lastWheel: number | null;
      /** This wheel run broke the arming rules (or committed): it cannot arm until the wheel is idle `idleMs`. */
      readonly claimed: boolean;
    })
  | (Base & {
      readonly phase: "armed";
      readonly input: Input;
      /** Where the finger went down (touch). */
      readonly origin: { readonly x: number; readonly y: number };
      /** Wheel travel along the swipe and across it so far. */
      readonly travel: number;
      readonly cross: number;
      readonly last: number;
    })
  | (Base & {
      readonly phase: "tracking";
      readonly input: Input;
      readonly origin: { readonly x: number; readonly y: number };
      readonly travel: number;
      readonly last: number;
      /** The highest speed (px/ms) towards the current target. */
      readonly peak: number;
    })
  | (Base & { readonly phase: "settling"; readonly input: Input; readonly outcome: "commit" | "cancel"; readonly ended: number; readonly lastWheel: number })
  | (Base & { readonly phase: "lockout"; readonly until: number; readonly lastWheel: number });

/** Events of the paged swipe. `t` is the clock time in ms. */
export type PagedSwipeInput =
  | {
      readonly type: "wheel";
      readonly dx: number;
      readonly dy: number;
      readonly t: number;
      readonly modifiers: Modifiers;
      /** Something under the pointer can still scroll that way: no arming. */
      readonly canScrollFurther?: boolean;
      readonly size?: number;
    }
  | { readonly type: "touch-start"; readonly x: number; readonly y: number; readonly t: number; readonly size?: number }
  | { readonly type: "touch-move"; readonly x: number; readonly y: number; readonly t: number; readonly canScrollFurther?: boolean; readonly size?: number }
  | { readonly type: "touch-end"; readonly t: number }
  | { readonly type: "tick"; readonly t: number }
  | { readonly type: "settled" }
  | { readonly type: "cancel" }
  | { readonly type: "block"; readonly on: boolean }
  | { readonly type: "context"; readonly hasPrev: boolean; readonly hasNext: boolean; readonly size?: number };

/** The idle state with no context. */
export const PAGED_SWIPE_IDLE: PagedSwipeState = { phase: "idle", context: PAGED_SWIPE_EMPTY_CONTEXT, progress: 0, target: null, lastWheel: null, claimed: false };

const idle = (context: PagedSwipeContext, lastWheel: number | null = null, claimed = false): PagedSwipeState => ({ phase: "idle", context, progress: 0, target: null, lastWheel, claimed });
const sideOf = (travel: number): SwipeSide | null => (travel > 0 ? "next" : travel < 0 ? "prev" : null);
const hasPage = (c: PagedSwipeContext, side: SwipeSide, wrap: boolean): boolean => (wrap ? c.hasPrev || c.hasNext : side === "next" ? c.hasNext : c.hasPrev);
const withSize = (c: PagedSwipeContext, size: number | undefined): PagedSwipeContext => (size === undefined || size === c.size ? c : { ...c, size });
const sizeOf = (c: PagedSwipeContext, size: number | undefined, config: PagedSwipeConfig): number => size ?? c.size ?? config.size;

/** Where the swipe may head for a movement (`main` along the swipe, `cross` across it), or null when it must not arm. */
function arming(c: PagedSwipeContext, main: number, cross: number, config: PagedSwipeConfig, gates: { ctrl: boolean; modifierHeld: boolean; canScrollFurther: boolean }): SwipeSide | null {
  if (c.blocked || gates.ctrl || gates.canScrollFurther || !gates.modifierHeld) return null;
  if (Math.abs(main) <= 2 * Math.abs(cross)) return null;
  const side = sideOf(main);
  return side && hasPage(c, side, config.wrap) ? side : null;
}

/** Travel to progress: over the page size, −1 to 1, 0 towards a side with no page (unless `wrap`). */
export function swipeProgress(travel: number, size: number, c: PagedSwipeContext, wrap: boolean): number {
  const p = Math.max(-1, Math.min(1, travel / Math.max(1, size)));
  if (wrap) return p;
  if ((p < 0 && !c.hasPrev) || (p > 0 && !c.hasNext)) return 0;
  return p;
}

/** Speed towards `side` for a step of `delta` px over `dt` ms; 0 moving away. */
const towards = (delta: number, dt: number, side: SwipeSide | null): number => {
  if (dt <= 0 || side === null) return 0;
  const v = (side === "next" ? delta : -delta) / dt;
  return v > 0 ? v : 0;
};

function track(c: PagedSwipeContext, input: Input, origin: { x: number; y: number }, travel: number, t: number, peak: number, size: number, config: PagedSwipeConfig): PagedSwipeState {
  const progress = swipeProgress(travel, size, c, config.wrap);
  return { phase: "tracking", context: c, input, origin, travel, last: t, peak, progress, target: sideOf(progress) };
}

function end(s: Extract<PagedSwipeState, { phase: "tracking" }>, t: number, config: PagedSwipeConfig): PagedSwipeState {
  const commit = s.target !== null && (Math.abs(s.progress) >= config.commitFraction || s.peak >= config.commitVelocity);
  return { phase: "settling", context: s.context, input: s.input, outcome: commit ? "commit" : "cancel", ended: t, lastWheel: t, progress: s.progress, target: commit ? s.target : null };
}

const giveUp = (s: Extract<PagedSwipeState, { phase: "tracking" }>, c: PagedSwipeContext): PagedSwipeState => ({
  phase: "settling",
  context: c,
  input: s.input,
  outcome: "cancel",
  ended: s.last,
  lastWheel: s.last,
  progress: s.progress,
  target: null,
});

/** The paged swipe's pure transition function. Unmatched pairs return the state unchanged. */
export function pagedSwipeReducer(state: PagedSwipeState, event: PagedSwipeInput, config: PagedSwipeConfig = PAGED_SWIPE_DEFAULTS): PagedSwipeState {
  const y = config.along === "y";
  if (event.type === "context") {
    return { ...state, context: { ...state.context, hasPrev: event.hasPrev, hasNext: event.hasNext, size: event.size ?? state.context.size } };
  }
  if (event.type === "block") {
    const c = state.context.blocked === event.on ? state.context : { ...state.context, blocked: event.on };
    if (event.on && state.phase === "armed") return idle(c);
    if (event.on && state.phase === "tracking") return giveUp(state, c);
    return c === state.context ? state : { ...state, context: c };
  }
  if (event.type === "cancel") {
    // Settling too: a host that will never send `settled` (it went away mid-transition) must not leave it stuck.
    if (state.phase === "armed" || state.phase === "lockout" || state.phase === "settling") return idle(state.context);
    if (state.phase === "tracking") return giveUp(state, state.context);
    return state;
  }
  switch (state.phase) {
    case "idle": {
      if (event.type === "wheel") {
        if (state.context.blocked) return state;
        const fresh = state.lastWheel === null || event.t - state.lastWheel >= config.idleMs;
        if (!fresh && state.claimed) return { ...state, lastWheel: event.t };
        const main = y ? event.dy : event.dx;
        const cross = y ? event.dx : event.dy;
        const side = arming(state.context, main, cross, config, wheelGates(event, config));
        const c = withSize(state.context, event.size);
        if (side === null) return idle(c, event.t, true);
        if (Math.abs(main) >= config.thresholdPx) return track(c, "wheel", { x: 0, y: 0 }, main, event.t, 0, sizeOf(c, event.size, config), config);
        return { phase: "armed", context: c, input: "wheel", origin: { x: 0, y: 0 }, travel: main, cross, last: event.t, progress: 0, target: null };
      }
      if (event.type === "touch-start") {
        if (state.context.blocked) return state;
        return { phase: "armed", context: withSize(state.context, event.size), input: "touch", origin: { x: event.x, y: event.y }, travel: 0, cross: 0, last: event.t, progress: 0, target: null };
      }
      return state;
    }
    case "armed": {
      if (event.type === "wheel") {
        if (state.input !== "wheel") return state;
        const main = y ? event.dy : event.dx;
        const cross = y ? event.dx : event.dy;
        // Every sample before the threshold must pass the rules too; a breach gives the run to scrolling.
        if (arming(state.context, main, cross, config, wheelGates(event, config)) === null) return idle(state.context, event.t, true);
        const c = withSize(state.context, event.size);
        const travel = state.travel + main;
        const crossTravel = state.cross + cross;
        // The run as a whole must stay along the swipe.
        if (Math.abs(crossTravel) > Math.abs(travel) / 2) return idle(c, event.t, true);
        if (Math.abs(travel) < config.thresholdPx) return { ...state, context: c, travel, cross: crossTravel, last: event.t };
        return track(c, "wheel", state.origin, travel, event.t, towards(main, event.t - state.last, sideOf(travel)), sizeOf(c, event.size, config), config);
      }
      if (event.type === "touch-move") {
        if (state.input !== "touch") return state;
        const main = y ? state.origin.y - event.y : state.origin.x - event.x;
        const cross = y ? event.x - state.origin.x : event.y - state.origin.y;
        // Finger jitter.
        if (Math.hypot(main, cross) < config.thresholdPx) return { ...state, last: event.t };
        const side = arming(state.context, main, cross, config, { ctrl: false, modifierHeld: true, canScrollFurther: event.canScrollFurther ?? false });
        // Across the swipe, or nowhere to go: the page owns this touch until it ends.
        if (side === null) return idle(state.context);
        const c = withSize(state.context, event.size);
        return track(c, "touch", state.origin, main, event.t, towards(main, event.t - state.last, side), sizeOf(c, event.size, config), config);
      }
      if (event.type === "tick") return state.input === "wheel" && event.t - state.last >= config.idleMs ? idle(state.context) : state;
      if (event.type === "touch-end") return state.input === "touch" ? idle(state.context) : state;
      if (event.type === "touch-start") return { ...state, context: withSize(state.context, event.size), input: "touch", origin: { x: event.x, y: event.y }, travel: 0, cross: 0, last: event.t };
      return state;
    }
    case "tracking": {
      if (event.type === "wheel" || event.type === "touch-move") {
        if (state.input !== (event.type === "wheel" ? "wheel" : "touch")) return state;
        const travel =
          event.type === "wheel" ? state.travel + (y ? event.dy : event.dx) : y ? state.origin.y - event.y : state.origin.x - event.x;
        const side = sideOf(travel);
        const v = towards(travel - state.travel, event.t - state.last, side);
        const peak = side === sideOf(state.travel) ? Math.max(state.peak, v) : v;
        const c = withSize(state.context, event.size);
        return track(c, state.input, state.origin, travel, event.t, peak, sizeOf(c, event.size, config), config);
      }
      if (event.type === "tick") return state.input === "wheel" && event.t - state.last >= config.idleMs ? end(state, event.t, config) : state;
      if (event.type === "touch-end") return state.input === "touch" ? end(state, event.t, config) : state;
      return state;
    }
    case "settling": {
      if (event.type === "settled") {
        if (state.outcome === "commit") return { phase: "lockout", context: state.context, until: state.ended + config.lockoutMs, lastWheel: state.lastWheel, progress: 0, target: null };
        return idle(state.context, state.lastWheel, false);
      }
      if (event.type === "wheel") return { ...state, lastWheel: event.t };
      return state;
    }
    case "lockout": {
      if (event.type === "wheel") return event.t >= state.until ? idle(state.context, event.t, true) : { ...state, lastWheel: event.t };
      if (event.type === "tick") {
        if (event.t < state.until) return state;
        return event.t - state.lastWheel < config.idleMs ? idle(state.context, state.lastWheel, true) : idle(state.context);
      }
      // A finger is not momentum: it may start a swipe at once.
      if (event.type === "touch-start") return pagedSwipeReducer(idle(state.context), event, config);
      return state;
    }
    default:
      return state;
  }
}

function wheelGates(event: Extract<PagedSwipeInput, { type: "wheel" }>, config: PagedSwipeConfig): { ctrl: boolean; modifierHeld: boolean; canScrollFurther: boolean } {
  return { ctrl: event.modifiers.ctrl, modifierHeld: config.modifier === null || event.modifiers[config.modifier], canScrollFurther: event.canScrollFurther ?? false };
}

/** When the next `tick` is due: a wheel run's idle end, or the end of the lockout; `null` when none is. */
export function pagedSwipeDeadline(state: PagedSwipeState, config: PagedSwipeConfig = PAGED_SWIPE_DEFAULTS): Deadline<PagedSwipeInput> | null {
  const tick = (t: number): PagedSwipeInput => ({ type: "tick", t });
  if ((state.phase === "armed" || state.phase === "tracking") && state.input === "wheel") return { at: state.last + config.idleMs, event: tick };
  if (state.phase === "lockout") return { at: state.until, event: tick };
  return null;
}

/** Options of {@link createPagedSwipe}. */
export interface PagedSwipeOptions {
  readonly clock: TimerSource;
  readonly config?: Partial<PagedSwipeConfig>;
}

/** A paged swipe on a clock: the idle and lockout timers are armed for you. */
export function createPagedSwipe(options: PagedSwipeOptions): Machine<PagedSwipeState, PagedSwipeInput> {
  const config: PagedSwipeConfig = { ...PAGED_SWIPE_DEFAULTS, ...options.config };
  return createMachine<PagedSwipeState, PagedSwipeInput>({
    reducer: (state, event) => pagedSwipeReducer(state, event, config),
    initial: PAGED_SWIPE_IDLE,
    clock: options.clock,
    deadline: (state) => pagedSwipeDeadline(state, config),
  });
}
