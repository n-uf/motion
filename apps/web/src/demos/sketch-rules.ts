/**
 * The rules of the sketches the docking-layouts page draws itself (the layouts the library does not lay out): where a
 * floated tile goes and how wide a scrolling column is.
 */
import type { Rect } from "@n-uf/placement";

/** The 22 px each further float steps down and right, and how far the first sits under the toolbar band. */
const FLOAT_STEP = 22;
const FLOAT_DROP = 40;

/**
 * Where the `k`-th tile floated out of a tiling tree goes on a stage `W` wide whose toolbar band ends at `top`: centered
 * across, `FLOAT_DROP` under the band, each further float a step down and right.
 */
export function floatSpot(W: number, top: number, size: { width: number; height: number }, k: number): Rect {
  return { x: W / 2 - size.width / 2 + FLOAT_STEP * k, y: top + FLOAT_DROP + FLOAT_STEP * k, ...size };
}

/** A scrolling strip's column width on a stage `W` wide: half the stage, 360 to 520 px. */
export const stripColumn = (W: number): number => Math.max(360, Math.min(520, W * 0.5));
