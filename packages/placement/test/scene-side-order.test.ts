/**
 * A side's outer edges, from the window's side inward: its toolbar bars outside the inset, its rail, its anchors
 * outside the inset, the inset, then the columns. With a side bar, the rail and the anchor lie flush after it, outside
 * the inset too; the `rail:` strip lies where the rail lands.
 */
import { describe, expect, it } from "vitest";
import { isOutsideSideBar, solve, targets, type Edge, type Scene, type SceneItem } from "../src/scene";
import { bar, byId, column, group, panel } from "./scene-fixture";

const thumbs: SceneItem = { id: "thumbs", kind: "anchor", used: 0, fixed: true, forms: { column: [{ kind: "open", main: { min: 0, natural: 0, grows: true }, cross: { natural: 72, min: 56 }, setsCross: true }] } };
const GUTTER = 8;

/** A top bar, maybe a left side bar (36) and a left anchor (72), a left and a right panel column, rails 30 wide. */
function scene(o: { sideBar?: boolean; anchor?: boolean; inset?: number; fold?: boolean; W?: number }): Scene {
  const tpl = { accepts: ["panel"], cross: { min: 160, max: 480, rail: 30 } };
  const items: SceneItem[] = [panel("p1", 1, o.fold ? { from: 1 } : {}), panel("p2", 2), group("g2", 4)];
  const edges: Edge[] = [bar("top", "top", 0, ["g2"])];
  if (o.sideBar) {
    items.push(group("g1", 3));
    edges.push({ id: "sbar", side: "left", ring: 0, accepts: ["group"], items: ["g1"], cross: { min: 36, max: 36, rail: 36 }, outsideInset: true });
  }
  if (o.anchor) {
    items.push(thumbs);
    edges.push({ id: "anchor", side: "left", ring: 1, accepts: [], items: ["thumbs"], cross: { min: 56, max: 200, rail: 56 }, outsideInset: true });
  }
  edges.push({ ...column("left-0", "left", 2, ["p1"]), column: true, accepts: ["panel"], cross: tpl.cross });
  edges.push({ ...column("right-0", "right", 0, ["p2"]), column: true, accepts: ["panel"], cross: tpl.cross });
  const i = o.inset ?? 0;
  return {
    stage: { x: 0, y: 0, width: o.W ?? 1200, height: 700 },
    edges,
    items: byId(items),
    floats: [],
    floatKinds: ["panel", "group"],
    columns: { left: tpl, right: tpl },
    rails: { left: { width: 30, accepts: ["panel"] }, right: { width: 30, accepts: ["panel"] } },
    contentMin: { width: 300, height: 200 },
    gutter: GUTTER,
    inset: { left: i, right: i, top: i, bottom: i },
    handFold: "bar",
  };
}

const span = (r: { x: number; width: number }): [number, number] => [r.x, r.x + r.width];

describe("a side's order with an inset", () => {
  it("inset 12, the column folded: side bar 0–36, rail 36–66, anchor 66–138, then the inset; open: the anchor at 36", () => {
    const f = solve(scene({ sideBar: true, anchor: true, inset: 12, fold: true }));
    expect(span(f.edges.sbar!.rect)).toEqual([0, 36]);
    expect(span(f.rails.left!.rect)).toEqual([36, 66]);
    expect(span(f.edges.anchor!.rect)).toEqual([66, 138]);
    expect(f.content.x).toBe(150);
    const o = solve(scene({ sideBar: true, anchor: true, inset: 12 }));
    expect(span(o.edges.sbar!.rect)).toEqual([0, 36]);
    expect(span(o.edges.anchor!.rect)).toEqual([36, 108]);
    expect(o.edges["left-0"]!.rect.x).toBe(120);
  });

  it("sweep, insets 0 and 12: the bar outermost, the rail and the anchor flush after it, then the inset (at least a gutter)", () => {
    for (const inset of [0, 12])
      for (const fold of [false, true])
        for (let W = 500; W <= 1400; W += 50) {
          const at = `inset ${inset} fold ${fold} W ${W}`;
          const l = solve(scene({ sideBar: true, anchor: true, inset, fold, W }));
          expect(span(l.edges.sbar!.rect), at).toEqual([0, 36]);
          const rail = l.rails.left?.rect;
          const a = l.edges.anchor!.rect;
          if (rail) {
            expect(span(rail), at).toEqual([36, 66]);
            expect(a.x, at).toBe(66);
            expect(l.content.x, at).toBe(a.x + a.width + Math.max(inset, GUTTER));
          } else {
            expect(a.x, at).toBe(36);
            const col = l.edges["left-0"]!.rect;
            if (col.width > 0) expect(col.x, at).toBe(a.x + a.width + inset);
          }
        }
  });
});

