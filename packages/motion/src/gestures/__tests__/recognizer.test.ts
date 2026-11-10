import { describe, expect, it } from "vitest";
import type { InputGesture } from "../types";
import { camera, setup } from "./helpers";

type Of<T extends InputGesture["type"]> = Extract<InputGesture, { type: T }>;
const last = <T extends InputGesture["type"]>(out: InputGesture[], type: T): Of<T> => {
  const g = [...out].reverse().find((x) => x.type === type);
  if (!g) throw new Error(`no ${type} in ${out.map((x) => x.type).join(",")}`);
  return g as Of<T>;
};

describe("recognizer: mouse", () => {
  it("a click is press then release, with canvas points through the camera", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 1, 300, 250));
    t.feed(t.ev("pointerup", 1, 300, 250));
    expect(t.types()).toEqual(["press", "release"]);
    const press = last(t.out, "press");
    expect(press.pointer.canvas).toEqual({ x: (300 - camera.offset.x) / 2, y: (250 - camera.offset.y) / 2 });
    expect(press.pointer.kind).toBe("mouse");
    const rel = last(t.out, "release");
    expect(rel).toMatchObject({ click: true, clickCount: 1, dragged: false });
    expect(rel.origin).toBe(press.pointer);
  });

  it("moves inside the threshold stay a click and report nothing", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 1, 0, 0));
    t.feed(t.ev("pointermove", 1, 3, 2)); // √13 ≈ 3.6 ≤ 4
    t.feed(t.ev("pointermove", 1, 4, 0)); // exactly 4: still a click
    t.feed(t.ev("pointerup", 1, 4, 0));
    expect(t.types()).toEqual(["press", "release"]);
    expect(last(t.out, "release").click).toBe(true);
  });

  it("past the threshold: dragStart, then every move, then a non-click release", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 1, 0, 0));
    t.feed(t.ev("pointermove", 1, 5, 0));
    t.feed(t.ev("pointermove", 1, 9, 0));
    t.feed(t.ev("pointermove", 1, 9, 0));
    t.feed(t.ev("pointerup", 1, 9, 0));
    expect(t.types()).toEqual(["press", "dragStart", "move", "move", "release"]);
    expect(last(t.out, "dragStart")).toMatchObject({ modifierDrag: null });
    expect(last(t.out, "release")).toMatchObject({ click: false, clickCount: 0, dragged: true });
  });

  it("counts quick clicks at one spot: double and triple click; slow or far ones start again", () => {
    const t = setup();
    const click = (x: number, y = 0, gap = 0) => {
      t.tick(gap);
      t.feed(t.ev("pointerdown", 1, x, y));
      t.feed(t.ev("pointerup", 1, x, y));
      return last(t.out, "release").clickCount;
    };
    expect(click(10)).toBe(1);
    expect(click(12)).toBe(2);
    expect(click(11)).toBe(3);
    expect(click(40)).toBe(1); // too far
    expect(click(40, 0, 400)).toBe(1); // too slow
    expect(click(40)).toBe(2);
  });

  it("a drag in between resets the click count; another button does not count", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 1, 0, 0));
    t.feed(t.ev("pointerup", 1, 0, 0));
    t.feed(t.ev("pointerdown", 1, 0, 0, { button: 2, buttons: 2 }));
    t.feed(t.ev("pointerup", 1, 0, 0, { button: 2 }));
    expect(last(t.out, "release").clickCount).toBe(1);
    t.feed(t.ev("pointerdown", 1, 0, 0));
    t.feed(t.ev("pointermove", 1, 20, 0));
    t.feed(t.ev("pointerup", 1, 20, 0));
    t.feed(t.ev("pointerdown", 1, 0, 0));
    t.feed(t.ev("pointerup", 1, 0, 0));
    expect(last(t.out, "release").clickCount).toBe(1);
  });

  it("a move with no buttons down while pressed is a missed pointerup: release", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 1, 0, 0));
    t.feed(t.ev("pointermove", 1, 30, 0));
    t.feed(t.ev("pointermove", 1, 40, 0, { buttons: 0 }));
    expect(t.types()).toEqual(["press", "dragStart", "release"]);
    expect(t.rec.active()).toBeNull();
  });

  it("hover: moves with no press and no buttons", () => {
    const t = setup();
    t.feed(t.ev("pointermove", 1, 5, 5, { buttons: 0 }));
    expect(t.types()).toEqual(["hover"]);
  });

  it("one press at a time: a second mouse or pen while one is down is ignored", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 1, 0, 0));
    t.feed(t.ev("pointerdown", 2, 50, 50, { kind: "pen" }));
    t.feed(t.ev("pointermove", 2, 90, 50, { kind: "pen" }));
    t.feed(t.ev("pointerup", 2, 90, 50, { kind: "pen" }));
    t.feed(t.ev("pointerup", 1, 0, 0));
    expect(t.types()).toEqual(["press", "release"]);
  });

  it("capture the content lost (the surface took the pointer) doesn't end the gesture", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 1, 0, 0));
    t.feed(t.ev("pointermove", 1, 30, 0));
    t.feed({ ...t.ev("lostpointercapture", 1, 30, 0), lostBy: "content" });
    t.feed(t.ev("pointermove", 1, 40, 0));
    t.feed(t.ev("pointerup", 1, 40, 0));
    expect(t.types()).toEqual(["press", "dragStart", "move", "release"]);
  });

  it("pointercancel cancels the press, saying whether it was dragging", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 1, 0, 0));
    t.feed(t.ev("pointermove", 1, 30, 0));
    t.feed(t.ev("pointercancel", 1, 30, 0));
    expect(last(t.out, "cancel")).toMatchObject({ reason: "pointercancel", dragged: true });
    t.feed(t.ev("pointerup", 1, 30, 0));
    expect(t.types()).toEqual(["press", "dragStart", "cancel"]);
  });

  it("capture lost before the pointer went up cancels; the one after pointerup is a no-op", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 1, 0, 0));
    t.feed(t.ev("lostpointercapture", 1, 0, 0));
    expect(last(t.out, "cancel")).toMatchObject({ reason: "lostcapture", dragged: false });
    t.take();
    t.feed(t.ev("pointerdown", 1, 0, 0));
    t.feed(t.ev("pointerup", 1, 0, 0));
    t.feed(t.ev("lostpointercapture", 1, 0, 0));
    expect(t.types()).toEqual(["press", "release"]);
  });
});

