/** The README's per-folder examples, run as written (console output checked). */
import { describe, expect, it, vi } from "vitest";
import {
  computed,
  createFakeClock,
  createFrameLoop,
  createPagedSwipe,
  createRecognizer,
  NO_MODIFIERS,
  effect,
  settleValue,
  signal,
  springValue,
} from "../index";
import { createDragIntent, type DragTarget } from "../src/drag";
import { createLayoutMotion, holdItem } from "../src/layout";

describe("README examples", () => {
  it("drag/", () => {
    const log = vi.fn();
    const slot: DragTarget = { id: "slot", priority: 2, hit: { x: 0, y: 0, width: 200, height: 100 } };
    const intent = createDragIntent({ home: { x: 300, y: 300, width: 100, height: 50 } });
    for (let t = 0; t <= 300; t += 16) intent.update({ x: 100, y: 50 }, t, [slot]);
    log(intent.state.shown?.id);
    log(intent.release({ x: 100, y: 50 }, [slot])?.id);
    expect(log.mock.calls).toEqual([["slot"], ["slot"]]);
  });

  it("drag/ placeOf with a null place", () => {
    const pane: DragTarget = { id: "pane", priority: 2, hit: { x: 0, y: 0, width: 200, height: 100 } };
    const zones = createDragIntent<DragTarget>({
      home: { x: 300, y: 300, width: 100, height: 50 },
      placeOf: (_t, p, previous) => (p.x >= (previous === "right" ? 94 : 100) ? "right" : null),
    });
    for (let t = 0; t <= 300; t += 16) zones.update({ x: 50, y: 50 }, t, [pane]);
    expect([zones.state.shown, zones.release({ x: 50, y: 50 }, [pane])]).toEqual([null, null]);
    // Its right half shows, and holds 3 px back past the line.
    for (let t = 316; t <= 600; t += 16) zones.update({ x: 150, y: 50 }, t, [pane]);
    expect(zones.state.shown?.id).toBe("pane");
    zones.update({ x: 97, y: 50 }, 616, [pane]);
    expect(zones.state.shown?.id).toBe("pane");
  });

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

  it("layout/", () => {
    const clock = createFakeClock();
    const loop = createFrameLoop({ clock });
    const motion = createLayoutMotion({ loop });
    const panel = motion.add("panel", { layOut: () => {}, draw: () => {} }, { x: 0, y: 0, width: 200, height: 100 });
    panel.moveTo({ x: 300, y: 0, width: 240, height: 100 });
    clock.runUntilIdle();
    const held = holdItem(panel, { x: 20, y: 10 });
    held.move({ x: 120, y: 60 });
    expect(panel.drawn).toEqual({ x: 100, y: 50, width: 240, height: 100 });
    const release = held.land({ x: 0, y: 0, width: 200, height: 100 });
    expect(release).toEqual({ x: 100, y: 50, width: 240, height: 100 });
    clock.runUntilIdle();
    expect(panel.drawn).toEqual({ x: 0, y: 0, width: 200, height: 100 });
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

  it("layout/ batched", () => {
    const clock = createFakeClock();
    const loop = createFrameLoop({ clock });
    const batches: string[][] = [];
    const host = createLayoutMotion({ loop, onDraw: (batch) => batches.push(batch.map((e) => e.id)) });
    const noop = { layOut: () => {}, draw: () => {} };
    const a = host.add("a", noop, { x: 0, y: 0, width: 100, height: 100 });
    host.add("b", noop, { x: 0, y: 200, width: 100, height: 100 });
    host.flush();
    expect(batches).toEqual([["a", "b"]]);
    a.moveTo({ x: 300, y: 0, width: 100, height: 100 });
    host.flush();
    expect(batches[1]).toEqual(["a"]);
    clock.runUntilIdle();
    expect(batches.length).toBeGreaterThan(3);
    expect(batches.slice(2).every((b) => b.length === 1 && b[0] === "a")).toBe(true);
    host.retain(["a"]);
    expect(host.items.size).toBe(1);
  });

  it("gestures/ paged swipe", () => {
    const clock = createFakeClock();
    const swipe = createPagedSwipe({ clock });
    swipe.send({ type: "context", hasPrev: true, hasNext: true, size: 1000 });
    swipe.send({ type: "wheel", dx: 400, dy: 0, t: clock.now(), modifiers: NO_MODIFIERS });
    expect([swipe.state.phase, swipe.state.progress]).toEqual(["tracking", 0.4]);
    clock.tick(120);
    expect([swipe.state.phase, swipe.state.target]).toEqual(["settling", "next"]);
    swipe.send({ type: "settled" });
    expect(swipe.state.phase).toBe("lockout");
  });
});
