import { createFakeClock } from "../../clock/fake-clock";
import type { Point } from "../../shapes";
import { createRecognizer, type RecognizerOptions, type RecognizerTimers } from "../recognizer";
import type { InputGesture, Modifiers, PointerKind, RawPointerEvent, RawPointerType } from "../types";

/** Timers driven by hand, on motion's fake clock: advance(ms) runs what is due */
export function fakeTimers(): RecognizerTimers & { advance(ms: number): void; pending(): number } {
  const clock = createFakeClock();
  return {
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    advance: (ms) => clock.tick(ms),
    pending: () => clock.pendingTimers,
  };
}

/** Camera: canvas = (screen − offset) / scale */
export const camera = { scale: 2, offset: { x: 100, y: 50 } };
export const toCanvas = (p: Point): Point => ({ x: (p.x - camera.offset.x) / camera.scale, y: (p.y - camera.offset.y) / camera.scale });

export function setup(opts: Partial<RecognizerOptions> = {}) {
  const out: InputGesture[] = [];
  const timers = fakeTimers();
  const rec = createRecognizer({ toCanvas, timers, dragModifier: "meta", ...opts }, (g) => out.push(g));
  let time = 0;
  const ev = (
    type: RawPointerType,
    pointerId: number,
    x: number,
    y: number,
    extra: { kind?: PointerKind; button?: number; buttons?: number; modifiers?: Partial<Modifiers>; pressure?: number } = {},
  ): RawPointerEvent => {
    time += 16;
    const kind = extra.kind ?? "mouse";
    const down = type === "pointerdown" || type === "pointermove";
    return {
      type,
      pointerId,
      pointerType: kind,
      button: extra.button ?? (type === "pointermove" ? -1 : 0),
      buttons: extra.buttons ?? (down && type === "pointerdown" ? 1 : type === "pointermove" ? 1 : 0),
      screen: { x, y },
      modifiers: extra.modifiers,
      time,
      pressure: extra.pressure,
    };
  };
  const feed = (e: Parameters<typeof rec.feed>[0]) => rec.feed(e);
  const types = () => out.map((g) => (g.type === "pinch" ? `pinch:${g.phase}` : g.type));
  const take = () => out.splice(0, out.length);
  return { rec, out, timers, ev, feed, types, take, tick: (ms: number) => (time += ms) };
}