describe("recognizer: the drag modifier", () => {
  it("left press with it held is a move candidate, confirmed at dragStart", () => {
    const t = setup({ dragModifier: "meta" });
    t.feed(t.ev("pointerdown", 1, 0, 0, { modifiers: { meta: true } }));
    expect(last(t.out, "press").modifierDrag).toBe("move");
    t.feed(t.ev("pointermove", 1, 10, 0, { modifiers: { meta: true } }));
    expect(last(t.out, "dragStart").modifierDrag).toBe("move");
  });

  it("right press with it held is a resize; the middle button never is", () => {
    const t = setup({ dragModifier: "alt" });
    t.feed(t.ev("pointerdown", 1, 0, 0, { button: 2, buttons: 2, modifiers: { alt: true } }));
    expect(last(t.out, "press").modifierDrag).toBe("resize");
    t.feed(t.ev("pointermove", 1, 10, 0, { buttons: 2, modifiers: { alt: true } }));
    expect(last(t.out, "dragStart").modifierDrag).toBe("resize");
    t.feed(t.ev("pointerup", 1, 10, 0, { button: 2 }));
    t.feed(t.ev("pointerdown", 1, 0, 0, { button: 1, buttons: 4, modifiers: { alt: true } }));
    expect(last(t.out, "press").modifierDrag).toBeNull();
  });

  it("modifier+click without travel stays a click for the content (Cmd/Ctrl+click multi-select)", () => {
    const t = setup({ dragModifier: "meta" });
    t.feed(t.ev("pointerdown", 1, 0, 0, { modifiers: { meta: true } }));
    t.feed(t.ev("pointermove", 1, 3, 0, { modifiers: { meta: true } }));
    t.feed(t.ev("pointerup", 1, 3, 0, { modifiers: { meta: true } }));
    expect(t.types()).toEqual(["press", "release"]);
    expect(last(t.out, "release")).toMatchObject({ click: true });
    expect(last(t.out, "release").pointer.modifiers.meta).toBe(true);
  });

  it("let go of the modifier before the threshold: a plain drag", () => {
    const t = setup({ dragModifier: "meta" });
    t.feed(t.ev("pointerdown", 1, 0, 0, { modifiers: { meta: true } }));
    t.feed(t.ev("pointermove", 1, 10, 0));
    expect(last(t.out, "dragStart").modifierDrag).toBeNull();
  });

  it("another modifier, or the drag modifier off (null), gives no candidate", () => {
    const off = setup({ dragModifier: null });
    off.feed(off.ev("pointerdown", 1, 0, 0, { modifiers: { meta: true, alt: true } }));
    expect(last(off.out, "press").modifierDrag).toBeNull();
    const ctrl = setup({ dragModifier: "ctrl" });
    ctrl.feed(ctrl.ev("pointerdown", 1, 0, 0, { modifiers: { meta: true } }));
    expect(last(ctrl.out, "press").modifierDrag).toBeNull();
    ctrl.feed(ctrl.ev("pointerup", 1, 0, 0));
    ctrl.feed(ctrl.ev("pointerdown", 1, 0, 0, { modifiers: { ctrl: true } }));
    expect(last(ctrl.out, "press").modifierDrag).toBe("move");
  });

  it("setDragModifier applies from the next press", () => {
    const t = setup({ dragModifier: "meta" });
    t.rec.setDragModifier("alt");
    t.feed(t.ev("pointerdown", 1, 0, 0, { modifiers: { meta: true } }));
    expect(last(t.out, "press").modifierDrag).toBeNull();
    t.feed(t.ev("pointerup", 1, 0, 0));
    t.feed(t.ev("pointerdown", 1, 0, 0, { modifiers: { alt: true } }));
    expect(last(t.out, "press").modifierDrag).toBe("move");
  });
});

