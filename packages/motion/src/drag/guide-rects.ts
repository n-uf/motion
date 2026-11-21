import type { Rect } from "../shapes";

/** A guide to place: any record with a `kind` and a `rect` (a landing model's `LandingGuide`, a lane's marks). */
export interface PlacedGuide {
  readonly kind: "line" | "box" | "hatch";
  readonly rect: Rect;
  /**
   * The axis of the lane the guide marks, when the guide knows it. It only decides a box that is no longer than it is
   * thick (a square): its long side is its axis, and a square has none, so `axis` (default `"x"`) says.
   */
  readonly axis?: "x" | "y";
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
  /** The least thickness a thin guide keeps, px (default 2); thinner, it is not drawn. A box a clear rect thinned is held to it too. */
  readonly minThickness?: number;
  /**
   * The thickness a `line` guide is drawn at, px (default 2). A line thinner than this (placement gives the line
   * between two docked panels zero thickness) is widened to it, centered on its own position, before the inset, the
   * clear rects and `minThickness` apply; a line at least this thick is unchanged. Only lines are widened. `0` turns
   * the widening off: a line keeps the thickness it has, and a zero-thick one is dropped by `minThickness`.
   */
  readonly lineThickness?: number;
  /**
   * The least length, along the box's axis, a part of a box that a clear rect cut keeps, px (default 8,
   * `MIN_BOX_LENGTH`); shorter, that part is not drawn. Corner-cut parts included; a box nothing touches is kept as is.
   */
  readonly minLength?: number;
}

/** The least length, px, a box part a clear rect cut keeps (`minLength`'s default). */
export const MIN_BOX_LENGTH = 8;

const EPS = 1e-6;

/**
 * Where to draw guides: every guide inside `inside` by `inset`, and at least `clearance` px clear of every `clear` rect
 * ("clear of" means at least that far: a plain rect keeps the options' `clearance`, default 2; `{ rect, clearance }`
 * keeps its own, so pass `{ rect, clearance: 0 }` for content a thin guide may run flush against, and `kinds` to
 * constrain only some kinds of guide, default all). A box is clipped, then each clear rect, grown by its clearance, is
 * taken out of it, by one model:
 *
 * - One axis per box: its long side, decided once from the box clipped to `inside`, before any clear rect is applied
 *   (a square takes the guide's `axis`, else x). Cutting a box never turns its axis.
 * - Thinning comes first. A clear rect over only part of the thickness that reaches one side of the box thins it when
 *   its overlap across the box is smaller than its overlap along it: the box loses that thickness from that side and no
 *   length (a neighbor poking 2 px into a bar costs 2 px of thickness, not its whole length in the bar's length). The
 *   deepest intrusion from each side wins, whatever the order. Only a shallow intrusion thins, at most half the box's
 *   thickness. A box thinned below `minThickness` is dropped. A rect that pokes in deeper than half the thickness (the
 *   held outline flush with one side), as deep as it is long, or touches neither side, is a corner (below).
 * - A clear rect across the box's whole thickness (of the thinned box) is an interval along the axis, and the box less all of them is a
 *   1-D interval subtraction: inside the box (the held item's outline sliding inside its room) both sides stay, over
 *   one end the other side. The result does not depend on the order of the clear rects.
 * - A clear rect over only part of the thickness (a corner) then cuts each part on the side that faces it, the
 *   largest part kept (no L-shapes). Corners are applied by their distance along the axis (start, then end, then
 *   across), whatever the input order, so the result is the same for any order.
 * - `minLength` (default 8, `MIN_BOX_LENGTH`) is applied once at the end, along the axis, to every part a clear rect
 *   cut, corner-cut ones included. A part nothing touched is the clipped box and is kept at any length.
 * - Ids follow the side, not the rank: a part keeps the guide's `id` when no interior cut lies before it along the
 *   axis, and gets `<id>#<k + 1>` when k of them do. A cut is a full-thickness clear interval strictly inside the box
 *   (box length on both sides of it); overlapping or touching ones count as one, and one that touches or overlaps the
 *   box's start or end only trims the box, it is no cut (a neighbor flush with the box's start, grown by its clearance,
 *   leaves the part before a held rect as `<id>`). The part before a cut is always `<id>`, the part after one cut
 *   always `<id>#2`, whether or not the part before survives, so a host keys each part by its id as a held item slides.
 *   The exception: while the held rect overlaps the box's start (or end) it only trims the box, so the part left is
 *   `<id>`, and it becomes `<id>#2` once the held rect lies strictly inside the box. A guide's own `id` must not end in `#` and digits
 *   (`b#2` would collide with the second part of `b`), and an `id` that is not a string is not suffixed (a split
 *   box's parts then share it: unsupported). Parts come back in order along the axis.
 *
 * A line thinner than `lineThickness` (default 2 px; a zero-thick line is a place between two things, a joint) is first
 * widened to it, centered on its own position, so the inset, the clear rects and `minThickness` below see a line of that
 * thickness; `lineThickness: 0` leaves lines as given. A thin guide (a line, a striped strip or end: its
 * shorter side is its thickness) keeps its thickness and moves inside rather than being clipped, so a line at a lane's
 * far end is as thick as at its head. A clear rect over its thickness that meets only one end of its length (it covers the
 * guide's start or its end, not both) shortens it, as it trims a box: the guide keeps the part away from the rect, at
 * least `minLength` long, else it is left out; a toolbar over the last 10 px of a column's line costs 10 px of length
 * (and the clearance), not the line. Then it is thinned, from the content side, to stay that far clear of the rects
 * over its middle (or over all of its length), so a thin strip at the window's side lies between the inset and the
 * content, the same on both sides. A guide with nothing left (or a thin one under `minThickness`) is left out. A clear rect whose x, y, width or height isn't finite is ignored. Pure; the guides come
 * back as given with their placed `rect`, the same object where nothing moved.
 */
