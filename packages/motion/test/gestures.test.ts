import { describe, expect, it, vi } from "vitest";
import { createFakeClock, createFrameLoop } from "../src/clock";
import {
  createDwellMachine,
  createFrameCoalescer,
  createMachine,
  createRecognizer,
  DWELL_IDLE,
  dwellDeadline,
  dwellReducer,
  type DwellState,
  type InputGesture,
  type RawPointerEvent,
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

describe("recognizer on motion's clock", () => {
  const pointer = (
    type: RawPointerEvent["type"],
    x: number,
    time: number,
    pointerType: "mouse" | "touch" = "mouse",
  ): RawPointerEvent => ({
    type,
    pointerId: 1,
    pointerType,
    button: type === "pointermove" ? -1 : 0,
    buttons: type === "pointerup" ? 0 : 1,
    screen: at(x),
    time,
  });

  it("takes a clock as its timers: the long press fires on the clock", () => {
    const clock = createFakeClock();
    const out: InputGesture["type"][] = [];
    createRecognizer({ toCanvas: (p) => p, timers: clock }, (g) => out.push(g.type)).feed(
      pointer("pointerdown", 0, clock.now(), "touch"),
    );
    clock.tick(499);
    expect(out).toEqual(["press"]);
    clock.tick(1);
    expect(out).toEqual(["press", "longPress"]);
    expect(clock.pendingTimers).toBe(0);
  });

  it("gets its moves through a coalescer in the input phase; a flush before the up keeps the last move", () => {
    const clock = createFakeClock();
    const loop = createFrameLoop({ clock });
    const out: InputGesture["type"][] = [];
    const recognizer = createRecognizer({ toCanvas: (p) => p, timers: loop.clock }, (g) => out.push(g.type));
    const moves = createFrameCoalescer((e: RawPointerEvent) => recognizer.feed(e), loop.frames("input"));
    recognizer.feed(pointer("pointerdown", 0, 0));
    for (let i = 1; i <= 10; i++) moves.schedule(pointer("pointermove", i * 3, i));
    clock.frame();
    // Ten moves, one delivery: past the threshold at once.
    expect(out).toEqual(["press", "dragStart"]);
    moves.schedule(pointer("pointermove", 40, 20));
    moves.flush();
    recognizer.feed(pointer("pointerup", 40, 21));
    expect(out).toEqual(["press", "dragStart", "move", "release"]);
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
