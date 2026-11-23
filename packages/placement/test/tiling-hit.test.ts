/** ./tiling, a drag's hit half: `tilingDrag(...).hit(basis)` over the reference adapter, and the seven properties of `tilingHitConformance`. */
import { describe, expect, it } from "vitest";
import type { DragFrame, DragIntentOptions, DragTarget } from "../../motion/src/drag/intent";
import type { Point, Rect } from "../index";
import {
  splitTreeOps,
  tilingDrag,
  tilingHitConformance,
  type Split,
  type StackedSplit,
  type TilingDragOptions,
  type TilingHit,
  type TilingHitFrame,
  type TilingHitIntent,
  type TilingHitTarget,
  type TilingSubject,
} from "../src/tiling";
import { randomTree, seeded } from "./tiling-fixture";

const ops = splitTreeOps<string>({ bar: 26 });
const AREA: Rect = { x: 0, y: 0, width: 800, height: 500 };
const opts = (more: Partial<TilingDragOptions<StackedSplit<string>, string>> = {}): TilingDragOptions<StackedSplit<string>, string> => ({ ops, area: AREA, gap: 8, min: 40, ...more });
const pane = (p: string): TilingSubject<string> => ({ kind: "pane", pane: p });

/** a over b on the left (40 %), c on the right. */
const three: StackedSplit<string> = { split: { axis: "x", ratio: 0.4, a: { axis: "y", ratio: 0.5, a: { pane: "a" }, b: { pane: "b" } }, b: { pane: "c" } } };
/** a over b on the left, a stack of c, d, e on the right. */
const stacked: StackedSplit<string> = { ...three, stacks: [{ id: "s", members: ["c", "d", "e"], active: "c" }] };

/** Drive the hit as an intent with its tuning does: the target the held place is on shows. */
function at<T>(hit: TilingHit<T, string>, p: Point) {
  const shown = hit.targets.find((t) => hit.placeOf(t, p) !== null) ?? null;
  return hit.read({ shown }, p);
}
const show = (h: { kind: string; at?: string; side?: string; index?: number } | null): string =>
  h === null ? "nothing" : h.kind === "home" ? "home" : `${h.kind} ${h.at}${h.side ? ` ${h.side}` : ""}${h.index !== undefined ? ` @${h.index}` : ""}`;

describe("the hit's shapes fit @n-uf/motion/drag's intent (a type check: placement imports nothing of motion)", () => {
  it("targets are drag targets, the intent options are intent options, the frame is read as given", () => {
    type Same<A, B> = [A] extends [B] ? true : false;
    const target: Same<TilingHitTarget<string>, DragTarget> = true;
    const intent: Same<TilingHitIntent<string>, Pick<DragIntentOptions<TilingHitTarget<string>>, "home" | "placeOf"> & { tuning: NonNullable<DragIntentOptions<TilingHitTarget<string>>["tuning"]> }> = true;
    const frame: Same<DragFrame<TilingHitTarget<string>>, TilingHitFrame<TilingHitTarget<string>>> = true;
    expect([target, intent, frame]).toEqual([true, true, true]);
  });
});

