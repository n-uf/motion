/**
 * BENCHMARK CANDIDATE, not shipped: the hand-written signals graph that was
 * weighed against alien-signals and @preact/signals-core (bench/RESULTS.md).
 * The package uses src/signals/signals.ts, on alien-signals' core.
 *
 * Signals: reactive values, computed values and effects.
 *
 * A write marks only the nodes that depend on the written signal (push), and
 * a computed value recomputes only when it is read and one of its sources
 * really changed (pull). Effects run at the end of the outermost batch, or,
 * when they are given a `schedule`, wherever the scheduler puts them: a
 * frame loop phase runs each such effect at most once per frame however many
 * writes land before it.
 *
 * Design notes:
 * - Every node carries a version. An observer records the version of each
 *   source it read; it is stale exactly when one of them moved. That is how a
 *   computed that nobody observes still answers correctly without being
 *   subscribed to anything (so dropping it leaves nothing behind).
 * - A computed subscribes to its sources only while something observes it.
 *   Disposing the last effect over a chain unsubscribes the whole chain.
 * - Dependencies are tracked per run, in read order; the common case (same
 *   reads in the same order) reuses the previous arrays without allocating.
 * - The only module state is the tracking context, the batch depth and the
 *   effect queue. There is no clock and no timer here.
 */

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

const CLEAN = 0;
const CHECK = 1;
const DIRTY = 2;
type Flag = typeof CLEAN | typeof CHECK | typeof DIRTY;

const SIGNAL = 0;
const COMPUTED = 1;
const EFFECT = 2;

/** Effect flush rounds before the graph is declared to be looping. */
const MAX_FLUSH_ROUNDS = 100;

interface SourceNode {
  readonly kind: typeof SIGNAL | typeof COMPUTED;
  version: number;
  observers: ObserverNode[];
}

interface ObserverNode {
  readonly kind: typeof COMPUTED | typeof EFFECT;
  flags: Flag;
  sources: SourceNode[];
  versions: number[];
}

let activeObserver: ObserverNode | null = null;
let trackIndex = 0;
let newSources: SourceNode[] | null = null;
let newVersions: number[] | null = null;
let globalVersion = 0;
let batchDepth = 0;
const effectQueue: EffectNode[] = [];
const markStack: ComputedNode<unknown>[] = [];

class SignalNode<T> implements Signal<T>, SourceNode {
  readonly kind = SIGNAL;
  version = 0;
  observers: ObserverNode[] = [];
  current: T;
  readonly equals: Equals<T> | false;

  constructor(value: T, equals: Equals<T> | false) {
    this.current = value;
    this.equals = equals;
  }

  get value(): T {
    track(this);
    return this.current;
  }

  set value(next: T) {
    if (activeObserver !== null && activeObserver.kind === COMPUTED) {
      throw new Error("vusyk: a computed value can't write a signal");
    }
    if (this.equals !== false && this.equals(this.current, next)) return;
    this.current = next;
    this.version++;
    globalVersion++;
    if (this.observers.length === 0) return;
    batchDepth++;
    try {
      propagate(this.observers);
    } finally {
      endBatch();
    }
  }

  peek(): T {
    return this.current;
  }
}

class ComputedNode<T> implements ReadonlySignal<T>, SourceNode, ObserverNode {
  readonly kind = COMPUTED;
  version = 0;
  observers: ObserverNode[] = [];
  flags: Flag = DIRTY;
  sources: SourceNode[] = [];
  versions: number[] = [];
  current: T | undefined = undefined;
  failed = false;
  error: unknown = undefined;
  seen = -1;
  running = false;
  readonly fn: (previous: T | undefined) => T;
  readonly equals: Equals<T> | false;

  constructor(fn: (previous: T | undefined) => T, equals: Equals<T> | false) {
    this.fn = fn;
    this.equals = equals;
  }

  get value(): T {
    this.refresh();
    track(this);
    if (this.failed) throw this.error;
    return this.current as T;
  }

  peek(): T {
    this.refresh();
    if (this.failed) throw this.error;
    return this.current as T;
  }

