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
  /**
   * The least length a part of a box cut across its whole thickness keeps, px (default 8, `MIN_BOX_LENGTH`); shorter,
   * that part is not drawn.
   */
  readonly minLength?: number;
}

/** The least length, px, a box part left by a clear rect across its whole thickness keeps (`minLength`'s default). */
export const MIN_BOX_LENGTH = 8;

const EPS = 1e-6;

/**
 * Where to draw guides: every guide inside `inside` by `inset`, and at least `clearance` px clear of every `clear` rect
 * ("clear of" means at least that far: a plain rect keeps the options' `clearance`, default 2; `{ rect, clearance }`
 * keeps its own, so pass `{ rect, clearance: 0 }` for content a thin guide may run flush against, and `kinds` to
 * constrain only some kinds of guide, default all). A box is clipped,
 * then each clear rect, grown by its clearance, is taken out of it. One across the box's whole thickness leaves the
 * part before it and the part after it along the box's length, each kept from `minLength` px (default 8,
 * `MIN_BOX_LENGTH`): inside the box (the held item's outline sliding inside its room), both; over one end, the other.
 * One over only part of the thickness (a corner) cuts it on the side that faces it, the largest part kept (no
 * L-shapes). A box cut in two comes back as two guides in order along it: the first keeps the guide's `id`, the second
 * gets `<id>#2` (further parts `#3`, ...), so a host keys each part by its id. A thin guide (a line, a striped strip or end: its
 * shorter side is its thickness) keeps its thickness and moves inside rather than being clipped, so a line at a lane's
 * far end is as thick as at its head. Then it is thinned, from the content side, to stay that far clear of `clear`, so
 * a thin strip at the window's side lies between the inset and the content, the same on both sides. A guide with nothing left (or a thin one under `minThickness`) is left out. A clear rect whose x, y, width or height isn't finite is ignored. Pure; the guides come
 * back as given with their placed `rect`, the same object where nothing moved.
 */
export function guideRects<G extends PlacedGuide>(guides: readonly G[], options: GuideRectsOptions): G[] {
  const inset = Number.isFinite(options.inset) ? Math.max(0, options.inset!) : 2;
  const min = Number.isFinite(options.minThickness) ? Math.max(0, options.minThickness!) : 2;
  const minLength = Number.isFinite(options.minLength) ? Math.max(0, options.minLength!) : MIN_BOX_LENGTH;
  // A guide placed where it already was comes back as given (the same rect object), so a host can key on it.
  const same = (a: Rect, b: Rect): boolean => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS && Math.abs(a.width - b.width) < EPS && Math.abs(a.height - b.height) < EPS;
  const place = (g: G, rect: Rect): G => (same(g.rect, rect) ? g : { ...g, rect });
  const x0 = options.inside.x + inset;
  const y0 = options.inside.y + inset;
  const x1 = options.inside.x + options.inside.width - inset;
  const y1 = options.inside.y + options.inside.height - inset;
  const gap = Number.isFinite(options.clearance) ? Math.max(0, options.clearance!) : 2;
  // Each clear rect with the gap it keeps: its own, or the options' for a plain one. One whose x, y, width or height
  // isn't finite is ignored (it would take every box out and give thin guides non-finite fields).
  const finite = (r: Rect): boolean => Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.width) && Number.isFinite(r.height);
  const allClear = (options.clear ?? [])
    .map((c): { k: Rect; gap: number; kinds?: readonly PlacedGuide["kind"][] } =>
      "rect" in c ? { k: c.rect, gap: Number.isFinite(c.clearance) ? Math.max(0, c.clearance) : gap, ...(c.kinds ? { kinds: c.kinds } : {}) } : { k: c, gap },
    )
    .filter((c) => finite(c.k));
  const out: G[] = [];
  for (const g of guides) {
    const r = g.rect;
    // The clear rects that constrain this kind of guide.
    const clear = allClear.filter((c) => !c.kinds || c.kinds.includes(g.kind));
    if (g.kind === "box") {
      type Part = { a: number; b: number; c: number; d: number };
      let parts: Part[] = [{ a: Math.max(r.x, x0), b: Math.max(r.y, y0), c: Math.min(r.x + r.width, x1), d: Math.min(r.y + r.height, y1) }];
      // Clear of what it must not cover: each clear rect, grown by the clearance, is taken out of each part of the box.
      for (const { k, gap } of clear) {
        const k0 = k.x - gap;
        const k1 = k.x + k.width + gap;
        const l0 = k.y - gap;
        const l1 = k.y + k.height + gap;
        parts = parts.flatMap((p): Part[] => {
          const { a, b, c, d } = p;
          if (k1 <= a + EPS || k0 >= c - EPS || l1 <= b + EPS || l0 >= d - EPS) return [p];
          // Across the part's whole thickness: the parts before and after it along its length, each kept from
          // `minLength` (a clear rect inside the box leaves both, one over an end the other).
          const alongX = c - a >= d - b;
          if (alongX ? l0 <= b + EPS && l1 >= d - EPS : k0 <= a + EPS && k1 >= c - EPS) {
            const pieces = alongX ? [{ a, b, c: Math.min(c, k0), d }, { a: Math.max(a, k1), b, c, d }] : [{ a, b, c, d: Math.min(d, l0) }, { a, b: Math.max(b, l1), c, d }];
            return pieces.filter((q) => (alongX ? q.c - q.a : q.d - q.b) >= Math.max(EPS, minLength - EPS));
          }
          // Over part of its thickness (a corner): cut on the side that faces it, the largest part kept (no L-shapes).
          const cut = [
            { a, b, c: Math.min(c, k0), d },
            { a: Math.max(a, k1), b, c, d },
            { a, b, c, d: Math.min(d, l0) },
            { a, b: Math.max(b, l1), c, d },
          ].filter((q) => q.c - q.a > EPS && q.d - q.b > EPS);
          return cut.length === 0 ? [] : [cut.reduce((q, s) => ((s.c - s.a) * (s.d - s.b) > (q.c - q.a) * (q.d - q.b) ? s : q))];
        });
      }
      // In order along the box; the first keeps the guide's id, every further part takes `<id>#<n>`.
      const kept = parts.filter((p) => p.c - p.a > EPS && p.d - p.b > EPS).sort((p, q) => p.a - q.a || p.b - q.b);
      kept.forEach((p, i) => {
        const placed = place(g, { x: p.a, y: p.b, width: p.c - p.a, height: p.d - p.b });
        const id = (g as { id?: unknown }).id;
        out.push(i === 0 ? placed : ({ ...placed, ...(typeof id === "string" ? { id: `${id}#${i + 1}` } : {}) } as G));
      });
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
