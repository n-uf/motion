import { describe, expect, it } from "vitest";
import { createFakeClock } from "../src/clock";
import {
  createTouchPress,
  TOUCH_PRESS_DEFAULTS,
  TOUCH_PRESS_IDLE,
  touchPressDeadline,
  touchPressReducer,
  type TouchPressConfig,
  type TouchPressInput,
  type TouchPressState,
} from "../src/gestures";

describe("touch press: a drag or a scroll", () => {
  const run = (events: readonly TouchPressInput[], config: TouchPressConfig = TOUCH_PRESS_DEFAULTS): TouchPressState =>
    events.reduce<TouchPressState>((s, e) => touchPressReducer(s, e, config), TOUCH_PRESS_IDLE);
  const press = { type: "press", t: 0, point: { x: 100, y: 100 } } as const;
  const move = (x: number, y: number): TouchPressInput => ({ type: "move", point: { x, y } });

  it("finger jitter below the lift distance stays pressed", () => {
    expect(run([press, move(103, 102), move(98, 104)]).phase).toBe("pressed");
  });

  it("travel mostly along the scroll direction is a scroll, and it never lifts after that", () => {
    const s = run([press, move(102, 110)]);
    expect(s).toEqual({ phase: "scrolled", from: { x: 100, y: 100 } });
    expect(run([press, move(102, 110), move(200, 110), { type: "tick", t: 5000 }]).phase).toBe("scrolled");
    // Upwards too.
    expect(run([press, move(100, 88)]).phase).toBe("scrolled");
  });

  it("travel past the lift distance that is not a scroll lifts, where the finger is", () => {
    expect(run([press, move(108, 101)])).toEqual({ phase: "lifted", from: { x: 100, y: 100 }, at: { x: 108, y: 101 } });
    // Mostly along the scroll direction but short of the escape: a lift, not a scroll.
    expect(run([press, move(104, 108)]).phase).toBe("lifted");
    // Along the scroll direction past the escape, but more across it: a lift.
    expect(run([press, move(113, 112)]).phase).toBe("lifted");
  });

  it("a page that scrolls on x escapes on x and lifts on y", () => {
    const x: TouchPressConfig = { ...TOUCH_PRESS_DEFAULTS, scroll: "x" };
    expect(run([press, move(111, 101)], x).phase).toBe("scrolled");
    expect(run([press, move(101, 111)], x).phase).toBe("lifted");
  });

  it("a still finger lifts where it was pressed once the hold has passed; release ends anything", () => {
    expect(run([press, { type: "tick", t: 219 }]).phase).toBe("pressed");
    expect(run([press, move(103, 103), { type: "tick", t: 220 }])).toEqual({ phase: "lifted", from: { x: 100, y: 100 }, at: { x: 100, y: 100 } });
    expect(touchPressDeadline(run([press]))?.at).toBe(220);
    expect(touchPressDeadline(run([press, move(100, 120)]))).toBeNull();
    expect(run([press, move(100, 120), { type: "release" }])).toBe(TOUCH_PRESS_IDLE);
    expect(run([press, move(120, 100), { type: "release" }])).toBe(TOUCH_PRESS_IDLE);
    // A second press while one is going on changes nothing.
    expect(run([press, { type: "press", t: 10, point: { x: 0, y: 0 } }])).toEqual(run([press]));
  });

  it("lifts on its own on a clock after the hold", () => {
    const clock = createFakeClock();
    const touch = createTouchPress({ clock, config: { holdMs: 300 } });
    touch.send({ type: "press", t: clock.now(), point: { x: 5, y: 5 } });
    clock.tick(299);
    expect(touch.state.phase).toBe("pressed");
    clock.tick(1);
    expect(touch.state).toMatchObject({ phase: "lifted", at: { x: 5, y: 5 } });
    expect(clock.pendingTimers).toBe(0);
  });
});
