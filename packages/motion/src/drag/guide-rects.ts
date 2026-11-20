import type { Rect } from "../shapes";

/** A guide to place: any record with a `kind` and a `rect` (a landing model's `LandingGuide`, a lane's marks). */
export interface PlacedGuide {
  readonly kind: "line" | "box" | "hatch";
  readonly rect: Rect;
}

/** A rect guides stay clear of, with a clearance of its own, px (0: guides may lie flush against it). */
export interface ClearRect {
  readonly rect: Rect;
  readonly clearance: number;
  /**
   * The guide kinds this rect constrains (default: all). Content a thin guide keeps clear of, but an empty lane's
   * real-size box lies over (it moves the content aside), is `kinds: ["line", "hatch"]`.
   */
  readonly kinds?: readonly PlacedGuide["kind"][];
}

export interface GuideRectsOptions {
  /** The area guides are drawn in: the window's inside (inside its border), px. */
  readonly inside: Rect;
  /** How far inside `inside` every guide stays, px (default 2). */
  readonly inset?: number;
  /**
   * Rects guides stay clear of. A plain `Rect` keeps `clearance` px (the default gap) for every kind: something guides
   * must keep apart from, such as the held item's outline. `{ rect, clearance, kinds? }` keeps its own, for the kinds
   * it names: `{ rect, clearance: 0, kinds: ["line", "hatch"] }` is a boundary a thin guide may run flush against (the
   * content: a column's panels under an empty lane's thin edge) while a box may still lie over it.
   */
  readonly clear?: readonly (Rect | ClearRect)[];
  /** How far clear of a plain `clear` rect a guide stays, px (default 2): "clear of" means at least this far. */
  readonly clearance?: number;
  /** The least thickness a thin guide keeps, px (default 2); thinner, it is not drawn. */
  readonly minThickness?: number;
}

const EPS = 1e-6;

/**
 * Where to draw guides: every guide inside `inside` by `inset`, and at least `clearance` px clear of every `clear` rect
 * ("clear of" means at least that far: a plain rect keeps the options' `clearance`, default 2; `{ rect, clearance }`
 * keeps its own, so pass `{ rect, clearance: 0 }` for content a thin guide may run flush against, and `kinds` to
 * constrain only some kinds of guide, default all). A box is clipped,
 * then cut on the side that faces each clear rect (the clear rect grown by its clearance is taken out of it, and the
 * largest remaining part, left, right, above or below, is kept). A thin guide (a line, a striped strip or end: its
 * shorter side is its thickness) keeps its thickness and moves inside rather than being clipped, so a line at a lane's
 * far end is as thick as at its head. Then it is thinned, from the content side, to stay that far clear of `clear`, so
 * a thin strip at the window's side lies between the inset and the content, the same on both sides. A guide with nothing left (or a thin one under `minThickness`) is left out. Pure; the guides come
 * back as given with their placed `rect`, the same object where nothing moved.
 */
export function guideRects<G extends PlacedGuide>(guides: readonly G[], options: GuideRectsOptions): G[] {
  const inset = Number.isFinite(options.inset) ? Math.max(0, options.inset!) : 2;
  const min = Number.isFinite(options.minThickness) ? Math.max(0, options.minThickness!) : 2;
  // A guide placed where it already was comes back as given (the same rect object), so a host can key on it.
  const same = (a: Rect, b: Rect): boolean => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS && Math.abs(a.width - b.width) < EPS && Math.abs(a.height - b.height) < EPS;
  const place = (g: G, rect: Rect): G => (same(g.rect, rect) ? g : { ...g, rect });
  const x0 = options.inside.x + inset;
  const y0 = options.inside.y + inset;
  const x1 = options.inside.x + options.inside.width - inset;
  const y1 = options.inside.y + options.inside.height - inset;
  const gap = Number.isFinite(options.clearance) ? Math.max(0, options.clearance!) : 2;
  // Each clear rect with the gap it keeps: its own, or the options' for a plain one.
  const allClear = (options.clear ?? []).map((c): { k: Rect; gap: number; kinds?: readonly PlacedGuide["kind"][] } =>
    "rect" in c ? { k: c.rect, gap: Number.isFinite(c.clearance) ? Math.max(0, c.clearance) : gap, ...(c.kinds ? { kinds: c.kinds } : {}) } : { k: c, gap },
  );
  const out: G[] = [];
  for (const g of guides) {
    const r = g.rect;
    // The clear rects that constrain this kind of guide.
    const clear = allClear.filter((c) => !c.kinds || c.kinds.includes(g.kind));
    if (g.kind === "box") {
      let a = Math.max(r.x, x0);
      let b = Math.max(r.y, y0);
      let c = Math.min(r.x + r.width, x1);
      let d = Math.min(r.y + r.height, y1);
      // Clear of what it must not cover: each clear rect, grown by the clearance, is taken out of the box, and the
      // largest part left of it (left, right, above or below) is kept.
      for (const { k, gap } of clear) {
        const k0 = k.x - gap;
        const k1 = k.x + k.width + gap;
        const l0 = k.y - gap;
        const l1 = k.y + k.height + gap;
        if (c - a <= EPS || d - b <= EPS) break;
        if (k1 <= a + EPS || k0 >= c - EPS || l1 <= b + EPS || l0 >= d - EPS) continue;
        const parts = [
          { a, b, c: Math.min(c, k0), d },
          { a: Math.max(a, k1), b, c, d },
          { a, b, c, d: Math.min(d, l0) },
          { a, b: Math.max(b, l1), c, d },
        ].filter((p) => p.c - p.a > EPS && p.d - p.b > EPS);
        if (parts.length === 0) {
          c = a;
          break;
        }
        const best = parts.reduce((p, q) => ((q.c - q.a) * (q.d - q.b) > (p.c - p.a) * (p.d - p.b) ? q : p));
        ({ a, b, c, d } = best);
      }
      if (c - a > EPS && d - b > EPS) out.push(place(g, { x: a, y: b, width: c - a, height: d - b }));
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
    // Clear of what it must not cover: cut from the side the clear rect (grown by the clearance) lies on.
    for (const { k: c, gap } of clear) {
      const cs0 = (thinX ? c.y : c.x) - gap;
      const cs1 = (thinX ? c.y + c.height : c.x + c.width) + gap;
      if (cs1 <= s0 + EPS || cs0 >= s1 - EPS) continue;
      const c0 = (thinX ? c.x : c.y) - gap;
      const c1 = (thinX ? c.x + c.width : c.y + c.height) + gap;
      if (c1 <= lo + EPS || c0 >= hi - EPS) continue;
      // Keep the side away from the clear rect's middle.
      if ((c0 + c1) / 2 >= (lo + hi) / 2) hi = Math.min(hi, c0);
      else lo = Math.max(lo, c1);
    }
    if (hi - lo < Math.max(EPS, min)) continue;
    out.push(place(g, thinX ? { x: lo, y: s0, width: hi - lo, height: s1 - s0 } : { x: s0, y: lo, width: s1 - s0, height: hi - lo }));
  }
  return out;
}