describe("recognizer: macOS Ctrl+click is a secondary click", () => {
  it("on mac a mouse press with Ctrl held is button 2: its click is a secondary click", () => {
    const t = setup({ platform: "mac", dragModifier: "meta" });
    t.feed(t.ev("pointerdown", 1, 40, 40, { modifiers: { ctrl: true } }));
    expect(last(t.out, "press").pointer.button).toBe(2);
    t.feed(t.ev("pointerup", 1, 40, 40));
    expect(last(t.out, "release")).toMatchObject({ click: true });
    expect(last(t.out, "release").origin.button).toBe(2);
  });

  it("on mac Cmd+Ctrl+drag resizes, as Cmd+right-drag does", () => {
    const t = setup({ platform: "mac", dragModifier: "meta" });
    t.feed(t.ev("pointerdown", 1, 0, 0, { modifiers: { ctrl: true, meta: true } }));
    expect(last(t.out, "press").modifierDrag).toBe("resize");
  });

  it("not when Ctrl is the drag modifier: Ctrl+drag moves the window", () => {
    const t = setup({ platform: "mac", dragModifier: "ctrl" });
    t.feed(t.ev("pointerdown", 1, 0, 0, { modifiers: { ctrl: true } }));
    expect(last(t.out, "press").pointer.button).toBe(0);
    expect(last(t.out, "press").modifierDrag).toBe("move");
  });

  it("not elsewhere, nor for a pen or a finger, nor for another button", () => {
    const other = setup({ platform: "other", dragModifier: "alt" });
    other.feed(other.ev("pointerdown", 1, 0, 0, { modifiers: { ctrl: true } }));
    expect(last(other.out, "press").pointer.button).toBe(0);
    const unset = setup({ dragModifier: "alt" });
    unset.feed(unset.ev("pointerdown", 1, 0, 0, { modifiers: { ctrl: true } }));
    expect(last(unset.out, "press").pointer.button).toBe(0);
    const pen = setup({ platform: "mac" });
    pen.feed(pen.ev("pointerdown", 1, 0, 0, { kind: "pen", modifiers: { ctrl: true } }));
    expect(last(pen.out, "press").pointer.button).toBe(0);
    const finger = setup({ platform: "mac" });
    finger.feed(finger.ev("pointerdown", 1, 0, 0, { kind: "touch", modifiers: { ctrl: true } }));
    expect(last(finger.out, "press").pointer.button).toBe(0);
    const middle = setup({ platform: "mac" });
    middle.feed(middle.ev("pointerdown", 1, 0, 0, { button: 1, buttons: 4, modifiers: { ctrl: true } }));
    expect(last(middle.out, "press").pointer.button).toBe(1);
  });
});

describe("recognizer: pen", () => {
  it("drags past its own threshold and carries pressure", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 7, 0, 0, { kind: "pen", pressure: 0.3 }));
    t.feed(t.ev("pointermove", 7, 6, 0, { kind: "pen", pressure: 0.4 }));
    expect(t.types()).toEqual(["press"]);
    t.feed(t.ev("pointermove", 7, 7, 0, { kind: "pen", pressure: 0.6 }));
    expect(t.types()).toEqual(["press", "dragStart"]);
    expect(last(t.out, "press").pointer).toMatchObject({ kind: "pen", pressure: 0.3 });
    expect(last(t.out, "dragStart").pointer.pressure).toBe(0.6);
  });

  it("holding still fires one long press, and the release is then not a click", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 7, 0, 0, { kind: "pen" }));
    t.timers.advance(499);
    expect(t.types()).toEqual(["press"]);
    t.timers.advance(1);
    t.timers.advance(1000);
    expect(t.types()).toEqual(["press", "longPress"]);
    t.feed(t.ev("pointerup", 7, 0, 0, { kind: "pen" }));
    expect(last(t.out, "release")).toMatchObject({ click: false, clickCount: 0, dragged: false });
  });

  it("travel before the delay drops the long press", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 7, 0, 0, { kind: "pen" }));
    t.feed(t.ev("pointermove", 7, 20, 0, { kind: "pen" }));
    t.timers.advance(600);
    expect(t.types()).toEqual(["press", "dragStart"]);
    expect(t.timers.pending()).toBe(0);
  });

  it("the barrel button with the drag modifier resizes; pen hover reports hover", () => {
    const t = setup({ dragModifier: "alt" });
    t.feed(t.ev("pointermove", 7, 1, 1, { kind: "pen", buttons: 0 }));
    t.feed(t.ev("pointerdown", 7, 0, 0, { kind: "pen", button: 2, buttons: 2, modifiers: { alt: true } }));
    expect(t.types()).toEqual(["hover", "press"]);
    expect(last(t.out, "press").modifierDrag).toBe("resize");
  });

  it("a cancelled pen press clears its long-press timer", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 7, 0, 0, { kind: "pen" }));
    t.feed(t.ev("pointercancel", 7, 0, 0, { kind: "pen" }));
    expect(t.timers.pending()).toBe(0);
    t.timers.advance(600);
    expect(t.types()).toEqual(["press", "cancel"]);
  });
});

