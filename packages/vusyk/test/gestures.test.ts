import { describe, expect, it, vi } from "vitest";
import { createFakeClock, createFrameLoop } from "../src/clock";
import {
  classifyPress,
  createDragMachine,
  createDwellMachine,
  createFrameCoalescer,
  createMachine,
  createPressMachine,
  DRAG_DEFAULTS,
  DRAG_IDLE,
  dragDeadline,
  dragOffset,
  dragReducer,
  DWELL_IDLE,
  dwellDeadline,
  dwellReducer,
  hasCrossedThreshold,
  PRESS_IDLE,
  pressDeadline,
  pressReducer,
  resolveTouchMove,
  type DragInput,
  type DragState,
  type DwellState,
  type PressInput,
  type PressState,
} from "../src/gestures";
import { effect } from "../src/signals";

const at = (x: number, y = 0) => ({ x, y });

describe("frame coalescer", () => {
  it("delivers one sample per frame, the latest, with how many it folded", () => {
    const clock = createFakeClock();
    const onFrame = vi.fn();
    const coalescer = createFrameCoalescer(onFrame, clock);
    for (let i = 1; i <= 10; i++) coalescer.schedule(at(i));
    expect(coalescer.pending).toBe(true);
    expect(clock.pendingFrames).toBe(1);
    clock.frame();
    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(onFrame).toHaveBeenCalledWith(at(10), 10);
    expect(coalescer.pending).toBe(false);
    clock.frame();
    expect(onFrame).toHaveBeenCalledTimes(1);
    coalescer.schedule(at(11));
    clock.frame();
    expect(onFrame).toHaveBeenLastCalledWith(at(11), 1);
  });

  it("folds with merge when given (wheel deltas add up)", () => {
    const clock = createFakeClock();
    const onFrame = vi.fn();
    const coalescer = createFrameCoalescer<{ dy: number }>(onFrame, clock, {
      merge: (pending, next) => ({ dy: pending.dy + next.dy }),
    });
    coalescer.schedule({ dy: 3 });
    coalescer.schedule({ dy: -1 });
    coalescer.schedule({ dy: 5 });
    clock.frame();
    expect(onFrame).toHaveBeenCalledWith({ dy: 7 }, 3);
  });

  it("flush delivers now and drops the requested frame", () => {
    const clock = createFakeClock();
    const onFrame = vi.fn();
    const coalescer = createFrameCoalescer(onFrame, clock);
    expect(coalescer.flush()).toBe(false);
    coalescer.schedule(at(1));
    coalescer.schedule(at(2));
    expect(coalescer.flush()).toBe(true);
    expect(onFrame).toHaveBeenCalledWith(at(2), 2);
    expect(clock.pendingFrames).toBe(0);
    clock.frame();
    expect(onFrame).toHaveBeenCalledTimes(1);
  });

  it("cancel drops the sample: nothing is delivered after it", () => {
    const clock = createFakeClock();
    const onFrame = vi.fn();
    const coalescer = createFrameCoalescer(onFrame, clock);
    coalescer.schedule(at(1));
    coalescer.cancel();
    expect(coalescer.pending).toBe(false);
    expect(clock.pendingFrames).toBe(0);
    clock.frames(2);
    expect(onFrame).not.toHaveBeenCalled();
  });

  it("can deliver in a frame loop's input phase, before update", () => {
    const clock = createFakeClock();
    const loop = createFrameLoop({ clock });
    const log: string[] = [];
    const coalescer = createFrameCoalescer((p: { x: number; y: number }) => log.push(`input ${p.x}`), loop.frames("input"));
    loop.schedule("update", () => log.push("update"));
    coalescer.schedule(at(1));
    coalescer.schedule(at(2));
    clock.frame();
    expect(log).toEqual(["input 2", "update"]);
  });
});

describe("drag machine: geometry helpers", () => {
  it("measures travel against the threshold", () => {
    expect(hasCrossedThreshold(at(0), at(3, 4), 5)).toBe(true);
    expect(hasCrossedThreshold(at(0), at(3, 3), 5)).toBe(false);
  });

  it("classifies a touch move: jitter, drag, or a scroll handed to the page", () => {
    expect(resolveTouchMove(at(0), at(2, 2))).toBe("hold");
    expect(resolveTouchMove(at(0), at(8, 1))).toBe("pickup");
    expect(resolveTouchMove(at(0), at(1, 12))).toBe("scroll-escape");
    expect(resolveTouchMove(at(0), at(12, 1), { ...DRAG_DEFAULTS, scrollAxis: "horizontal" })).toBe("scroll-escape");
    expect(resolveTouchMove(at(0), at(1, 12), { ...DRAG_DEFAULTS, scrollAxis: "none" })).toBe("pickup");
  });
});

