/** A fixed anchor (page thumbnails: a fixed item alone in a static edge that takes nothing): store, side, fold. */
import { describe, expect, it } from "vitest";
import { targetAt } from "@n-uf/motion/drag";
import { centre } from "../src/geometry";
import { fold, parseTargetId, readScene, refusals, resize, setSide, solve, storeScene, targetId, targets, use, type Scene } from "../src/scene";
import { byId, column, form, panel } from "./scene-fixture";

/** Thumbnails fixed on the left, a panel column beside them, a column on the right. */
export function anchorScene(): Scene {
  return {
    stage: { x: 0, y: 0, width: 1200, height: 800 },
    edges: [
      { id: "anchor:thumbs", side: "left", ring: 0, accepts: [], items: ["thumbs"], cross: { min: 80, max: 400, rail: 30 } },
      column("left", "left", 1, ["notes"]),
      column("right", "right", 0, ["findings"]),
    ],
    items: byId([
      { id: "thumbs", kind: "thumbs", used: 1, fixed: true, forms: { column: [form("open", 120, 240, 160, { grows: true, crossMin: 80 }), form("rail", 28, 28, 30)] } },
      panel("notes", 2),
      panel("findings", 3),
    ]),
    floats: [],
    floatKinds: ["panel"],
  };
}

describe("an anchor dragged to the other side", () => {
  const movable = (): Scene => ({ ...anchorScene(), edges: anchorScene().edges.map((e) => (e.id === "anchor:thumbs" ? { ...e, moves: "side" as const } : e)) });

  it("has one target, side:<other side>, over the place its edge takes there; preview = landing", () => {
    const s = movable();
    const ts = targets(s, "thumbs");
    expect(ts.map((t) => t.id).sort()).toEqual(["home:thumbs", "side:right"]);
    const side = ts.find((t) => t.id === "side:right")!;
    const moved = solve(use(setSide(s, "anchor:thumbs", "right"), "thumbs"));
    expect(side.hit).toEqual(moved.edges["anchor:thumbs"]!.rect);
    expect(side.place).toEqual({ kind: "side", edge: "anchor:thumbs", side: "right" });
    const after = side.after({ x: side.hit.x + 4, y: side.hit.y + 4 });
    expect(side.slot).toEqual(after.layout.items.thumbs!.rect);
    expect(after.layout.edges["anchor:thumbs"]!.side).toBe("right");
    // Its own place is home; nothing else of the window is a target.
    expect(targetAt(ts, centre(solve(s).items.thumbs!.rect))?.place.kind).toBe("home");
    expect(targetAt(ts, { x: 600, y: 400 })).toBeNull();
    expect(refusals(s, "thumbs")).toEqual([]);
    expect(parseTargetId("side:right")).toEqual({ kind: "side", side: "right" });
    expect(targetId({ kind: "side", side: "left" })).toBe("side:left");
  });

  it("a fixed item on an edge that doesn't move has no targets, and never a gap", () => {
    expect(targets(anchorScene(), "thumbs")).toEqual([]);
    for (const t of targets(movable(), "thumbs")) expect(t.place.kind === "gap").toBe(false);
  });
});

describe("an anchor folded by hand", () => {
  const foldable = (): Scene => ({ ...anchorScene(), edges: anchorScene().edges.map((e) => (e.id === "anchor:thumbs" ? { ...e, foldable: true } : e)) });

  it("folds to its rail form and reopens, on an edge that allows it; the store keeps the fold", () => {
    const s = foldable();
    const folded = fold(s, "thumbs", true);
    expect(solve(folded).items.thumbs!.formKind).toBe("rail");
    expect(solve(fold(folded, "thumbs", false)).items.thumbs!.formKind).toBe("open");
    // A click on its rail segment reopens it as it does a hand-folded panel: `fold(id, false)` + `use`.
    const l = solve(folded);
    expect(solve(use(fold(folded, "thumbs", false), "thumbs"), { previous: l, fresh: ["thumbs"] }).items.thumbs!.formKind).toBe("open");
    const back = readScene(JSON.parse(JSON.stringify(storeScene(folded))), s);
    expect(back.dropped).toEqual([]);
    expect(solve(back.scene)).toEqual(solve(folded));
  });

  it("stays as it is on an edge that doesn't (the default): fold is a no-op, a stored fold is dropped", () => {
    const s = anchorScene();
    expect(fold(s, "thumbs", true)).toBe(s);
    const stored = storeScene(s);
    const withFrom = { ...stored, items: { ...stored.items, thumbs: { ...stored.items.thumbs!, from: 1 } } };
    const back = readScene(JSON.parse(JSON.stringify(withFrom)), s);
    expect(back.dropped).toEqual(["item:thumbs:from"]);
    expect(solve(back.scene).items.thumbs!.formKind).toBe("open");
  });
});

describe("a fixed anchor's edge in the store", () => {
  it("reads back on the side and at the width it was stored with", () => {
    const base = anchorScene();
    const moved = resize(setSide(base, "anchor:thumbs", "right"), "anchor:thumbs", 120);
    const l = solve(moved);
    expect(l.items.thumbs!.rect.x + l.items.thumbs!.rect.width).toBe(1200);
    expect(l.items.thumbs!.rect.width).toBe(120);
    const back = readScene(JSON.parse(JSON.stringify(storeScene(moved))), base);
    expect(back.dropped).toEqual([]);
    expect(solve(back.scene)).toEqual(l);
  });

  it("listed inside another edge's entry (a legacy store), that entry moves the anchor's own edge: its side and its size", () => {
    const base = anchorScene();
    const expected = solve(resize(setSide(base, "anchor:thumbs", "right"), "anchor:thumbs", 120));
    const stored = storeScene(base);
    const others = stored.edges.filter((e) => e.id !== "anchor:thumbs");
    // An entry of its own under another id, on the right at 120 px.
    const own = { ...stored, edges: [...others, { id: "thumbs-right", side: "right" as const, ring: 0, items: ["thumbs"], size: 120 }] };
    const a = readScene(JSON.parse(JSON.stringify(own)), base);
    expect(a.dropped).toEqual([]);
    expect(solve(a.scene)).toEqual(expected);
    // Listed in the right column's entry, before its panel: the column keeps its items and its own size.
    const inRight = { ...stored, edges: others.map((e) => (e.id === "right" ? { ...e, items: ["thumbs", ...e.items], size: 120 } : e)) };
    const b = readScene(JSON.parse(JSON.stringify(inRight)), base);
    expect(b.dropped).toEqual([]);
    expect(solve(b.scene)).toEqual(expected);
  });
});