describe("the rail strip lies where the rail lands", () => {
  it("with and without a side bar, an anchor and an inset: the strip's outer edge is the landed rail's", () => {
    let n = 0;
    for (const sideBar of [false, true])
      for (const anchor of [false, true])
        for (const inset of [0, 12]) {
          const s = scene({ sideBar, anchor, inset });
          expect(solve(s).rails.left, "no rail shown").toBeUndefined();
          for (const t of targets(s, "p2").filter((x) => x.id.startsWith("rail:left:"))) {
            const landed = t.after({ x: t.hit.x + t.hit.width / 2, y: t.hit.y + t.hit.height / 2 }).layout.rails.left!.rect;
            expect(t.hit.x, `${t.id} bar ${sideBar} anchor ${anchor} inset ${inset}`).toBe(landed.x);
            n++;
          }
        }
    expect(n).toBeGreaterThanOrEqual(8);
  });
});

describe("isOutsideSideBar", () => {
  const sbar: Edge = { id: "sbar", side: "left", ring: 0, accepts: ["group"], items: [], cross: { min: 36, max: 36, rail: 36 }, outsideInset: true };
  const panels: Edge = { id: "pan", side: "left", ring: 0, accepts: ["panel"], items: [], cross: { min: 160, max: 480, rail: 30 }, outsideInset: true };
  it("needs a template or a rail on the side, and takes none of their kinds", () => {
    const s = scene({});
    expect(isOutsideSideBar(s, sbar)).toBe(true);
    expect(isOutsideSideBar(s, panels)).toBe(false);
    // No template and no rail on the side: nothing tells a bar from a panel edge, so nothing is a bar.
    const bare: Scene = { ...s, columns: { right: s.columns!.right! }, rails: { right: s.rails!.right! } };
    expect(isOutsideSideBar(bare, sbar)).toBe(false);
    expect(isOutsideSideBar(bare, panels)).toBe(false);
    // A rail alone: its kinds count too.
    const railOnly: Scene = { ...s, columns: { right: s.columns!.right! } };
    expect(isOutsideSideBar(railOnly, sbar)).toBe(true);
    expect(isOutsideSideBar(railOnly, panels)).toBe(false);
    // An anchor (it takes nothing) and an edge inside the inset are never bars.
    expect(isOutsideSideBar(s, { ...sbar, accepts: [] })).toBe(false);
    expect(isOutsideSideBar(s, { ...sbar, outsideInset: false })).toBe(false);
  });

  it("a static panel edge outside the inset on a side with no template is not laid as a bar: it keeps its ring order", () => {
    // Left, no template or rail: an anchor (ring 0) and a static panel edge outside the inset (ring 1). Taken for a
    // bar, the panel edge would jump outside the anchor; it isn't one, so they lie by ring, the anchor at the window edge.
    const s = scene({ anchor: true });
    const anchor = s.edges.find((e) => e.id === "anchor")!;
    const pe: Edge = { ...panels, ring: 1, items: ["p1"] };
    const bare: Scene = { ...s, edges: [s.edges[0]!, { ...anchor, ring: 0 }, pe, s.edges.find((e) => e.id === "right-0")!], columns: { right: s.columns!.right! }, rails: { right: s.rails!.right! } };
    const l = solve(bare);
    expect(l.edges.anchor!.rect.x).toBe(0);
    expect(l.edges.pan!.rect.x).toBe(72);
  });
});