describe("recognizer: touch", () => {
  it("a tap is press and release; the touch threshold is wider", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 11, 0, 0, { kind: "touch" }));
    t.feed(t.ev("pointermove", 11, 7, 0, { kind: "touch" }));
    t.feed(t.ev("pointerup", 11, 7, 0, { kind: "touch" }));
    expect(t.types()).toEqual(["press", "release"]);
    expect(last(t.out, "release").click).toBe(true);
  });

  it("long press, then a drag", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 11, 0, 0, { kind: "touch" }));
    t.timers.advance(500);
    t.feed(t.ev("pointermove", 11, 30, 0, { kind: "touch" }));
    t.feed(t.ev("pointerup", 11, 30, 0, { kind: "touch" }));
    expect(t.types()).toEqual(["press", "longPress", "dragStart", "release"]);
    expect(last(t.out, "release")).toMatchObject({ click: false, dragged: true });
  });

  it("the mouse gets no long press by default", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 1, 0, 0));
    t.timers.advance(2000);
    expect(t.types()).toEqual(["press"]);
  });

  it("without timers there is no long press", () => {
    const t = setup({ timers: undefined });
    t.feed(t.ev("pointerdown", 11, 0, 0, { kind: "touch" }));
    t.feed(t.ev("pointerup", 11, 0, 0, { kind: "touch" }));
    expect(t.types()).toEqual(["press", "release"]);
  });

  it("a second finger cancels the press and pinches: scales multiply to the total", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 11, 100, 100, { kind: "touch" }));
    t.feed(t.ev("pointerdown", 12, 200, 100, { kind: "touch" }));
    expect(t.types()).toEqual(["press", "cancel"]);
    expect(last(t.out, "cancel").reason).toBe("multitouch");
    t.feed(t.ev("pointermove", 12, 203, 100, { kind: "touch" })); // 3 %
    t.feed(t.ev("pointermove", 11, 101, 100, { kind: "touch" })); // both moved: 2 % is no pinch yet
    expect(t.types()).toEqual(["press", "cancel"]);
    t.feed(t.ev("pointermove", 12, 210, 100, { kind: "touch" })); // 110 / 100: 11 hasn't moved since
    t.feed(t.ev("pointermove", 11, 90, 100, { kind: "touch" })); // 120 / 100: start
    t.feed(t.ev("pointermove", 12, 230, 100, { kind: "touch" })); // 140 / 120
    const pinches = t.out.filter((g): g is Of<"pinch"> => g.type === "pinch");
    expect(pinches.map((p) => p.phase)).toEqual(["start", "update"]);
    expect(pinches[0]).toMatchObject({ kind: "pinch", source: "touch" });
    const total = pinches.reduce((s, p) => s * p.scale, 1);
    expect(total).toBeCloseTo(1.4, 10);
    expect(pinches[1]!.center.screen).toEqual({ x: 160, y: 100 });
    expect(pinches[1]!.center.canvas).toEqual({ x: 30, y: 25 });
    // The centre moved from 150 to 160 in all: pan deltas add up.
    expect(pinches.reduce((s, p) => s + p.pan.x, 0)).toBeCloseTo(10, 10);
  });

  it("two fingers moving together pan (scale stays 1)", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 11, 100, 100, { kind: "touch" }));
    t.feed(t.ev("pointerdown", 12, 200, 100, { kind: "touch" }));
    t.feed(t.ev("pointermove", 11, 100, 115, { kind: "touch" }));
    t.feed(t.ev("pointermove", 12, 200, 115, { kind: "touch" }));
    t.feed(t.ev("pointermove", 11, 101, 130, { kind: "touch" }));
    const pinches = t.out.filter((g): g is Of<"pinch"> => g.type === "pinch");
    // Recognised once the centre travelled past 10 px (the second move); the third updates.
    expect(pinches.map((p) => [p.phase, p.kind, p.scale])).toEqual([
      ["start", "pan", 1],
      ["update", "pan", 1],
    ]);
    expect(pinches.reduce((s, p) => s + p.pan.y, 0)).toBeCloseTo(22.5, 10);
  });

  it("lifting a finger ends the pinch; the other finger starts nothing until all are up", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 11, 100, 100, { kind: "touch" }));
    t.feed(t.ev("pointerdown", 12, 200, 100, { kind: "touch" }));
    t.feed(t.ev("pointermove", 12, 260, 100, { kind: "touch" }));
    t.feed(t.ev("pointerup", 12, 260, 100, { kind: "touch" }));
    expect(t.types().slice(-2)).toEqual(["pinch:start", "pinch:end"]);
    t.take();
    t.feed(t.ev("pointermove", 11, 160, 100, { kind: "touch" }));
    t.feed(t.ev("pointerdown", 13, 10, 10, { kind: "touch" }));
    t.feed(t.ev("pointerup", 13, 10, 10, { kind: "touch" }));
    t.feed(t.ev("pointerup", 11, 160, 100, { kind: "touch" }));
    expect(t.types()).toEqual([]);
    t.feed(t.ev("pointerdown", 14, 10, 10, { kind: "touch" }));
    expect(t.types()).toEqual(["press"]);
  });

  it("two fingers that hardly move make no pinch events at all", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 11, 100, 100, { kind: "touch" }));
    t.feed(t.ev("pointerdown", 12, 200, 100, { kind: "touch" }));
    t.feed(t.ev("pointermove", 12, 202, 101, { kind: "touch" }));
    t.feed(t.ev("pointerup", 12, 202, 101, { kind: "touch" }));
    t.feed(t.ev("pointerup", 11, 100, 100, { kind: "touch" }));
    expect(t.types()).toEqual(["press", "cancel"]);
  });

  it("pointercancel or lost capture of a pinching finger cancels the pinch", () => {
    for (const type of ["pointercancel", "lostpointercapture"] as const) {
      const t = setup();
      t.feed(t.ev("pointerdown", 11, 100, 100, { kind: "touch" }));
      t.feed(t.ev("pointerdown", 12, 200, 100, { kind: "touch" }));
      t.feed(t.ev("pointermove", 12, 260, 100, { kind: "touch" }));
      t.feed(t.ev("pointermove", 11, 99, 100, { kind: "touch" }));
      t.feed(t.ev(type, 11, 99, 100, { kind: "touch" }));
      expect(t.types().slice(-1)).toEqual(["pinch:cancel"]);
      expect(t.rec.pinching()).toBe(false);
    }
  });

  it("a third finger is ignored", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 11, 100, 100, { kind: "touch" }));
    t.feed(t.ev("pointerdown", 12, 200, 100, { kind: "touch" }));
    t.feed(t.ev("pointerdown", 13, 300, 300, { kind: "touch" }));
    t.feed(t.ev("pointermove", 13, 500, 500, { kind: "touch" }));
    expect(t.types()).toEqual(["press", "cancel"]);
  });

  it("a finger while the mouse is pressed is ignored", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 1, 0, 0));
    t.feed(t.ev("pointerdown", 11, 100, 100, { kind: "touch" }));
    t.feed(t.ev("pointerdown", 12, 200, 100, { kind: "touch" }));
    t.feed(t.ev("pointermove", 12, 300, 100, { kind: "touch" }));
    t.feed(t.ev("pointerup", 1, 0, 0));
    expect(t.types()).toEqual(["press", "release"]);
  });
});

