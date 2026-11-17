/**
 * `SceneItemLayout.foldedBy`: why an item is drawn smaller than its first form, read from the scene's own state. By hand
 * (`SceneItem.from`, which `fold` sets) or by give-way (`"auto"`: a form below the one it started in); absent otherwise.
 */
import { describe, expect, it } from "vitest";
import { close, fold, solve, type Edge, type Scene, type SceneLayout } from "../src/scene";
import { bar, byId, column, controls, group, panel, title } from "./scene-fixture";

const by = (l: SceneLayout, ids: readonly string[]): (string | null)[] => ids.map((id) => l.items[id]?.foldedBy ?? null);

/** A toolbar of three groups (row 200, icons 84, then the » menu) under a title bar, and nothing else. */
function toolbar(width: number): Scene {
  return {
    stage: { x: 0, y: 0, width, height: 400 },
    edges: [{ id: "titlebar", side: "top", ring: 0, accepts: [], items: ["title", "controls"], cross: { min: 32, max: 32, rail: 32 } }, bar("toolbar", "top", 1, ["a", "b", "c"], { menu: { main: 28 } })],
    items: byId([title(), controls(), group("a", 1), group("b", 2), group("c", 3)]),
    floats: [],
    floatKinds: ["panel", "group"],
  };
}

/** Three panels in one left column, `height` tall. */
function panels(height: number, more: Partial<Scene["items"][string]> = {}): Scene {
  return {
    stage: { x: 0, y: 0, width: 800, height },
    edges: [column("left", "left", 0, ["p", "q", "r"])],
    items: byId([panel("p", 1, more), panel("q", 2), panel("r", 3)]),
    floats: [],
    floatKinds: ["panel"],
  };
}