  /** Bring the value up to date, recomputing only if a source really changed. */
  refresh(): void {
    if (this.running) throw new Error("vusyk: a computed value depends on itself");
    if (this.observers.length > 0) {
      if (this.flags === CLEAN) return;
    } else if (this.seen === globalVersion) {
      return;
    }
    this.seen = globalVersion;
    if (this.version !== 0 && !sourcesChanged(this)) {
      this.flags = CLEAN;
      return;
    }
    // The recompute is inline: a first read of a chain recurses through every
    // level, and one frame less per level is a deeper chain before the stack ends.
    this.flags = CLEAN;
    const previousObserver = activeObserver;
    const previousIndex = trackIndex;
    const previousSources = newSources;
    const previousVersions = newVersions;
    activeObserver = this;
    trackIndex = 0;
    newSources = null;
    newVersions = null;
    this.running = true;
    let next: T | undefined;
    let threw = false;
    let error: unknown;
    try {
      next = this.fn(this.current);
    } catch (caught) {
      threw = true;
      error = caught;
    } finally {
      this.running = false;
      commitSources(this, this.observers.length > 0);
      activeObserver = previousObserver;
      trackIndex = previousIndex;
      newSources = previousSources;
      newVersions = previousVersions;
    }
    if (threw) {
      this.failed = true;
      this.error = error;
      this.version++;
      return;
    }
    if (
      this.version === 0 ||
      this.failed ||
      this.equals === false ||
      !this.equals(this.current as T, next as T)
    ) {
      this.current = next;
      this.failed = false;
      this.error = undefined;
      this.version++;
    }
  }
}

class EffectNode implements ObserverNode {
  readonly kind = EFFECT;
  flags: Flag = DIRTY;
  sources: SourceNode[] = [];
  versions: number[] = [];
  cleanup: EffectCleanup | undefined = undefined;
  disposed = false;
  ran = false;
  readonly fn: () => void | EffectCleanup;
  readonly schedule: ((run: () => void) => void) | undefined;
  readonly run: () => void;

  constructor(fn: () => void | EffectCleanup, schedule: ((run: () => void) => void) | undefined) {
    this.fn = fn;
    this.schedule = schedule;
    this.run = () => this.execute();
  }

  execute(): void {
    if (this.disposed || this.flags === CLEAN) return;
    if (this.ran && !sourcesChanged(this)) {
      this.flags = CLEAN;
      return;
    }
    // Clean before the run: a write during the run marks it again.
    this.flags = CLEAN;
    runCleanup(this);
    const previousObserver = activeObserver;
    const previousIndex = trackIndex;
    const previousSources = newSources;
    const previousVersions = newVersions;
    activeObserver = this;
    trackIndex = 0;
    newSources = null;
    newVersions = null;
    const startVersion = globalVersion;
    batchDepth++;
    try {
      const cleanup = this.fn();
      this.cleanup = typeof cleanup === "function" ? cleanup : undefined;
    } finally {
      // An effect that disposed itself during the run keeps no sources.
      if (!this.disposed) commitSources(this, true);
      activeObserver = previousObserver;
      trackIndex = previousIndex;
      newSources = previousSources;
      newVersions = previousVersions;
      this.ran = true;
      // A write during the run may have reached a source before this effect
      // subscribed to it; check again on the next round.
      if (globalVersion !== startVersion && this.flags === CLEAN && !this.disposed) {
        this.flags = CHECK;
        effectQueue.push(this);
      }
      endBatch();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const sources = this.sources;
    for (let i = 0; i < sources.length; i++) unsubscribe(sources[i]!, this);
    sources.length = 0;
    this.versions.length = 0;
    runCleanup(this);
  }
}

function runCleanup(node: EffectNode): void {
  const cleanup = node.cleanup;
  if (cleanup === undefined) return;
  node.cleanup = undefined;
  const previousObserver = activeObserver;
  activeObserver = null;
  try {
    cleanup();
  } finally {
    activeObserver = previousObserver;
  }
}

function track(source: SourceNode): void {
  const observer = activeObserver;
  if (observer === null) return;
  if (newSources === null) {
    if (observer.sources[trackIndex] === source) {
      observer.versions[trackIndex] = source.version;
      trackIndex++;
      return;
    }
    if (trackIndex > 0 && observer.sources[trackIndex - 1] === source) {
      observer.versions[trackIndex - 1] = source.version;
      return;
    }
    newSources = [source];
    newVersions = [source.version];
    return;
  }
  const last = newSources.length - 1;
  if (newSources[last] === source) {
    newVersions![last] = source.version;
    return;
  }
  newSources.push(source);
  newVersions!.push(source.version);
}

/** Swap the observer's dependency list for the one its run just read. */
function commitSources(observer: ObserverNode, watched: boolean): void {
  const sources = observer.sources;
  const versions = observer.versions;
  const kept = trackIndex;
  if (newSources !== null) {
    const added = newSources;
    const addedVersions = newVersions!;
    // Subscribe the new ones first, so a source that moved position never
    // drops to zero observers in between.
    if (watched) for (let i = 0; i < added.length; i++) subscribe(added[i]!, observer);
    if (watched) for (let i = kept; i < sources.length; i++) unsubscribe(sources[i]!, observer);
    sources.length = kept;
    versions.length = kept;
    for (let i = 0; i < added.length; i++) {
      sources.push(added[i]!);
      versions.push(addedVersions[i]!);
    }
  } else if (kept < sources.length) {
    if (watched) for (let i = kept; i < sources.length; i++) unsubscribe(sources[i]!, observer);
    sources.length = kept;
    versions.length = kept;
  }
}

function subscribe(source: SourceNode, observer: ObserverNode): void {
  source.observers.push(observer);
  if (source.kind === COMPUTED && source.observers.length === 1) {
    // The computed was unobserved: it starts listening to its own sources.
    // A flag other than CLEAN means "my observers are already marked", which
    // stops propagation at this node, so it is CLEAN when it was refreshed
    // since the last write. Otherwise a write landed after the observer read
    // it; the observer is then re-queued (see EffectNode.execute) and its
    // check refreshes this node.
    const node = source as ComputedNode<unknown>;
    const sources = node.sources;
    for (let i = 0; i < sources.length; i++) subscribe(sources[i]!, node);
    node.flags = node.seen === globalVersion ? CLEAN : CHECK;
  }
}

function unsubscribe(source: SourceNode, observer: ObserverNode): void {
  const observers = source.observers;
  const index = observers.indexOf(observer);
  if (index < 0) return;
  observers[index] = observers[observers.length - 1]!;
  observers.pop();
  if (source.kind === COMPUTED && observers.length === 0) {
    const node = source as ComputedNode<unknown>;
    const sources = node.sources;
    for (let i = 0; i < sources.length; i++) unsubscribe(sources[i]!, node);
  }
}

function sourcesChanged(observer: ObserverNode): boolean {
  const sources = observer.sources;
  const versions = observer.versions;
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]!;
    if (source.kind === COMPUTED) (source as ComputedNode<unknown>).refresh();
    if (source.version !== versions[i]) return true;
  }
  return false;
}