describe("drag machine: transitions", () => {
  type S = DragState<string>;
  type E = DragInput<string>;
  const reduce = (state: S, event: E): S => dragReducer(state, event);
  const down = (t = 0, pointer: "mouse" | "touch" = "mouse", pointerId = 1): E => ({
    type: "down",
    t,
    pointerId,
    pointer,
    point: at(0),
    data: "pane-a",
  });
  const move = (t: number, x: number, y = 0, pointerId = 1): E => ({ type: "move", t, pointerId, point: at(x, y) });
  const armedMouse = reduce(DRAG_IDLE, down());
  const dragging = reduce(armedMouse, move(16, 10));

  it("idle: down arms; rearm starts dragging; anything else is ignored", () => {
    expect(armedMouse).toEqual({
      phase: "armed",
      pointerId: 1,
      pointer: "mouse",
      data: "pane-a",
      origin: at(0),
      point: at(0),
      downAt: 0,
    });
    const rearmed = reduce(DRAG_IDLE, { type: "rearm", t: 5, pointerId: 2, pointer: "touch", point: at(7, 7), data: "b" });
    expect(rearmed).toMatchObject({ phase: "dragging", via: "rearm", pointerId: 2, origin: at(7, 7), startedAt: 5 });
    for (const event of [move(1, 50), { type: "up", t: 1, pointerId: 1 }, { type: "cancel", t: 1, reason: "blur" }, { type: "long-press", t: 1, pointerId: 1 }, { type: "settled", t: 1 }] as E[]) {
      expect(reduce(DRAG_IDLE, event)).toBe(DRAG_IDLE);
    }
  });

  it("armed (mouse): stays armed below the threshold, drags past it", () => {
    const jitter = reduce(armedMouse, move(5, 3, 3));
    expect(jitter).toMatchObject({ phase: "armed", point: at(3, 3) });
    expect(dragging).toMatchObject({ phase: "dragging", via: "threshold", point: at(10), startedAt: 16, lastAt: 16, velocity: at(0) });
  });

  it("armed: up is a click and cancel is nothing (both back to idle); a mouse ignores long-press", () => {
    expect(reduce(armedMouse, { type: "up", t: 50, pointerId: 1 })).toBe(DRAG_IDLE);
    expect(reduce(armedMouse, { type: "cancel", t: 50, reason: "escape" })).toBe(DRAG_IDLE);
    expect(reduce(armedMouse, { type: "long-press", t: 220, pointerId: 1 })).toBe(armedMouse);
    expect(reduce(armedMouse, { type: "settled", t: 1 })).toBe(armedMouse);
  });

  it("armed: a second down of the same pointer re-arms; another pointer is ignored", () => {
    const again = reduce(armedMouse, { ...down(40), point: at(5, 5) } as E);
    expect(again).toMatchObject({ phase: "armed", origin: at(5, 5), downAt: 40 });
    expect(reduce(armedMouse, down(40, "mouse", 2))).toBe(armedMouse);
    expect(reduce(armedMouse, move(40, 100, 0, 2))).toBe(armedMouse);
  });

  it("armed (touch): jitter holds, scroll-axis travel escapes, other travel or a long-press drags", () => {
    const armedTouch = reduce(DRAG_IDLE, down(0, "touch"));
    expect(reduce(armedTouch, move(10, 2, 3))).toMatchObject({ phase: "armed", point: at(2, 3) });
    expect(reduce(armedTouch, move(10, 1, 15))).toBe(DRAG_IDLE);
    expect(reduce(armedTouch, move(10, 9, 2))).toMatchObject({ phase: "dragging", via: "threshold" });
    const held = reduce(reduce(armedTouch, move(100, 2, 2)), { type: "long-press", t: 220, pointerId: 1 });
    expect(held).toMatchObject({ phase: "dragging", via: "long-press", point: at(2, 2), startedAt: 220 });
  });

  it("dragging: moves track the point and a smoothed velocity", () => {
    let state = dragging;
    for (let i = 1; i <= 10; i++) state = reduce(state, move(16 + i * 16, 10 + i * 16));
    // 16 px every 16 ms is 1000 px/s; with a 40 ms time constant, ten moves
    // get within 1 - e^(-160/40) of it.
    expect(state.phase).toBe("dragging");
    if (state.phase !== "dragging") return;
    expect(state.velocity.x).toBeCloseTo(1000 * (1 - Math.exp(-4)), 6);
    expect(state.velocity.x).toBeLessThanOrEqual(1000);
    expect(state.velocity.y).toBe(0);
    expect(dragOffset(state)).toEqual(at(170));
    expect(reduce(state, move(500, 0, 0)).phase).toBe("dragging");
  });

  it("dragging: up commits by default, carrying the release velocity", () => {
    const moving = reduce(dragging, move(32, 26));
    const released = reduce(moving, { type: "up", t: 40, pointerId: 1 });
    expect(released).toMatchObject({ phase: "settling", outcome: "commit", reason: null, data: "pane-a", point: at(26), endedAt: 40 });
    if (released.phase !== "settling") return;
    expect(released.velocity.x).toBeGreaterThan(0);
  });

  it("dragging: a still release has no velocity; the release point wins over the last move", () => {
    const moving = reduce(dragging, move(32, 26));
    const still = reduce(moving, { type: "up", t: 32 + DRAG_DEFAULTS.stillMs + 1, pointerId: 1, point: at(30) });
    expect(still).toMatchObject({ phase: "settling", point: at(30), velocity: at(0) });
  });

  it("dragging: claimed and non-committable releases, and cancels with their reason", () => {
    expect(reduce(dragging, { type: "up", t: 20, pointerId: 1, claimed: true })).toMatchObject({ outcome: "claimed" });
    expect(reduce(dragging, { type: "up", t: 20, pointerId: 1, commit: false })).toMatchObject({ outcome: "cancel", reason: null });
    for (const reason of ["pointer-cancel", "escape", "blur", "hidden", "lost-capture"] as const) {
      expect(reduce(dragging, { type: "cancel", t: 20, reason })).toMatchObject({ phase: "settling", outcome: "cancel", reason });
    }
  });

  it("dragging: another pointer, a long-press or a down can't touch it", () => {
    expect(reduce(dragging, { type: "up", t: 20, pointerId: 9 })).toBe(dragging);
    expect(reduce(dragging, move(20, 99, 0, 9))).toBe(dragging);
    expect(reduce(dragging, { type: "cancel", t: 20, pointerId: 9, reason: "blur" })).toBe(dragging);
    expect(reduce(dragging, { type: "long-press", t: 220, pointerId: 1 })).toBe(dragging);
    expect(reduce(dragging, down(20))).toBe(dragging);
    expect(reduce(dragging, { type: "settled", t: 20 })).toBe(dragging);
  });

  it("settling: settled returns to idle, a new down cuts it short, the rest waits", () => {
    const settling = reduce(dragging, { type: "up", t: 20, pointerId: 1 });
    expect(reduce(settling, { type: "settled", t: 200 })).toBe(DRAG_IDLE);
    expect(reduce(settling, down(100, "mouse", 3))).toMatchObject({ phase: "armed", pointerId: 3, downAt: 100 });
    expect(reduce(settling, move(30, 5))).toBe(settling);
    expect(reduce(settling, { type: "up", t: 30, pointerId: 1 })).toBe(settling);
  });

  it("asks for a long-press timer while a touch is armed, and a watchdog while dragging when set", () => {
    expect(dragDeadline(armedMouse)).toBeNull();
    const armedTouch = reduce(DRAG_IDLE, down(100, "touch"));
    const deadline = dragDeadline(armedTouch);
    expect(deadline?.at).toBe(320);
    expect(deadline?.event(320)).toEqual({ type: "long-press", t: 320, pointerId: 1 });
    expect(dragDeadline(dragging)).toBeNull();
    const watchdog = dragDeadline(dragging, { ...DRAG_DEFAULTS, idleTimeoutMs: 1000 });
    expect(watchdog?.at).toBe(1016);
    expect(watchdog?.event(1016)).toEqual({ type: "cancel", t: 1016, pointerId: 1, reason: "watchdog" });
  });
});

