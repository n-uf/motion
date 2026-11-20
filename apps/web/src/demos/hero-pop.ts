/**
 * The home hero's placement diagram: four small cases of one rule, each one call of `positionPopup` from
 * `@n-uf/placement`. The rule is the same in all four (the popup's top-center on the anchor's bottom-center, extending
 * down, flip and slide and resize on) and so is the popup's size; only the anchor and the bounds differ. Static: the
 * server draws what the function returns (components/HeroPop.astro). Placement is separate functions, one job each: this
 * one is given rects and a rule and returns a rect.
 */
import { positionPopup, type PositionerRule, type Positioned, type Rect } from "@n-uf/placement";

/** Each case's box, in its own px (drawn at about this size). */
export const CASE = { width: 176, height: 140 };
const POPUP ={ width: 76, height: 44 };
export const ANCHOR = { width: 36, height: 16 };

/** The one rule: anchor bottom-center, gravity down, 6 px apart; flip, slide and resize on. */
const RULE: PositionerRule = { anchor: { x: 0, y: 1 }, gravity: { x: 0, y: 1 }, offset: { x: 0, y: 6 }, flip: true, slide: true, resize: true };

export interface Case {
  readonly n: number;
  readonly bounds: Rect;
  readonly anchor: Rect;
  readonly result: Positioned;
  /** Where the rule asked for the popup before any adjustment; null when that was where it went. */
  readonly ghost: Rect | null;
  /** What happened, from `Positioned`. */
  readonly said: string;
}

const at = (x: number, y: number): Rect => ({ x, y, ...ANCHOR });
const B: Rect = { x: 18, y: 6, width: 140, height: 104 };

const asked = (anchor: Rect, bounds: Rect): Rect => positionPopup(anchor, POPUP, bounds, { ...RULE, flip: false, slide: false, resize: false }).rect;
const same = (a: Rect, b: Rect): boolean => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;

/** What `Positioned` says, in words. */
function said(p: Positioned, ghost: Rect | null): string {
  if (p.resized) return "resized to fit";
  if (p.flipped.y) return "flipped up";
  if (p.slid.x && ghost) return p.rect.x < ghost.x ? "slid left" : "slid right";
  if (p.slid.y && ghost) return p.rect.y < ghost.y ? "slid up" : "slid down";
  return "below";
}

function make(n: number, bounds: Rect, anchor: Rect): Case {
  const result = positionPopup(anchor, POPUP, bounds, RULE);
  const want = asked(anchor, bounds);
  const ghost = same(want, result.rect) ? null : want;
  return { n, bounds, anchor, result, ghost, said: said(result, ghost) };
}

/** The four cases: room below, the anchor near the bottom, the anchor at the right edge, bounds smaller than the popup. */
export const CASES: readonly Case[] = [
  make(1, B, at(70, 14)),
  make(2, B, at(70, 72)),
  make(3, B, at(118, 14)),
  make(4, { x: 58, y: 6, width: 60, height: 104 }, at(70, 14)),
];
