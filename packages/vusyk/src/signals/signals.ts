/**
 * Signals: reactive values, computed values and effects.
 *
 * The graph algorithm is alien-signals' (`alien-signals/system`, the core it
 * publishes for building your own API on, also used by Vue 3.6). A write marks
 * only what depends on it (push); a computed recomputes only when it is read
 * and one of its sources really changed (pull). Both walks are iterative, so
 * depth doesn't eat the stack. bench/RESULTS.md has the comparison that
 * chose it over a hand-written graph and over @preact/signals-core.
 *
 * What this surface adds on top of that core:
 * - `.value` reads and writes, `peek()`, an `equals` option;
 * - a computed that throws keeps the error and rethrows it until a source changes;
 * - effects take a `schedule`: their runs go wherever the scheduler puts them,
 *   so a frame loop phase runs each one at most once per frame, however many
 *   writes land before it;
 * - an effect loop (effects that keep re-triggering each other) throws
 *   instead of hanging.
 *
 * Semantics worth knowing:
 * - an effect's own writes don't re-run it (no self-loops), as in alien-signals and Vue;
 * - writes inside an effect are batched until it returns;
 * - this module's state (the tracking context, the batch depth, the effect
 *   queue) is the graph's; there is no clock and no timer here.
 */
import { createReactiveSystem, type Link, type ReactiveNode } from "alien-signals/system";

/** A value that can be read reactively. */
export interface ReadonlySignal<T> {
  /** The current value. Read inside a computed or an effect, it becomes a dependency. */
  readonly value: T;
  /** The current value, without becoming a dependency. */
  peek(): T;
}

/** A value that can be read reactively and written. */
export interface Signal<T> extends ReadonlySignal<T> {
  /** The current value. Writing a different value (by `equals`) notifies dependants. */
  value: T;
}

/** Decides whether a new value is the same as the old one (then nothing is notified). */
export type Equals<T> = (previous: T, next: T) => boolean;

/** Options of {@link signal} and {@link computed}. */
export interface SignalOptions<T> {
  /** Equality used to skip notifications. Default `Object.is`; `false` notifies on every write. */
  readonly equals?: Equals<T> | false;
}

/** What an effect function may return: a cleanup, run before the next run and on dispose. */
export type EffectCleanup = () => void;

/** Options of {@link effect}. */
export interface EffectOptions {
  /**
   * Where the effect's runs go. Without it, an effect runs synchronously at the
   * end of the outermost batch. With it, the first run and every re-run are
   * handed to `schedule(run)`; `run` is the same function each time, so a
   * scheduler that dedupes by identity (a frame loop's `scheduler(phase)`)
   * runs the effect once however many changes arrived.
   */
  readonly schedule?: (run: () => void) => void;
}

// alien-signals' ReactiveFlags (a const enum in its types, so mirrored here).
const NONE = 0;
const MUTABLE = 1;
const WATCHING = 2;
const RECURSED_CHECK = 4;
const RECURSED = 8;
const DIRTY = 16;
const PENDING = 32;

const SIGNAL = 0;
const COMPUTED = 1;
const EFFECT = 2;

/** Runs of one effect within one flush before the graph is declared to be looping. */
const MAX_RUNS_PER_FLUSH = 100;

interface Node extends ReactiveNode {
  readonly kind: typeof SIGNAL | typeof COMPUTED | typeof EFFECT;
}

let cycle = 0;
let runDepth = 0;
let batchDepth = 0;
let flushing = false;
let flushId = 0;
let activeSub: Node | undefined;
const queue: (EffectNode | undefined)[] = [];
let queueHead = 0;

const { link, unlink, propagate, checkDirty, shallowPropagate } = createReactiveSystem({
  update(node) {
    return (node as Node).kind === COMPUTED
      ? updateComputed(node as ComputedNode<unknown>)
      : updateSignal(node as SignalNode<unknown>);
  },
  notify(node) {
    // Not watching until it has run: further writes mark it but don't queue it again.
    node.flags &= ~WATCHING;
    queue.push(node as EffectNode);
  },
  unwatched(node) {
    const n = node as Node;
    if (n.kind === COMPUTED) {
      // Nobody observes it any more: let go of its sources; the next read recomputes.
      if (n.depsTail !== undefined) {
        n.flags = MUTABLE | DIRTY;
        disposeDeps(n);
      }
    } else if (n.kind === EFFECT) {
      (n as EffectNode).dispose();
    }
  },
});

class SignalNode<T> implements Signal<T>, Node {
  readonly kind = SIGNAL;
  deps: Link | undefined = undefined;
  depsTail: Link | undefined = undefined;
  subs: Link | undefined = undefined;
  subsTail: Link | undefined = undefined;
  flags = MUTABLE;
  current: T;
  pending: T;
  readonly equals: Equals<T> | false;