describe("drag machine on a clock", () => {
  it("a held touch becomes a drag when the long-press timer fires", () => {
    const clock = createFakeClock();
    const drag = createDragMachine<string>({ clock });
    drag.send({ type: "down", t: clock.now(), pointerId: 1, pointer: "touch", point: at(0), data: "x" });
    expect(clock.pendingTimers).toBe(1);
    clock.tick(219);
    expect(drag.state.phase).toBe("armed");
    clock.tick(1);
    expect(drag.state).toMatchObject({ phase: "dragging", via: "long-press", startedAt: 220 });
    expect(clock.pendingTimers).toBe(0);
  });

  it("a tap clears the long-press timer", () => {
    const clock = createFakeClock();
    const drag = createDragMachine({ clock });
    drag.send({ type: "down", t: 0, pointerId: 1, pointer: "touch", point: at(0), data: null });
    clock.tick(100);
    drag.send({ type: "up", t: clock.now(), pointerId: 1 });
    expect(drag.state).toBe(DRAG_IDLE);
    expect(clock.pendingTimers).toBe(0);
  });

  it("the watchdog cancels a drag that went quiet, and moves keep pushing it back", () => {
    const clock = createFakeClock();
    const drag = createDragMachine({ clock, config: { idleTimeoutMs: 500 } });
    drag.send({ type: "down", t: 0, pointerId: 1, pointer: "mouse", point: at(0), data: null });
    drag.send({ type: "move", t: 0, pointerId: 1, point: at(20) });
    clock.tick(400);
    drag.send({ type: "move", t: clock.now(), pointerId: 1, point: at(40) });
    clock.tick(400);
    expect(drag.state.phase).toBe("dragging");
    clock.tick(100);
    expect(drag.state).toMatchObject({ phase: "settling", outcome: "cancel", reason: "watchdog", endedAt: 900 });
  });
});

