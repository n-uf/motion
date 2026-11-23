/**
 * The seven properties of a tiling drag's hit half, run on any `TilingTree` adapter: the library's tests on the reference
 * one, a host on its own (its `parts` included). Pure: no test runner, no DOM. The zone rule is checked against a second
 * copy of it written here (the center by its formula, the side regions as trapezoids), never the library's own call.
 * See docs/placement.md, Entry: tiling.
 */
import type { Point, Rect } from "../geometry";
import type { Side } from "../side";
import { tilingDrag, type TilingDrag, type TilingDragOptions, type TilingHeld, type TilingSubject } from "./drag";
import { TILING_HIT_DEFAULTS, TILING_NEIGHBOR_SWAP_SHARE, type TilingBasis, type TilingHitOptions, type TilingHitRead, type TilingHitTarget, type TilingHold } from "./hit";
import { layoutSplitTree } from "./layout";
import { PANE_REGION_DEFAULTS } from "./regions";
import type { Split } from "./split";
import { tilingSubjects } from "./conformance";

/** The properties, by name (each is a key of `TilingHitConformance.counts`). */
export const TILING_HIT_PROPERTIES = [
  /** The targets after any sequence of frames are the ones built at the lift; with nothing held the place at a point is the same before and after holding every other place. */
  "fixed-map",
  /** The place at a point is the one a second copy of the rule names: home inside its rect, a part over the body, a slot over its part, else the pane's region; a refused zone falls to the one beneath; a place that gives the lift back is home. */
  "zone-rule",
  /** A still pointer changes nothing; a path within the edge measure of the held zone, or inside its pane within the travel measure of where it was taken, never changes the place; a straight sweep meets each place but home (which shows nothing) at most once. */
  "hold-rule",
  /** A place is offered exactly when `after(place).refusal` is null; over a refused zone nothing is held and the refusal is named. */
  "existence",
  /** Every place whose release gives the lift back reads as home, and its release commits the lift tree. */
  "lift-equals-home",
  /** Lift basis: the mark contains the pointer and lies inside the target pane as drawn. Base basis: the landing contains the pointer for every insert and join (swaps whose landing lies beside the pointer are counted, not failed). */
  "shown-under-pointer",
  /** At every frame of a gesture a release commits `after(held)`, else the lift tree; the base basis draws `after(held)` for a held place, the lift at home, the base with nothing held. */
  "shown-equals-landed",
  /** A side of a pane takes an insert exactly when that insert gives a new arrangement: neither the lift's nor the swap's (by a second copy of the arrangement). */
  "new-arrangement-sides",
  /** Every zone of every pane is convex: the midpoint of two points in one zone is in it too. */
  "zones-convex",
] as const;

export type TilingHitProperty = (typeof TILING_HIT_PROPERTIES)[number];

/** A conformance run, as `tilingConformance`'s, and the rows the ruling counts rather than fails. */
export interface TilingHitConformance {
  readonly ok: boolean;
  readonly failures: readonly string[];
  readonly counts: Readonly<Record<TilingHitProperty, { readonly checked: number; readonly failed: number }>>;
  readonly reported: {
    /** Base basis: a held swap whose landing does not contain the pointer (a pane that moved at the lift, hit at its base rect). */
    readonly swapsBeside: number;
    /** Base basis: an insert or join whose layout moves a pane other than its target (floors, fixed lengths). */
    readonly insertsMoveOthers: number;
    /** Of those, the ones whose landing does not contain the pointer. */
    readonly insertsMoveOthersBeside: number;
  };
}

/** A small seeded generator (the library has no `Math.random`). */
function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const inside = (r: Rect, p: Point): boolean => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
const within = (a: Rect, b: Rect, e = 1e-6): boolean => a.x >= b.x - e && a.y >= b.y - e && a.x + a.width <= b.x + b.width + e && a.y + a.height <= b.y + b.height + e;
const sameRect = (a: Rect | undefined, b: Rect | undefined, e = 1e-3): boolean =>
  !!a && !!b && Math.abs(a.x - b.x) <= e && Math.abs(a.y - b.y) <= e && Math.abs(a.width - b.width) <= e && Math.abs(a.height - b.height) <= e;
