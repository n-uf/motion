/**
 * A side's outer edges, from the window's side inward: its toolbar bars outside the inset, its rail, its anchors
 * outside the inset, the inset, then the columns. With a side bar, the rail and the anchor lie flush after it, outside
 * the inset too; the `rail:` strip lies where the rail lands.
 */
import { describe, expect, it } from "vitest";
import { solve, targets, type Edge, type Scene, type SceneItem } from "../src/scene";
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