describe("foldedBy: why an item is folded", () => {
  it("is absent while every item shows its first form", () => {
    const l = solve(toolbar(1200));
    expect(by(l, ["title", "controls", "a", "b", "c"])).toEqual([null, null, null, null, null]);
    expect(by(solve(panels(900)), ["p", "q", "r"])).toEqual([null, null, null]);
  });

  it("is 'hand' for an item folded by hand, and gone once it is unfolded", () => {
    const s = fold(panels(900), "q", true);
    expect(s.items.q!.from).toBe(1);
    expect(by(solve(s), ["p", "q", "r"])).toEqual([null, "hand", null]);
    expect(by(solve(fold(s, "q", false)), ["p", "q", "r"])).toEqual([null, null, null]);
  });

  it("is 'auto' for an item that gave way by length, and gone when the room returns (under previous too)", () => {
    const tall = solve(panels(900));
    const short = solve(panels(150), { previous: tall });
    // Whoever gave way is in a smaller form than its first, and is told "auto"; the rest show open.
    const gave = ["p", "q", "r"].filter((id) => short.items[id]!.form > 0);
    expect(gave.length).toBeGreaterThan(0);
    for (const id of ["p", "q", "r"]) expect(short.items[id]!.foldedBy ?? null).toBe(short.items[id]!.form > 0 ? "auto" : null);
    const back = solve(panels(900), { previous: short });
    expect(by(back, ["p", "q", "r"])).toEqual([null, null, null]);
  });

  it("is 'auto' for a toolbar group that gave way by width: its icons and its » menu entry", () => {
    const l = solve(toolbar(520));
    const forms = ["a", "b", "c"].map((id) => l.items[id]!.formKind);
    expect(forms).toContain("icons");
    for (const id of ["a", "b", "c"]) expect(l.items[id]!.foldedBy ?? null).toBe(l.items[id]!.form > 0 ? "auto" : null);
    const menu = solve(toolbar(330));
    const inMenu = ["a", "b", "c"].filter((id) => menu.items[id]!.inMenu);
    expect(inMenu.length).toBeGreaterThan(0);
    for (const id of inMenu) expect(menu.items[id]!.foldedBy).toBe("auto");
    // Wide again: nothing is folded.
    expect(by(solve(toolbar(1200), { previous: menu }), ["a", "b", "c"])).toEqual([null, null, null]);
  });

  it("walks 'auto' down and back up with the width, the same item reporting it from its first step to its last", () => {
    let prev: SceneLayout | undefined;
    const seen: Record<string, string | null>[] = [];
    for (const w of [1200, 900, 700, 520, 400, 330, 400, 520, 700, 900, 1200]) {
      prev = solve(toolbar(w), prev ? { previous: prev } : {});
      seen.push(Object.fromEntries(["a", "b", "c"].map((id) => [id, prev!.items[id]!.foldedBy ?? null])));
      for (const id of ["a", "b", "c"]) expect(prev.items[id]!.foldedBy ?? null).toBe(prev.items[id]!.form > 0 ? "auto" : null);
    }
    expect(seen[0]).toEqual({ a: null, b: null, c: null });
    expect(seen[seen.length - 1]).toEqual({ a: null, b: null, c: null });
    expect(seen.some((x) => Object.values(x).includes("auto"))).toBe(true);
  });

  it("keeps 'hand' for a hand-folded item that gave way further", () => {
    const l = solve(panels(120, { from: 1 }));
    expect(l.items.p!.foldedBy).toBe("hand");
    expect(l.items.p!.form).toBeGreaterThanOrEqual(1);
  });

  it("is never set on a fixed item that keeps its form, or a closed one", () => {
    const l = solve(toolbar(330));
    expect(by(l, ["title", "controls"])).toEqual([null, null]);
    const s = close(fold(panels(900), "q", true), "q");
    expect(solve(s).items.q?.foldedBy ?? null).toBe(null);
  });

  it("is not set for the form an icons-only edge gives its items, only for what gave way past it (the » menu)", () => {
    const s: Scene = {
      stage: { x: 0, y: 0, width: 800, height: 400 },
      edges: [{ id: "rail", side: "left", ring: 0, accepts: ["group"], items: ["a", "b", "c", "d"], cross: { min: 30, max: 30, rail: 30 }, compact: true, menu: { main: 28 } }],
      items: byId([group("a", 1), group("b", 2), group("c", 3), group("d", 4)]),
      floats: [],
      floatKinds: [],
    };
    const roomy = solve({ ...s, stage: { ...s.stage, height: 800 } });
    expect(["a", "b", "c", "d"].map((id) => roomy.items[id]!.formKind)).toEqual(["icons", "icons", "icons", "icons"]);
    expect(by(roomy, ["a", "b", "c", "d"])).toEqual([null, null, null, null]);
    const tight = solve({ ...s, stage: { ...s.stage, height: 200 } });
    const out = ["a", "b", "c", "d"].filter((id) => tight.items[id]!.inMenu);
    expect(out.length).toBeGreaterThan(0);
    for (const id of ["a", "b", "c", "d"]) expect(tight.items[id]!.foldedBy ?? null).toBe(tight.items[id]!.inMenu ? "auto" : null);
  });

  it("says 'hand' for a float folded by hand, nothing for an open one, and never 'auto'", () => {
    const base: Scene = { ...panels(900), edges: [], floats: [{ id: "p", rect: { x: 100, y: 100, width: 300, height: 300 } }, { id: "q", rect: { x: 450, y: 100, width: 300, height: 300 } }] };
    expect(by(solve(base), ["p", "q"])).toEqual([null, null]);
    expect(by(solve(fold(base, "q", true)), ["p", "q"])).toEqual([null, "hand"]);
  });

  describe("columns folded into their side's rail", () => {
    const tpl = { accepts: ["panel"], cross: { min: 160, max: 480, rail: 30 } };
    const edges = (): Edge[] => [{ ...column("left-0", "left", 0, ["p"]), column: true, accepts: ["panel"], cross: tpl.cross }];
    const scene = (width: number, more: Partial<Scene> = {}, p = panel("p", 1)): Scene => ({
      stage: { x: 0, y: 0, width, height: 600 },
      edges: edges(),
      items: byId([p]),
      floats: [],
      floatKinds: ["panel"],
      columns: { left: tpl, right: tpl },
      rails: { left: { width: 30, accepts: ["panel"] }, right: { width: 30, accepts: ["panel"] } },
      contentMin: { width: 340, height: 200 },
      ...more,
    });

    it("by give-way: 'auto', and the column's own `folded` says the same", () => {
      const wide = solve(scene(900));
      expect(wide.items.p!.foldedBy).toBeUndefined();
      const narrow = solve(scene(420), { previous: wide });
      expect(narrow.items.p!.rail).toBe("left");
      expect(narrow.items.p!.folded).toBe("auto");
      expect(narrow.items.p!.foldedBy).toBe("auto");
      // Room returns: unfolded again.
      expect(solve(scene(900), { previous: narrow }).items.p!.foldedBy).toBeUndefined();
    });

    it("by hand: 'hand', in the rail and riding", () => {
      const p = panel("p", 1, { from: 1 });
      const railed = solve(scene(900, {}, p));
      expect(railed.items.p).toMatchObject({ rail: "left", folded: "hand", foldedBy: "hand" });
      const ride: Scene = scene(900, { handFold: "ride" }, p);
      const two: Scene = { ...ride, edges: [...ride.edges, { ...column("left-1", "left", 1, ["q"]), column: true, accepts: ["panel"], cross: tpl.cross }], items: { ...ride.items, q: panel("q", 2) } };
      const l = solve(two);
      expect(l.items.p).toMatchObject({ rides: "left-1", folded: "hand", foldedBy: "hand" });
      expect(l.items.q!.foldedBy).toBeUndefined();
    });

    it("a hand fold wins over a column that gave way too", () => {
      const l = solve({ ...scene(420, {}, panel("p", 1, { from: 1 })) });
      expect(l.items.p!.foldedBy).toBe("hand");
    });
  });
});
