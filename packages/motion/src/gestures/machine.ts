import type { TimerSource } from "../clock/port";
import { signal } from "../signals/signals";

/**
 * A timer event a state asks for: send `event(t)` when the clock reaches
 * `at`. Machines stay pure; this is how a long-press or a dwell turns into
 * an event without the reducer touching a timer.
 */
export interface Deadline<E> {
  /** Clock time in ms. */
  readonly at: number;
  /** The event to send, given the clock time it fired at. */
  readonly event: (t: number) => E;
}

/** Options of {@link createMachine}. */
export interface MachineOptions<S, E> {
  /** The pure transition function. Returning the same state means "no change". */
  readonly reducer: (state: S, event: E) => S;
  readonly initial: S;
  /** Timers come from here (and `now()` for their events). */
  readonly clock: TimerSource;
  /** The timer event the state needs, or `null`. Checked after every transition. */
  readonly deadline?: (state: S) => Deadline<E> | null;
}

/** A running machine: the state, a way to send events, and change listeners. */
export interface Machine<S, E> {
  /** The current state; reactive (read it in a computed or an effect). */
  readonly state: S;
  /** The current state, untracked. */
  peek(): S;
  /**
   * Run `event` through the reducer and return the new state. An event sent
   * from a listener waits until the current one has been handled.
   */
  send(event: E): S;
  /** Called after each change of state (not for events that changed nothing). */
  subscribe(listener: (next: S, previous: S, event: E) => void): () => void;
  /** Clear the timer and drop listeners. Events sent after this are ignored. */
  dispose(): void;
}

/** Run a pure machine on a clock: it arms and clears the deadline timer for you. */
export function createMachine<S, E>(options: MachineOptions<S, E>): Machine<S, E> {
  const { reducer, clock, deadline } = options;
  const state = signal(options.initial);
  const listeners = new Set<(next: S, previous: S, event: E) => void>();
  const inbox: E[] = [];
  let dispatching = false;
  let disposed = false;
  let timer: number | null = null;
  let timerAt: number | null = null;
  let timerEvent: ((t: number) => E) | null = null;

  const clearTimer = (): void => {
    if (timer !== null) clock.clearTimer(timer);
    timer = null;
    timerAt = null;
    timerEvent = null;
  };

  const arm = (): void => {
    const due = deadline === undefined ? null : deadline(state.peek());
    if (due === null) {
      clearTimer();
      return;
    }
    timerEvent = due.event;
    if (timer !== null && timerAt === due.at) return;
    if (timer !== null) clock.clearTimer(timer);
    timerAt = due.at;
    timer = clock.setTimer(() => {
      const make = timerEvent;
      timer = null;
      timerAt = null;
      timerEvent = null;
      if (make !== null) machine.send(make(clock.now()));
    }, Math.max(0, due.at - clock.now()));
  };

  const machine: Machine<S, E> = {
    get state() {
      return state.value;
    },
    peek: () => state.peek(),
    send(event) {
      if (disposed) return state.peek();
      inbox.push(event);
      if (dispatching) return state.peek();
      dispatching = true;
      try {
        let next: E | undefined;
        while ((next = inbox.shift()) !== undefined) {
          const previous = state.peek();
          const after = reducer(previous, next);
          if (after === previous) continue;
          state.value = after;
          arm();
          for (const listener of Array.from(listeners)) listener(after, previous, next);
          if (disposed) break;
        }
      } finally {
        dispatching = false;
        inbox.length = 0;
      }
      return state.peek();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimer();
      listeners.clear();
    },
  };
  arm();
  return machine;
}
