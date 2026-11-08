import type { ClockPort, FrameSource } from "./port";

/**
 * The phases of a frame, in the order they run:
 * - `input`: coalesced pointer, wheel and key samples are delivered;
 * - `update`: state changes (a gesture machine's intent, an engine transaction);
 * - `layout`: derived geometry, then motion values step toward their targets;
 * - `write`: the host writes the results out (transforms, canvas, DOM).
 */
export type Phase = "input" | "update" | "layout" | "write";

/** {@link Phase} in run order. */
export const PHASES: readonly Phase[] = ["input", "update", "layout", "write"];

const PHASE_INDEX: Readonly<Record<Phase, number>> = { input: 0, update: 1, layout: 2, write: 3 };

/** What a task sees of the frame it runs in. */
export interface FrameInfo {
  /** `clock.now()` when the frame started. */
  readonly time: number;
  /**
   * Ms since the previous frame, clamped to `maxDeltaMs`. The first frame
   * after the loop was idle gets `frameMs`, not the idle gap.
   */
  readonly delta: number;
  /** Frame counter, from 0. */
  readonly index: number;
  /** The phase running now. */
  readonly phase: Phase;
  /** The loop's frame budget in ms. */
  readonly budgetMs: number;
  /** Ms spent in this frame so far. */
  elapsed(): number;
  /** Ms of budget left in this frame (negative when over). */
  remaining(): number;
}

/** A one-shot task. */
export type FrameTask = (frame: FrameInfo) => void;

/** A task that runs every frame; it stops when it returns `false`. */
export type RepeatingTask = (frame: FrameInfo) => boolean | void;

/** Options of {@link FrameLoop.schedule}. */
export interface ScheduleOptions {
  /**
   * May wait for a later frame when this frame is over budget. Default
   * `false`: the task runs this frame whatever the cost. Repeating tasks
   * always run.
   */
  readonly deferrable?: boolean;
}

/** Counters of a frame loop since it was created or last reset. */
export interface FrameStats {
  /** Frames run. */
  readonly frames: number;
  /** Frames that took longer than the budget. */
  readonly overBudget: number;
  /** Deferrable tasks moved to a later frame because the budget was spent. */
  readonly deferred: number;
  /** Tasks that threw. */
  readonly errors: number;
  /** Duration of the last frame in ms. */
  readonly lastMs: number;
  /** Longest frame in ms. */
  readonly maxMs: number;
  /** Mean frame duration in ms. */
  readonly meanMs: number;
  /** Duration of each phase in the last frame, in ms. */
  readonly phaseMs: Readonly<Record<Phase, number>>;
  /** Repeating tasks currently registered. */
  readonly repeating: number;
  /** One-shot tasks waiting for a frame. */
  readonly queued: number;
}

/** Options of {@link createFrameLoop}. */
export interface FrameLoopOptions {
  /** The clock: frames, time and timers all come from it. */
  readonly clock: ClockPort;
  /** Frame budget in ms. Default 10. */
  readonly budgetMs?: number;
  /** `delta` of the first frame after the loop was idle. Default 1000/60. */
  readonly frameMs?: number;
  /** Largest `delta` handed to tasks (a long pause doesn't make motion jump). Default 64. */
  readonly maxDeltaMs?: number;
  /**
   * How many times one phase drains tasks that were queued for that same
   * phase while it ran (an effect that triggers another effect). The rest
   * waits for the next frame. Default 8.
   */
  readonly maxRounds?: number;
  /**
   * Called when a task throws; the frame carries on. Without it, the first
   * error of a frame is rethrown once the frame is done (and the next frame
   * is already requested). A repeating task that throws is stopped.
   */
  readonly onError?: (error: unknown, phase: Phase) => void;
  /** Called after a frame that took longer than the budget. */
  readonly onOverBudget?: (stats: FrameStats) => void;
}

/**
 * One frame loop. It requests a frame only while it has work, runs the
 * phases in order, and goes idle (no frame requested) when nothing is left.
 */
