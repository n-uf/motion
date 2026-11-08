/**
 * Wheel normalisation (Figma / tldraw style): lines and pages to pixels;
 * Cmd/Ctrl+wheel and the trackpad pinch (ctrl+wheel in Chrome, Firefox, Edge)
 * zoom by 2^(−dy / sensitivity); any other wheel scrolls, Shift turns
 * vertical into horizontal.
 */

import type { Point } from "../shapes";
import type { Modifiers } from "./types";

export interface WheelOptions {
  /** px per line (deltaMode 1); default 40 */
  lineHeight: number;
  /** px per page (deltaMode 2); default 800 */
  pageHeight: number;
  /** zoom factor = 2^(−deltaY / sensitivity); default 300 */
  zoomSensitivity: number;
}

export const WHEEL_DEFAULTS: Readonly<WheelOptions> = Object.freeze({ lineHeight: 40, pageHeight: 800, zoomSensitivity: 300 });

export function wheelDeltaPx(deltaX: number, deltaY: number, deltaMode: 0 | 1 | 2, opts: WheelOptions = WHEEL_DEFAULTS): Point {
  const k = deltaMode === 1 ? opts.lineHeight : deltaMode === 2 ? opts.pageHeight : 1;
  return { x: finite(deltaX) * k, y: finite(deltaY) * k };
}

export type WheelIntent = { kind: "zoom"; factor: number } | { kind: "scroll"; delta: Point };

/**
 * What a wheel event means. Ctrl or Meta held: zoom (a trackpad pinch arrives as ctrl+wheel).
 * Otherwise scroll; with Shift a vertical-only delta scrolls horizontally (mice without a
 * horizontal wheel).
 */
export function classifyWheel(delta: Point, modifiers: Modifiers, opts: WheelOptions = WHEEL_DEFAULTS): WheelIntent {
  if (modifiers.ctrl || modifiers.meta) {
    const factor = Math.pow(2, -delta.y / (opts.zoomSensitivity > 0 ? opts.zoomSensitivity : WHEEL_DEFAULTS.zoomSensitivity));
    return { kind: "zoom", factor: Number.isFinite(factor) && factor > 0 ? factor : 1 };
  }
  if (modifiers.shift && delta.x === 0) return { kind: "scroll", delta: { x: delta.y, y: 0 } };
  return { kind: "scroll", delta };
}

/** Wheel pan damping for a camera that pans on scroll */
export interface WheelPanOptions {
  /** Multiplier on the wheel's px; default 0.65 */
  speed: number;
  /** Linear up to this many px per event; default 30 */
  threshold: number;
  /** Hard cap per event, px; default 60 */
  max: number;
}

export const WHEEL_PAN_DEFAULTS: Readonly<WheelPanOptions> = Object.freeze({ speed: 0.65, threshold: 30, max: 60 });

/**
 * The camera pan for one wheel scroll, per axis: speed × delta, linear up to the threshold, then
 * square-root damped (threshold + √(4 × excess)) and capped, so a fast flick of a free-spinning wheel or an
 * accelerated trackpad doesn't throw the canvas away.
 */
export function dampWheelPan(delta: Point, opts: WheelPanOptions = WHEEL_PAN_DEFAULTS): Point {
  const one = (d: number) => {
    const v = finite(d) * opts.speed;
    const abs = Math.abs(v);
    if (abs <= opts.threshold) return v;
    return Math.sign(v) * Math.min(opts.threshold + Math.sqrt((abs - opts.threshold) * 4), opts.max);
  };
  return { x: one(delta.x), y: one(delta.y) };
}

function finite(v: number): number {
  return Number.isFinite(v) ? v : 0;
}
