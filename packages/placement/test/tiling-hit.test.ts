/** ./tiling, a drag's hit half: `tilingDrag`'s targets and places on the base, and a held place kept where it is drawn. */
import { describe, expect, it } from "vitest";
import type { Point, Rect } from "../index";
import { splitTreeOps, tilingDrag, type PaneTarget, type StackedSplit, type TilingDrag, type TilingDragOptions, type TilingHeld } from "../src/tiling";

const ops = splitTreeOps<string>();
const AREA: Rect = { x: 0, y: 0, width: 800, height: 500 };
const opts = (more: Partial<TilingDragOptions<StackedSplit<string>, string>> = {}): TilingDragOptions<StackedSplit<string>, string> => ({ ops, area: AREA, min: 40, ...more });

/** A column of a over b on the left (40 %), c on the right. Dragging a, the base gives b the whole column. */
const three: StackedSplit<string> = { split: { axis: "x", ratio: 0.4, a: { axis: "y", ratio: 0.5, a: { pane: "a" }, b: { pane: "b" } }, b: { pane: "c" } } };
const dragA = (more: Partial<TilingDragOptions<StackedSplit<string>, string>> = {}): TilingDrag<StackedSplit<string>, string> => tilingDrag(three, { kind: "pane", pane: "a" }, opts(more));

/** The target whose base hit holds `p`, as an intent's pick would find it (one per pane, they don't overlap). */
const targetAt = (d: TilingDrag<StackedSplit<string>, string>, p: Point): PaneTarget<string> | null =>
  d.targets.find((t) => p.x >= t.hit.x && p.x <= t.hit.x + t.hit.width && p.y >= t.hit.y && p.y <= t.hit.y + t.hit.height) ?? null;

/**
 * A host's loop over one sample: the held place stays while it holds the pointer where `drawn` draws its pane; else the
 * place is acquired on the base. Gives the place id held after the sample.
 */
const step = (d: TilingDrag<StackedSplit<string>, string>, held: string | null, p: Point, drawn: ReadonlyMap<string, Rect>): string | null => {
  const h = held === null ? null : d.heldOf(held);
  if (h && d.holds(h, p, drawn)) return held;
  const t = targetAt(d, p);
  return t ? d.placeOf(t, p, held) : null;
};

describe("tilingDrag: targets and places on the base", () => {
  it("one target per pane of the base, hit-tested at its base rect, priority 2", () => {
    const d = dragA();
    expect(d.targets.map((t) => [t.id, t.pane, t.priority])).toEqual([
      ["pane:b", "b", 2],
      ["pane:c", "c", 2],
    ]);
    expect(d.targets[0]!.hit).toEqual(d.base.layout.get("b"));
  });

  it("still panes have no target; key names the ids", () => {
    const d = dragA({ still: (p) => p === "c", key: (p) => p.toUpperCase() });
    expect(d.targets.map((t) => t.id)).toEqual(["pane:B"]);
  });

  it("the centre is a swap, a band a side drop; heldOf reads the id, and an unknown id is null", () => {
    const d = dragA();
    const b = d.targets[0]!;
    expect(d.heldOf(d.placeOf(b, { x: 160, y: 250 }, null)!)).toEqual({ kind: "swap", at: "b" });
    expect(d.heldOf(d.placeOf(b, { x: 160, y: 480 }, null)!)).toEqual({ kind: "beside", at: "b", side: "bottom" });
    expect(d.heldOf("pane:b/elsewhere")).toBeNull();
  });

  it("a refused place is no place", () => {
    // b's column is 320 wide: two panes of 200 don't fit beside each other.
    const d = dragA({ min: 200 });
    expect(d.placeOf(d.targets[0]!, { x: 5, y: 250 }, null)).toBeNull();
  });
});

