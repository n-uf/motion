import { describe, expect, it, vi } from "vitest";
import { createFakeClock, createFrameLoop, PHASES, type FrameInfo, type Phase } from "../src/clock";
import { effect, signal } from "../src/signals";

describe("fake clock", () => {
  it("moves only when told, firing timers in time order with now() at their due time", () => {
    const clock = createFakeClock({ now: 100 });
    const log: string[] = [];
    clock.setTimer(() => log.push(`b@${clock.now()}`), 20);
    clock.setTimer(() => log.push(`a@${clock.now()}`), 10);
    clock.setTimer(() => log.push(`c@${clock.now()}`), 20);
    expect(clock.now()).toBe(100);
    expect(clock.pendingTimers).toBe(3);
    clock.tick(15);
    expect(log).toEqual(["a@110"]);
    expect(clock.now()).toBe(115);
    clock.tick(5);
    expect(log).toEqual(["a@110", "b@120", "c@120"]);
    expect(clock.pendingTimers).toBe(0);
  });

  it("fires a timer set by a timer when it comes due in the same tick", () => {
    const clock = createFakeClock();
    const log: number[] = [];
    clock.setTimer(() => {
      log.push(clock.now());
      clock.setTimer(() => log.push(clock.now()), 5);
    }, 5);
    clock.tick(20);
    expect(log).toEqual([5, 10]);
  });

  it("clears timers and cancels frames", () => {
    const clock = createFakeClock();
    const fn = vi.fn();
    clock.clearTimer(clock.setTimer(fn, 1));
    clock.cancelFrame(clock.requestFrame(fn));
    clock.tick(10);
    expect(clock.frame()).toBe(0);
    expect(fn).not.toHaveBeenCalled();
  });

  it("runs frame callbacks requested before the frame; ones requested during it wait", () => {
    const clock = createFakeClock({ frameMs: 10 });
    const log: string[] = [];
    clock.requestFrame(() => {
      log.push(`first@${clock.now()}`);
      clock.requestFrame(() => log.push(`second@${clock.now()}`));
    });
    expect(clock.pendingFrames).toBe(1);
    expect(clock.frame()).toBe(1);
    expect(log).toEqual(["first@10"]);
    expect(clock.frame(5)).toBe(1);
    expect(log).toEqual(["first@10", "second@15"]);
  });

  it("spend() moves time without firing timers", () => {
    const clock = createFakeClock();
    const fn = vi.fn();
    clock.setTimer(fn, 5);
    clock.spend(10);
    expect(clock.now()).toBe(10);
    expect(fn).not.toHaveBeenCalled();
    clock.tick(0);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("runUntilIdle stops when nothing asks for frames, and throws when something always does", () => {
    const clock = createFakeClock();
    let left = 3;
    const again = (): void => {
      if (--left > 0) clock.requestFrame(again);
    };
    clock.requestFrame(again);
    expect(clock.runUntilIdle()).toBe(3);
    const forever = (): void => {
      clock.requestFrame(forever);
    };
    clock.requestFrame(forever);
    expect(() => clock.runUntilIdle({ maxFrames: 5 })).toThrow(/after 5 frames/);
  });

  it("rejects negative steps", () => {
    const clock = createFakeClock();
    expect(() => clock.tick(-1)).toThrow(RangeError);
    expect(() => clock.spend(Number.NaN)).toThrow(RangeError);
  });
});

describe("frame loop", () => {
  it("runs the phases in order: input, update, layout, write", () => {
    const clock = createFakeClock();
    const loop = createFrameLoop({ clock });
    const order: Phase[] = [];
    for (const phase of [...PHASES].reverse()) loop.schedule(phase, (frame) => order.push(frame.phase));
    clock.frame();
    expect(order).toEqual(["input", "update", "layout", "write"]);
  });

  it("requests a frame only while it has work, and goes idle after", () => {
    const clock = createFakeClock();
    const loop = createFrameLoop({ clock });
    expect(loop.active).toBe(false);
    expect(clock.pendingFrames).toBe(0);
    loop.schedule("update", () => {});
    expect(loop.active).toBe(true);
    expect(clock.pendingFrames).toBe(1);
    clock.frame();
    expect(loop.active).toBe(false);
    expect(clock.pendingFrames).toBe(0);
  });

  it("dedupes a task scheduled twice, and cancel drops it", () => {
    const clock = createFakeClock();
    const loop = createFrameLoop({ clock });
    const task = vi.fn();
    loop.schedule("update", task);
    loop.schedule("update", task);
    clock.frame();
    expect(task).toHaveBeenCalledTimes(1);
    const cancel = loop.schedule("update", task);
    cancel();
    expect(clock.pendingFrames).toBe(0);
    clock.frame();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("runs a task queued for a later phase in this frame, an earlier phase in the next", () => {
    const clock = createFakeClock();
    const loop = createFrameLoop({ clock });
    const log: string[] = [];
    loop.schedule("update", (frame) => {
      log.push(`update#${frame.index}`);
      loop.schedule("write", (f) => log.push(`write#${f.index}`));
      loop.schedule("input", (f) => log.push(`input#${f.index}`));
    });
    clock.frame();
    expect(log).toEqual(["update#0", "write#0"]);
    clock.frame();
    expect(log).toEqual(["update#0", "write#0", "input#1"]);
  });

  it("drains same-phase follow-ups within the frame up to maxRounds, then defers the rest", () => {
    const clock = createFakeClock();
    const loop = createFrameLoop({ clock, maxRounds: 3 });
    const seen: number[] = [];
    let n = 0;
    const chain = (frame: FrameInfo): void => {
      seen.push(frame.index);
      if (++n < 5) loop.schedule("update", () => chain(frame));
    };
    loop.schedule("update", chain);
    clock.frame();
    // Three rounds in the first drain, three more after the repeat pass: 5 links fit.
    expect(seen).toEqual([0, 0, 0, 0, 0]);
    const ping = vi.fn();
    const relay = (): void => {
      ping();
      loop.schedule("write", relay);
    };
    loop.schedule("write", relay);
    clock.frame();
    // 3 rounds + 3 rounds in one frame, the seventh waits.
    expect(ping).toHaveBeenCalledTimes(6);
    expect(loop.stats().queued).toBe(1);
  });

  it("repeats a task every frame until it returns false or is stopped", () => {
    const clock = createFakeClock();
    const loop = createFrameLoop({ clock });
    let count = 0;
    loop.repeat("layout", () => ++count < 3);
    expect(clock.runUntilIdle()).toBe(3);
    expect(count).toBe(3);

    const step = vi.fn();
    const stop = loop.repeat("update", step);
    clock.frames(2);
    stop();
    expect(clock.pendingFrames).toBe(0);
    clock.frame();
    expect(step).toHaveBeenCalledTimes(2);
  });

  it("starts a repeating task added during a phase's one-shots in that same phase", () => {
    const clock = createFakeClock();
    const loop = createFrameLoop({ clock });
    const log: string[] = [];
    loop.schedule("layout", () => {
      log.push("target set");
      loop.repeat("layout", (frame) => {
        log.push(`step#${frame.index}`);
        return false;
      });
    });
    loop.schedule("write", () => log.push("write"));
    clock.frame();
    expect(log).toEqual(["target set", "step#0", "write"]);
  });

  it("gives delta since the last frame, frameMs after idle, clamped to maxDeltaMs", () => {
    const clock = createFakeClock();
    const loop = createFrameLoop({ clock, frameMs: 16, maxDeltaMs: 50 });
    const deltas: number[] = [];
    const stop = loop.repeat("update", (frame) => {
      deltas.push(frame.delta);
    });
    clock.frame(10);
    clock.frame(20);
    clock.frame(200);
    stop();
    clock.tick(1000);
    loop.schedule("update", (frame) => {
      deltas.push(frame.delta);
    });
    clock.frame(30);
    expect(deltas).toEqual([16, 20, 50, 16]);
  });

  it("defers deferrable tasks once the budget is spent, never the others, and counts it", () => {
    const clock = createFakeClock();
    const onOverBudget = vi.fn();
    const loop = createFrameLoop({ clock, budgetMs: 8, onOverBudget });
    const log: string[] = [];
    loop.schedule("update", () => {
      log.push("heavy");
      clock.spend(10);
    });
    loop.schedule("update", () => log.push("optional"), { deferrable: true });
    loop.schedule("update", () => log.push("required"));
    loop.repeat("layout", () => {
      log.push("animation");
      return false;
    });
    clock.frame();
    expect(log).toEqual(["heavy", "required", "animation"]);
    expect(onOverBudget).toHaveBeenCalledTimes(1);
    let stats = loop.stats();
    expect(stats.overBudget).toBe(1);
    expect(stats.deferred).toBe(1);
    expect(stats.lastMs).toBe(10);
    expect(stats.phaseMs.update).toBe(10);
    expect(stats.queued).toBe(1);
    clock.frame();
    expect(log).toEqual(["heavy", "required", "animation", "optional"]);
    stats = loop.stats();
    expect(stats.frames).toBe(2);
    expect(stats.maxMs).toBe(10);
    expect(stats.meanMs).toBe(5);
    expect(clock.pendingFrames).toBe(0);
    loop.resetStats();
    expect(loop.stats().frames).toBe(0);
  });

  it("tells a task how much budget is left", () => {
    const clock = createFakeClock();
    const loop = createFrameLoop({ clock, budgetMs: 10 });
    const seen: number[] = [];
    loop.schedule("update", (frame) => {
      clock.spend(4);
      seen.push(frame.elapsed(), frame.remaining());
    });
    clock.frame();
    expect(seen).toEqual([4, 6]);
  });

  it("rethrows the first task error after the frame, with the other tasks run and the next frame requested", () => {
    const clock = createFakeClock();
    const loop = createFrameLoop({ clock });
    const after = vi.fn();
    const step = vi.fn(() => {
      throw new Error("bad step");
    });
    loop.schedule("update", () => {
      throw new Error("first");
    });
    loop.repeat("layout", step);
    loop.schedule("write", after);
    loop.repeat("write", () => true);
    expect(() => clock.frame()).toThrow("first");
    expect(after).toHaveBeenCalled();
    expect(loop.stats().errors).toBe(2);
    expect(clock.pendingFrames).toBe(1);
    clock.frame();
    // A repeating task that threw was stopped.
    expect(step).toHaveBeenCalledTimes(1);
  });

  it("hands errors to onError when given", () => {
    const clock = createFakeClock();
    const onError = vi.fn();
    const loop = createFrameLoop({ clock, onError });
    loop.schedule("layout", () => {
      throw new Error("x");
    });
    expect(() => clock.frame()).not.toThrow();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), "layout");
  });

  it("runs effects through scheduler(phase) once per frame with the latest values", () => {
    const clock = createFakeClock();
    const loop = createFrameLoop({ clock });
    const x = signal(0);
    const writes: number[] = [];
    effect(
      () => {
        writes.push(x.value);
      },
      { schedule: loop.scheduler("write") },
    );
    expect(loop.scheduler("write")).toBe(loop.scheduler("write"));
    clock.frame();
    x.value = 1;
    x.value = 2;
    x.value = 3;
    clock.frame();
    expect(writes).toEqual([0, 3]);
    clock.frame();
    expect(writes).toEqual([0, 3]);
  });

  it("frames(phase) is a frame source that runs callbacks in that phase", () => {
    const clock = createFakeClock();
    const loop = createFrameLoop({ clock });
    const source = loop.frames("input");
    const log: string[] = [];
    source.requestFrame(() => log.push("input callback"));
    const dropped = source.requestFrame(() => log.push("dropped"));
    source.cancelFrame(dropped);
    loop.schedule("update", () => log.push("update"));
    clock.frame();
    expect(log).toEqual(["input callback", "update"]);
  });

  it("reports the phase it is in, and null outside a frame", () => {
    const clock = createFakeClock();
    const loop = createFrameLoop({ clock });
    const phases: (Phase | null)[] = [];
    loop.schedule("layout", () => phases.push(loop.phase));
    clock.frame();
    phases.push(loop.phase);
    expect(phases).toEqual(["layout", null]);
  });

  it("does nothing after dispose", () => {
    const clock = createFakeClock();
    const loop = createFrameLoop({ clock });
    const task = vi.fn();
    loop.repeat("update", task);
    loop.dispose();
    expect(clock.pendingFrames).toBe(0);
    loop.schedule("update", task);
    loop.repeat("update", task);
    clock.frames(3);
    expect(task).not.toHaveBeenCalled();
  });
});