describe("press machine", () => {
  const reduce = (state: PressState, event: PressInput): PressState => pressReducer(state, event);
  const pressed = reduce(PRESS_IDLE, { type: "down", t: 0, pointerId: 1, point: at(0) });
  const held = reduce(pressed, { type: "long-press", t: 500, pointerId: 1 });

  it("goes through every transition", () => {
    expect(pressed).toEqual({ phase: "pressed", pointerId: 1, origin: at(0), downAt: 0 });
    expect(reduce(PRESS_IDLE, { type: "up", t: 0, pointerId: 1 })).toBe(PRESS_IDLE);
    expect(reduce(pressed, { type: "move", t: 10, pointerId: 1, point: at(5, 5) })).toBe(pressed);
    expect(reduce(pressed, { type: "move", t: 10, pointerId: 1, point: at(11) })).toBe(PRESS_IDLE);
    expect(held).toEqual({ phase: "held", pointerId: 1, origin: at(0), downAt: 0, heldAt: 500 });
    expect(reduce(pressed, { type: "up", t: 100, pointerId: 1 })).toBe(PRESS_IDLE);
    expect(reduce(pressed, { type: "cancel", t: 100 })).toBe(PRESS_IDLE);
    expect(reduce(held, { type: "move", t: 600, pointerId: 1, point: at(80) })).toBe(held);
    expect(reduce(held, { type: "up", t: 700, pointerId: 1 })).toBe(PRESS_IDLE);
    expect(reduce(held, { type: "cancel", t: 700 })).toBe(PRESS_IDLE);
    expect(reduce(pressed, { type: "down", t: 1, pointerId: 1, point: at(0) })).toBe(pressed);
    expect(reduce(pressed, { type: "up", t: 1, pointerId: 2 })).toBe(pressed);
  });

  it("names what a transition meant", () => {
    const up: PressInput = { type: "up", t: 1, pointerId: 1 };
    expect(classifyPress(pressed, PRESS_IDLE, up)).toBe("tap");
    expect(classifyPress(pressed, held, { type: "long-press", t: 500, pointerId: 1 })).toBe("long-press");
    expect(classifyPress(held, PRESS_IDLE, up)).toBe("release");
    expect(classifyPress(pressed, PRESS_IDLE, { type: "move", t: 1, pointerId: 1, point: at(50) })).toBe("cancel");
    expect(classifyPress(PRESS_IDLE, pressed, { type: "down", t: 0, pointerId: 1, point: at(0) })).toBeNull();
  });

  it("asks for the long-press timer while pressed, and the runner fires it", () => {
    expect(pressDeadline(pressed)?.at).toBe(500);
    expect(pressDeadline(held)).toBeNull();
    const clock = createFakeClock();
    const press = createPressMachine({ clock, config: { longPressMs: 300 } });
    const outcomes: (string | null)[] = [];
    press.subscribe((next, previous, event) => outcomes.push(classifyPress(previous, next, event)));
    press.send({ type: "down", t: 0, pointerId: 1, point: at(0) });
    clock.tick(300);
    press.send({ type: "up", t: clock.now(), pointerId: 1 });
    press.send({ type: "down", t: clock.now(), pointerId: 1, point: at(0) });
    clock.tick(50);
    press.send({ type: "up", t: clock.now(), pointerId: 1 });
    expect(outcomes).toEqual([null, "long-press", "release", null, "tap"]);
    expect(clock.pendingTimers).toBe(0);
  });
});

