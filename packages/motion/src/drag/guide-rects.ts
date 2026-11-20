import type { Rect } from "../shapes";

/** A guide to place: any record with a `kind` and a `rect` (a landing model's `LandingGuide`, a lane's marks). */
export interface PlacedGuide {
  readonly kind: "line" | "box" | "hatch";
  readonly rect: Rect;
}

export interface GuideRectsOptions {
  /** The area guides are drawn in: the window's inside (inside its border), px. */
  readonly inside: Rect;
  /** How far inside `inside` every guide stays, px (default 2). */
  readonly inset?: number;
  /** Rects a thin guide stays clear of (the content: a column's panels under an empty lane's thin edge). */
  readonly clear?: readonly Rect[];
  /** The least thickness a thin guide keeps, px (default 2); thinner, it is not drawn. */
  readonly minThickness?: number;
}

const EPS = 1e-6;

/**
 * Where to draw guides: every guide inside `inside` by `inset`. A box is clipped. A thin guide (a line, a striped
 * strip or end: its shorter side is its thickness) keeps its thickness and moves inside rather than being clipped, so
 * a line at a lane's far end is as thick as at its head. Then it is thinned, from the content side, to stay clear of
 * `clear`, so a thin strip at the window's side lies between the inset and the content, the same on both sides. A
 * guide with nothing left (or a thin one under `minThickness`) is left out. Pure; the guides come back as given with
 * their placed `rect`.
 */
export function guideRects<G extends PlacedGuide>(guides: readonly G[], options: GuideRectsOptions): G[] {
  const inset = Math.max(0, options.inset ?? 2);
  const min = Math.max(0, options.minThickness ?? 2);
  const x0 = options.inside.x + inset;
  const y0 = options.inside.y + inset;
  const x1 = options.inside.x + options.inside.width - inset;
  const y1 = options.inside.y + options.inside.height - inset;
  const clear = options.clear ?? [];
  const out: G[] = [];
  for (const g of guides) {
    const r = g.rect;
    if (g.kind === "box") {
      const a = Math.max(r.x, x0);
      const b = Math.max(r.y, y0);
      const c = Math.min(r.x + r.width, x1);
      const d = Math.min(r.y + r.height, y1);
      if (c - a > EPS && d - b > EPS) out.push({ ...g, rect: { x: a, y: b, width: c - a, height: d - b } });
      continue;
    }
    // A thin guide: thick along one axis (its shorter side), long along the other.
    const thinX = r.width <= r.height;
    // Along its thickness: moved inside whole; along its length: clipped.
    const t = thinX ? r.width : r.height;
    let lo = thinX ? r.x : r.y;
    const lim0 = thinX ? x0 : y0;
    const lim1 = thinX ? x1 : y1;
    if (lo + t > lim1) lo = lim1 - t;
    if (lo < lim0) lo = lim0;
    let hi = Math.min(lo + t, lim1);
    const s0 = Math.max(thinX ? r.y : r.x, thinX ? y0 : x0);
    const s1 = Math.min(thinX ? r.y + r.height : r.x + r.width, thinX ? y1 : x1);
    if (s1 - s0 <= EPS) continue;
    // Clear of what it must not cover: cut from the side the clear rect lies on.
    for (const c of clear) {
      const cs0 = thinX ? c.y : c.x;
      const cs1 = thinX ? c.y + c.height : c.x + c.width;
      if (cs1 <= s0 + EPS || cs0 >= s1 - EPS) continue;
      const c0 = thinX ? c.x : c.y;
      const c1 = thinX ? c.x + c.width : c.y + c.height;
      if (c1 <= lo + EPS || c0 >= hi - EPS) continue;
      // Keep the side away from the clear rect's middle.
      if ((c0 + c1) / 2 >= (lo + hi) / 2) hi = Math.min(hi, c0);
      else lo = Math.max(lo, c1);
    }
    if (hi - lo < Math.max(EPS, min)) continue;
    out.push({ ...g, rect: thinX ? { x: lo, y: s0, width: hi - lo, height: s1 - s0 } : { x: s0, y: lo, width: s1 - s0, height: hi - lo } });
  }
  return out;
}
