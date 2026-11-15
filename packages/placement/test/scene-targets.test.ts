import { describe, expect, it } from "vitest";
import { ZONES, reservedRect, solve, targets, use, type Scene } from "../src/scene";
import { bar, byId, column, group, panel, windowScene } from "./scene-fixture";

const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1e-6 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1e-6;
const ids = (s: Scene, id: string) => targets(s, id).map((t) => t.id);

describe("targets", () => {
  const s = windowScene();

  it("only edges whose accepts lists the kind (C25): a panel never lands in a bar", () => {
    // Lifted out, the left column is empty: it offers its strip in thirds. Its center and end thirds lie on Pages' own
    // rect, which home covers, so only the start third (its own place, home) is left.
    expect(ids(s, "pages").filter((t) => t.startsWith("gap:") || t.startsWith("strip:"))).toEqual(["strip:left:start", "gap:right:start:0", "gap:right:start:1", "gap:right:start:2"]);
    expect(ids(s, "views").some((t) => t.startsWith("gap:left"))).toBe(true);
    // The title bar takes groups, never a panel.
    expect(ids(s, "views").some((t) => t.startsWith("gap:titlebar"))).toBe(true);
    expect(ids(s, "pages").some((t) => t.startsWith("gap:titlebar") || t.startsWith("gap:toolbar"))).toBe(false);
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

  it("no hit covers a non-growing fixed item or chrome; no slot covers any fixed item's reserved rect", () => {
    const chrome = [r(600, 32, 60, 36)];
    const sc: Scene = { ...s, chrome };
    const before = solve(sc);
    // The controls and the readout don't grow: no hit over them. The title grows: hits may lie over it, slots never over
    // its natural 160 px.
    const solid = Object.entries(before.items)
      .filter(([id, i]) => i.fixed && id !== "title")
      .map(([, i]) => i.rect);
    const reserved = Object.keys(before.items)
      .filter((id) => before.items[id]!.fixed)
      .map((id) => reservedRect(sc, before, id));
    for (const id of ["views", "tools", "pages", "search"]) {
      for (const t of targets(sc, id)) {
        if (t.place.kind !== "gap") continue;
        for (const f of [...solid, ...chrome]) expect(overlaps(t.hit, f)).toBe(false);
        if (t.slot) for (const f of [...reserved, ...chrome]) expect(overlaps(t.slot, f)).toBe(false);
      }
    }
  });

  it("an empty plain panel column is one zone: one strip down its whole length, holding the item at its start", () => {
    // Items fill a panel column, so it has one zone, the whole column (Revision 9a); its strip is 20 px deep inward.
    const sc: Scene = { ...s, edges: [...s.edges, column("drawer", "right", 1, [], { strip: 20 })] };
    const ts = targets(sc, "pages");
    expect(ts.filter((t) => t.id.startsWith("strip:drawer")).map((t) => t.id)).toEqual(["strip:drawer:start"]);
    const strip = ts.find((t) => t.id === "strip:drawer:start")!;
    expect(strip.hit.x).toBe(920);
    expect(strip.hit.width).toBe(20);
    const after = strip.after({ x: 0, y: 0 }).layout.items.pages!;
    expect(after.edge).toBe("drawer");
    expect(ZONES).toContain(after.zone);
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
    // `home:<id>` is home's tile (Revision 9): it covers the item's own rect, the home slot's hit.
    const home = all.find((t) => t.id === "home:views")!;
    const own = solve(sc).items.views!.rect;
    expect(home.hit.x <= own.x && home.hit.x + home.hit.width >= own.x + own.width && home.hit.y <= own.y && home.hit.y + home.hit.height >= own.y + own.height).toBe(true);
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

describe("gaps are gaps, not halves of items (hitBand)", () => {
  const at = (ts: ReturnType<typeof targets>, p: { x: number; y: number }) => ts.filter((t) => t.place.kind !== "home" && p.x >= t.hit.x && p.x <= t.hit.x + t.hit.width && p.y >= t.hit.y && p.y <= t.hit.y + t.hit.height).map((t) => t.id);
  const tall: Scene = { stage: r(0, 0, 1000, 600), edges: [column("l", "left", 0, ["a"])], items: byId([panel("a", 1), group("g", 2)]), floats: [{ id: "g", rect: r(500, 100, 200, 40), orient: "column" }], floatKinds: ["group"] };

  it("over the middle of a tall panel a group gets no gap; the pointer falls through to the float target", () => {
    const ts = targets(tall, "g");
    expect(at(ts, { x: 100, y: 300 })).toEqual(["float:g"]);
  });

  it("near an edge of the panel it gets that gap", () => {
    const ts = targets(tall, "g");
    expect(at(ts, { x: 100, y: 5 })).toEqual(["gap:l:start:0", "float:g"]);
    expect(at(ts, { x: 100, y: 595 })).toEqual(["gap:l:start:1", "float:g"]);
  });

  it('"middle" splits the column at the items\' middles, as bars do by default', () => {
    const halves: Scene = { ...tall, edges: [column("l", "left", 0, ["a"], { hitBand: "middle" })] };
    expect(at(targets(halves, "g"), { x: 100, y: 290 })).toEqual(["gap:l:start:0", "float:g"]);
    expect(at(targets(windowScene(), "marks"), { x: 600, y: 50 }).some((id) => id.startsWith("gap:toolbar"))).toBe(true);
  });

  for (const side of ["left", "right"] as const) {
    it(`every gap of a three-item ${side} column is reachable, and a between drop lands between (C3)`, () => {
      const sc: Scene = { stage: r(0, 0, 1000, 600), edges: [column("c", side, 0, ["a", "b", "c"])], items: byId([panel("a", 1), panel("b", 2), panel("c", 3), panel("d", 4)]), floats: [{ id: "d", rect: r(400, 100, 200, 200) }], floatKinds: ["panel"] };
      const ts = targets(sc, "d", { endReach: 24 });
      const gaps = ts.filter((t) => t.place.kind === "gap");
      expect(gaps.map((t) => t.id)).toEqual(["gap:c:start:0", "gap:c:start:1", "gap:c:start:2", "gap:c:start:3"]);
      for (const t of gaps) {
        expect(t.hit.height).toBeGreaterThan(0);
        // No two bands overlap.
        for (const u of gaps) if (u !== t) expect(t.hit.y + t.hit.height <= u.hit.y + 1e-6 || u.hit.y + u.hit.height <= t.hit.y + 1e-6).toBe(true);
      }
      // The pointer on the line between a and b drops between them, not at the top.
      const l = solve(sc);
      const line = l.items.b!.rect.y;
      const x = l.edges.c!.rect.x + 10;
      const hit = at(ts, { x, y: line }).filter((id) => id.startsWith("gap:"));
      expect(hit).toEqual(["gap:c:start:1"]);
      const after = gaps.find((t) => t.id === "gap:c:start:1")!.after({ x, y: line });
      expect(after.scene.edges[0]!.items).toEqual(["a", "d", "b", "c"]);
      const ys = ["a", "d", "b", "c"].map((id) => after.layout.items[id]!.rect.y);
      expect([...ys].sort((p, q) => p - q)).toEqual(ys);
      // Past the ends by endReach.
      expect(gaps[0]!.hit.y).toBe(-24);
      expect(gaps[3]!.hit.y + gaps[3]!.hit.height).toBe(624);
    });
  }

  it("the float target's after(point, grab).layout.items[id].rect is the slot to draw", () => {
    const f = targets(tall, "g").find((t) => t.id === "float:g")!;
    const a = f.after({ x: 300, y: 300 }, { x: 10, y: 10 });
    // A vertical float shows the group's icons (28 × 84), held where the pointer holds it.
    expect(a.layout.items.g).toMatchObject({ rect: r(290, 290, 28, 84), formKind: "icons" });
  });
});

describe("a growing fixed title", () => {
  // The fixture's title (natural 160, min 80, grows) fills its bar up to the 84 px controls: drawn 0..1116.
  const s = windowScene();
  const overlapsX = (a: { x: number; width: number }, from: number, to: number) => Math.min(a.x + a.width, to) - Math.max(a.x, from) > 1e-6;

  it("hits tile the bar over the growing title; the slot stays off its natural rect, and the drop shrinks it to make room", () => {
    const gap = targets(s, "views").find((t) => t.id === "gap:titlebar:start:1")!;
    expect(gap).toBeDefined();
    // The pointer over the title's text picks the gap just after it.
    expect(gap.hit.x).toBe(0);
    expect(gap.hit.x + gap.hit.width).toBeLessThanOrEqual(1116);
    const after = gap.after({ x: 0, y: 0 }).layout;
    expect(after.items.views!.edge).toBe("titlebar");
    expect(after.items.title!.rect.x).toBe(0);
    expect(after.items.title!.rect.width).toBeLessThan(1116);
    expect(after.items.title!.rect.width).toBeGreaterThanOrEqual(80);
    // The slot never lies over the title's natural rect.
    expect(overlapsX(gap.slot!, 0, 160)).toBe(false);
  });

  it("reservedRect gives what a fixed item keeps clear: the grown title its natural rect, other fixed items their rect", () => {
    const l = solve(s);
    expect(reservedRect(s, l, "title")).toEqual({ ...l.items.title!.rect, width: 160 });
    for (const [id, it] of Object.entries(l.items)) if (it.fixed && id !== "title") expect(reservedRect(s, l, id)).toEqual(it.rect);
  });

  it("a group moved out of the title bar can always go back (the operator's zoom case)", () => {
    const into = targets(s, "zoom").find((t) => t.id.startsWith("gap:titlebar"))!;
    const s1 = into.after({ x: 0, y: 0 }).scene;
    expect(s1.edges.find((e) => e.id === "titlebar")!.items).toContain("zoom");
    // Held in the title bar, it is offered its place there: dropped back it sits in the bar, the title shrunk.
    const held = targets(s1, "zoom").find((t) => t.id.startsWith("gap:titlebar"))!;
    expect(held).toBeDefined();
    const back = held.after({ x: 0, y: 0 }).layout;
    expect(back.items.zoom!.edge).toBe("titlebar");
    expect(back.items.title!.rect.width).toBeLessThan(1116);
    // Out to the toolbar, then back into the title bar.
    const out = targets(s1, "zoom").find((t) => t.id.startsWith("gap:toolbar") && t.place.kind === "gap")!;
    const s2 = out.after({ x: 0, y: 0 }).scene;
    expect(s2.edges.find((e) => e.id === "toolbar")!.items).toContain("zoom");
    const again = targets(s2, "zoom").find((t) => t.id.startsWith("gap:titlebar") && t.place.kind === "gap")!;
    expect(again.after({ x: 0, y: 0 }).layout.items.zoom!.edge).toBe("titlebar");
  });

  it("a title already at its natural size leaves no room: the bar offers no gap over it", () => {
    const bare: Scene = { stage: { x: 0, y: 0, width: 244, height: 300 }, edges: [s.edges[0]!], items: { title: s.items.title!, controls: s.items.controls!, views: s.items.views! }, floats: [{ id: "views", rect: { x: 0, y: 100, width: 200, height: 30 } }], floatKinds: ["group"] };
    expect(solve(bare).items.title!.rect.width).toBe(160);
    expect(targets(bare, "views").filter((t) => t.id.startsWith("gap:titlebar"))).toEqual([]);
  });
});

describe("content-changed", () => {
  it("is noted under previous whenever the content's rect changes, and only then", () => {
    const s = windowScene();
    const before = solve(s);
    expect(before.notes.some((n) => n.code === "content-changed")).toBe(false);
    expect(solve(s, { previous: before }).notes.some((n) => n.code === "content-changed")).toBe(false);
    const pressed = solve(use(s, "pages"), { previous: before });
    expect(pressed.notes.some((n) => n.code === "content-changed")).toBe(false);
    const wider = solve({ ...s, edges: s.edges.map((e) => (e.id === "left" ? { ...e, size: 320 } : e)) }, { previous: before });
    expect(wider.notes.filter((n) => n.code === "content-changed")).toEqual([{ code: "content-changed", from: r(260, 68, 680, 704), to: r(320, 68, 620, 704) }]);
  });
});

describe("an empty bar's strip", () => {
  it("is three zone strips along the content; a gap spanning one trims its end, a thinner one is smaller and wins the tie-break", () => {
    const s = windowScene();
    // An empty top bar (its strip runs along the top of the content) and a group that may go there.
    const empty: Scene = { ...s, edges: s.edges.map((e) => (e.id === "toolbar" ? { ...e, items: [] } : e)), floats: [{ id: "views", rect: r(500, 300, 200, 40) }] };
    const ts = targets(empty, "views");
    const strips = ["start", "center", "end"].map((z) => ts.find((t) => t.id === `strip:toolbar:${z}`)!);
    for (const strip of strips) expect(strip).toBeDefined();
    const area = (h: { width: number; height: number }) => h.width * h.height;
    const gapsHere = ts.filter((t) => t.id.startsWith("gap:"));
    for (const strip of strips) for (const g of gapsHere) if (overlaps(strip.hit, g.hit)) expect(area(g.hit)).toBeLessThan(area(strip.hit));
    // Together they keep the content's width, in thirds, left to right; each lands in its zone.
    const content = solve(empty).content;
    expect(strips.reduce((w, t) => w + t.hit.width, 0)).toBeGreaterThan(0.9 * content.width);
    expect(strips.map((t) => t.hit.x)).toEqual([...strips.map((t) => t.hit.x)].sort((a, b) => a - b));
    strips.forEach((t, k) => expect(t.after({ x: 0, y: 0 }).layout.items.views!.zone).toBe(["start", "center", "end"][k]));
    // The columns' first gaps keep their hits.
    for (const id of ["gap:left:start:0", "gap:right:start:0"]) expect(ts.find((t) => t.id === id)!.hit.height).toBeGreaterThan(0);
  });
});

describe("a gap's end reach", () => {
  it("never enters another edge's rect: a column's top gap stops at the toolbar above", () => {
    const s = windowScene();
    const l = solve(s);
    const toolbar = l.edges.toolbar!.rect;
    const ts = targets(s, "views", { endReach: 24 });
    for (const id of ["gap:left:start:0", "gap:right:start:0"]) {
      const g = ts.find((t) => t.id === id)!;
      expect(g.hit.y).toBeGreaterThanOrEqual(toolbar.y + toolbar.height - 1e-6);
    }
    for (const t of ts.filter((x) => x.id.startsWith("gap:left") || x.id.startsWith("gap:right"))) {
      for (const [id, e] of Object.entries(l.edges)) if (id !== "left" && id !== "right" && e.rect.width > 0 && e.rect.height > 0) expect(overlaps(t.hit, e.rect)).toBe(false);
    }
  });
});