describe("recognizer: two fingers, pan or pinch read on both fingers", () => {
  type Setup = ReturnType<typeof setup>;
  const touch = { kind: "touch" } as const;
  const pinchesOf = (t: Setup) => t.out.filter((g): g is Of<"pinch"> => g.type === "pinch");
  const product = (t: Setup) => pinchesOf(t).reduce((s, p) => s * p.scale, 1);
  const panTotal = (t: Setup) => pinchesOf(t).reduce((s, p) => ({ x: s.x + p.pan.x, y: s.y + p.pan.y }), { x: 0, y: 0 });

  /** Fingers 11 and 12 down 120 px apart on a row (a pan along that row changes the distance most) */
  function twoDown(): Setup {
    const t = setup();
    t.feed(t.ev("pointerdown", 11, 100, 100, touch));
    t.feed(t.ev("pointerdown", 12, 220, 100, touch));
    t.take();
    return t;
  }

  /** Both fingers move `steps` times by (dx, dy) per event, one event each in turn, `lead` first */
  function walk(t: Setup, steps: number, dx: number, dy: number, lead: 11 | 12): void {
    const at = new Map<number, { x: number; y: number }>([
      [11, { x: 100, y: 100 }],
      [12, { x: 220, y: 100 }],
    ]);
    for (let i = 0; i < steps; i++) {
      for (const id of lead === 11 ? [11, 12] : [12, 11]) {
        const p = at.get(id)!;
        p.x += dx;
        p.y += dy;
        t.feed(t.ev("pointermove", id, p.x, p.y, touch));
      }
    }
  }

  for (const step of [2, 7.5, 15, 30]) {
    for (const lead of [11, 12] as const) {
      for (const [name, dx, dy] of [["along the row", step, 0], ["across it", 0, step], ["diagonally", step * 0.6, step * 0.8]] as const) {
        it(`a pan ${name} at ${step} px per event, finger ${lead} leading, is a pan: the leading finger alone is no pinch`, () => {
          const t = twoDown();
          walk(t, 8, dx, dy, lead);
          const pinches = pinchesOf(t);
          expect(pinches.length).toBeGreaterThan(0);
          expect(new Set(pinches.map((p) => p.kind))).toEqual(new Set(["pan"]));
          expect(product(t)).toBe(1);
          const pan = panTotal(t);
          expect(pan.x).toBeCloseTo(8 * dx, 6);
          expect(pan.y).toBeCloseTo(8 * dy, 6);
        });
      }
    }
  }

  it("the input spec's pan (120 px apart, 7.5 px per event per finger) starts as a pan once the centre passed 10 px", () => {
    const t = twoDown();
    t.feed(t.ev("pointermove", 12, 227.5, 100, touch)); // the lead alone: 6.25 % of the distance, no look yet
    expect(pinchesOf(t)).toEqual([]);
    t.feed(t.ev("pointermove", 11, 107.5, 100, touch)); // both at +7.5: the centre moved 7.5 px, not yet
    expect(pinchesOf(t)).toEqual([]);
    t.feed(t.ev("pointermove", 12, 235, 100, touch)); // the lead alone again
    expect(pinchesOf(t)).toEqual([]);
    t.feed(t.ev("pointermove", 11, 115, 100, touch)); // both at +15: a pan
    expect(pinchesOf(t).map((p) => [p.phase, p.kind])).toEqual([["start", "pan"]]);
  });

  it("a real pinch, fingers spreading in turn, is a pinch; its scales multiply to the total", () => {
    const t = twoDown();
    for (let i = 1; i <= 6; i++) {
      t.feed(t.ev("pointermove", 12, 220 + 5 * i, 100, touch));
      t.feed(t.ev("pointermove", 11, 100 - 5 * i, 100, touch));
    }
    const pinches = pinchesOf(t);
    expect(pinches[0]).toMatchObject({ phase: "start", kind: "pinch" });
    expect(new Set(pinches.map((p) => p.kind))).toEqual(new Set(["pinch"]));
    expect(product(t)).toBeCloseTo(180 / 120, 10);
    expect(panTotal(t).x).toBeCloseTo(0, 10);
  });

  it("a pinch around a resting finger decides on the moving one's third move", () => {
    const t = twoDown();
    t.feed(t.ev("pointermove", 12, 240, 100, touch));
    t.feed(t.ev("pointermove", 12, 260, 100, touch));
    expect(pinchesOf(t)).toEqual([]);
    t.feed(t.ev("pointermove", 12, 280, 100, touch));
    expect(pinchesOf(t).map((p) => [p.phase, p.kind])).toEqual([["start", "pinch"]]);
    expect(product(t)).toBeCloseTo(180 / 120, 10);
  });

  it("a pinch while panning is a pinch, and carries the pan too", () => {
    const t = twoDown();
    for (let i = 1; i <= 5; i++) {
      t.feed(t.ev("pointermove", 11, 100 - 6 * i + 4 * i, 100 + 5 * i, touch));
      t.feed(t.ev("pointermove", 12, 220 + 6 * i + 4 * i, 100 + 5 * i, touch));
    }
    expect(new Set(pinchesOf(t).map((p) => p.kind))).toEqual(new Set(["pinch"]));
    expect(product(t)).toBeCloseTo(180 / 120, 10);
    expect(panTotal(t).x).toBeCloseTo(20, 10);
    expect(panTotal(t).y).toBeCloseTo(25, 10);
  });

  // Up to SOLO_MOVES − 1: a finger SOLO_MOVES ahead is looked at alone (the anchored-thumb pinch)
  for (const burst of [1, 2]) {
    it(`a pan whose fingers report in bursts of ${burst} (7.5 px per event) is still a pan`, () => {
      const t = twoDown();
      for (let i = 0; i < 4; i++) {
        for (const [id, x0] of [[12, 220], [11, 100]] as const) {
          for (let k = 1; k <= burst; k++) t.feed(t.ev("pointermove", id, x0 + 7.5 * (burst * i + k), 100, touch));
        }
      }
      expect(new Set(pinchesOf(t).map((p) => p.kind))).toEqual(new Set(["pan"]));
      expect(product(t)).toBe(1);
      expect(panTotal(t).x).toBeCloseTo(7.5 * burst * 4, 10);
    });
  }

  it("a move that changes nothing (pressure only) is no move: the lead alone is still not looked at", () => {
    const t = twoDown();
    t.feed(t.ev("pointermove", 12, 227.5, 100, touch));
    t.feed(t.ev("pointermove", 11, 100, 100, { kind: "touch", pressure: 0.6 }));
    expect(pinchesOf(t)).toEqual([]);
    t.feed(t.ev("pointermove", 11, 107.5, 100, touch));
    t.feed(t.ev("pointermove", 12, 235, 100, touch));
    t.feed(t.ev("pointermove", 11, 115, 100, touch));
    expect(pinchesOf(t).map((p) => [p.phase, p.kind])).toEqual([["start", "pan"]]);
  });

  it("a quick pinch lifted before both fingers moved still counts: start, then end", () => {
    const t = twoDown();
    t.feed(t.ev("pointermove", 12, 280, 100, touch));
    t.feed(t.ev("pointerup", 12, 280, 100, touch));
    expect(t.types()).toEqual(["pinch:start", "pinch:end"]);
    expect(product(t)).toBeCloseTo(180 / 120, 10);
  });

  it("the resting finger lifting after the other moved once is looked at too: start, then end", () => {
    const t = twoDown();
    t.feed(t.ev("pointermove", 12, 280, 100, touch));
    t.feed(t.ev("pointerup", 11, 100, 100, touch));
    expect(t.types()).toEqual(["pinch:start", "pinch:end"]);
    expect(product(t)).toBeCloseTo(180 / 120, 10);
  });

  it("a lift with too little movement to decide emits nothing", () => {
    const t = twoDown();
    t.feed(t.ev("pointermove", 12, 223, 100, touch));
    t.feed(t.ev("pointerup", 12, 223, 100, touch));
    expect(pinchesOf(t)).toEqual([]);
  });

  it("a pair cancelled before it decided emits no pinch event (pointercancel, lost capture, cancel, reset)", () => {
    const cases: Array<(t: Setup) => void> = [
      (t) => t.feed(t.ev("pointercancel", 11, 100, 100, touch)),
      (t) => t.feed(t.ev("lostpointercapture", 12, 227.5, 100, touch)),
      (t) => t.rec.cancel("escape"),
      (t) => t.rec.reset(),
    ];
    for (const end of cases) {
      const t = twoDown();
      t.feed(t.ev("pointermove", 12, 227.5, 100, touch));
      end(t);
      expect(pinchesOf(t)).toEqual([]);
      expect(t.rec.pinching()).toBe(false);
    }
  });
});

