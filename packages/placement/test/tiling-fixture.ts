/** Shared helpers of the tiling tests: seeded random split trees and the checks every layout has to pass. */
import { overlap, type Rect, type Side } from "../index";
import type { Split } from "../src/tiling";
import { seeded, shuffle } from "./stack-fixture";

export { seeded };

type Branch = Exclude<Split<number>, { readonly pane: number }>;

export interface TreeShape {
  /** Chance a split carries its own axis (else it divides the longer side). */
  readonly axis?: number;
  /** Chance a split carries a gap of its own. */
  readonly gap?: number;
  /** Chance a split carries an id (`s<n>`, unique in the tree). */
  readonly id?: number;
  /** Chance a split lays its panes out as master and stack. */
  readonly master?: number;
  /** Chance a ratio is left out. */
  readonly noRatio?: number;
}

const SIDES: readonly Side[] = ["left", "right", "top", "bottom"];

/** A random tree over panes 0..n-1 (shuffled). */
export function randomTree(rnd: () => number, n: number, shape: TreeShape = {}): Split<number> {
  const ids = shuffle(rnd, Array.from({ length: n }, (_, i) => i));
  let next = 0;
  const grow = (panes: readonly number[]): Split<number> => {
    if (panes.length === 1) return { pane: panes[0]! };
    const cut = 1 + Math.floor(rnd() * (panes.length - 1));
    const axis = rnd() < (shape.axis ?? 0.7) ? (rnd() < 0.5 ? "x" : "y") : undefined;
    const ratio = rnd() < (shape.noRatio ?? 0.2) ? undefined : 0.02 + rnd() * 0.96;
    const gap = rnd() < (shape.gap ?? 0) ? Math.floor(rnd() * 14) : undefined;
    const id = rnd() < (shape.id ?? 0) ? `s${next++}` : undefined;
    const master = rnd() < (shape.master ?? 0) ? { count: 1 + Math.floor(rnd() * 3), side: SIDES[Math.floor(rnd() * 4)]! } : undefined;
    const node: Branch = {
      a: grow(panes.slice(0, cut)),
      b: grow(panes.slice(cut)),
      ...(axis ? { axis } : {}),
      ...(ratio === undefined ? {} : { ratio }),
      ...(gap === undefined ? {} : { gap }),
      ...(id === undefined ? {} : { id }),
      ...(master ? { master } : {}),
    };
    return node;
  };
  return grow(ids);
}

/**
 * The problems of a layout: a negative size, a pane outside `whole`, two panes overlapping. Empty when it is sound. A
 * pane of no size may sit up to half a gutter past the end, so only panes with room are held inside.
 */
export function unsound(rects: readonly Rect[], whole: Rect, e = 1e-6): string[] {
  const out: string[] = [];
  rects.forEach((r, i) => {
    if (!(r.width >= 0) || !(r.height >= 0)) out.push(`size ${i}: ${JSON.stringify(r)}`);
    if (r.width === 0 || r.height === 0) return;
    if (r.x < whole.x - e || r.y < whole.y - e || r.x + r.width > whole.x + whole.width + e || r.y + r.height > whole.y + whole.height + e) out.push(`outside ${i}: ${JSON.stringify(r)}`);
  });
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (overlap(rects[i]!, rects[j]!) > e) out.push(`overlap ${i} ${j}`);
  return out;
}

/** The same rect, to a nano px. */
export const same = (a: Rect, b: Rect): boolean => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9 && Math.abs(a.width - b.width) < 1e-9 && Math.abs(a.height - b.height) < 1e-9;