  constructor(value: T, equals: Equals<T> | false) {
    this.current = value;
    this.pending = value;
    this.equals = equals;
  }

  get value(): T {
    const value = this.peek();
    if (activeSub !== undefined) link(this, activeSub, cycle);
    return value;
  }

  set value(next: T) {
    if (activeSub !== undefined && activeSub.kind === COMPUTED) {
      throw new Error("vusyk: a computed value can't write a signal");
    }
    if (this.equals !== false && this.equals(this.pending, next)) return;
    this.pending = next;
    this.flags = MUTABLE | DIRTY;
    const subs = this.subs;
    if (subs === undefined) return;
    propagate(subs, runDepth > 0);
    if (batchDepth === 0) flush();
  }

  peek(): T {
    if (this.flags & DIRTY && updateSignal(this)) {
      const subs = this.subs;
      if (subs !== undefined) shallowPropagate(subs);
    }
    return this.current;
  }
}

function updateSignal<T>(node: SignalNode<T>): boolean {
  node.flags = MUTABLE;
  const previous = node.current;
  node.current = node.pending;
  return node.equals === false || !node.equals(previous, node.current);
}

class ComputedNode<T> implements ReadonlySignal<T>, Node {
  readonly kind = COMPUTED;
  deps: Link | undefined = undefined;
  depsTail: Link | undefined = undefined;
  subs: Link | undefined = undefined;
  subsTail: Link | undefined = undefined;
  flags = NONE;
  current: T | undefined = undefined;
  failed = false;
  error: unknown = undefined;
  readonly getter: (previous: T | undefined) => T;
  readonly equals: Equals<T> | false;

  constructor(getter: (previous: T | undefined) => T, equals: Equals<T> | false) {
    this.getter = getter;
    this.equals = equals;
  }

  get value(): T {
    refreshComputed(this);
    if (activeSub !== undefined) link(this, activeSub, cycle);
    if (this.failed) throw this.error;
    return this.current as T;
  }

  peek(): T {
    refreshComputed(this);
    if (this.failed) throw this.error;
    return this.current as T;
  }
}

function refreshComputed<T>(node: ComputedNode<T>): void {
  const flags = node.flags;
  if (flags & RECURSED_CHECK) throw new Error("vusyk: a computed value depends on itself");
  if (flags & DIRTY || (flags & PENDING && (checkDirty(node.deps!, node) || ((node.flags = flags & ~PENDING), false)))) {
    if (updateComputed(node)) {
      const subs = node.subs;
      if (subs !== undefined) shallowPropagate(subs);
    }
  } else if (flags === NONE) {
    // First read.
    node.flags = MUTABLE | RECURSED_CHECK;
    const previous = activeSub;
    activeSub = node;
    try {
      ++cycle;
      node.current = node.getter(undefined);
    } catch (error) {
      node.failed = true;
      node.error = error;
    } finally {
      activeSub = previous;
      node.flags &= ~RECURSED_CHECK;
    }
  }
}

/** Recompute; returns whether the value (or the error state) changed. */
function updateComputed<T>(node: ComputedNode<T>): boolean {
  node.depsTail = undefined;
  node.flags = MUTABLE | RECURSED_CHECK;
  const previousSub = activeSub;
  activeSub = node;
  try {
    ++cycle;
    const previous = node.current;
    let next: T;
    try {
      next = node.getter(previous);
    } catch (error) {
      node.failed = true;
      node.error = error;
      return true;
    }
    if (node.failed) {
      node.failed = false;
      node.error = undefined;
      node.current = next;
      return true;
    }
    if (node.equals !== false && node.equals(previous as T, next)) return false;
    node.current = next;
    return true;
  } finally {
    activeSub = previousSub;
    node.flags &= ~RECURSED_CHECK;
    purgeDeps(node);
  }
}

class EffectNode implements Node {
  readonly kind = EFFECT;
  deps: Link | undefined = undefined;
  depsTail: Link | undefined = undefined;
  subs: Link | undefined = undefined;
  subsTail: Link | undefined = undefined;
  flags = DIRTY;
  cleanup: EffectCleanup | undefined = undefined;
  disposed = false;
  lastFlush = 0;
  runsInFlush = 0;
  readonly fn: () => void | EffectCleanup;
  readonly schedule: ((run: () => void) => void) | undefined;
  /** A scheduled run: the effect, then whatever its writes triggered. */
  readonly run: () => void;

