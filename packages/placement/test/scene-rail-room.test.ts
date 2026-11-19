/** A rail target whose drop pushes what lies beside it opens its room as it shows (`Target.opensRoom`). */
import { createDragIntent, type DragTarget } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import { solve, targets, type Scene } from "../src/scene";
import { bar, byId, column, group, panel } from "./scene-fixture";

/** A toolbar on top, an empty or filled compact rail at the left, a panel column beside it. */
const win = (rail: readonly string[] = []): Scene => ({
  stage: { x: 0, y: 0, width: 1200, height: 800 },
  edges: [
    bar("top", "top", 0, ["a", "b"]),
    { id: "rail", side: "left", ring: 0, accepts: ["group"], items: [...rail], cross: { min: 36, max: 36, rail: 36 }, gap: 4, compact: true },
    column("left", "left", 1, ["p"]),
  ],
  items: byId([group("a", 1), group("b", 2), group("c", 3), panel("p", 4)]),
  floats: [],
  floatKinds: ["group"],
});

describe("a rail that pushes a column", () => {
  it("marks the targets of an empty rail, whose drop moves the column, and no other", () => {
    const s = win();
    const before = solve(s).items.p!.rect;
    const ts = targets(s, "a");
    const onRail = ts.filter((t) => t.id.includes(":rail:"));
    expect(onRail.length).toBeGreaterThan(0);
    for (const t of onRail) {
      expect(t.opensRoom, t.id).toBe(true);
      expect(t.after({ x: 10, y: 400 }).layout.items.p!.rect.x).toBeGreaterThan(before.x);
    }
    for (const t of ts.filter((x) => x.place.kind === "gap" && x.place.edge === "top")) expect(t.opensRoom, t.id).toBeUndefined();
    expect(ts.find((t) => t.place.kind === "float")?.opensRoom).toBeUndefined();
  });

  it("a rail already drawn at its width moves nothing, so its gaps show as any gap does", () => {
    const s = win(["c"]);
    for (const t of targets(s, "a").filter((x) => x.id.includes(":rail:"))) expect(t.opensRoom, t.id).toBeUndefined();
  });

  it("a host driving the intent gets the target and its room in one frame", () => {
    const s = win();
    const list = targets(s, "a") as unknown as DragTarget[];
    const home = solve(s).items.a!.rect;
    const intent = createDragIntent<DragTarget>({ home });
    intent.update({ x: home.x + 4, y: home.y + 4 }, 0, list);
    const p = { x: 4, y: 400 };
    let first = null;
    for (let t = 16; t < 400 && !first; t += 16) {
      const f = intent.update(p, t, list);
      if (f.shown) first = f;
    }
    expect(first!.shown!.id).toContain(":rail:");
    expect(first!.room).toBe(true);
  });
});
