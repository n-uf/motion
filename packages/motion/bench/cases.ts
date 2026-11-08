/**
 * The signals benchmark cases: graphs of a few thousand nodes, the same for
 * every library behind a tiny adapter. bench/run.mjs bundles this file once
 * per library and runs each bundle in its own Node process, so no library
 * runs on JIT feedback another one left behind.
 *
 * Each case checks its effect counts once before timing, so a broken adapter
 * fails loudly instead of measuring nothing.
 */

export interface Cell<T> {
  get(): T;
  set(value: T): void;
}
export interface Derived<T> {
  get(): T;
}
export interface Lib {
  signal<T>(value: T): Cell<T>;
  computed<T>(fn: () => T): Derived<T>;
  effect(fn: () => void): () => void;
}

export interface CaseResult {
  readonly name: string;
  readonly samples: number;
  readonly medianUs: number;
  readonly bestUs: number;
  readonly p90Us: number;
}

const WARMUP_MS = 300;
const MEASURE_MS = 1000;
const MAX_SAMPLES = 5000;

function expectRuns(what: string, actual: number, expected: number): void {
  if (actual !== expected) throw new Error(`${what}: ${actual} effect runs, expected ${expected}`);
}

function measure(name: string, op: () => void): CaseResult {
  const warmEnd = performance.now() + WARMUP_MS;
  while (performance.now() < warmEnd) op();
  const times: number[] = [];
  const end = performance.now() + MEASURE_MS;
  while (performance.now() < end && times.length < MAX_SAMPLES) {
    const start = performance.now();
    op();
    times.push((performance.now() - start) * 1000);
  }
  times.sort((a, b) => a - b);
  return {
    name,
    samples: times.length,
    medianUs: times[Math.floor(times.length / 2)]!,
    bestUs: times[0]!,
    p90Us: times[Math.floor(times.length * 0.9)]!,
  };
}

export const CASES = [
  "fan-out: 1 signal → 2000 computeds → 2000 effects",
  "deep chain: 1 signal → 1000 computeds in a row → 1 effect",
  "layered grid: 20 signals, 100 layers × 20 computeds reading 2 each, 20 effects",
  "pruned: 1 signal → 2000 computeds that don't change → 2000 effects that must not run",
  "churn: build and dispose 1000 signal → computed → effect triples",
] as const;

export function run(lib: Lib): CaseResult[] {
  const results: CaseResult[] = [];

  {
    const source = lib.signal(0);
    let runs = 0;
    for (let i = 0; i < 2000; i++) {
      const c = lib.computed(() => source.get() + i);
      lib.effect(() => {
        c.get();
        runs++;
      });
    }
    runs = 0;
    source.set(1);
    expectRuns("fan-out", runs, 2000);
    let n = 1;
    results.push(measure(CASES[0], () => source.set(++n)));
  }

  {
    const source = lib.signal(0);
    let last: Derived<number> = source;
    for (let i = 0; i < 1000; i++) {
      const previous = last;
      last = lib.computed(() => previous.get() + 1);
    }
    const end = last;
    let runs = 0;
    lib.effect(() => {
      end.get();
      runs++;
    });
    runs = 0;
    source.set(1);
    expectRuns("deep chain", runs, 1);
    let n = 1;
    results.push(measure(CASES[1], () => source.set(++n)));
  }

  {
    const width = 20;
    const sources = Array.from({ length: width }, (_, i) => lib.signal(i));
    let layer: Derived<number>[] = sources;
    for (let l = 0; l < 100; l++) {
      const above = layer;
      layer = above.map((_, i) => {
        const a = above[i]!;
        const b = above[(i + 1) % width]!;
        return lib.computed(() => a.get() + b.get());
      });
    }
    let runs = 0;
    for (const node of layer) {
      lib.effect(() => {
        node.get();
        runs++;
      });
    }
    runs = 0;
    sources[0]!.set(100);
    expectRuns("layered grid", runs, width);
    let n = 100;
    let column = 0;
    results.push(
      measure(CASES[2], () => {
        sources[column]!.set(++n);
        column = (column + 1) % width;
      }),
    );
  }

  {
    const source = lib.signal(0);
    let runs = 0;
    for (let i = 0; i < 2000; i++) {
      const parity = lib.computed(() => source.get() % 2);
      lib.effect(() => {
        parity.get();
        runs++;
      });
    }
    runs = 0;
    source.set(2);
    expectRuns("pruned", runs, 0);
    let n = 2;
    results.push(measure(CASES[3], () => source.set((n += 2))));
  }

  {
    let runs = 0;
    const once = (): void => {
      const disposers: (() => void)[] = [];
      for (let i = 0; i < 1000; i++) {
        const s = lib.signal(i);
        const c = lib.computed(() => s.get() + 1);
        disposers.push(
          lib.effect(() => {
            c.get();
            runs++;
          }),
        );
      }
      for (const dispose of disposers) dispose();
    };
    once();
    expectRuns("churn", runs, 1000);
    results.push(measure(CASES[4], once));
  }

  return results;
}
