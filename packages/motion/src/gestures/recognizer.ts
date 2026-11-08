/**
 * The gesture recogniser: raw pointer, wheel and Safari gesture events (plain
 * objects) in, one stream of InputGesture out. Mouse, pen and touch share one
 * path; two fingers become a pinch (5 % scale or 10 px pan decides which); a
 * press becomes a drag only past a per-kind threshold, so a modifier+click
 * (Cmd/Ctrl+click to multi-select) stays a click for the content.
 *
 * One press at a time: a second mouse or pen while one is down is ignored, and
 * a second finger cancels the one-finger press ("multitouch") and starts a
 * pinch. After a pinch, the fingers left on the glass start nothing until all
 * are lifted.
 *
 * No DOM, no clock: timestamps come with the events and the long-press timer
 * is injected as the timer half of a ClockPort (without timers there is no
 * long press). The stale-press drop works from event timestamps, so it needs
 * no timer.
 */

import type { ClockPort } from "../clock/port";
import type { Point } from "../shapes";
import { isHeld, platformButton, toModifiers } from "./modifiers";
import type {
  CancelReason,
  InputGesture,
  ModifierDrag,
  ModifierKey,
  Platform,
  PointerKind,
  RawInputEvent,
  RawPointerEvent,
  RawSafariGestureEvent,
  RawWheelEvent,
  SurfacePointer,
} from "./types";
import { classifyWheel, WHEEL_DEFAULTS, wheelDeltaPx, type WheelOptions } from "./wheel";

/** The timer half of a ClockPort: any clock (createBrowserClock, createFakeClock) is one. */
export type RecognizerTimers = Pick<ClockPort, "setTimer" | "clearTimer">;

export interface RecognizerOptions {
  /** Screen px (relative to the view) to canvas units, through the current camera */
  toCanvas: (screen: Point) => Point;
  /** For the long press: a clock; without timers no long press fires */
  timers?: RecognizerTimers;
  /** The drag modifier, resolved (see resolveDragModifier); null = off */
  dragModifier?: ModifierKey | null;
  /** "mac": a mouse Ctrl+press is the secondary button, as the system has it (platformButton); default "other" */
  platform?: Platform;
  /** Click vs drag: a press becomes a drag after travelling more than this many screen px */
  thresholds?: Partial<Record<PointerKind, number>>;
  longPress?: { ms?: number; kinds?: readonly PointerKind[] };
  /** Two clicks within ms and px of each other count as a double click */
  multiClick?: { ms?: number; px?: number };
  pinch?: { scaleThreshold?: number; panThreshold?: number };
  wheel?: Partial<WheelOptions>;
  /** A mouse or pen press, or a resting finger outside any gesture, untouched this long when another pointer goes down, lost its pointerup; default 1000 ms */
  staleMs?: number;
}

export const RECOGNIZER_DEFAULTS = Object.freeze({
  thresholds: Object.freeze({ mouse: 4, pen: 6, touch: 8 }) as Readonly<Record<PointerKind, number>>,
  longPress: Object.freeze({ ms: 500, kinds: Object.freeze(["touch", "pen"]) as readonly PointerKind[] }),
  multiClick: Object.freeze({ ms: 300, px: 5 }),
  pinch: Object.freeze({ scaleThreshold: 0.05, panThreshold: 10 }),
});

export interface Recognizer {
  feed(event: RawInputEvent): void;
  /** Cancel the press and the pinch in flight (Escape, a tool change, the view losing focus) */
  cancel(reason: CancelReason): void;
  /** cancel("reset") and forget every pointer (e.g. after the window lost focus mid-touch) */
  reset(): void;
  /** The press in flight, if any */
  active(): { pointerId: number; kind: PointerKind; dragging: boolean } | null;
  pinching(): boolean;
  /** Change the drag modifier; applies from the next press */
  setDragModifier(key: ModifierKey | null): void;
  dispose(): void;
}