describe("recognizer: wheel and trackpad", () => {
  const wheel = (deltaX: number, deltaY: number, deltaMode: 0 | 1 | 2 = 0, modifiers = {}) =>
    ({ type: "wheel", deltaX, deltaY, deltaMode, screen: { x: 300, y: 250 }, modifiers, time: 1 }) as const;

  it("scrolls in px: lines × 40, pages × 800", () => {
    const t = setup();
    t.feed(wheel(1, 2));
    t.feed(wheel(0, 3, 1));
    t.feed(wheel(0, 1, 2));
    const s = t.out.filter((g): g is Of<"scroll"> => g.type === "scroll").map((g) => g.delta);
    expect(s).toEqual([{ x: 1, y: 2 }, { x: 0, y: 120 }, { x: 0, y: 800 }]);
    expect(last(t.out, "scroll").at.canvas).toEqual({ x: 100, y: 100 });
  });

  it("Shift turns a vertical-only wheel horizontal; a zero delta reports nothing", () => {
    const t = setup();
    t.feed(wheel(0, 30, 0, { shift: true }));
    t.feed(wheel(0, 0));
    expect(t.types()).toEqual(["scroll"]);
    expect(last(t.out, "scroll").delta).toEqual({ x: 30, y: 0 });
  });

  it("Ctrl+wheel (the trackpad pinch) and Cmd+wheel zoom by 2^(−dy/300)", () => {
    const t = setup();
    t.feed(wheel(0, -300, 0, { ctrl: true }));
    t.feed(wheel(0, 150, 0, { meta: true }));
    const z = t.out.filter((g): g is Of<"zoom"> => g.type === "zoom").map((g) => g.factor);
    expect(z[0]).toBeCloseTo(2, 10);
    expect(z[1]).toBeCloseTo(Math.SQRT1_2, 10);
  });

  it("Safari's trackpad pinch: start, incremental updates, end", () => {
    const t = setup();
    const g = (type: "gesturestart" | "gesturechange" | "gestureend", scale: number) =>
      t.feed({ type, scale, screen: { x: 300, y: 250 }, time: 1 });
    g("gesturestart", 1);
    g("gesturechange", 1.5);
    g("gesturechange", 1.5);
    g("gesturechange", 3);
    g("gestureend", 3);
    const p = t.out.filter((x): x is Of<"pinch"> => x.type === "pinch");
    expect(p.map((x) => [x.phase, x.source, x.scale])).toEqual([
      ["start", "trackpad", 1],
      ["update", "trackpad", 1.5],
      ["update", "trackpad", 2],
      ["end", "trackpad", 1],
    ]);
  });

  it("Safari gesture events during a touch pinch are left to the pointer path", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 11, 100, 100, { kind: "touch" }));
    t.feed({ type: "gesturestart", scale: 1, screen: { x: 0, y: 0 }, time: 1 });
    t.feed({ type: "gesturechange", scale: 2, screen: { x: 0, y: 0 }, time: 1 });
    expect(t.types()).toEqual(["press"]);
  });
});

