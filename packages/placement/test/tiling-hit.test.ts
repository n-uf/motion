/** ./tiling, a drag's hit half: `tilingDrag`'s targets and places, on the base and on the layout a frame draws. */
import { describe, expect, it } from "vitest";
import type { Point, Rect } from "../index";
import { splitTreeOps, tilingDrag, type PaneTarget, type StackedSplit, type TilingDrag, type TilingDragOptions } from "../src/tiling";

const ops = splitTreeOps<string>();
const AREA: Rect = { x: 0, y: 0, width: 800, height: 500 };
const opts = (more: Partial<TilingDragOptions<StackedSplit<string>, string>> = {}): TilingDragOptions<StackedSplit<string>, string> => ({ ops, area: AREA, min: 40, ...more });
type Drag = TilingDrag<StackedSplit<string>, string>;

/** A column of a over b on the left (40 %), c on the right. Dragging a, the base gives b the whole column. */
const three: StackedSplit<string> = { split: { axis: "x", ratio: 0.4, a: { axis: "y", ratio: 0.5, a: { pane: "a" }, b: { pane: "b" } }, b: { pane: "c" } } };
const dragA = (more: Partial<TilingDragOptions<StackedSplit<string>, string>> = {}): Drag => tilingDrag(three, { kind: "pane", pane: "a" }, opts(more));

/** The target among `targets` whose hit holds `p`, as an intent's pick would find it (one per pane, they don't overlap). */
const targetAt = (targets: readonly PaneTarget<string>[], p: Point): PaneTarget<string> | null =>
  targets.find((t) => p.x >= t.hit.x && p.x <= t.hit.x + t.hit.width && p.y >= t.hit.y && p.y <= t.hit.y + t.hit.height) ?? null;

/** One sample of a host's loop over `targets`: the place id held after it. */
const step = (d: Drag, targets: readonly PaneTarget<string>[], held: string | null, p: Point): string | null => {
  const t = targetAt(targets, p);
  return t ? d.placeOf(t, p, held) : null;
};

const name = (d: Drag, place: string | null): string => {
  const h = place === null ? null : d.heldOf(place);
  return h === null ? "none" : h.kind === "beside" ? `beside ${h.at} ${h.side}` : h.kind === "home" ? "home" : `${h.kind} ${h.at}`;
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

  it("the center is a swap, a band a side drop; heldOf reads the id, and an unknown id is null", () => {
    const d = dragA();
    const b = d.targets[0]!;
    expect(name(d, d.placeOf(b, { x: 160, y: 250 }, null))).toBe("swap b");
    expect(name(d, d.placeOf(b, { x: 160, y: 480 }, null))).toBe("beside b bottom");
    expect(d.heldOf("pane:b/elsewhere")).toBeNull();
  });

  it("a refused place is no place", () => {
    // b's column is 320 wide: two panes of 200 don't fit beside each other.
    const d = dragA({ min: 200 });
    expect(d.placeOf(d.targets[0]!, { x: 5, y: 250 }, null)).toBeNull();
  });
});

describe("tilingDrag: targets on the layout a frame draws", () => {
  // a 0–333 over b 333–500. Nothing moves until the release: the frame draws the lift layout, a's slot left open.
  const tall: StackedSplit<string> = { split: { axis: "x", ratio: 0.4, a: { axis: "y", ratio: 2 / 3, a: { pane: "a" }, b: { pane: "b" } }, b: { pane: "c" } } };
  const dragTall = (): Drag => tilingDrag(tall, { kind: "pane", pane: "a" }, opts());

  it("on the lift layout every pane but the subject's own slot is a target, at the rect it is drawn at", () => {
    const d = dragTall();
    const on = d.targetsOn(d.lift.layout);
    expect(on.map((t) => t.id)).toEqual(["pane:b", "pane:c"]);
    expect(on[0]!.hit).toEqual(d.lift.layout.get("b"));
    // Over the open slot nothing is hit: it is home.
    expect(targetAt(on, { x: 160, y: 100 })).toBeNull();
  });

  it("down through b as drawn: its top band, its whole middle a swap, its bottom band; each switch once, at a drawn edge", () => {
    const d = dragTall();
    const on = d.targetsOn(d.lift.layout);
    const b = d.lift.layout.get("b")!;
    let held: string | null = null;
    const runs: { place: string; from: number }[] = [];
    for (let y = Math.ceil(b.y); y <= b.y + b.height; y += 1) {
      held = step(d, on, held, { x: 160, y });
      const place = name(d, held);
      if (runs.at(-1)?.place !== place) runs.push({ place, from: y });
    }
    expect(runs.map((r) => r.place)).toEqual(["beside b top", "swap b", "beside b bottom"]);
    // Each switch is at b's drawn center edge (34 % of its height, about the middle), the region before held 6 px past it.
    const centerTop = b.y + b.height * 0.33;
    const centerBottom = b.y + b.height * 0.67;
    expect(runs[1]!.from).toBeGreaterThan(centerTop);
    expect(runs[1]!.from).toBeLessThanOrEqual(Math.ceil(centerTop) + 7);
    expect(runs[2]!.from).toBeGreaterThan(centerBottom);
    expect(runs[2]!.from).toBeLessThanOrEqual(Math.ceil(centerBottom) + 7);
  });

  it("place ids name the same place whichever layout the target came from", () => {
    const d = dragTall();
    const onLift = d.targetsOn(d.lift.layout)[0]!;
    const onBase = d.targets[0]!;
    const liftCentre = { x: 160, y: onLift.hit.y + onLift.hit.height / 2 };
    const baseCentre = { x: 160, y: onBase.hit.y + onBase.hit.height / 2 };
    expect(d.placeOf(onLift, liftCentre, null)).toBe(d.placeOf(onBase, baseCentre, null));
  });
});