export function guideRects<G extends PlacedGuide>(guides: readonly G[], options: GuideRectsOptions): G[] {
  const inset = Number.isFinite(options.inset) ? Math.max(0, options.inset!) : 2;
  const min = Number.isFinite(options.minThickness) ? Math.max(0, options.minThickness!) : 2;
  const lineThickness = Number.isFinite(options.lineThickness) ? Math.max(0, options.lineThickness!) : 2;
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
      type Box = { a: number; b: number; c: number; d: number };
      // The box clipped to `inside`. Its axis is its long side, decided here once (a square: the guide's `axis`, else
      // x), before any clear rect is applied, so cutting it never turns the axis.
      const box: Box = { a: Math.max(r.x, x0), b: Math.max(r.y, y0), c: Math.min(r.x + r.width, x1), d: Math.min(r.y + r.height, y1) };
      // Written as "not more than" so a non-finite box (NaN in its rect or in `inside`) is left out, never drawn as NaN.
      if (!(box.c - box.a > EPS) || !(box.d - box.b > EPS)) continue;
      const w = box.c - box.a;
      const h = box.d - box.b;
      const alongX = w > h || (w === h && (g as { axis?: unknown }).axis !== "y");
      // Axis coordinates: `s` along the box, `t` across it.
      const s0 = alongX ? box.a : box.b;
      const s1 = alongX ? box.c : box.d;
      const t0 = alongX ? box.b : box.a;
      const t1 = alongX ? box.d : box.c;
      const toBox = (p0: number, p1: number, q0: number, q1: number): Box => (alongX ? { a: p0, b: q0, c: p1, d: q1 } : { a: q0, b: p0, c: q1, d: p1 });
      // Each clear rect, grown by its clearance, that lies over the box.
      const over = clear
        .map(({ k, gap }) => ({
          x0: k.x - gap,
          x1: k.x + k.width + gap,
          y0: k.y - gap,
          y1: k.y + k.height + gap,
          s0: (alongX ? k.x : k.y) - gap,
          s1: (alongX ? k.x + k.width : k.y + k.height) + gap,
          t0: (alongX ? k.y : k.x) - gap,
          t1: (alongX ? k.y + k.height : k.x + k.width) + gap,
        }))
        .filter((k) => k.s1 > s0 + EPS && k.s0 < s1 - EPS && k.t1 > t0 + EPS && k.t0 < t1 - EPS);
      // First, thinning: a clear rect over only part of the thickness, reaching one side of the box, whose overlap across
      // is smaller than its overlap along the box, thins the box from that side by that overlap, no length lost. The
      // deepest intrusion from each side wins, so the order of the clear rects never matters. Only a shallow one thins, at
      // most half the box's thickness: a deeper one (the held outline flush with one side) is a corner, so the box never
      // shrinks to a sliver beside it.
      let v0 = t0;
      let v1 = t1;
      const half = (t1 - t0) / 2 + EPS;
      for (const k of over) {
        if (k.t0 <= t0 + EPS && k.t1 >= t1 - EPS) continue;
        const along = Math.min(k.s1, s1) - Math.max(k.s0, s0);
        if (k.t0 <= t0 + EPS) {
          if (k.t1 - t0 < along - EPS && k.t1 - t0 <= half) v0 = Math.max(v0, k.t1);
        } else if (k.t1 >= t1 - EPS) {
          if (t1 - k.t0 < along - EPS && t1 - k.t0 <= half) v1 = Math.min(v1, k.t0);
        }
      }
      // A box thinned below `minThickness` is dropped, as a thin guide is.
      if ((v0 > t0 || v1 < t1) && v1 - v0 < Math.max(EPS, min)) continue;
      // What is left to cut is judged against the thinned box: a thinning rect no longer overlaps it.
      const rest = over.filter((k) => k.t1 > v0 + EPS && k.t0 < v1 - EPS);
      const kept = toBox(s0, s1, v0, v1);
      // Across the box's whole thickness: interval subtraction along the axis (order does not matter). The cut
      // intervals, merged, split the box into parts; a part's `k` is how many intervals lie before it.
      const full = rest
        .filter((k) => k.t0 <= v0 + EPS && k.t1 >= v1 - EPS)
        .map((k): [number, number] => [Math.max(k.s0, s0), Math.min(k.s1, s1)])
        .sort((p, q) => p[0] - q[0] || p[1] - q[1]);
      const cuts: [number, number][] = [];
      for (const [lo, hi] of full) {
        const last = cuts[cuts.length - 1];
        if (last && lo <= last[1] + EPS) last[1] = Math.max(last[1], hi);
        else cuts.push([lo, hi]);
      }
      // A part's `k` counts the interior cuts before it: a cut that touches or overlaps the box's start or end trims the
      // box, it is no cut (so a neighbor flush with the box's start never renames the part before a held rect).
      const spans: { lo: number; hi: number; k: number }[] = [];
      let at = s0;
      let k = 0;
      for (const [lo, hi] of cuts) {
        if (lo - at > EPS) spans.push({ lo: at, hi: lo, k });
        if (lo > s0 + EPS && hi < s1 - EPS) k++;
        at = hi;
      }
      if (s1 - at > EPS) spans.push({ lo: at, hi: s1, k });
      // Over only part of the thickness (a corner): cut on the side that faces it, the largest part kept (no L-shapes),
      // each corner rect in turn by its distance along the axis, so the result never depends on the input order.
      const corners = rest
        .filter((k) => !(k.t0 <= v0 + EPS && k.t1 >= v1 - EPS))
        .sort((p, q) => p.s0 - q.s0 || p.s1 - q.s1 || p.t0 - q.t0 || p.t1 - q.t1);
      const longEnough = Math.max(EPS, minLength - EPS);
      for (const span of spans) {
        let p: Box | null = toBox(span.lo, span.hi, v0, v1);
        for (const k of corners) {
          const { a, b, c, d } = p;
          if (k.x1 <= a + EPS || k.x0 >= c - EPS || k.y1 <= b + EPS || k.y0 >= d - EPS) continue;
          const cut: Box[] = [
            { a, b, c: Math.min(c, k.x0), d },
            { a: Math.max(a, k.x1), b, c, d },
            { a, b, c, d: Math.min(d, k.y0) },
            { a, b: Math.max(b, k.y1), c, d },
          ].filter((q) => q.c - q.a > EPS && q.d - q.b > EPS);
          p = cut.length === 0 ? null : cut.reduce((q, s) => ((s.c - s.a) * (s.d - s.b) > (q.c - q.a) * (q.d - q.b) ? s : q));
          if (!p) break;
        }
        if (!p) continue;
        // A part a clear rect cut keeps `minLength` along the axis; a part nothing cut is the clipped box (thinned or not).
        const touched = Math.abs(p.a - kept.a) > EPS || Math.abs(p.b - kept.b) > EPS || Math.abs(p.c - kept.c) > EPS || Math.abs(p.d - kept.d) > EPS;
        if (touched && (alongX ? p.c - p.a : p.d - p.b) < longEnough) continue;
        const placed = place(g, { x: p.a, y: p.b, width: p.c - p.a, height: p.d - p.b });
        // The side names the part: `<id>` before any full-thickness cut, `<id>#<k + 1>` after k of them.
        const id = (g as { id?: unknown }).id;
        out.push(span.k === 0 || typeof id !== "string" ? placed : ({ ...placed, id: `${id}#${span.k + 1}` } as G));
      }
      continue;
    }
    // A thin guide: thick along one axis (its shorter side), long along the other.
    const thinX = r.width <= r.height;
    // A line thinner than `lineThickness` is widened to it, centered on its own position, before anything else is
    // applied (a non-finite thickness is left as is: it is dropped below).
    const own = thinX ? r.width : r.height;
    const widen = g.kind === "line" && own < lineThickness;
    // Along its thickness: moved inside whole; along its length: clipped.
    const t = widen ? lineThickness : own;
    let lo = (thinX ? r.x : r.y) - (widen ? (lineThickness - own) / 2 : 0);
    const lim0 = thinX ? x0 : y0;
    const lim1 = thinX ? x1 : y1;
    if (lo + t > lim1) lo = lim1 - t;
    if (lo < lim0) lo = lim0;
    let hi = Math.min(lo + t, lim1);
    const l0 = Math.max(thinX ? r.y : r.x, thinX ? y0 : x0);
    const l1 = Math.min(thinX ? r.y + r.height : r.x + r.width, thinX ? y1 : x1);
    if (l1 - l0 <= EPS) continue;
    // Each clear rect, grown by its clearance: its extent along the guide's length (a, b) and across its thickness (c0, c1).
    const around = clear.map(({ k: c, gap }) => ({
      a: (thinX ? c.y : c.x) - gap,
      b: (thinX ? c.y + c.height : c.x + c.width) + gap,
      c0: (thinX ? c.x : c.y) - gap,
      c1: (thinX ? c.x + c.width : c.y + c.height) + gap,
    }));
    // A rect over the thickness that meets only one end of the length (its start or its end, not both, not the middle)
    // shortens the guide, as it trims a box: the guide keeps the part away from it. The ends are the clipped guide's, so
    // the order of the rects never matters.
    let s0 = l0;
    let s1 = l1;
    let shortened = false;
    for (const k of around) {
      if (k.b <= l0 + EPS || k.a >= l1 - EPS || k.c1 <= lo + EPS || k.c0 >= hi - EPS) continue;
      const atStart = k.a <= l0 + EPS;
      const atEnd = k.b >= l1 - EPS;
      if (atStart === atEnd) continue;
      if (atStart) s0 = Math.max(s0, k.b);
      else s1 = Math.min(s1, k.a);
      shortened = true;
    }
    // What is left of the length keeps `minLength`, as a part of a box a clear rect cut does.
    if (s1 - s0 <= EPS || (shortened && s1 - s0 < Math.max(EPS, minLength - EPS))) continue;
    // A rect over the middle of the length (or all of it) cuts across the thickness, from the side it lies on, where it
    // still lies over what is left.
    for (const k of around) {
      if (k.b <= s0 + EPS || k.a >= s1 - EPS || k.c1 <= lo + EPS || k.c0 >= hi - EPS) continue;
      if ((k.a <= l0 + EPS) !== (k.b >= l1 - EPS)) continue;
      // Keep the side away from the clear rect's middle.
      if ((k.c0 + k.c1) / 2 >= (lo + hi) / 2) hi = Math.min(hi, k.c0);
      else lo = Math.max(lo, k.c1);
    }
    if (hi - lo < Math.max(EPS, min)) continue;
    out.push(place(g, thinX ? { x: lo, y: s0, width: hi - lo, height: s1 - s0 } : { x: s0, y: lo, width: s1 - s0, height: hi - lo }));
  }
  return out;
}