/** Mark direct dependants dirty and everything below them as needing a check. */
function propagate(observers: ObserverNode[]): void {
  for (let i = 0; i < observers.length; i++) mark(observers[i]!, DIRTY);
  let node: ComputedNode<unknown> | undefined;
  while ((node = markStack.pop()) !== undefined) {
    const below = node.observers;
    for (let i = 0; i < below.length; i++) mark(below[i]!, CHECK);
  }
}

function mark(node: ObserverNode, flag: Flag): void {
  if (node.flags >= flag) return;
  const was = node.flags;
  node.flags = flag;
  if (was !== CLEAN) return;
  if (node.kind === EFFECT) effectQueue.push(node as EffectNode);
  else markStack.push(node as ComputedNode<unknown>);
}

function endBatch(): void {
  if (--batchDepth > 0) return;
  flushEffects();
}

function flushEffects(): void {
  let failed = false;
  let error: unknown;
  let rounds = 0;
  while (effectQueue.length > 0) {
    if (++rounds > MAX_FLUSH_ROUNDS) {
      effectQueue.length = 0;
      throw new Error(`vusyk: effects kept re-triggering each other (more than ${MAX_FLUSH_ROUNDS} rounds)`);
    }
    const pending = effectQueue.splice(0, effectQueue.length);
    batchDepth++;
    for (let i = 0; i < pending.length; i++) {
      const node = pending[i]!;
      try {
        if (node.schedule !== undefined) node.schedule(node.run);
        else node.execute();
      } catch (caught) {
        if (!failed) {
          failed = true;
          error = caught;
        }
      }
    }
    batchDepth--;
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
    node.execute();
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
  const previousObserver = activeObserver;
  activeObserver = null;
  try {
    return fn();
  } finally {
    activeObserver = previousObserver;
  }
}

/** Whether `value` is a signal or a computed value made by this module. */
export function isSignal(value: unknown): value is ReadonlySignal<unknown> {
  return value instanceof SignalNode || value instanceof ComputedNode;
}
