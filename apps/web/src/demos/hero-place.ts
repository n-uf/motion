/**
 * The home hero's placement illustration: "numbers in, rects out", three rows, each one real placement call. Left, the
 * call's inputs as plain numbers; right, the rects it returns, drawn to scale. Static, and computed here at build time by the
 * functions themselves (`positionPopup` from `@n-uf/placement/popup`, `fitStack` from `/stack`, `masterStack` from
 * `/tiling`); no rect is placed by hand. Placement knows no window, no panel and no app: it takes numbers and returns rects.
 */
import type { Rect } from "@n-uf/placement";
import { BELOW_LEFT, positionPopup } from "@n-uf/placement/popup";
import { fitStack, type StackForm } from "@n-uf/placement/stack";
import { masterStack } from "@n-uf/placement/tiling";

/** A rect to draw, and how: the bounds or area it lives in, an anchor, or a placed result. */
interface Shape {
  readonly kind: "area" | "anchor" | "result" | "ghost";
  readonly rect: Rect;
}
export interface Row {
  readonly fn: string;
  /** The call's inputs, one per line. */
  readonly inputs: readonly string[];
  /** What the call returned, in numbers, one per line. */
  readonly outputs: readonly string[];
  /** The drawing's own size, in px (drawn scaled to fit its column). */
  readonly box: { readonly width: number; readonly height: number };
  readonly shapes: readonly Shape[];
}

const rect = (r: Rect): string => `${Math.round(r.width)}×${Math.round(r.height)} at ${Math.round(r.x)}, ${Math.round(r.y)}`;
const size = (r: Rect): string => `${Math.round(r.width)}×${Math.round(r.height)}`;

/** 1. A popup under its anchor, where below does not fit: it flips up. */
function popupRow(): Row {
  const bounds: Rect = { x: 0, y: 0, width: 160, height: 100 };
  const anchor: Rect = { x: 62, y: 68, width: 36, height: 16 };
  const popup = { width: 70, height: 40 };
  const rule = { ...BELOW_LEFT, slide: false, resize: false };
  const placed = positionPopup(anchor, popup, bounds, rule);
  const asked = positionPopup(anchor, popup, bounds, { ...rule, flip: false }).rect;
  return {
    fn: "positionPopup",
    inputs: [`anchor ${rect(anchor)}`, `popup ${size({ x: 0, y: 0, ...popup })}`, `bounds ${size(bounds)}`, "rule: below + 6, flip only"],
    outputs: [`rect ${rect(placed.rect)}`, placed.flipped.y ? "flipped up" : "below"],
    // Room under the bounds for the ghost, which crosses their bottom edge.
    box: { width: bounds.width, height: bounds.height + 36 },
    shapes: [{ kind: "area", rect: bounds }, { kind: "ghost", rect: asked }, { kind: "anchor", rect: anchor }, { kind: "result", rect: placed.rect }],
  };
}

/** 2. A row of four items in a room too short for all of them at full size: some step down to their icon. */
function stackRow(): Row {
  const form = (kind: StackForm["kind"], main: number): StackForm => ({ kind, main: { min: main, natural: main }, cross: { natural: 28 } });
  const items = ["a", "b", "c", "d"].map((id, i) => ({ id, used: i + 1, forms: [form("row", 70), form("icons", 28)] }));
  const room = 244;
  const fit = fitStack({ axis: "row", length: room, cross: { min: 28, max: 28 }, items, gap: 6 });
  const full = fit.items.filter((p) => p.kind === "row").length;
  const icons = fit.items.filter((p) => p.kind === "icons").length;
  return {
    fn: "fitStack",
    inputs: ["4 items in a row", "each 70 wide, or 28 as an icon", `room ${room}, gap 6`],
    outputs: [`${full} full · ${icons} icons`, `widths ${fit.items.map((p) => Math.round(p.rect.width)).join(" ")}`],
    box: { width: room, height: fit.cross },
    shapes: [{ kind: "area", rect: { x: 0, y: 0, width: room, height: fit.cross } }, ...fit.items.map((p) => ({ kind: "result" as const, rect: p.rect }))],
  };
}

/** 3. Three panes in an area: master and stack. */
function tilesRow(): Row {
  const area: Rect = { x: 0, y: 0, width: 400, height: 240 };
  const panes = masterStack(["a", "b", "c"], area, { gap: 6 });
  const rects = [...panes.values()];
  return {
    fn: "masterStack",
    inputs: ["3 panes", `area ${size(area)}`, "gap 6"],
    outputs: rects.map((r) => size(r)),
    box: { width: area.width, height: area.height },
    shapes: [{ kind: "area", rect: area }, ...rects.map((r) => ({ kind: "result" as const, rect: r }))],
  };
}

export const ROWS: readonly Row[] = [popupRow(), stackRow(), tilesRow()];