  constructor(fn: () => void | EffectCleanup, schedule: ((run: () => void) => void) | undefined) {
    this.fn = fn;
    this.schedule = schedule;
    this.run = () => {
      if (this.disposed) return;
      batchDepth++;
      try {
        runEffect(this);
      } finally {
        endBatch();
      }
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.flags = NONE;
    disposeDeps(this);
    if (this.cleanup !== undefined) runCleanup(this);
  }
}

function runEffect(node: EffectNode): void {
  const flags = node.flags;
  if (flags & DIRTY || (flags & PENDING && checkDirty(node.deps!, node))) {
    if (node.cleanup !== undefined) {
      runCleanup(node);
      if (node.disposed) return;
    }
    node.depsTail = undefined;
    node.flags = WATCHING | RECURSED_CHECK;
    const previous = activeSub;
    activeSub = node;
    try {
      ++cycle;
      ++runDepth;
      const cleanup = node.fn();
      node.cleanup = typeof cleanup === "function" ? cleanup : undefined;
    } finally {
      --runDepth;
      activeSub = previous;
      node.flags &= ~RECURSED_CHECK;
      purgeDeps(node);
      // It disposed itself during the run: drop whatever it read after that.
      if (node.disposed) disposeDeps(node);
    }
  } else if (!node.disposed) {
    node.flags = WATCHING;
  }
}

function runCleanup(node: EffectNode): void {
  const cleanup = node.cleanup!;
  node.cleanup = undefined;
  const previous = activeSub;
  activeSub = undefined;
  try {
    cleanup();
  } finally {
    activeSub = previous;
  }
}

function disposeDeps(node: ReactiveNode): void {
  let dep = node.depsTail;
  while (dep !== undefined) {
    const previous = dep.prevDep;
    unlink(dep, node);
    dep = previous;
  }
}

function purgeDeps(node: ReactiveNode): void {
  const tail = node.depsTail;
  let dep = tail !== undefined ? tail.nextDep : node.deps;
  while (dep !== undefined) dep = unlink(dep, node);
}

function endBatch(): void {
  if (--batchDepth === 0) flush();
}

function flush(): void {
  if (flushing) return;
  flushing = true;
  batchDepth++;
  const id = ++flushId;
  let failed = false;
  let error: unknown;
  try {
    while (queueHead < queue.length) {
      const node = queue[queueHead]!;
      queue[queueHead++] = undefined;
      if (node.disposed) continue;
      try {
        if (node.schedule !== undefined) {
          node.schedule(node.run);
          continue;
        }
        if (node.lastFlush !== id) {
          node.lastFlush = id;
          node.runsInFlush = 0;
        }
        if (++node.runsInFlush > MAX_RUNS_PER_FLUSH) {
          // Leave it watching so a later change still reaches it.
          node.flags |= WATCHING | RECURSED;
          throw new Error(`vusyk: effects kept re-triggering each other (one ran more than ${MAX_RUNS_PER_FLUSH} times)`);
        }
        runEffect(node);
      } catch (caught) {
        if (!failed) {
          failed = true;
          error = caught;
        }
      }
    }
  } finally {
    queue.length = 0;
    queueHead = 0;
    batchDepth--;
    flushing = false;
  }
  if (failed) throw error;
}

/** A writable reactive value. */
export function signal<T>(initial: T, options?: SignalOptions<T>): Signal<T> {
  return new SignalNode(initial, options?.equals ?? Object.is);
}

/**
 * A value derived from other signals. It recomputes lazily, on read, and only
 * when a source changed; `fn` gets the previous value. If `fn` throws, reading
 * the computed throws the same error until a source changes.
 */
export function computed<T>(fn: (previous: T | undefined) => T, options?: SignalOptions<T>): ReadonlySignal<T> {
  return new ComputedNode(fn, options?.equals ?? Object.is);
}

/**
 * Run `fn` now (or through `options.schedule`) and again whenever a signal it
 * read changes. Returns `dispose`. If the first synchronous run throws, the
 * effect is disposed and the error rethrown.
 */
export function effect(fn: () => void | EffectCleanup, options?: EffectOptions): () => void {
  const node = new EffectNode(fn, options?.schedule);
  const dispose = (): void => node.dispose();
  if (node.schedule !== undefined) {
    node.schedule(node.run);
    return dispose;
  }
  try {
    node.run();
  } catch (error) {
    node.dispose();
    throw error;
  }
  return dispose;
}

/** Run `fn` with effects held until it returns; nested batches flush at the outermost end. */
export function batch<T>(fn: () => T): T {
  batchDepth++;
  try {
    return fn();
  } finally {
    endBatch();
  }
}

/** Run `fn` without tracking what it reads. */
export function untracked<T>(fn: () => T): T {
  const previous = activeSub;
  activeSub = undefined;
  try {
    return fn();
  } finally {
    activeSub = previous;
  }
}

/** Whether `value` is a signal or a computed value made by this module. */
export function isSignal(value: unknown): value is ReadonlySignal<unknown> {
  return value instanceof SignalNode || value instanceof ComputedNode;
}