describe("hit on the lift (marks over the lift layout)", () => {
  const d = tilingDrag(three, pane("a"), opts());
  const hit = d.hit("lift");
  const B = d.lift.layout.get("b")!;

  it("a straight drag down from home over its full-edge neighbor below: home, its title bar, then swap over its whole height", () => {
    const seen: string[] = [];
    for (let y = 100; y <= 495; y += 2) {
      const r = at(hit, { x: B.x + B.width / 2, y });
      const s = show(r.held);
      if (seen[seen.length - 1] !== s) seen.push(s);
      if (r.mark) expect(r.mark.rect.y >= B.y - 1e-6 && r.mark.rect.y + r.mark.rect.height <= B.y + B.height + 1e-6).toBe(true);
    }
    expect(seen).toEqual(["home", "join b", "swap b"]);
  });

  it("across the neighbor its side bands stay sides: a sweep from left to right reads left, swap, right", () => {
    const seen: string[] = [];
    at(hit, { x: -500, y: -500 });
    for (let x = B.x + 1; x <= B.x + B.width - 1; x += 2) {
      const s = show(at(hit, { x, y: B.y + B.height / 2 + 20 }).held);
      if (seen[seen.length - 1] !== s) seen.push(s);
    }
    expect(seen).toEqual(["beside b left", "swap b", "beside b right"]);
  });

  it("the mark is a region of the lift layout: a side's half, a swap's outline and the wash in home", () => {
    at(hit, { x: -500, y: -500 });
    const r = at(hit, { x: B.x + B.width / 2, y: B.y + B.height / 2 });
    expect(r.mark).toEqual({ kind: "swap", at: "b", rect: B, wash: d.home });
    at(hit, { x: -500, y: -500 });
    const s = at(hit, { x: B.x + 4, y: B.y + B.height / 2 });
    expect(s.mark).toEqual({ kind: "side", at: "b", side: "left", rect: { x: B.x, y: B.y, width: B.width / 2, height: B.height } });
    expect(hit.drawn(s)).toBe(d.lift);
    expect(hit.release(s)).toBe(d.after({ kind: "beside", at: "b", side: "left" }));
  });

  it("every pane is a target on the lift, also one the base would cover with home", () => {
    expect(hit.targets.map((t) => t.id).sort()).toEqual(["home", "pane:b", "pane:c", "part:b:bar", "part:c:bar"]);
  });

  it("a still pointer and a ±3 px wobble at each switch point change nothing", () => {
    const x = B.x + B.width / 2;
    let prev = show(at(hit, { x, y: 100 }).held);
    for (let y = 100; y <= 495; y += 1) {
      const now = show(at(hit, { x, y }).held);
      // The gutter left past home's 6 px edge is 2 px here (gap 8): a ±3 px wobble can't stay in it, so it is not one.
      if (now !== prev && now === "nothing") prev = now;
      if (now !== prev) {
        for (const dy of [0, 3, -3, 2, -2, 1, 0]) expect(show(at(hit, { x, y: y + dy }).held)).toBe(now);
        prev = now;
      }
    }
  });
});

describe("full-edge neighbors swap along their axis; other panes keep their sides", () => {
  const bottomOf = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height - 3 });
  const topOf = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + 30 });

  it("equal bounds (a over b, the same left and right): b's bottom band is the swap", () => {
    const d = tilingDrag(three, pane("a"), opts());
    for (const basis of ["lift", "base"] as const) {
      const hit = d.hit(basis);
      expect(show(hit.place(hit.zone(bottomOf(hit.laid.layout.get("b")!))!))).toBe("swap b");
    }
  });

  it("unequal bounds (a over b and c side by side): b's bands stay sides", () => {
    const t: StackedSplit<string> = { split: { axis: "y", ratio: 0.5, a: { pane: "a" }, b: { axis: "x", ratio: 0.5, a: { pane: "b" }, b: { pane: "c" } } } };
    const hit = tilingDrag(t, pane("a"), opts()).hit("lift");
    const B = hit.laid.layout.get("b")!;
    expect(show(hit.place(hit.zone(bottomOf(B))!))).toBe("beside b bottom");
    expect(show(hit.place(hit.zone(topOf(B))!))).toBe("beside b top");
  });

  it("not adjacent (a over b over c, a dragged over c): above c is a side, not a swap", () => {
    const t: StackedSplit<string> = { split: { axis: "y", ratio: 0.34, a: { pane: "a" }, b: { axis: "y", ratio: 0.5, a: { pane: "b" }, b: { pane: "c" } } } };
    const hit = tilingDrag(t, pane("a"), opts()).hit("lift");
    const C = hit.laid.layout.get("c")!;
    expect(show(hit.place(hit.zone(topOf(C))!))).toBe("beside c top");
    const B = hit.laid.layout.get("b")!;
    expect(show(hit.place(hit.zone(bottomOf(B))!))).toBe("swap b");
  });
});