interface Press {
  origin: SurfacePointer;
  last: SurfacePointer;
  dragging: boolean;
  longPressed: boolean;
  /** What a modifier-drag would do; decided at the press, confirmed (modifier still held) at dragStart */
  candidate: ModifierDrag | null;
  modifierDrag: ModifierDrag | null;
  timer: number | undefined;
}

interface Touch {
  screen: Point;
  time: number;
}

interface Pinch {
  ids: [number, number];
  startDist: number;
  startCenter: Point;
  lastDist: number;
  lastCenter: Point;
  kind: "pinch" | "pan" | null;
}

function kindOf(pointerType: string): PointerKind {
  return pointerType === "touch" || pointerType === "pen" ? pointerType : "mouse";
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mid(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function finitePoint(p: Point): Point {
  return { x: Number.isFinite(p.x) ? p.x : 0, y: Number.isFinite(p.y) ? p.y : 0 };
}

export function createRecognizer(options: RecognizerOptions, emit: (gesture: InputGesture) => void): Recognizer {
  const thresholds = { ...RECOGNIZER_DEFAULTS.thresholds, ...options.thresholds };
  const longPressMs = options.longPress?.ms ?? RECOGNIZER_DEFAULTS.longPress.ms;
  const longPressKinds = options.longPress?.kinds ?? RECOGNIZER_DEFAULTS.longPress.kinds;
  const multiClick = { ...RECOGNIZER_DEFAULTS.multiClick, ...options.multiClick };
  const pinchCfg = { ...RECOGNIZER_DEFAULTS.pinch, ...options.pinch };
  const wheelCfg: WheelOptions = { ...WHEEL_DEFAULTS, ...options.wheel };
  const timers = options.timers;
  const staleMs = options.staleMs ?? 1000;
  let dragModifier: ModifierKey | null = options.dragModifier ?? null;
  const platform: Platform = options.platform ?? "other";

  let press: Press | null = null;
  let pinch: Pinch | null = null;
  const touches = new Map<number, Touch>();
  /** After a pinch (or a reset mid-touch), fingers still down start nothing until all are up */
  let touchLocked = false;
  let lastClick: { time: number; screen: Point; button: number; count: number } | null = null;
  let safari: { last: number } | null = null;
  let lastTime = 0;
  let disposed = false;

  const pointerOf = (e: RawPointerEvent): SurfacePointer => {
    const screen = finitePoint(e.screen);
    return {
      screen,
      canvas: options.toCanvas(screen),
      kind: kindOf(e.pointerType),
      buttons: e.buttons,
      modifiers: toModifiers(e.modifiers),
      pointerId: e.pointerId,
      button: e.button,
      time: e.time,
      ...(e.pressure !== undefined ? { pressure: e.pressure } : {}),
    };
  };

  const clearTimer = (p: Press) => {
    if (p.timer !== undefined && timers) timers.clearTimer(p.timer);
    p.timer = undefined;
  };

  const endPress = (): Press | null => {
    const p = press;
    if (p) clearTimer(p);
    press = null;
    return p;
  };

  const cancelPress = (reason: CancelReason, pointer?: SurfacePointer) => {
    const p = endPress();
    if (!p) return;
    emit({ type: "cancel", pointer: pointer ?? p.last, origin: p.origin, reason, dragged: p.dragging });
  };

  const releasePress = (pointer: SurfacePointer) => {
    const p = endPress();
    if (!p) return;
    const click = !p.dragging && !p.longPressed;
    let clickCount = 0;
    if (click) {
      const prev = lastClick;
      const repeat =
        !!prev &&
        prev.button === p.origin.button &&
        p.origin.time - prev.time <= multiClick.ms &&
        dist(prev.screen, p.origin.screen) <= multiClick.px;
      clickCount = repeat ? prev!.count + 1 : 1;
      lastClick = { time: pointer.time, screen: p.origin.screen, button: p.origin.button, count: clickCount };
    } else {
      lastClick = null;
    }
    emit({ type: "release", pointer, origin: p.origin, click, clickCount, dragged: p.dragging });
  };

  const pinchState = (): { center: Point; d: number } | null => {
    if (!pinch) return null;
    const a = touches.get(pinch.ids[0]);
    const b = touches.get(pinch.ids[1]);
    if (!a || !b) return null;
    return { center: mid(a.screen, b.screen), d: Math.max(1, dist(a.screen, b.screen)) };
  };

  const pinchEvent = (
    phase: "start" | "update" | "end" | "cancel",
    center: Point,
    scale: number,
    pan: Point,
    time: number,
    modifiers: SurfacePointer["modifiers"],
    source: "touch" | "trackpad",
    kind: "pinch" | "pan",
  ): InputGesture => ({
    type: "pinch",
    phase,
    source,
    kind,
    center: { screen: center, canvas: options.toCanvas(center) },
    scale,
    pan,
    modifiers,
    time,
  });

  const endPinch = (phase: "end" | "cancel", time: number, modifiers: SurfacePointer["modifiers"]) => {
    const p = pinch;
    pinch = null;
    touchLocked = touches.size > 0;
    if (p && p.kind) emit(pinchEvent(phase, p.lastCenter, 1, { x: 0, y: 0 }, time, modifiers, "touch", p.kind));
  };

  const updatePinch = (time: number, modifiers: SurfacePointer["modifiers"]) => {
    const p = pinch;
    const now = pinchState();
    if (!p || !now) return;
    if (!p.kind) {
      const scaleChange = Math.abs(now.d / p.startDist - 1);
      const panDist = dist(now.center, p.startCenter);
      if (scaleChange > pinchCfg.scaleThreshold) p.kind = "pinch";
      else if (panDist > pinchCfg.panThreshold) p.kind = "pan";
      else return;
      // The first event carries everything since the second finger landed, so nothing is lost.
      const scale = p.kind === "pinch" ? now.d / p.startDist : 1;
      const pan = { x: now.center.x - p.startCenter.x, y: now.center.y - p.startCenter.y };
      p.lastDist = now.d;
      p.lastCenter = now.center;
      emit(pinchEvent("start", now.center, scale, pan, time, modifiers, "touch", p.kind));
      return;
    }
    const scale = p.kind === "pinch" ? now.d / p.lastDist : 1;
    const pan = { x: now.center.x - p.lastCenter.x, y: now.center.y - p.lastCenter.y };
    p.lastDist = now.d;
    p.lastCenter = now.center;
    if (scale === 1 && pan.x === 0 && pan.y === 0) return;
    emit(pinchEvent("update", now.center, scale, pan, time, modifiers, "touch", p.kind));
  };

  /**
   * A pointerup that never came (released outside the page, a pen lifted out of range, a lost event):
   * a press of the same pointer, or a mouse / pen press untouched for staleMs, is over. A finger that
   * lands again under its old id, or one resting untouched for staleMs outside any press or pinch, is gone.
   */
  const dropMissedUps = (e: RawPointerEvent, kind: PointerKind) => {
    const p = press;
    if (p) {
      const same = p.origin.pointerId === e.pointerId;
      const mixed = kind !== "touch" || p.origin.kind !== "touch"; // two fingers make a pinch, never a stale press
      if (same || (mixed && e.time - p.last.time > staleMs)) cancelPress("missed-up");
    }
    if (kind !== "touch") return;
    if (touches.has(e.pointerId)) {
      if (pinch?.ids.includes(e.pointerId)) endPinch("cancel", e.time, toModifiers(e.modifiers));
      touches.delete(e.pointerId);
    }
    for (const [id, t] of touches) {
      const busy = press?.origin.pointerId === id || !!pinch?.ids.includes(id);
      if (!busy && e.time - t.time > staleMs) touches.delete(id);
    }
    if (touches.size === 0) touchLocked = false;
  };

  const onDown = (e: RawPointerEvent) => {
    const down = pointerOf(e);
    // The press's button as the platform means it (macOS: Ctrl+click is a secondary click)
    const pointer: SurfacePointer = { ...down, button: platformButton(down, platform, dragModifier) };
    dropMissedUps(e, pointer.kind);
    if (pointer.kind === "touch") {
      touches.set(e.pointerId, { screen: pointer.screen, time: pointer.time });
      if (touchLocked || pinch) return; // a third finger, or fingers after a pinch
      if (touches.size === 2) {
        const ids = [...touches.keys()] as [number, number];
        // The second finger: whatever the first one started is cancelled, a pinch may begin.
        if (press && press.origin.kind === "touch") cancelPress("multitouch");
        else if (press) {
          touches.delete(e.pointerId); // a mouse or pen press owns the input; ignore the finger
          return;
        }
        const a = touches.get(ids[0])!;
        const b = touches.get(ids[1])!;
        const d = Math.max(1, dist(a.screen, b.screen));
        const c = mid(a.screen, b.screen);
        pinch = { ids, startDist: d, startCenter: c, lastDist: d, lastCenter: c, kind: null };
        return;
      }
      if (touches.size > 2) return;
    }
    if (press || pinch) return; // one press at a time
    const candidate: ModifierDrag | null = isHeld(pointer.modifiers, dragModifier)
      ? pointer.button === 0
        ? "move"
        : pointer.button === 2
          ? "resize"
          : null
      : null;
    const p: Press = {
      origin: pointer,
      last: pointer,
      dragging: false,
      longPressed: false,
      candidate,
      modifierDrag: null,
      timer: undefined,
    };
    press = p;
    if (timers && longPressKinds.includes(pointer.kind)) {
      p.timer = timers.setTimer(() => {
        p.timer = undefined;
        if (press !== p || p.dragging || disposed) return;
        p.longPressed = true;
        emit({ type: "longPress", pointer: p.last, origin: p.origin });
      }, longPressMs);
    }
    emit({ type: "press", pointer, modifierDrag: candidate });
  };

  const onMove = (e: RawPointerEvent) => {
    const kind = kindOf(e.pointerType);
    if (kind === "touch") {
      const t = touches.get(e.pointerId);
      if (t) {
        t.screen = finitePoint(e.screen);
        t.time = e.time;
      }
      if (pinch && pinch.ids.includes(e.pointerId)) {
        updatePinch(e.time, toModifiers(e.modifiers));
        return;
      }
    }
    if (press && press.origin.pointerId === e.pointerId) {
      const pointer = pointerOf(e);
      // A mouse or pen moving with no button down and no pointerup before it: the release was missed.
      if (pointer.kind !== "touch" && e.buttons === 0) {
        releasePress(pointer);
        return;
      }
      const p = press;
      p.last = pointer;
      if (!p.dragging) {
        if (dist(pointer.screen, p.origin.screen) <= thresholds[p.origin.kind]) return;
        p.dragging = true;
        clearTimer(p);
        // The modifier must still be held when the drag starts: a released Cmd makes it a plain drag.
        p.modifierDrag = p.candidate && isHeld(pointer.modifiers, dragModifier) ? p.candidate : null;
        emit({ type: "dragStart", pointer, origin: p.origin, modifierDrag: p.modifierDrag });
        return;
      }
      emit({ type: "move", pointer, origin: p.origin });
      return;
    }
    if (!press && kind !== "touch" && e.buttons === 0) emit({ type: "hover", pointer: pointerOf(e) });
  };

  const onUp = (e: RawPointerEvent) => {
    if (kindOf(e.pointerType) === "touch") {
      touches.delete(e.pointerId);
      if (pinch && pinch.ids.includes(e.pointerId)) {
        endPinch("end", e.time, toModifiers(e.modifiers));
        return;
      }
      if (touches.size === 0) touchLocked = false;
    }
    if (press && press.origin.pointerId === e.pointerId) releasePress(pointerOf(e));
  };

  const onCancel = (e: RawPointerEvent, reason: CancelReason) => {
    if (kindOf(e.pointerType) === "touch") {
      const tracked = touches.delete(e.pointerId);
      if (pinch && pinch.ids.includes(e.pointerId)) {
        if (tracked) endPinch("cancel", e.time, toModifiers(e.modifiers));
        return;
      }
      if (touches.size === 0) touchLocked = false;
    }
    if (press && press.origin.pointerId === e.pointerId) cancelPress(reason, pointerOf(e));
  };

  const onWheel = (e: RawWheelEvent) => {
    const modifiers = toModifiers(e.modifiers);
    const screen = finitePoint(e.screen);
    const at = { screen, canvas: options.toCanvas(screen) };
    const intent = classifyWheel(wheelDeltaPx(e.deltaX, e.deltaY, e.deltaMode, wheelCfg), modifiers, wheelCfg);
    if (intent.kind === "zoom") {
      if (intent.factor !== 1) emit({ type: "zoom", factor: intent.factor, at, modifiers, time: e.time });
      return;
    }
    if (intent.delta.x === 0 && intent.delta.y === 0) return;
    emit({ type: "scroll", delta: intent.delta, at, modifiers, time: e.time });
  };

  const onSafari = (e: RawSafariGestureEvent) => {
    // iOS Safari fires gesture events for touch pinches too; the pointer path handles those.
    if (touches.size > 0 || pinch) return;
    const modifiers = toModifiers(e.modifiers);
    const screen = finitePoint(e.screen);
    const scaleNow = Number.isFinite(e.scale) && e.scale > 0 ? e.scale : 1;
    const none = { x: 0, y: 0 };
    if (e.type === "gesturestart") {
      safari = { last: scaleNow };
      emit(pinchEvent("start", screen, 1, none, e.time, modifiers, "trackpad", "pinch"));
      return;
    }
    if (!safari) return;
    const scale = scaleNow / safari.last;
    safari.last = scaleNow;
    if (e.type === "gesturechange") {
      if (scale !== 1) emit(pinchEvent("update", screen, scale, none, e.time, modifiers, "trackpad", "pinch"));
      return;
    }
    safari = null;
    emit(pinchEvent("end", screen, scale, none, e.time, modifiers, "trackpad", "pinch"));
  };

  const cancelAll = (reason: CancelReason) => {
    cancelPress(reason);
    if (pinch) endPinch("cancel", lastTime, toModifiers(undefined));
    if (safari) {
      safari = null;
      emit(pinchEvent("cancel", { x: 0, y: 0 }, 1, { x: 0, y: 0 }, lastTime, toModifiers(undefined), "trackpad", "pinch"));
    }
  };

  return {
    feed(event) {
      if (disposed) return;
      if (Number.isFinite(event.time)) lastTime = event.time;
      switch (event.type) {
        case "pointerdown":
          return onDown(event);
        case "pointermove":
          return onMove(event);
        case "pointerup":
          return onUp(event);
        case "pointercancel":
          return onCancel(event, "pointercancel");
        case "lostpointercapture":
          // Also fires right after pointerup; by then the press is gone and this is a no-op. The content
          // losing its capture (the surface just took the pointer) is not the gesture's end.
          if (event.lostBy === "content") return;
          return onCancel(event, "lostcapture");
        case "wheel":
          return onWheel(event);
        case "gesturestart":
        case "gesturechange":
        case "gestureend":
          return onSafari(event);
      }
    },
    cancel: cancelAll,
    reset() {
      cancelAll("reset");
      touches.clear();
      touchLocked = false;
      lastClick = null;
    },
    active() {
      return press ? { pointerId: press.origin.pointerId, kind: press.origin.kind, dragging: press.dragging } : null;
    },
    pinching() {
      return !!pinch?.kind || !!safari;
    },
    setDragModifier(key) {
      dragModifier = key;
    },
    dispose() {
      if (press) clearTimer(press);
      press = null;
      pinch = null;
      safari = null;
      touches.clear();
      disposed = true;
    },
  };
}