describe("recognizer: a pointerup that never came", () => {
  it("a pen moving with no button down after a press: the release was missed", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 7, 0, 0, { kind: "pen" }));
    t.feed(t.ev("pointermove", 7, 30, 0, { kind: "pen" }));
    t.feed(t.ev("pointermove", 7, 40, 0, { kind: "pen", buttons: 0 }));
    expect(t.types()).toEqual(["press", "dragStart", "release"]);
    expect(t.rec.active()).toBeNull();
  });

  it("the same pointer pressing again cancels the old press and starts the new one where it is", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 1, 0, 0));
    t.feed(t.ev("pointerdown", 1, 50, 0));
    t.feed(t.ev("pointerup", 1, 50, 0));
    expect(t.types()).toEqual(["press", "cancel", "press", "release"]);
    expect(last(t.out, "cancel").reason).toBe("missed-up");
    expect(last(t.out, "release").origin.screen).toEqual({ x: 50, y: 0 });
  });

  it("a mouse or pen press untouched for a second gives way to the next pointer", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 7, 0, 0, { kind: "pen" }));
    t.tick(2000);
    t.feed(t.ev("pointerdown", 1, 10, 10));
    expect(t.types()).toEqual(["press", "cancel", "press"]);
    expect(t.rec.active()).toMatchObject({ pointerId: 1, kind: "mouse" });
  });

  it("a finger landing again under its old id is a new press, not a pinch", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 11, 0, 0, { kind: "touch" }));
    t.feed(t.ev("pointerdown", 11, 100, 0, { kind: "touch" }));
    t.feed(t.ev("pointermove", 11, 200, 0, { kind: "touch" }));
    expect(t.types()).toEqual(["press", "cancel", "press", "dragStart"]);
    expect(t.rec.pinching()).toBe(false);
  });

  it("a finger whose pointerup was lost after a pinch stops blocking new touches a second later", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 11, 100, 100, { kind: "touch" }));
    t.feed(t.ev("pointerdown", 12, 200, 100, { kind: "touch" }));
    t.feed(t.ev("pointermove", 12, 260, 100, { kind: "touch" }));
    t.feed(t.ev("pointerup", 12, 260, 100, { kind: "touch" })); // 11's pointerup never comes
    t.take();
    t.feed(t.ev("pointerdown", 13, 10, 10, { kind: "touch" }));
    t.feed(t.ev("pointerup", 13, 10, 10, { kind: "touch" }));
    expect(t.types()).toEqual([]); // still locked: 11 may be resting on the glass
    t.tick(2000);
    t.feed(t.ev("pointerdown", 14, 10, 10, { kind: "touch" }));
    expect(t.types()).toEqual(["press"]);
  });

  it("a finger resting longer than that still pinches with a second one", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 11, 100, 100, { kind: "touch" }));
    t.tick(3000);
    t.feed(t.ev("pointerdown", 12, 200, 100, { kind: "touch" }));
    t.feed(t.ev("pointermove", 12, 260, 100, { kind: "touch" }));
    t.feed(t.ev("pointermove", 11, 99, 100, { kind: "touch" }));
    expect(t.types()).toEqual(["press", "cancel", "pinch:start"]);
    expect(last(t.out, "cancel").reason).toBe("multitouch");
  });
});

