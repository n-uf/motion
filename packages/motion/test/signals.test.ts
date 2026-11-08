import { describe, expect, it, vi } from "vitest";
import { batch, computed, effect, isSignal, signal, untracked } from "../src/signals";

describe("signal", () => {
  it("reads and writes", () => {
    const s = signal(1);
    expect(s.value).toBe(1);
    s.value = 2;
    expect(s.value).toBe(2);
    expect(s.peek()).toBe(2);
  });

  it("skips equal writes by Object.is, or by a custom equals", () => {
    const s = signal(1);
    const runs = vi.fn();
    effect(() => runs(s.value));
    s.value = 1;
    expect(runs).toHaveBeenCalledTimes(1);

    const point = signal({ x: 1 }, { equals: (a, b) => a.x === b.x });
    const seen = vi.fn();
    effect(() => seen(point.value.x));
    point.value = { x: 1 };
    expect(seen).toHaveBeenCalledTimes(1);
    point.value = { x: 2 };
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it("notifies every write with equals: false", () => {
    const s = signal(1, { equals: false });
    const runs = vi.fn();
    effect(() => runs(s.value));
    s.value = 1;
    expect(runs).toHaveBeenCalledTimes(2);
  });
});

describe("computed", () => {
  it("is lazy and cached", () => {
    const s = signal(2);
    const fn = vi.fn(() => s.value * 10);
    const c = computed(fn);
    expect(fn).not.toHaveBeenCalled();
    expect(c.value).toBe(20);
    expect(c.value).toBe(20);
    expect(fn).toHaveBeenCalledTimes(1);
    s.value = 3;
    expect(fn).toHaveBeenCalledTimes(1);
    expect(c.value).toBe(30);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("passes the previous value", () => {
    const s = signal(1);
    const history = computed<number[]>((previous) => [...(previous ?? []), s.value]);
    expect(history.value).toEqual([1]);
    s.value = 2;
    expect(history.value).toEqual([1, 2]);
  });

  it("recomputes a diamond once per write and never shows a half-updated value", () => {
    const a = signal(1);
    const b = computed(() => a.value + 1);
    const c = computed(() => a.value * 2);
    const dFn = vi.fn(() => `${b.value}/${c.value}`);
    const d = computed(dFn);
    const seen: string[] = [];
    effect(() => {
      seen.push(d.value);
    });
    a.value = 2;
    a.value = 3;
    expect(seen).toEqual(["2/2", "3/4", "4/6"]);
    expect(dFn).toHaveBeenCalledTimes(3);
  });

  it("stops at a computed whose value did not change", () => {
    const s = signal(1);
    const parity = computed(() => s.value % 2);
    const below = vi.fn(() => parity.value);
    const label = computed(below);
    const runs = vi.fn();
    effect(() => runs(label.value));
    s.value = 3;
    expect(below).toHaveBeenCalledTimes(1);
    expect(runs).toHaveBeenCalledTimes(1);
    s.value = 4;
    expect(below).toHaveBeenCalledTimes(2);
    expect(runs).toHaveBeenCalledTimes(2);
  });

  it("follows dynamic dependencies and drops the branch it no longer reads", () => {
    const useLeft = signal(true);
    const left = signal("L");
    const right = signal("R");
    const fn = vi.fn(() => (useLeft.value ? left.value : right.value));
    const picked = computed(fn);
    const seen: string[] = [];
    effect(() => {
      seen.push(picked.value);
    });
    right.value = "R2";
    expect(seen).toEqual(["L"]);
    useLeft.value = false;
    expect(seen).toEqual(["L", "R2"]);
    const callsBefore = fn.mock.calls.length;
    left.value = "L2";
    expect(fn.mock.calls.length).toBe(callsBefore);
    expect(seen).toEqual(["L", "R2"]);
  });

  it("stays correct without observers and stops listening when the last effect goes", () => {
    const s = signal(1);
    const fn = vi.fn(() => s.value + 1);
    const c = computed(fn);
    expect(c.value).toBe(2);
    s.value = 5;
    expect(c.value).toBe(6);

    const dispose = effect(() => {
      c.value;
    });
    const calls = fn.mock.calls.length;
    dispose();
    s.value = 10;
    s.value = 11;
    // Unobserved: nothing recomputes until someone reads it.
    expect(fn.mock.calls.length).toBe(calls);
    expect(c.value).toBe(12);
    expect(fn.mock.calls.length).toBe(calls + 1);
  });

  it("rethrows its error until a source changes", () => {
    const s = signal(0);
    const c = computed(() => {
      if (s.value === 0) throw new Error("zero");
      return 10 / s.value;
    });
    expect(() => c.value).toThrow("zero");
    expect(() => c.peek()).toThrow("zero");
    s.value = 2;
    expect(c.value).toBe(5);
  });

  it("reports a cycle", () => {
    const s = signal(0);
    let self: { value: number } = { value: 0 };
    const c = computed((): number => (s.value > 0 ? self.value : 0));
    self = c;
    expect(c.value).toBe(0);
    s.value = 1;
    expect(() => c.value).toThrow(/depends on itself/);
  });

  it("refuses to write a signal", () => {
    const s = signal(0);
    const other = signal(0);
    const c = computed(() => {
      other.value = s.value;
      return 1;
    });
    expect(() => c.value).toThrow(/can't write a signal/);
  });
});

describe("effect", () => {
  it("runs now, then on change, and runs the cleanup before the next run and on dispose", () => {
    const s = signal(1);
    const log: string[] = [];
    const dispose = effect(() => {
      const v = s.value;
      log.push(`run ${v}`);
      return () => log.push(`cleanup ${v}`);
    });
    s.value = 2;
    dispose();
    s.value = 3;
    expect(log).toEqual(["run 1", "cleanup 1", "run 2", "cleanup 2"]);
  });

  it("batches writes: one run per batch, nested batches flush at the outermost end", () => {
    const a = signal(1);
    const b = signal(1);
    const runs = vi.fn();
    effect(() => runs(a.value + b.value));
    batch(() => {
      a.value = 2;
      batch(() => {
        b.value = 3;
      });
      expect(runs).toHaveBeenCalledTimes(1);
    });
    expect(runs).toHaveBeenCalledTimes(2);
    expect(runs).toHaveBeenLastCalledWith(5);
  });

  it("returns the batch result", () => {
    expect(batch(() => 42)).toBe(42);
  });

  it("does not track reads inside untracked", () => {
    const tracked = signal(1);
    const ignored = signal(1);
    const runs = vi.fn();
    effect(() => runs(tracked.value + untracked(() => ignored.value)));
    ignored.value = 2;
    expect(runs).toHaveBeenCalledTimes(1);
    tracked.value = 2;
    expect(runs).toHaveBeenLastCalledWith(4);
  });

  it("hands every run to schedule, once until it runs, with the latest values", () => {
    const s = signal(1);
    const queue: (() => void)[] = [];
    const schedule = vi.fn((run: () => void) => {
      queue.push(run);
    });
    const seen: number[] = [];
    effect(
      () => {
        seen.push(s.value);
      },
      { schedule },
    );
    expect(seen).toEqual([]);
    queue.shift()!();
    expect(seen).toEqual([1]);
    s.value = 2;
    s.value = 3;
    s.value = 4;
    expect(schedule).toHaveBeenCalledTimes(2);
    const run = queue.shift()!;
    expect(run).toBe(schedule.mock.calls[0]![0]);
    run();
    expect(seen).toEqual([1, 4]);
  });

  it("skips a scheduled run when the sources changed back", () => {
    const s = signal(1);
    const parity = computed(() => s.value % 2);
    const queue: (() => void)[] = [];
    const runs = vi.fn();
    effect(() => runs(parity.value), { schedule: (run) => queue.push(run) });
    queue.shift()!();
    s.value = 3;
    queue.shift()!();
    expect(runs).toHaveBeenCalledTimes(1);
  });

  it("is not re-run by its own writes, but is by the next outside write", () => {
    const s = signal(15);
    const seen: number[] = [];
    effect(() => {
      seen.push(s.value);
      if (s.value > 10) s.value = 10;
    });
    expect(seen).toEqual([15]);
    expect(s.value).toBe(10);
    s.value = 20;
    expect(seen).toEqual([15, 20]);
    expect(s.value).toBe(10);
  });

  it("re-runs another effect its write reaches, and computed values it read see the write", () => {
    const s = signal(1);
    const doubled = computed(() => s.value * 2);
    const seen: number[] = [];
    effect(() => {
      seen.push(doubled.value);
    });
    effect(() => {
      if (s.peek() === 1) s.value = 2;
    });
    expect(seen).toEqual([2, 4]);
    expect(doubled.value).toBe(4);
  });

  it("throws when effects keep re-triggering each other", () => {
    const a = signal(0);
    const b = signal(0);
    effect(() => {
      b.value = a.value + 1;
    });
    expect(() =>
      effect(() => {
        a.value = b.value + 1;
      }),
    ).toThrow(/re-triggering/);
  });

  it("disposes itself and rethrows when the first run throws", () => {
    const s = signal(0);
    const runs = vi.fn();
    expect(() =>
      effect(() => {
        runs(s.value);
        throw new Error("boom");
      }),
    ).toThrow("boom");
    s.value = 1;
    expect(runs).toHaveBeenCalledTimes(1);
  });

  it("runs the other effects and then rethrows when a re-run throws", () => {
    const s = signal(0);
    effect(() => {
      if (s.value === 1) throw new Error("later");
    });
    const runs = vi.fn();
    effect(() => runs(s.value));
    expect(() => (s.value = 1)).toThrow("later");
    expect(runs).toHaveBeenLastCalledWith(1);
  });

  it("can dispose itself during a run", () => {
    const s = signal(0);
    const runs = vi.fn();
    const dispose: () => void = effect(() => {
      runs(s.value);
      if (s.value === 1) dispose();
    });
    s.value = 1;
    s.value = 2;
    expect(runs).toHaveBeenCalledTimes(2);
  });
});

describe("isSignal", () => {
  it("tells signals and computed values from other things", () => {
    expect(isSignal(signal(1))).toBe(true);
    expect(isSignal(computed(() => 1))).toBe(true);
    expect(isSignal({ value: 1 })).toBe(false);
    expect(isSignal(null)).toBe(false);
  });
});
