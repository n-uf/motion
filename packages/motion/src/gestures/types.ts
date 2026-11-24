/**
 * Input types: plain event objects in, one gesture stream out. Nothing here
 * touches the DOM; the host copies the fields it needs out of PointerEvent /
 * WheelEvent / Safari's GestureEvent.
 *
 * Hit testing and routing (what is under a point, who gets a gesture) stay
 * with the host.
 */

import type { Modifiers } from "../keys";
import type { Point } from "../shapes";

export type { ModifierKey, Modifiers } from "../keys";

export type PointerKind = "mouse" | "pen" | "touch";

/** "mac": the drag modifier defaults to Cmd; "other": Alt (the OS keeps the Win/Super key) */
export type Platform = "mac" | "other";

export const NO_MODIFIERS: Readonly<Modifiers> = Object.freeze({ shift: false, alt: false, meta: false, ctrl: false });

/**
 * A pointer as the gesture stream reports it (screen, canvas, kind, buttons,
 * modifiers) plus the fields a recognizer needs: which pointer, which button
 * changed, when.
 */
export interface GesturePointer {
  screen: Point; // CSS px relative to the host's view
  canvas: Point; // the host's world units, through its camera at the time of the event (RecognizerOptions.toCanvas; else `screen`)
  kind: PointerKind;
  buttons: number; // PointerEvent.buttons bit mask
  modifiers: Modifiers;
  pointerId: number;
  /** PointerEvent.button: 0 primary, 1 middle, 2 secondary (a pen's barrel button), 5 eraser; -1 none changed */
  button: number;
  time: number; // event timeStamp, ms
  pressure?: number;
}

// ----------------------------------------------------------------------------
// Raw events (copied out of DOM events by the host)
// ----------------------------------------------------------------------------

export type RawPointerType = "pointerdown" | "pointermove" | "pointerup" | "pointercancel" | "lostpointercapture";

export interface RawPointerEvent {
  type: RawPointerType;
  pointerId: number;
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- `PointerKind | string` is deliberate: the known kinds show up as suggestions, any other string is accepted; the published types must stay as they are
  pointerType: PointerKind | string; // unknown types are treated as mouse
  isPrimary?: boolean;
  button: number;
  buttons: number;
  screen: Point; // clientX/Y minus the view's origin
  modifiers?: Partial<Modifiers>;
  time: number;
  pressure?: number;
  /**
   * lostpointercapture only: whose capture was lost. "content" (an element inside the view's content, e.g.
   * right after the host took the pointer for a modifier-drag) leaves the gesture alone; default "view".
   */
  lostBy?: "view" | "content";
}

export interface RawWheelEvent {
  type: "wheel";
  deltaX: number;
  deltaY: number;
  /** 0 pixels, 1 lines, 2 pages */
  deltaMode: 0 | 1 | 2;
  screen: Point;
  modifiers?: Partial<Modifiers>;
  time: number;
}

/** Safari's trackpad pinch (GestureEvent): scale is relative to the gesture's start */
export interface RawSafariGestureEvent {
  type: "gesturestart" | "gesturechange" | "gestureend";
  scale: number;
  screen: Point;
  modifiers?: Partial<Modifiers>;
  time: number;
}

export type RawInputEvent = RawPointerEvent | RawWheelEvent | RawSafariGestureEvent;

// ----------------------------------------------------------------------------
// The gesture stream
// ----------------------------------------------------------------------------

export type CancelReason =
  | "pointercancel" // the browser or OS took the pointer (scroll, system gesture, palm rejection)
  | "lostcapture" // pointer capture lost before the pointer went up
  | "multitouch" // a second finger turned the press into a pinch
  | "missed-up" // its pointerup never came (the same pointer pressed again, or another went down long after)
  | "escape"
  | "reset" // the view lost focus, the tool changed, the host was disposed
  | (string & {});

interface PointerGestureBase {
  pointer: GesturePointer;
  /** The press that started this gesture */
  origin: GesturePointer;
}

export type InputGesture =
  /** A pointer went down (one per gesture; a second touch becomes a pinch instead) */
  | { type: "press"; pointer: GesturePointer }
  /**
   * The pointer travelled past the click threshold. What a drag means (a modifier-drag that moves or resizes, say) is
   * the host's: it reads `origin.button` and the keys held (`isHeld(pointer.modifiers, key)`).
   */
  | (PointerGestureBase & { type: "dragStart" })
  /** A move after dragStart (moves inside the threshold are not reported) */
  | (PointerGestureBase & { type: "move" })
  /** Held still past the long-press delay (touch and pen by default); at most once per press */
  | (PointerGestureBase & { type: "longPress" })
  /**
   * The pointer went up. click: it never crossed the threshold and no long press fired;
   * clickCount counts quick clicks at the same spot (2 = double click).
   */
  | (PointerGestureBase & { type: "release"; click: boolean; clickCount: number; dragged: boolean })
  | (PointerGestureBase & { type: "cancel"; reason: CancelReason; dragged: boolean })
  /** A pointer moving with no press (mouse and pen hover): cursor and chrome hover */
  | { type: "hover"; pointer: GesturePointer }
  /**
   * Two fingers (touch) or a trackpad pinch. scale is the change since the last update (multiply it in);
   * pan is the center's screen-px change since the last update. kind is what was recognized first.
   */
  | {
      type: "pinch";
      phase: "start" | "update" | "end" | "cancel";
      source: "touch" | "trackpad";
      kind: "pinch" | "pan";
      center: { screen: Point; canvas: Point };
      scale: number;
      pan: Point;
      modifiers: Modifiers;
      time: number;
    }
  /** A wheel or trackpad scroll that is not a pinch: delta in screen px (lines and pages converted) */
  | { type: "scroll"; delta: Point; at: { screen: Point; canvas: Point }; modifiers: Modifiers; time: number }
  /**
   * Zoom by a factor around a point: Cmd/Ctrl+wheel, a trackpad pinch reported as ctrl+wheel
   * (Chrome, Firefox, Edge). Safari's trackpad pinch comes as "pinch" with source "trackpad".
   */
  | { type: "zoom"; factor: number; at: { screen: Point; canvas: Point }; modifiers: Modifiers; time: number };

export type InputGestureType = InputGesture["type"];