describe("an empty bar outside the inset draws as nothing", () => {
  /** What the layout draws, less one edge (its rect may sit anywhere at size 0). */
  const drawn = (s: Scene, skip: string) => {
    const l = solve(s);
    return { content: l.content, rails: l.rails, items: l.items, edges: Object.fromEntries(Object.entries(l.edges).filter(([id]) => id !== skip)) };
  };
  const without = (s: Scene, id: string): Scene => ({ ...s, edges: s.edges.filter((e) => e.id !== id) });

  it("an empty or closed side bar gives the layout of no bar, at every width, folded and open, with and without an inset", () => {
    for (const inset of [0, 12])
      for (const fold of [false, true])
        for (const anchor of [false, true])
          for (let W = 500; W <= 1400; W += 100) {
            const at = `inset ${inset} fold ${fold} anchor ${anchor} W ${W}`;
            const s = scene({ sideBar: true, anchor, inset, fold, W });
            const empty: Scene = { ...s, edges: s.edges.map((e) => (e.id === "sbar" ? { ...e, items: [] } : e)) };
            const closed: Scene = { ...s, items: { ...s.items, g1: { ...s.items.g1!, closed: true } } };
            const none = drawn(without(s, "sbar"), "sbar");
            expect(drawn(empty, "sbar"), `empty, ${at}`).toEqual(none);
            // A closed item is drawn nowhere: everything else as with no bar.
            const c = drawn(closed, "sbar");
            expect({ ...c, items: Object.fromEntries(Object.entries(c.items).filter(([id]) => id !== "g1")) }, `closed, ${at}`).toEqual(none);
          }
  });

  it("an empty top bar outside the inset keeps nothing from the inset: the layout of no bar", () => {
    for (const inset of [0, 12])
      for (const fold of [false, true])
        for (let W = 500; W <= 1400; W += 100) {
          const at = `inset ${inset} fold ${fold} W ${W}`;
          const s = scene({ sideBar: true, anchor: true, inset, fold, W });
          const out: Scene = { ...s, edges: s.edges.map((e) => (e.id === "top" ? { ...e, items: [], outsideInset: true } : e)) };
          expect(drawn(out, "top"), at).toEqual(drawn(without(s, "top"), "top"));
        }
  });
});

describe("columnRoom counts a side toolbar bar's width", () => {
  const without = (s: Scene, id: string): Scene => ({ ...s, edges: s.edges.filter((e) => e.id !== id) });
  const room = (s: Scene) => {
    const l = solve(s);
    return { room: l.columnRoom, note: l.notes.find((n) => n.code === "no-column-room") ?? null };
  };

  it("a bar with an item takes its width (and its gutter when inside the inset): as no bar in a window that much narrower", () => {
    let flips = 0;
    for (const inset of [0, 12])
      for (const fold of [false, true])
        for (const outside of [true, false])
          for (let W = 400; W <= 900; W += 10) {
            const at = `inset ${inset} fold ${fold} outside ${outside} W ${W}`;
            const base = scene({ sideBar: true, inset, fold, W });
            const s: Scene = { ...base, edges: base.edges.map((e) => (e.id === "sbar" ? { ...e, outsideInset: outside } : e)) };
            // The bar is 36 wide; inside the inset a gutter (8) follows it.
            const taken = 36 + (outside ? 0 : GUTTER);
            const narrower = without(scene({ sideBar: true, inset, fold, W: W - taken }), "sbar");
            expect(room(s), at).toEqual(room(narrower));
            if (room(s).room !== room(without(s, "sbar")).room) flips++;
          }
    // The bar decides it at some widths.
    expect(flips).toBeGreaterThan(0);
  });

  it("an empty or closed side bar takes nothing; the layout never changes, only columnRoom and its note", () => {
    for (let W = 400; W <= 900; W += 10) {
      const s = scene({ sideBar: true, inset: 12, W });
      const empty: Scene = { ...s, edges: s.edges.map((e) => (e.id === "sbar" ? { ...e, items: [] } : e)) };
      const closed: Scene = { ...s, items: { ...s.items, g1: { ...s.items.g1!, closed: true } } };
      const none = room(without(s, "sbar"));
      expect(room(empty), `empty at ${W}`).toEqual(none);
      expect(room(closed), `closed at ${W}`).toEqual(none);
    }
  });
});
