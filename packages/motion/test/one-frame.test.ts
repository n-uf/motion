/**
 * One frame, end to end on the fake clock:
 * input coalesced → the recogniser turns it into a gesture → state →
 * layout targets → motion values spring toward them → one write per frame.
 */
import { describe, expect, it } from "vitest";
import { createFakeClock, createFrameLoop } from "../src/clock";
import { createFrameCoalescer, createRecognizer, type RawPointerEvent } from "../src/gestures";
import type { Point } from "../src/shapes";
import { batch, computed, effect, signal } from "../src/signals";
import { springValue } from "../src/values";

describe("one frame", () => {
  it("runs input, gesture, layout, motion and write in one frame, and the loop idles after", () => {
    const clock = createFakeClock();
    const loop = createFrameLoop({ clock, frameMs: 16 });

    // State: where the dragged window sits, and the drag in flight.
    const windowAt = signal<Point>({ x: 100, y: 100 });
    const offset = signal<Point>({ x: 0, y: 0 });
    // Gesture: the recogniser turns pointer events into drags.
    const recognizer = createRecognizer({ toCanvas: (p) => p, timers: clock }, (g) => {
      if (g.type === "dragStart" || g.type === "move") {
        offset.value = { x: g.pointer.screen.x - g.origin.screen.x, y: g.pointer.screen.y - g.origin.screen.y };
      } else if (g.type === "release") {
        batch(() => {
          windowAt.value = target.peek();
          offset.value = { x: 0, y: 0 };
        });
      }
    });
    // Layout: the window's target follows the drag, snapped to a 50 px grid.
    const target = computed<Point>(() => ({
      x: Math.round((windowAt.value.x + offset.value.x) / 50) * 50,
      y: Math.round((windowAt.value.y + offset.value.y) / 50) * 50,
    }));
    // Motion: the drawn position springs toward the target.
    const drawn = springValue(loop, { x: 100, y: 100 });
    drawn.follow(() => target.value);
    // Write: one write per frame while it moves.
    const writes: Point[] = [];
    effect(
      () => {
        writes.push(drawn.value);
      },
      { schedule: loop.scheduler("write") },
    );
    // Input: moves coalesce to one per frame, delivered in the input phase.
    const moves = createFrameCoalescer((e: RawPointerEvent) => recognizer.feed(e), loop.frames("input"));
    const event = (type: RawPointerEvent["type"], x: number): RawPointerEvent => ({
      type,
      pointerId: 1,
      pointerType: "mouse",
      button: type === "pointermove" ? -1 : 0,
      buttons: type === "pointerup" ? 0 : 1,
      screen: { x, y: 0 },
      time: clock.now(),
    });

    clock.frame();
    writes.length = 0;
    recognizer.feed(event("pointerdown", 0));
    for (let x = 1; x <= 60; x++) moves.schedule(event("pointermove", x));

    clock.frame();
    // One frame: the 60 moves arrived as one, the drag started, the target
    // moved to the next grid line, and the window began to move toward it.
    expect(offset.peek()).toEqual({ x: 60, y: 0 });
    expect(target.peek()).toEqual({ x: 150, y: 100 });
    expect(writes).toHaveLength(1);
    expect(writes[0]!.x).toBeGreaterThan(100);
    expect(writes[0]!.x).toBeLessThan(150);

    moves.flush();
    recognizer.feed(event("pointerup", 60));
    expect(windowAt.peek()).toEqual({ x: 150, y: 100 });
    clock.runUntilIdle();
    expect(drawn.value).toEqual({ x: 150, y: 100 });
    expect(writes.at(-1)).toEqual({ x: 150, y: 100 });
    expect(loop.active).toBe(false);
    expect(clock.pendingFrames).toBe(0);
  });
});