const show = (h: TilingHeld<unknown> | null): string =>
  h === null ? "nothing" : h.kind === "home" ? "home" : `${h.kind} ${String(h.at)}${h.kind === "beside" ? ` ${h.side}` : h.kind === "join" && h.index !== undefined ? ` @${h.index}` : ""}`;
const cross = (a: Point, b: Point, p: Point): number => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
/** Strictly inside the convex quad `q` (corners in order), by the signs of its edges. */
function inQuad(q: readonly Point[], p: Point): boolean {
  const s = q.map((a, i) => cross(a, q[(i + 1) % q.length]!, p));
  return s.every((v) => v > 1e-9) || s.every((v) => v < -1e-9);
}

/**
 * Runs the seven properties on every subject of every tree (`tilingSubjects`), on both bases, over seeded points,
 * walks and sweeps. Gives the first `limit` failures (default 20) in words.
 */
export function tilingHitConformance<T, K>(trees: Iterable<T>, options: TilingDragOptions<T, K>, hitOptions: TilingHitOptions<K> = {}, limit = 20): TilingHitConformance {
  const { ops, area } = options;
  const counts = Object.fromEntries(TILING_HIT_PROPERTIES.map((p) => [p, { checked: 0, failed: 0 }])) as Record<TilingHitProperty, { checked: number; failed: number }>;
  const failures: string[] = [];
  const reported = { swapsBeside: 0, insertsMoveOthers: 0, insertsMoveOthersBeside: 0 };
  const edge = hitOptions.edge ?? TILING_HIT_DEFAULTS.edge;
  const travel = hitOptions.travel ?? TILING_HIT_DEFAULTS.travel;
  const share = hitOptions.share ?? TILING_HIT_DEFAULTS.share;
  const reg = { ...PANE_REGION_DEFAULTS, ...hitOptions.regions };
  const stackOf = (t: T, k: K) => ops.stackOf?.(t, k) ?? null;
  const drawnAs = (t: T, k: K): K => stackOf(t, k)?.active ?? k;
  let n = 0;
  for (const tree of trees) {
    for (const subject of tilingSubjects(tree, options)) {
      const drag = tilingDrag(tree, subject, options);
      for (const basis of ["lift", "base"] as const) {
        const name = `tree ${n}, ${subject.kind === "pane" ? `pane ${String(subject.pane)}` : `stack ${subject.stack.id}`}, ${basis}`;
        const check = (p: TilingHitProperty, ok: boolean, why: () => string): void => {
          counts[p].checked++;
          if (ok) return;
          counts[p].failed++;
          if (failures.length < limit) failures.push(`${p}: ${name}: ${why()}`);
        };
        runOne(drag, subject, basis, check, seeded(1 + n * 7919 + (basis === "base" ? 1 : 0)));
      }
    }
    n++;
  }
  return { ok: failures.length === 0 && Object.values(counts).every((c) => c.failed === 0), failures, counts, reported };

  function runOne(drag: TilingDrag<T, K>, subject: TilingSubject<K>, basis: TilingBasis, check: (p: TilingHitProperty, ok: boolean, why: () => string) => void, rnd: () => number): void {
    const hit = drag.hit(basis, hitOptions);
    const laid = basis === "lift" ? drag.lift : drag.base;
    const home = drag.home;
    const subjectKey = subject.kind === "pane" ? subject.pane : subject.stack.active;
    const inSubject = (k: K): boolean => (subject.kind === "pane" ? k === subject.pane : subject.stack.members.includes(k));
    const HOME: TilingHeld<K> = { kind: "home" };
    const targetsAtLift = hit.targets;
    const snapshot = JSON.stringify(hit.targets);

    // ---- The second copy of the zone rule.
    const subjectDrawn = drawnAs(drag.lift.tree, subjectKey);
    const atOf = (pane: K): K | null => {
      if (drag.base.layout.has(pane)) return pane;
      for (const m of stackOf(laid.tree, pane)?.members ?? []) {
        if (inSubject(m)) continue;
        const d = drawnAs(drag.base.tree, m);
        if (drag.base.layout.has(d)) return d;
      }
      return null;
    };
    // The second copy of the arrangement: every pane in reading order of its runs, a stack as its members, sizes dropped.
    // A split's axis is its own, else read off its two halves' panes as laid out; a split along its parent's axis joins
    // the parent's run; a master split stands apart.
    const flatOf = (t: T): string => {
      const placed = layoutSplitTree(ops.split(t), area, options).panes;
      const keysIn = (n: Split<K>): K[] => ("pane" in n ? [n.pane] : [...keysIn(n.a), ...keysIn(n.b)]);
      const box = (n: Split<K>) => {
        const rs = keysIn(n).map((k) => placed.get(k)).filter((r): r is Rect => !!r);
        return { x0: Math.min(...rs.map((r) => r.x)), x1: Math.max(...rs.map((r) => r.x + r.width)) };
      };
      const dir = (n: Exclude<Split<K>, { readonly pane: K }>): "x" | "y" => {
        if (n.axis) return n.axis;
        const [a, b] = [box(n.a), box(n.b)];
        return a.x1 <= b.x0 + 0.5 || b.x1 <= a.x0 + 0.5 ? "x" : "y";
      };
      const items = (n: Split<K>, d: "x" | "y" | null): string[] => {
        if ("pane" in n) {
          const s = stackOf(t, n.pane);
          return [s ? `<${s.members.map(String).join(" ")}>` : String(n.pane)];
        }
        if (n.master) return [`M${JSON.stringify(n.master)}{${items(n.a, null).join(";")}|${items(n.b, null).join(";")}}`];
        const own = dir(n);
        if (own === d) return [...items(n.a, own), ...items(n.b, own)];
        return [`${own}{${[...items(n.a, own), ...items(n.b, own)].join(";")}}`];
      };
      const s = ops.split(t);
      return s ? items(s, null).join(";") : "";
    };
    const liftFlat = flatOf(drag.lift.tree);
    const changed = (h: { kind: "swap"; at: K } | { kind: "beside"; at: K; side: Side }): T => {
      const t = h.kind === "swap" ? ops.swap(drag.lift.tree, subject, h.at) : ops.beside(ops.release(drag.lift.tree, subject), subject, h.at, h.side, { kind: "half" });
      return ops.normalize ? ops.normalize(t) : t;
    };
    const masterIn = (n: Split<K> | null): boolean => !!n && !("pane" in n) && (!!n.master || masterIn(n.a) || masterIn(n.b));
    const hasMaster = masterIn(ops.split(drag.lift.tree));
    /** Whether the smallest split holding both `x` and `y` in the lift tree lays its panes out as master and stack. */
    const meetInMaster = (x: K, y: K): boolean => {
      let node = ops.split(drag.lift.tree);
      let master = false;
      while (node && !("pane" in node)) {
        const has = (n: Split<K>, k: K): boolean => ("pane" in n ? n.pane === k : has(n.a, k) || has(n.b, k));
        master = !!node.master;
        if (has(node.a, x) && has(node.a, y)) node = node.a;
        else if (has(node.b, x) && has(node.b, y)) node = node.b;
        else break;
      }
      return master && !!node && !("pane" in node);
    };
    /**
     * The second copy of the rule, by result: a side is gone when its insert gives no new arrangement (the lift's or the
     * swap's), the release leaves a slot, the two panes meet in no master split (a master split is no run), and the pane
     * has the subject's bounds across that side's axis (a narrower one, a fixed length across, keeps its side). The copy
     * asks this of every pane; the drag's own rule judges only a whole child of a run next to the subject.
     */
    const sidesOf = (at: K): Side[] => {
      const swap = flatOf(changed({ kind: "swap", at }));
      const r = drag.lift.layout.get(at);
      const same = (a: number, b: number): boolean => Math.abs(a - b) <= 0.5;
      return (["top", "right", "bottom", "left"] as Side[]).filter((side) => {
        const f = flatOf(changed({ kind: "beside", at, side }));
        if (f !== liftFlat && f !== swap) return true;
        if (!home || !r || meetInMaster(subjectDrawn, at)) return true;
        const across = side === "top" || side === "bottom" ? same(r.x, home.x) && same(r.width, home.width) : same(r.y, home.y) && same(r.height, home.height);
        return !across;
      });
    };
    const panes: { pane: K; at: K; rect: Rect; sides: Side[] }[] = [];
    for (const [pane, rect] of laid.layout) {
      if (basis === "lift" && home && pane === subjectDrawn) continue;
      const at = atOf(pane);
      if (at === null || options.still?.(at)) continue;
      panes.push({ pane, at, rect, sides: sidesOf(at) });
    }
    /** The center rectangle, by its formula: the share of each axis (clamped), the floor, the device-pixel grid; a side gone toward a pane's edge reaches it. */
    const centerOf = (r: Rect, sides: readonly Side[] = ["top", "right", "bottom", "left"]) => {
      const clamp = (v: number): number => Math.min(0.95, Math.max(0.05, v));
      const ratio = reg.pixelRatio > 0 ? reg.pixelRatio : 1;
      const alongGone = !sides.includes("top") || !sides.includes("bottom");
      const acrossGone = !sides.includes("left") || !sides.includes("right");
      const sx = alongGone ? TILING_NEIGHBOR_SWAP_SHARE : (reg.centerX ?? reg.center);
      const sy = acrossGone ? TILING_NEIGHBOR_SWAP_SHARE : (reg.centerY ?? reg.center);
      const cw = Math.min(r.width, Math.max(r.width * clamp(sx), Math.min(reg.centerMin, r.width)));
      const ch = Math.min(r.height, Math.max(r.height * clamp(sy), Math.min(reg.centerMin, r.height)));
      const g = (v: number): number => Math.round(v * ratio) / ratio;
      return {
        l: sides.includes("left") ? r.x + g((r.width - cw) / 2) : r.x,
        t: sides.includes("top") ? r.y + g((r.height - ch) / 2) : r.y,
        r: sides.includes("right") ? r.x + g((r.width + cw) / 2) : r.x + r.width,
        b: sides.includes("bottom") ? r.y + g((r.height + ch) / 2) : r.y + r.height,
        // The edges a side that exists is cut at (the band it would have had).
        cl: r.x + g((r.width - cw) / 2),
        ct: r.y + g((r.height - ch) / 2),
        cr: r.x + g((r.width + cw) / 2),
        cb: r.y + g((r.height + ch) / 2),
      };
    };
    /**
     * The region of `r` the point is in: the center (reaching the pane's edge where a side is gone), else a side that
     * exists and the point lies past the center toward, two such sides parted by the diagonal from the pane's corner to
     * the center's; null on a shared edge.
     */
    const regionOf = (r: Rect, p: Point, sides: readonly Side[] = ["top", "right", "bottom", "left"]): "center" | Side | null => {
      const c = centerOf(r, sides);
      if (p.x >= c.l && p.x <= c.r && p.y >= c.t && p.y <= c.b) return "center";
      const past = sides.filter((s) => (s === "top" ? p.y < c.ct : s === "bottom" ? p.y > c.cb : s === "left" ? p.x < c.cl : p.x > c.cr));
      if (past.length === 1) return past[0]!;
      const [x0, y0, x1, y1] = [r.x, r.y, r.x + r.width, r.y + r.height];
      const quads: Record<Side, Point[]> = {
        top: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: c.cr, y: c.ct }, { x: c.cl, y: c.ct }],
        right: [{ x: x1, y: y0 }, { x: x1, y: y1 }, { x: c.cr, y: c.cb }, { x: c.cr, y: c.ct }],
        bottom: [{ x: x1, y: y1 }, { x: x0, y: y1 }, { x: c.cl, y: c.cb }, { x: c.cr, y: c.cb }],
        left: [{ x: x0, y: y1 }, { x: x0, y: y0 }, { x: c.cl, y: c.ct }, { x: c.cl, y: c.cb }],
      };
      return past.find((s) => inQuad(quads[s], p)) ?? null;
    };
    /** The bounding box of a region of `r`. */
    const regionBox = (r: Rect, region: "center" | Side, sides?: readonly Side[]): Rect => {
      const c = centerOf(r, sides);
      if (region === "center") return { x: c.l, y: c.t, width: c.r - c.l, height: c.b - c.t };
      if (region === "top") return { x: r.x, y: r.y, width: r.width, height: c.ct - r.y };
      if (region === "bottom") return { x: r.x, y: c.cb, width: r.width, height: r.y + r.height - c.cb };
      if (region === "left") return { x: r.x, y: r.y, width: c.cl - r.x, height: r.height };
      return { x: c.cr, y: r.y, width: r.x + r.width - c.cr, height: r.height };
    };
    const live = (h: TilingHeld<K>): boolean => h.kind === "home" || drag.after(h).refusal === null;
    /** A live place whose release has the lift's arrangement (by the copy's own flattening). */
    const givesLift = (h: TilingHeld<K>): boolean => {
      if (h.kind === "home") return true;
      const a = drag.after(h);
      return !a.refusal && (a.tree === drag.lift.tree || flatOf(a.tree) === liftFlat);
    };
    interface Expect {
      /** The live place on top at the point, before home-likeness; null over nothing or a refused zone. */
      readonly raw: TilingHeld<K> | null;
      readonly refused: TilingHeld<K> | null;
      /** The zone the raw place lies in, and its extent (for the measures); the pane it lies on. */
      readonly box: Rect | null;
      readonly pane: { pane: K; at: K; rect: Rect } | null;
      /** A shared edge of two regions: not decided by this copy. */
      readonly tie: boolean;
    }
    const expectAt = (p: Point): Expect => {
      if (home && inside(home, p)) return { raw: HOME, refused: null, box: home, pane: null, tie: false };
      const pane = panes.find((x) => inside(x.rect, p));
      if (!pane) return { raw: null, refused: null, box: null, pane: null, tie: false };
      const members = stackOf(laid.tree, pane.pane)?.members ?? [pane.pane];
      let refused: TilingHeld<K> | null = null;
      for (const part of ops.parts?.(laid.tree, pane.pane, pane.rect) ?? []) {
        if (!inside(part.rect, p)) continue;
        const i = (part.slots ?? []).findIndex((s) => inside(s, p));
        if (i >= 0) {
          const index = i < members.length ? members.slice(0, i).filter((m) => !inSubject(m)).length : undefined;
          const held: TilingHeld<K> = index === undefined ? { kind: "join", at: pane.at } : { kind: "join", at: pane.at, index };
          if (live(held)) return { raw: held, refused: null, box: part.slots![i]!, pane, tie: false };
          refused ??= held;
        }
        const held: TilingHeld<K> = { kind: "join", at: pane.at };
        if (live(held)) return { raw: held, refused: null, box: part.rect, pane, tie: false };
        refused ??= held;
      }
      const region = regionOf(pane.rect, p, pane.sides);
      if (region === null) return { raw: null, refused: null, box: null, pane, tie: true };
      const held: TilingHeld<K> = region === "center" ? { kind: "swap", at: pane.at } : { kind: "beside", at: pane.at, side: region };
      return live(held) ? { raw: held, refused: null, box: regionBox(pane.rect, region, pane.sides), pane, tie: false } : { raw: null, refused: refused ?? held, box: null, pane, tie: false };
    };
    const expectedPlace = (e: Expect): TilingHeld<K> | null => (e.raw && givesLift(e.raw) ? HOME : e.raw);
    const placeAt = (p: Point): TilingHeld<K> | null => {
      const id = hit.zone(p);
      return id === null ? null : hit.place(id);
    };

    // ---- Driving the hit as an intent with the hit's tuning does: the target the held place is on shows.
    const frame = (p: Point): TilingHitRead<K> => {
      const shown: TilingHitTarget<K> | null = hit.targets.find((t) => hit.placeOf(t, p) !== null) ?? null;
      return hit.read({ shown }, p);
    };
    const FAR: Point = { x: area.x - 1e5, y: area.y - 1e5 };
    const fresh = (p: Point): TilingHitRead<K> => {
      frame(FAR);
      return frame(p);
    };
    const randomPoint = (r: Rect): Point => ({ x: r.x + rnd() * r.width, y: r.y + rnd() * r.height });
    const samples: Point[] = [];
    for (let i = 0; i < 300; i++) samples.push(randomPoint(area));
    for (const t of hit.targets) for (let i = 0; i < 6; i++) samples.push(randomPoint(t.hit));
    const zonesBefore = samples.map((p) => hit.zone(p));

    // ---- zone-rule, existence, lift-equals-home, shown-under-pointer: point by point, from nothing held.
    for (const p of samples) {
      const e = expectAt(p);
      if (e.tie) continue;
      const want = expectedPlace(e);
      const got = placeAt(p);
      check("zone-rule", show(got) === show(want), () => `at ${p.x.toFixed(1)},${p.y.toFixed(1)}: ${show(got)}, the rule says ${show(want)}`);
      if (got && got.kind !== "home") check("existence", drag.after(got).refusal === null, () => `${show(got)} is offered but refused (${drag.after(got).refusal?.code})`);
      const r = fresh(p);
      if (e.raw === null && e.refused) check("existence", r.held === null && show(r.refused) === show(e.refused), () => `over refused ${show(e.refused)}: held ${show(r.held)}, refused ${show(r.refused)}`);
      if (e.raw && e.raw.kind !== "home" && givesLift(e.raw)) {
        check("lift-equals-home", r.held?.kind === "home" && hit.release(r).tree === drag.lift.tree, () => `${show(e.raw)} gives the lift back but reads ${show(r.held)}`);
      }
      if (basis === "lift" && r.mark && e.pane) {
        const m = r.mark;
        check("shown-under-pointer", inside(m.rect, p) && within(m.rect, e.pane.rect) && (m.kind !== "swap" || sameRect(m.wash ?? undefined, home ?? undefined) || (m.wash === null && home === null)), () => `${show(r.held)}: mark ${JSON.stringify(m.rect)} at ${p.x.toFixed(1)},${p.y.toFixed(1)}, pane ${JSON.stringify(e.pane!.rect)}`);
      }
      if (basis === "base" && r.held && r.held.kind !== "home") {
        const a = drag.after(r.held);
        if (r.held.kind === "swap") {
          if (!a.landing || !inside(a.landing, p)) reported.swapsBeside++;
        } else {
          const at = drawnAs(a.tree, r.held.at);
          const own = drawnAs(a.tree, subjectKey);
          const others = [...a.layout].some(([k, rect]) => k !== at && k !== own && drag.base.layout.has(k) && !sameRect(rect, drag.base.layout.get(k)));
          const under = !!a.landing && inside(a.landing, p);
          // A fixed length keeps the subject's size wherever it lands, and a master split lays its stack out anew: the
          // landing need not reach the pointer (counted).
          if (others || options.fixed || options.fixedAcross || hasMaster) {
            reported.insertsMoveOthers++;
            if (!under) reported.insertsMoveOthersBeside++;
          } else check("shown-under-pointer", under, () => `${show(r.held)}: landing ${JSON.stringify(a.landing)} does not contain ${p.x.toFixed(1)},${p.y.toFixed(1)}`);
        }
      }
    }

    // ---- new-arrangement-sides: at a point 1 px in from the middle of each of a pane's edges (off parts and home), a
    // side insert shows exactly when its insert gives a new arrangement (the copy's `sidesOf`); where it does not, no
    // insert of that side is offered there.
    for (const pn of panes) {
      const r = pn.rect;
      if (r.width < 4 || r.height < 4) continue;
      const partRects = (ops.parts?.(laid.tree, pn.pane, r) ?? []).map((q) => q.rect);
      const free = (p: Point): boolean => !(home && inside(home, p)) && !partRects.some((q) => inside(q, p));
      const probes: [Side, Point][] = [
        ["top", { x: r.x + r.width / 2, y: r.y + 1 }],
        ["bottom", { x: r.x + r.width / 2, y: r.y + r.height - 1 }],
        ["left", { x: r.x + 1, y: r.y + r.height / 2 }],
        ["right", { x: r.x + r.width - 1, y: r.y + r.height / 2 }],
      ];
      for (const [side, p] of probes) {
        if (!free(p)) continue;
        const got = placeAt(p);
        const want: TilingHeld<K> = { kind: "beside", at: pn.at, side };
        const isSide = got?.kind === "beside" && got.side === side;
        if (pn.sides.includes(side)) {
          // A pane narrower than the center's floor has no band there: the point is in its middle.
          // A side kept by the bounds clause whose insert gives the lift's arrangement reads as home.
          if (live(want) && regionOf(r, p, pn.sides) === side) check("new-arrangement-sides", isSide || (givesLift(want) && got?.kind === "home"), () => `${String(pn.at)} reads ${show(got)} at its ${side} edge, a new arrangement`);
        } else {
          check("new-arrangement-sides", !isSide, () => `${String(pn.at)} offers its ${side} insert, which gives the ${flatOf(changed(want as { kind: "beside"; at: K; side: Side })) === liftFlat ? "lift's" : "swap's"} arrangement`);
        }
      }
    }
    // ---- zones-convex: two points in one zone of a pane (off parts and home) have their midpoint in it too.
    for (const pn of panes) {
      const partRects = (ops.parts?.(laid.tree, pn.pane, pn.rect) ?? []).map((q) => q.rect);
      const free = (p: Point): boolean => !(home && inside(home, p)) && !partRects.some((q) => inside(q, p));
      for (let k = 0; k < 24; k++) {
        const a = randomPoint(pn.rect);
        const b = randomPoint(pn.rect);
        const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        if (!free(a) || !free(b) || !free(m)) continue;
        const za = hit.zone(a);
        if (za === null || za === "home" || za !== hit.zone(b)) continue;
        check("zones-convex", hit.zone(m) === za, () => `${za} at ${a.x.toFixed(1)},${a.y.toFixed(1)} and ${b.x.toFixed(1)},${b.y.toFixed(1)}, ${hit.zone(m)} between`);
      }
    }

    // ---- Gestures: random walks and straight sweeps, through the intent-like driver.
    const checkFrame = (p: Point, r: TilingHitRead<K>): void => {
      const ok = r.held === null || r.held.kind === "home" || drag.after(r.held).refusal === null;
      const rel = hit.release(r);
      const drawn = hit.drawn(r);
      const wantDrawn = basis === "lift" ? drag.lift : r.held === null ? drag.base : r.held.kind === "home" ? drag.lift : drag.after(r.held);
      check(
        "shown-equals-landed",
        ok && rel === drag.after(r.held ?? HOME) && drawn === wantDrawn && (r.held !== null || rel.tree === drag.lift.tree),
        () => `at ${p.x.toFixed(1)},${p.y.toFixed(1)}: held ${show(r.held)}${ok ? "" : " (refused)"}, release ${show(rel.held)}`,
      );
    };
    for (let w = 0; w < 4; w++) {
      frame(FAR);
      let p = randomPoint(area);
      for (let i = 0; i < 40; i++) {
        p = { x: Math.min(area.x + area.width, Math.max(area.x, p.x + (rnd() - 0.5) * 60)), y: Math.min(area.y + area.height, Math.max(area.y, p.y + (rnd() - 0.5) * 60)) };
        const r = frame(p);
        checkFrame(p, r);
        // Stillness: the same point again reads the same.
        const again = [frame(p), frame(p)];
        check("hold-rule", again.every((x) => JSON.stringify(x) === JSON.stringify(r)), () => `a still pointer at ${p.x.toFixed(1)},${p.y.toFixed(1)} changed ${show(r.held)} to ${again.map((x) => show(x.held)).join(", ")}`);
      }
    }
    // One pass: a straight sweep meets each place at most once (the pure hold, so the stateful one is left alone). Home
    // shows nothing and may come back: its rect, then a title bar's join, then the pane's band that gives the lift back
    // is the ruling's own sequence for a drag onto the pane below.
    for (let s = 0; s < 6; s++) {
      const a = randomPoint(area);
      const b = randomPoint(area);
      const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 1.5));
      let state: TilingHold | null = null;
      const met: string[] = [];
      for (let i = 0; i <= steps; i++) {
        const p = { x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps };
        state = hit.hold(state, p);
        if (state && met[met.length - 1] !== state.place) met.push(state.place);
      }
      const twice = met.filter((m, i) => m !== "home" && met.indexOf(m) !== i);
      check("hold-rule", twice.length === 0, () => `a sweep from ${a.x.toFixed(0)},${a.y.toFixed(0)} to ${b.x.toFixed(0)},${b.y.toFixed(0)} met ${met.join(" > ")}`);
    }
    // Wobble: within the edge measure of the held zone, or inside its pane within the travel measure, the place stays.
    for (let k = 0; k < 12; k++) {
      const a = samples[Math.floor(rnd() * samples.length)]!;
      const e = expectAt(a);
      if (e.tie || !e.raw || e.raw.kind === "home" || givesLift(e.raw) || !e.box || !e.pane) continue;
      const start = hit.hold(null, a);
      if (!start) continue;
      const box = e.box;
      const ex = Math.min(edge, share * box.width);
      const ey = Math.min(edge, share * box.height);
      const zoneOf = (p: Point): string => show(expectedPlace(expectAt(p)));
      const want = show(e.raw);
      const path: Point[] = [];
      for (let i = 0; i < 20 && path.length < 10; i++) {
        // A point of the same zone near the start, moved within the edge measure.
        const z = { x: a.x + (rnd() - 0.5) * box.width * 0.5, y: a.y + (rnd() - 0.5) * box.height * 0.5 };
        if (zoneOf(z) !== want || (e.box && !inside(e.box, z))) continue;
        const ang = rnd() * Math.PI * 2;
        const len = Math.sqrt(rnd()) * 0.9;
        path.push({ x: z.x + Math.cos(ang) * ex * len, y: z.y + Math.sin(ang) * ey * len });
      }
      // And points inside the pane (not over home) within the travel measure of the start.
      const tb = hit.place(start.place)?.kind === "join" ? null : box;
      if (tb) {
        const rx = Math.min(travel, share * tb.width);
        const ry = Math.min(travel, share * tb.height);
        for (let i = 0; i < 10; i++) {
          const ang = rnd() * Math.PI * 2;
          const len = Math.sqrt(rnd()) * 0.9;
          const p = { x: a.x + Math.cos(ang) * rx * len, y: a.y + Math.sin(ang) * ry * len };
          if (inside(e.pane.rect, p) && !(home && inside(home, p))) path.push(p);
        }
      }
      let state: TilingHold | null = start;
      for (const p of path) {
        state = hit.hold(state, p);
        check("hold-rule", state?.place === start.place, () => `${want} taken at ${a.x.toFixed(1)},${a.y.toFixed(1)} went to ${state ? show(hit.place(state.place)) : "nothing"} at ${p.x.toFixed(1)},${p.y.toFixed(1)}`);
        if (state?.place !== start.place) break;
      }
    }

    // ---- fixed-map: the targets are the lift's, and the zone map never moved.
    check("fixed-map", hit.targets === targetsAtLift && Object.isFrozen(hit.targets) && JSON.stringify(hit.targets) === snapshot, () => "the targets changed during the drag");
    const zonesAfter = samples.map((p) => hit.zone(p));
    const moved = zonesAfter.findIndex((z, i) => z !== zonesBefore[i]);
    check("fixed-map", moved < 0, () => `the zone at ${samples[moved]!.x.toFixed(1)},${samples[moved]!.y.toFixed(1)} changed from ${zonesBefore[moved]} to ${zonesAfter[moved]}`);
    // Holding every other place, then nothing, then a point: the place there is what nothing held gives.
    const places = new Map<string, Point>();
    samples.forEach((p, i) => {
      const z = zonesBefore[i];
      if (z !== null && !places.has(z)) places.set(z, p);
    });
    const probes = samples.slice(0, 12);
    for (const [, at] of [...places].slice(0, 10)) {
      for (const q of probes) {
        frame(at);
        const r = fresh(q);
        const z = hit.zone(q);
        check("fixed-map", show(r.held) === show(z === null ? null : hit.place(z)), () => `after holding the place at ${at.x.toFixed(1)},${at.y.toFixed(1)}, the point ${q.x.toFixed(1)},${q.y.toFixed(1)} reads ${show(r.held)}, nothing held gives ${z}`);
      }
    }
  }
}