export interface FrameLoop {
  /** The clock the loop runs on. */
  readonly clock: ClockPort;
  /** The frame budget in ms. */
  readonly budgetMs: number;
  /** Whether a frame is requested or running. */
  readonly active: boolean;
  /** The phase running now, or `null` outside a frame. */
  readonly phase: Phase | null;
  /**
   * Run `task` once in `phase`: in this frame if that phase is still ahead,
   * otherwise in the next one. Scheduling the same function again before it
   * runs does nothing. Returns a cancel function.
   */
  schedule(phase: Phase, task: FrameTask, options?: ScheduleOptions): () => void;
  /** Run `task` in `phase` every frame until it returns `false` or the returned stop is called. */
  repeat(phase: Phase, task: RepeatingTask): () => void;
  /**
   * A scheduler for `effect(fn, { schedule })`: the effect runs in `phase`,
   * at most once per frame. The same function is returned for a phase each time.
   */
  scheduler(phase: Phase): (run: () => void) => void;
  /** A {@link FrameSource} whose frames are this loop's `phase`, for a coalescer. */
  frames(phase: Phase): FrameSource;
  /** Counters since creation or the last {@link FrameLoop.resetStats}. */
  stats(): FrameStats;
  /** Zero the counters. */
  resetStats(): void;
  /** Cancel the requested frame and drop every task. The loop does nothing after this. */
  dispose(): void;
}

interface Job {
  readonly task: FrameTask;
  readonly deferrable: boolean;
  cancelled: boolean;
}

interface Repeater {
  readonly task: RepeatingTask;
  alive: boolean;
}