describe("dwell machine", () => {
  type S = DwellState<string, number>;
  const reduce = (state: S, event: Parameters<typeof dwellReducer<string, number>>[1]): S => dwellReducer(state, event);
  const dwelling = reduce(DWELL_IDLE, { type: "hover", t: 100, key: "tab-2", payload: 7 });

  it("goes through every transition", () => {
    expect(reduce(DWELL_IDLE, { type: "hover", t: 0, key: null })).toBe(DWELL_IDLE);
    expect(dwelling).toEqual({ phase: "dwelling", key: "tab-2", since: 100, payload: 7 });
    expect(reduce(dwelling, { type: "hover", t: 300, key: "tab-2", payload: 9 })).toBe(dwelling);
    expect(reduce(dwelling, { type: "hover", t: 300, key: "tab-3" })).toEqual({ phase: "dwelling", key: "tab-3", since: 300, payload: undefined });
    expect(reduce(dwelling, { type: "hover", t: 300, key: null })).toBe(DWELL_IDLE);
    expect(reduce(dwelling, { type: "tick", t: 599 })).toBe(dwelling);
    const fired = reduce(dwelling, { type: "tick", t: 600 });
    expect(fired).toEqual({ phase: "fired", key: "tab-2", since: 100, firedAt: 600, payload: 7 });
    expect(reduce(fired, { type: "hover", t: 700, key: "tab-9" })).toBe(fired);
    expect(reduce(fired, { type: "hover", t: 700, key: null })).toBe(fired);
    expect(reduce(fired, { type: "tick", t: 2000 })).toBe(fired);
    expect(reduce(fired, { type: "reset" })).toBe(DWELL_IDLE);
    expect(reduce(dwelling, { type: "reset" })).toBe(DWELL_IDLE);
    expect(reduce(DWELL_IDLE, { type: "reset" })).toBe(DWELL_IDLE);
    expect(reduce(DWELL_IDLE, { type: "tick", t: 5000 })).toBe(DWELL_IDLE);
  });

  it("asks for its timer while dwelling", () => {
    expect(dwellDeadline(dwelling)?.at).toBe(600);
    expect(dwellDeadline(DWELL_IDLE)).toBeNull();
  });

  it("fires on its own on a clock, and a new key restarts the wait", () => {
    const clock = createFakeClock();
    const dwell = createDwellMachine<string>({ clock });
    dwell.send({ type: "hover", t: clock.now(), key: "a" });
    clock.tick(300);
    dwell.send({ type: "hover", t: clock.now(), key: "b" });
    clock.tick(300);
    expect(dwell.state.phase).toBe("dwelling");
    clock.tick(200);
    expect(dwell.state).toMatchObject({ phase: "fired", key: "b", firedAt: 800 });
    expect(clock.pendingTimers).toBe(0);
  });
});

describe("machine runner", () => {
  type Count = { readonly n: number };
  type Bump = { readonly type: "bump" } | { readonly type: "noop" };
  const counter = (state: Count, event: Bump): Count => (event.type === "bump" ? { n: state.n + 1 } : state);

  it("tells listeners about changes only, and queues events sent from a listener", () => {
    const clock = createFakeClock();
    const machine = createMachine({ reducer: counter, initial: { n: 0 }, clock });
    const seen: string[] = [];
    machine.subscribe((next, previous, event) => {
      seen.push(`${previous.n}->${next.n} by ${event.type}`);
      if (next.n === 1) {
        machine.send({ type: "bump" });
        seen.push(`sent at ${machine.peek().n}`);
      }
    });
    machine.send({ type: "noop" });
    machine.send({ type: "bump" });
    expect(seen).toEqual(["0->1 by bump", "sent at 1", "1->2 by bump"]);
  });

  it("has a reactive state", () => {
    const clock = createFakeClock();
    const machine = createMachine({ reducer: counter, initial: { n: 0 }, clock });
    const seen: number[] = [];
    effect(() => {
      seen.push(machine.state.n);
    });
    machine.send({ type: "bump" });
    machine.send({ type: "noop" });
    expect(seen).toEqual([0, 1]);
  });

  it("keeps the timer when the deadline stays, and clears it on dispose", () => {
    const clock = createFakeClock();
    const machine = createMachine<Count, Bump>({
      reducer: counter,
      initial: { n: 0 },
      clock,
      deadline: (state) => (state.n < 3 ? { at: 1000, event: () => ({ type: "bump" }) } : null),
    });
    expect(clock.pendingTimers).toBe(1);
    machine.send({ type: "bump" });
    expect(clock.pendingTimers).toBe(1);
    machine.dispose();
    expect(clock.pendingTimers).toBe(0);
    machine.send({ type: "bump" });
    expect(machine.peek().n).toBe(1);
  });
});
