/**
 * Kit-shaped windows (dynamic columns, rails, hand folds that ride, a thumbnail anchor): the strip at each window side
 * is never a hole the float fills.
 */
import { describe, expect, it } from "vitest";
import { refusals, targets, type Scene } from "../src/scene";
import { pickTarget } from "../src/scene/cases";
import { FLUSH, INSET, kitScene } from "./kit-scene";

/** What a point picks: a docked target's id, else a refusal's, else the float's (or "-"). */
function pickAt(s: Scene, drag: string, x: number, y: number): string {
  const t = pickTarget(targets(s, drag), { x, y });
  const r = refusals(s, drag).find((q) => x >= q.hit.x && x < q.hit.x + q.hit.width && y >= q.hit.y && y < q.hit.y + q.hit.height);
  return t && !t.free ? t.id : r ? r.id : t ? t.id : "-";
}

describe("kit-shaped windows: the window's sides", () => {
  it("a rail stop that can't land (the panel would ride over an open column) owns nothing: the column line takes the side's edge", () => {
    for (const k of [FLUSH, INSET])
      for (const drag of ["notes", "findings"]) {
        const s = kitScene(k);
        // Every stop of the left rail refuses: the left column stays open, so a folded panel rides over it.
        expect(targets(s, drag).some((t) => t.id.startsWith("rail:left:"))).toBe(false);
        for (let x = 0; x <= 9; x++) expect(pickAt(s, drag, x, 400), `${k === FLUSH ? "flush" : "inset"} ${drag} x ${x}`).toBe("column:left:0");
      }
  });

  it("an edge that takes nothing (a thumbnail anchor) refuses its whole seen rect, its item's body included: no point floats", () => {
    for (const k of [FLUSH, INSET])
      for (const drag of ["notes", "findings"]) {
        const s = kitScene(k, { anchor: true });
        for (let x = 0; x < 60; x++) expect(pickAt(s, drag, x, 400), `${drag} x ${x}`).toMatch(/^refuse:anchor:thumbs:/);
      }
  });

  it("hand folds that ride: the rail strip on each side collapses the panel there, a rider bar over the open column", () => {
    for (const k of [FLUSH, INSET]) {
      const s: Scene = { ...kitScene(k, { W: 1280, H: 800 }), railDrop: { panel: { railStripWidth: 24 } } };
      const ts = targets(s, "notes");
      for (const side of ["left", "right"] as const) {
        const t = ts.find((x) => x.arm === "dwell" && x.place.kind === "rail" && x.place.side === side);
        expect(t, `${side}`).toBeDefined();
        const after = t!.after({ x: t!.hit.x + 2, y: t!.hit.y + t!.hit.height / 2 });
        const me = after.layout.items.notes!;
        // It rides over the side's open column (the scene's hand fold), and the slot is that rider bar.
        expect(me.rides, `${side}`).toBeDefined();
        expect(after.layout.edges[me.rides!]!.side).toBe(side);
        expect(t!.slot).toEqual(me.rect);
      }
    }
  });

  it("a new column holding the item alone where its own column is is home: no column-line sliver beside it", () => {
    for (const k of [FLUSH, INSET]) {
      const s = kitScene(k);
      const ts = targets(s, "findings");
      expect(ts.some((t) => t.id.startsWith("column:right:"))).toBe(false);
      const own = ts.find((t) => t.id === "home:findings")!;
      // Home's pieces: its own rect, and the column lines' stretches beside it.
      for (let x = 1100; x < 1440; x++) expect(pickAt(s, "findings", x, 400), `x ${x}`).toMatch(/^home:findings$|^float:|^rail:right:/);
      expect((own.hits ?? [own.hit]).length).toBeGreaterThan(1);
    }
  });
});
