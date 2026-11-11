/** The README's per-folder examples, run as written (console output checked). */
import { describe, expect, it, vi } from "vitest";
import {
  computed,
  createFakeClock,
  createFrameLoop,
  createRecognizer,
  effect,
  settleValue,
  signal,
  springValue,
} from "../index";

describe("README examples", () => {
  it("clock/", () => {
    const log = vi.fn();
    const clock = createFakeClock();
    const loop = createFrameLoop({ clock, budgetMs: 8 });
    loop.schedule("write", () => log("write"));
    loop.schedule("input", () => log("input"));
    clock.frame();
    expect(log.mock.calls).toEqual([["input"], ["write"]]);
    expect(loop.stats()).toMatchObject({ frames: 1, overBudget: 0 });
  });

  it("signals/", () => {
    const log = vi.fn();
    const clock = createFakeClock();
    const loop = createFrameLoop({ clock });
    const width = signal(800);
    const columns = computed(() => Math.max(1, Math.floor(width.value / 300)));
    effect(() => log("columns", columns.value), { schedule: loop.scheduler("write") });
    clock.frame();
    width.value = 850;
    clock.frame();
    width.value = 1300;
    clock.frame();
    expect(log.mock.calls).toEqual([
      ["columns", 2],
      ["columns", 4],
    ]);
  });

  it("values/", () => {
    const log = vi.fn();
    const clock = createFakeClock();
    const loop = createFrameLoop({ clock });
    const rect = springValue(loop, { x: 0, y: 0, width: 200, height: 100 }, { dampingRatio: 0.7 });
    rect.onSettle((r) => log("settled at", r));
    rect.set({ x: 300, y: 40, width: 240, height: 100 });
    clock.runUntilIdle();
    expect(log).toHaveBeenCalledWith("settled at", { x: 300, y: 40, width: 240, height: 100 });
  });

  it("values/ window motion", () => {
    const clock = createFakeClock();
    const loop = createFrameLoop({ clock });
    const win = settleValue(loop, { x: 0, y: 0, width: 400, height: 300 });
    win.set({ x: 400, y: 0, width: 200, height: 300 });
    clock.frame();
    win.set({ x: 300, y: 0, width: 300, height: 300 });
    const seen: number[] = [];
    while (loop.active) {
      clock.frame();
      seen.push(win.value.x);
    }
    expect(win.value).toEqual({ x: 300, y: 0, width: 300, height: 300 });
    expect(Math.max(...seen)).toBeLessThanOrEqual(300);
  });

  it("gestures/", () => {
    const log = vi.fn();
    const clock = createFakeClock();
    const recognizer = createRecognizer({ toCanvas: (p) => p, timers: clock }, (g) => log(g.type));
    const finger = { pointerId: 1, pointerType: "touch", button: 0, screen: { x: 0, y: 0 } } as const;
    recognizer.feed({ ...finger, type: "pointerdown", buttons: 1, time: clock.now() });
    clock.tick(500);
    recognizer.feed({ ...finger, type: "pointerup", buttons: 0, time: clock.now() });
    expect(log.mock.calls).toEqual([["press"], ["longPress"], ["release"]]);
  });
});
