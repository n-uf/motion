import { describe, expect, it } from "vitest";
import { solve, targets, type Scene } from "../src/scene";
import { bar, byId, column, group, panel, windowScene } from "./scene-fixture";

const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1e-6 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1e-6;
const ids = (s: Scene, id: string) => targets(s, id).map((t) => t.id);

describe("targets", () => {
  const s = windowScene();

  it("only edges whose accepts lists the kind (C25): a panel never lands in a bar", () => {
    // Lifted out, the left column is empty: it offers a strip.
    expect(ids(s, "pages").filter((t) => t.startsWith("gap:") || t.startsWith("strip:"))).toEqual(["strip:left", "gap:right:start:0", "gap:right:start:1", "gap:right:start:2"]);
    expect(ids(s, "views").some((t) => t.startsWith("gap:left"))).toBe(true);
    expect(ids(s, "views").some((t) => t.startsWith("gap:titlebar"))).toBe(false);
  });

  it("gap ids name the edge, the zone and the place; an empty zone still has one", () => {
    expect(ids(s, "views")).toContain("gap:toolbar:center:0");
    expect(ids(s, "views")).toContain("gap:toolbar:end:1");
  });

  it("no gap where the item doesn't fit: no menu, no overflow, no fixed item moved (C29)", () => {
    // The status bar: anything in its center or end zone would push the centred fixed readout.
    expect(ids(s, "views").filter((t) => t.startsWith("gap:status"))).toEqual(["gap:status:start:0"]);
    const tight = windowScene(700, 600);
    for (const t of targets(tight, "tools")) {
      if (t.place.kind !== "gap") continue;
      const l = t.after({ x: 0, y: 0 }).layout;
      expect(l.items.tools!.inMenu).toBeUndefined();
      expect(l.notes.some((n) => n.code === "overflow")).toBe(false);
    }
  });

  it("no hit covers a fixed item or chrome", () => {
    const chrome = [r(600, 32, 60, 36)];
    const sc: Scene = { ...s, chrome };
    const before = solve(sc);
    const fixedRects = Object.values(before.items).filter((i) => i.fixed).map((i) => i.rect);
    for (const id of ["views", "tools", "pages", "search"]) {
      for (const t of targets(sc, id)) {
        if (t.place.kind !== "gap") continue;
        for (const f of [...fixedRects, ...chrome]) expect(overlaps(t.hit, f)).toBe(false);
      }
    }
  });

  it("an empty accepting edge gets a strip; its after shows the edge holding the item", () => {
    const sc: Scene = { ...s, edges: [...s.edges, column("drawer", "right", 1, [], { strip: 20 })] };
    const strip = targets(sc, "pages").find((t) => t.id === "strip:drawer")!;
    expect(strip.hit).toEqual(r(920, 68, 20, 732));
    expect(strip.after({ x: 0, y: 0 }).layout.items.pages!.edge).toBe("drawer");
  });

  it("a float target over the whole plane when floatKinds has the kind; it lands clear", () => {
    const f = targets(s, "views").find((t) => t.place.kind === "float")!;
    expect(f).toMatchObject({ id: "float:views", priority: 3, free: true });
    const { layout } = f.after({ x: 600, y: 40 }, { x: 10, y: 10 });
    const v = layout.items.views!;
    expect(v.floating).toBe(true);
    for (const e of ["titlebar", "toolbar"]) expect(overlaps(v.rect, layout.edges[e]!.rect)).toBe(false);
    expect(ids({ ...s, floatKinds: ["panel"] }, "views").some((t) => t.startsWith("float"))).toBe(false);
  });

  it("a none target over each blocked rect, and a home stop; both commit nothing", () => {
    const sc: Scene = { ...s, blocked: [r(300, 300, 50, 50)] };
    const all = targets(sc, "views");
    const none = all.find((t) => t.id === "none:0")!;
    expect(none).toMatchObject({ priority: 1, hit: r(300, 300, 50, 50), place: { kind: "none" } });
    expect(none.after({ x: 0, y: 0 }).scene).toBe(sc);
    const home = all.find((t) => t.id === "home:views")!;
    expect(home.hit).toEqual(solve(sc).items.views!.rect);
    expect(home.after({ x: 0, y: 0 }).scene).toBe(sc);
  });

  it("fixed, closed and unknown items have no targets", () => {
    expect(targets(s, "title")).toEqual([]);
    expect(targets(s, "nobody")).toEqual([]);
    expect(targets({ ...s, items: { ...s.items, pages: { ...s.items.pages!, closed: true } } }, "pages")).toEqual([]);
  });

  it("preview = result: solve(after.scene) equals after.layout for every target", () => {
    for (const sc of [s, windowScene(800, 600), { ...s, blocked: [r(0, 0, 10, 10)] }]) {
      const previous = solve(sc);
      for (const id of Object.keys(sc.items)) {
        for (const t of targets(sc, id, { previous, endReach: 12 })) {
          const a = t.after({ x: 400, y: 300 }, { x: 5, y: 5 });
          expect(solve(a.scene, { previous })).toEqual(a.layout);
          if (t.slot) expect(a.layout.items[id]!.rect).toEqual(t.slot);
        }
      }
    }
  });

  it("the dropped item counts as just used", () => {
    const t = targets(s, "pages").find((x) => x.id === "gap:right:start:0")!;
    const a = t.after({ x: 0, y: 0 }).scene;
    expect(a.items.pages!.used).toBeGreaterThan(Math.max(...Object.values(s.items).filter((i) => i.id !== "pages").map((i) => i.used)));
  });

  it("endReach carries the first and last gaps past the edge's ends", () => {
    const sc: Scene = { stage: r(0, 0, 600, 400), edges: [bar("t", "top", 0, ["a"])], items: byId([group("a", 1), group("b", 2)]), floats: [], floatKinds: [] };
    const t = targets(sc, "b", { endReach: 10 }).filter((x) => x.place.kind === "gap");
    expect(t[0]!.hit.x).toBe(-10);
    expect(t.at(-1)!.hit.x + t.at(-1)!.hit.width).toBe(610);
  });

  it("the marker is the insertion line across the edge after the drop", () => {
    const t = targets(s, "notes").find((x) => x.id === "gap:left:start:1")!;
    const l = t.after({ x: 0, y: 0 }).layout;
    expect(t.marker).toEqual(r(0, l.items.notes!.rect.y, l.edges.left!.cross, 0));
  });

  it("works for a scene with a panel column and nothing else", () => {
    const sc: Scene = { stage: r(0, 0, 900, 500), edges: [column("l", "left", 0, ["a", "b"])], items: byId([panel("a", 1), panel("b", 2)]), floats: [], floatKinds: [] };
    expect(ids(sc, "a")).toEqual(["gap:l:start:0", "gap:l:start:1", "home:a"]);
  });
});