describe("recognizer: cancel, reset, dispose", () => {
  it("cancel and reset work detached from the object", () => {
    const t = setup();
    const { reset, cancel } = t.rec;
    t.feed(t.ev("pointerdown", 1, 0, 0));
    cancel("escape");
    reset();
    expect(t.types()).toEqual(["press", "cancel"]);
  });

  it("cancel(reason) ends the press and the pinch in flight", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 1, 0, 0));
    t.feed(t.ev("pointermove", 1, 30, 0));
    t.rec.cancel("escape");
    expect(last(t.out, "cancel")).toMatchObject({ reason: "escape", dragged: true });
    t.feed(t.ev("pointermove", 1, 40, 0));
    t.feed(t.ev("pointerup", 1, 40, 0));
    expect(t.types()).toEqual(["press", "dragStart", "cancel"]);

    const p = setup();
    p.feed(p.ev("pointerdown", 11, 100, 100, { kind: "touch" }));
    p.feed(p.ev("pointerdown", 12, 200, 100, { kind: "touch" }));
    p.feed(p.ev("pointermove", 12, 300, 100, { kind: "touch" }));
    p.feed(p.ev("pointermove", 11, 90, 100, { kind: "touch" }));
    p.rec.cancel("escape");
    expect(p.types().slice(-1)).toEqual(["pinch:cancel"]);
  });

  it("reset forgets the fingers, so the next touch presses again", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 11, 100, 100, { kind: "touch" }));
    t.feed(t.ev("pointerdown", 12, 200, 100, { kind: "touch" }));
    t.rec.reset();
    t.take();
    t.feed(t.ev("pointerdown", 13, 10, 10, { kind: "touch" }));
    expect(t.types()).toEqual(["press"]);
  });

  it("after dispose nothing is reported and the long-press timer is gone", () => {
    const t = setup();
    t.feed(t.ev("pointerdown", 11, 0, 0, { kind: "touch" }));
    t.rec.dispose();
    t.timers.advance(1000);
    t.feed(t.ev("pointerup", 11, 0, 0, { kind: "touch" }));
    expect(t.types()).toEqual(["press"]);
  });

  it("non-finite coordinates become 0 rather than NaN", () => {
    const t = setup();
    t.feed({ ...t.ev("pointerdown", 1, 0, 0), screen: { x: Number.NaN, y: Number.POSITIVE_INFINITY } });
    expect(last(t.out, "press").pointer.screen).toEqual({ x: 0, y: 0 });
  });
});