describe("tilingDrag: a held place keeps its zone as drawn", () => {
  it("a held swap keeps the partner's centre where the frame draws it, though the base there is a side band", () => {
    const d = dragA();
    const drawn = d.lift.layout; // the old place reopened, b in its own slot (the lower half)
    const swapB: TilingHeld<string> = { kind: "swap", at: "b" };
    const middleOfB = { x: 160, y: 375 };
    // On the base b fills the column, so this point is in b's bottom band.
    expect(d.heldOf(d.placeOf(d.targets[0]!, middleOfB, null)!)).toEqual({ kind: "beside", at: "b", side: "bottom" });
    expect(d.holds(swapB, middleOfB, drawn)).toBe(true);
    // Out of b as drawn, or in its band there, it lets go.
    expect(d.holds(swapB, { x: 160, y: 200 }, drawn)).toBe(false);
    expect(d.holds(swapB, { x: 160, y: 490 }, drawn)).toBe(false);
  });

  it("a held swap kept from b's upper part down through its drawn middle, frame to frame", () => {
    const d = dragA();
    const drawn = d.lift.layout;
    let held: string | null = null;
    const seen: string[] = [];
    for (let y = 270; y <= 410; y += 2) {
      held = step(d, held, { x: 160, y }, drawn);
      seen.push(held === null ? "none" : JSON.stringify(d.heldOf(held)));
    }
    expect(new Set(seen)).toEqual(new Set([JSON.stringify({ kind: "swap", at: "b" })]));
  });

  it("once it lets go, the next place is acquired on the base", () => {
    const d = dragA();
    const drawn = d.lift.layout;
    let held: string | null = step(d, null, { x: 160, y: 300 }, drawn);
    expect(d.heldOf(held!)).toEqual({ kind: "swap", at: "b" });
    held = step(d, held, { x: 160, y: 470 }, drawn); // b's bottom band as drawn
    expect(d.heldOf(held!)).toEqual({ kind: "beside", at: "b", side: "bottom" });
  });

  it("a side holds its band where it is drawn, and lets go in the centre", () => {
    const d = dragA();
    const drawn = new Map([["c", { x: 400, y: 0, width: 400, height: 500 }]]);
    const left: TilingHeld<string> = { kind: "beside", at: "c", side: "left" };
    expect(d.holds(left, { x: 420, y: 250 }, drawn)).toBe(true);
    expect(d.holds(left, { x: 600, y: 250 }, drawn)).toBe(false);
    // Where the base has c (from 320), but the frame draws nothing: it lets go.
    expect(d.holds(left, { x: 330, y: 250 }, drawn)).toBe(false);
  });

  describe("a column where the subject's slot is twice the partner's height", () => {
    // a 0–333 over b 333–500. On the base b fills the column (centre 165–335); drawn, b's centre is 388–444, so its top
    // band (333–388) lies between the two centres.
    const tall: StackedSplit<string> = { split: { axis: "x", ratio: 0.4, a: { axis: "y", ratio: 2 / 3, a: { pane: "a" }, b: { pane: "b" } }, b: { pane: "c" } } };
    const dragTall = (): TilingDrag<StackedSplit<string>, string> => tilingDrag(tall, { kind: "pane", pane: "a" }, opts());
    const swapB = JSON.stringify({ kind: "swap", at: "b" });

    it("the slow path from b's upper part down through its drawn middle stays a swap, frame to frame", () => {
      const d = dragTall();
      const drawn = d.lift.layout; // the old place reopened, b in its own slot
      let held: string | null = null;
      const seen: string[] = [];
      for (let y = 300; y <= 440; y += 1) {
        held = step(d, held, { x: 160, y }, drawn);
        seen.push(held === null ? "none" : JSON.stringify(d.heldOf(held)));
      }
      expect(new Set(seen)).toEqual(new Set([swapB]));
    });

    it("the band facing the reopened place holds; every other band lets go, so insert below stays reachable", () => {
      const d = dragTall();
      const drawn = d.lift.layout;
      const swap: TilingHeld<string> = { kind: "swap", at: "b" };
      expect(d.holds(swap, { x: 160, y: 350 }, drawn)).toBe(true); // b's top band, against a's slot
      expect(d.holds(swap, { x: 5, y: 415 }, drawn)).toBe(false); // b's left band
      expect(d.holds(swap, { x: 160, y: 490 }, drawn)).toBe(false); // b's bottom band
      expect(d.heldOf(step(d, d.placeOf(d.targets[0]!, { x: 160, y: 300 }, null), { x: 160, y: 490 }, drawn)!)).toEqual({ kind: "beside", at: "b", side: "bottom" });
    });

    it("a side's band never takes the facing band: only a swap does", () => {
      const d = dragTall();
      expect(d.holds({ kind: "beside", at: "b", side: "bottom" }, { x: 160, y: 350 }, d.lift.layout)).toBe(false);
    });
  });

  it("home, a join, and a pane not drawn hold nowhere", () => {
    const d = dragA();
    const p = { x: 160, y: 375 };
    expect(d.holds({ kind: "home" }, p, d.lift.layout)).toBe(false);
    expect(d.holds({ kind: "join", at: "b" }, p, d.lift.layout)).toBe(false);
    expect(d.holds({ kind: "swap", at: "b" }, p, new Map())).toBe(false);
  });
});