/** Create a frame loop on `options.clock`. */
export function createFrameLoop(options: FrameLoopOptions): FrameLoop {
  const clock = options.clock;
  const budgetMs = options.budgetMs ?? 10;
  const frameMs = options.frameMs ?? 1000 / 60;
  const maxDeltaMs = options.maxDeltaMs ?? 64;
  const maxRounds = options.maxRounds ?? 8;
  const onError = options.onError;
  const onOverBudget = options.onOverBudget;

  const queues: Map<FrameTask, Job>[] = [new Map(), new Map(), new Map(), new Map()];
  const carried: Job[][] = [[], [], [], []];
  const repeaters: Repeater[][] = [[], [], [], []];
  const schedulers: ((run: () => void) => void)[] = [];
  let liveRepeaters = 0;
  let handle: number | null = null;
  let running = false;
  let current = -1;
  let lastTime: number | null = null;
  let index = 0;
  let frameStart = 0;
  let disposed = false;
  let frameError: { error: unknown } | null = null;

  let frameCount = 0;
  let overBudget = 0;
  let deferred = 0;
  let errors = 0;
  let lastMs = 0;
  let maxMs = 0;
  let totalMs = 0;
  const phaseMs = [0, 0, 0, 0];

  const queuedCount = (): number => {
    let count = 0;
    for (let p = 0; p < 4; p++) count += queues[p]!.size + carried[p]!.length;
    return count;
  };

  const hasWork = (): boolean => liveRepeaters > 0 || queuedCount() > 0;

  const request = (): void => {
    if (handle !== null || running || disposed) return;
    handle = clock.requestFrame(runFrame);
  };

  /** Drop a requested frame that has nothing left to do. */
  const releaseIfIdle = (): void => {
    if (running || handle === null || hasWork()) return;
    clock.cancelFrame(handle);
    handle = null;
    lastTime = null;
  };

  const report = (error: unknown, phase: number): void => {
    errors++;
    if (onError !== undefined) {
      onError(error, PHASES[phase]!);
    } else if (frameError === null) {
      frameError = { error };
    }
  };

  const drain = (phase: number, info: FrameInfo): void => {
    const queue = queues[phase]!;
    for (let round = 0; queue.size > 0 && round < maxRounds; round++) {
      const jobs = Array.from(queue.values());
      queue.clear();
      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i]!;
        if (job.cancelled) continue;
        if (job.deferrable && clock.now() - frameStart >= budgetMs) {
          carried[phase]!.push(job);
          deferred++;
          continue;
        }
        try {
          job.task(info);
        } catch (error) {
          report(error, phase);
        }
      }
    }
  };

  const runRepeaters = (phase: number, info: FrameInfo): void => {
    const list = repeaters[phase]!;
    // New repeaters pushed during the pass run in this pass too.
    for (let i = 0; i < list.length; i++) {
      const repeater = list[i]!;
      if (!repeater.alive) continue;
      let keep: boolean | void;
      try {
        keep = repeater.task(info);
      } catch (error) {
        report(error, phase);
        keep = false;
      }
      if (keep === false && repeater.alive) {
        repeater.alive = false;
        liveRepeaters--;
      }
    }
    let kept = 0;
    for (let i = 0; i < list.length; i++) {
      const repeater = list[i]!;
      if (repeater.alive) list[kept++] = repeater;
    }
    list.length = kept;
  };

  /** Put deferred jobs back at the front of their queues for the next frame. */
  const restoreCarried = (): void => {
    for (let p = 0; p < 4; p++) {
      const jobs = carried[p]!;
      if (jobs.length === 0) continue;
      const queue = queues[p]!;
      const later = Array.from(queue.values());
      queue.clear();
      for (const job of jobs) if (!job.cancelled) queue.set(job.task, job);
      for (const job of later) if (!queue.has(job.task)) queue.set(job.task, job);
      jobs.length = 0;
    }
  };

  function runFrame(): void {
    handle = null;
    if (disposed) return;
    const time = clock.now();
    const delta = lastTime === null ? frameMs : Math.min(Math.max(time - lastTime, 0), maxDeltaMs);
    lastTime = time;
    frameStart = time;
    const info = {
      time,
      delta,
      index: index++,
      phase: PHASES[0]!,
      budgetMs,
      elapsed: (): number => clock.now() - frameStart,
      remaining: (): number => budgetMs - (clock.now() - frameStart),
    };
    running = true;
    try {
      for (let p = 0; p < 4; p++) {
        current = p;
        info.phase = PHASES[p]!;
        const phaseStart = clock.now();
        drain(p, info);
        runRepeaters(p, info);
        drain(p, info);
        phaseMs[p] = clock.now() - phaseStart;
      }
    } finally {
      running = false;
      current = -1;
    }
    restoreCarried();
    const took = clock.now() - frameStart;
    frameCount++;
    lastMs = took;
    totalMs += took;
    if (took > maxMs) maxMs = took;
    if (took > budgetMs) {
      overBudget++;
      if (onOverBudget !== undefined) onOverBudget(stats());
    }
    if (hasWork()) request();
    else lastTime = null;
    if (frameError !== null) {
      const { error } = frameError;
      frameError = null;
      throw error;
    }
  }

  const stats = (): FrameStats => ({
    frames: frameCount,
    overBudget,
    deferred,
    errors,
    lastMs,
    maxMs,
    meanMs: frameCount === 0 ? 0 : totalMs / frameCount,
    phaseMs: { input: phaseMs[0]!, update: phaseMs[1]!, layout: phaseMs[2]!, write: phaseMs[3]! },
    repeating: liveRepeaters,
    queued: queuedCount(),
  });

  const schedule = (phase: Phase, task: FrameTask, scheduleOptions?: ScheduleOptions): (() => void) => {
    if (disposed) return () => {};
    const queue = queues[PHASE_INDEX[phase]]!;
    let job = queue.get(task);
    if (job === undefined) {
      job = { task, deferrable: scheduleOptions?.deferrable ?? false, cancelled: false };
      queue.set(task, job);
      request();
    }
    const scheduled = job;
    return () => {
      if (scheduled.cancelled) return;
      scheduled.cancelled = true;
      if (queue.get(task) === scheduled) queue.delete(task);
      releaseIfIdle();
    };
  };

  const loop: FrameLoop = {
    clock,
    budgetMs,
    get active() {
      return running || handle !== null;
    },
    get phase() {
      return current < 0 ? null : PHASES[current]!;
    },
    schedule,
    repeat(phase, task) {
      if (disposed) return () => {};
      const repeater: Repeater = { task, alive: true };
      repeaters[PHASE_INDEX[phase]]!.push(repeater);
      liveRepeaters++;
      request();
      return () => {
        if (!repeater.alive) return;
        repeater.alive = false;
        liveRepeaters--;
        releaseIfIdle();
      };
    },
    scheduler(phase) {
      const p = PHASE_INDEX[phase];
      let made = schedulers[p];
      if (made === undefined) {
        made = (run) => {
          schedule(phase, run);
        };
        schedulers[p] = made;
      }
      return made;
    },
    frames(phase) {
      let next = 1;
      const pending = new Map<number, () => void>();
      return {
        requestFrame(callback) {
          const id = next++;
          const task = (): void => {
            pending.delete(id);
            callback();
          };
          pending.set(id, schedule(phase, task));
          return id;
        },
        cancelFrame(id) {
          const cancel = pending.get(id);
          if (cancel === undefined) return;
          pending.delete(id);
          cancel();
        },
      };
    },
    stats,
    resetStats() {
      frameCount = 0;
      overBudget = 0;
      deferred = 0;
      errors = 0;
      lastMs = 0;
      maxMs = 0;
      totalMs = 0;
      phaseMs.fill(0);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (handle !== null) clock.cancelFrame(handle);
      handle = null;
      for (let p = 0; p < 4; p++) {
        queues[p]!.clear();
        carried[p]!.length = 0;
        for (const repeater of repeaters[p]!) repeater.alive = false;
        repeaters[p]!.length = 0;
      }
      liveRepeaters = 0;
    },
  };
  return loop;
}
