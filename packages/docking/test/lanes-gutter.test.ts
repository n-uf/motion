/**
 * The gutter between a column and the pages is open space: `lanes()` gives a landing model `content` = the float region,
 * and `blocked` keeps every drawn edge, docked item, chrome and drawn rail out of it. So a pointer there, coming from the
 * pages, is over open space and a release floats; anything docked stays out of the open space.
 */
import { describe, expect, it } from "vitest";
import { dockDrag, lanes, solve, type DockState } from "../src";
import { createLandingModel } from "@n-uf/motion/drag";
import { INSET, kitState } from "./kit-window";

const strictlyIn = (r: { x: number; y: number; width: number; height: number }, p: { x: number; y: number }): boolean => p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height;

describe("lanes(): the gutter between a column and the pages is open", () => {
  it("open space is the float region less what blocks it: every docked item stays out, the gutter is in", () => {
    const s: DockState = kitState(INSET, { W: 1400, H: 800 });
    const previous = solve(s);
    const rs = lanes(s, "pages", { previous });
    expect(rs.content).toEqual(rs.floatRegion);
    for (const [id, it] of Object.entries(previous.items))
      if (id !== "pages" && !it.inMenu && !it.floating && it.rect.width > 0 && it.rect.height > 0) {
        const c = { x: it.rect.x + it.rect.width / 2, y: it.rect.y + it.rect.height / 2 };
        expect([id, rs.blocked.some((b) => strictlyIn(b, c))]).toEqual([id, true]);
      }
  });

  for (const side of ["left", "right"] as const)
    it(`inset window, one column per side, ${side} column: a pointer in the gutter, come from the pages, is over open space and a release there floats`, () => {
      // One column per side: no new-column line lies over the gutter, so only the open space can take the pointer there.
      const s: DockState = { ...kitState(INSET, { W: 1400, H: 800 }), sideColumns: "one" };
      const previous = solve(s);
      const col = previous.edges[`${side}-0`]!.rect;
      const page = previous.content;
      // The gutter: between the column's inner side and the pages.
      const g0 = side === "left" ? col.x + col.width : page.x + page.width;
      const g1 = side === "left" ? page.x : col.x;
      expect(g1 - g0).toBeGreaterThan(4);
      const gutter = { x: (g0 + g1) / 2, y: page.y + page.height / 2 };
      const held = side === "left" ? "notes" : "pages";
      const own = previous.items[held]!.rect;
      const press = { x: own.x + 10, y: own.y + 12 };
      const grab = { x: 10, y: 12 };
      const rs = lanes(s, held, { previous, grab });
      const home = rs.lanes.flatMap((l) => l.spots.filter((sp) => sp.home).map((sp) => ({ lane: l.id, spot: sp.id })))[0];
      const m = createLandingModel({ ...dockDrag(s, held, { previous, grab }), ...(home ? { home } : {}) });
      const mid = { x: page.x + page.width / 2, y: page.y + page.height / 2 };
      let t = 0;
      m.update(press, t);
      for (const [a, b] of [
        [press, mid],
        [mid, gutter],
      ] as const) {
        const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.3 / 8);
        for (let i = 1; i <= n; i++) m.update({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }, (t += 8));
      }
      for (let i = 0; i < 10; i++) m.update(gutter, (t += 8));
      expect([side, m.frame.region]).toEqual([side, "open"]);
      expect(m.release(gutter, t)?.kind).toBe("float");
    });
});