describe("hit on the base (the landed layout drawn)", () => {
  const d = tilingDrag(three, pane("a"), opts());
  const hit = d.hit("base");
  const B = d.base.layout.get("b")!;

  it("home covers the neighbor that grew, and wins over it", () => {
    expect(hit.zone({ x: 50, y: 100 })).toBe("home");
    expect(B.y).toBe(0);
  });

  it("a held insert draws its landed layout from the first frame, and its release commits it", () => {
    // b is a's full-edge neighbor, so its bottom band is the swap: the insert is taken in its left strip.
    const r = at(hit, { x: B.x + 4, y: B.y + B.height - 40 });
    expect(show(r.held)).toBe("beside b left");
    expect(r.mark).toBeNull();
    expect(hit.drawn(r)).toBe(d.after(r.held!));
    expect(hit.release(r)).toBe(d.after(r.held!));
  });

  it("nothing held outside home draws the base, and releases home", () => {
    const r = at(hit, { x: -200, y: -200 });
    expect(r.held).toBeNull();
    expect(hit.drawn(r)).toBe(d.base);
    expect(hit.release(r).tree).toBe(three);
  });
});

describe("tab slots: the slot under the pointer gives the index; a torn tab's own cell is home", () => {
  it("tearing the drawn tab c out of c, d, e: its own cell and the next give the lift back, the third joins before e", () => {
    const d = tilingDrag(stacked, pane("c"), opts());
    expect(d.home).toBeNull();
    const hit = d.hit("lift");
    const S = d.lift.layout.get("c")!;
    expect(show(at(hit, { x: S.x + 40, y: S.y + 10 }).held)).toBe("home");
    at(hit, { x: -500, y: -500 });
    expect(show(at(hit, { x: S.x + 120, y: S.y + 10 }).held)).toBe("home");
    at(hit, { x: -500, y: -500 });
    expect(show(at(hit, { x: S.x + 200, y: S.y + 10 }).held)).toBe("join d @1");
    at(hit, { x: -500, y: -500 });
    expect(show(at(hit, { x: S.x + 300, y: S.y + 10 }).held)).toBe("join d");
  });

  it("a new tab slot is taken only past the edge measure and after the travel measure from where the last one was taken", () => {
    const d = tilingDrag(stacked, pane("a"), opts());
    const hit = d.hit("base");
    const S = d.base.layout.get("c")!;
    expect(show(at(hit, { x: S.x + 70, y: S.y + 10 }).held)).toBe("join c @0");
    // Into the next cell by 4 px: within the edge measure, the first holds.
    expect(show(at(hit, { x: S.x + 84, y: S.y + 10 }).held)).toBe("join c @0");
    // 8 px in, 18 px from where it was taken: within the travel measure (a quarter of the 80 px cell), still the first.
    expect(show(at(hit, { x: S.x + 88, y: S.y + 10 }).held)).toBe("join c @0");
    // 25 px from where it was taken: the next cell.
    expect(show(at(hit, { x: S.x + 95, y: S.y + 10 }).held)).toBe("join c @1");
  });
});

describe("tilingHitConformance: the seven properties", () => {
  const trees = (seed: number, count: number, stacks: boolean): StackedSplit<string>[] => {
    const rnd = seeded(seed);
    return Array.from({ length: count }, () => {
      const t = randomTree(rnd, 2 + Math.floor(rnd() * 4), { axis: 0.8 });
      const map = (s: Split<number>): Split<string> => ("pane" in s ? { pane: `p${s.pane}` } : { ...s, a: map(s.a), b: map(s.b) });
      const split = map(t);
      if (!stacks || "pane" in split) return { split };
      const first = (s: Split<string>): string => ("pane" in s ? s.pane : first(s.a));
      const host = first(split);
      return { split, stacks: [{ id: `s:${host}`, members: [host, `${host}x`, `${host}y`], active: host }] };
    });
  };

  it("hold on the reference adapter, panes and stacks, both bases", () => {
    const r = tilingHitConformance([three, stacked, ...trees(11, 12, false), ...trees(23, 10, true)], opts());
    expect(r.failures).toEqual([]);
    for (const c of Object.values(r.counts)) expect(c.checked).toBeGreaterThan(0);
    expect(r.ok).toBe(true);
  });

  it("hold with floors and a minimum: inserts that move other panes are counted", () => {
    const floor = () => ({ min: 120 });
    const r = tilingHitConformance([three, stacked, ...trees(5, 8, false)], opts({ floor, min: 60 }));
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
  });
});
