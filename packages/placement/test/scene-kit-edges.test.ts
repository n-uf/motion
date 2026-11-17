/**
 * Kit-shaped windows (dynamic columns, rails, hand folds that ride, a thumbnail anchor): the strip at each window side
 * is never a hole the float fills.
 */
import { describe, expect, it } from "vitest";
import { refusals, solve, stops, targets, type Scene } from "../src/scene";
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

  it("an occupied rail's stops are rail targets, not a dead band: the left column folded by width reopens when the item leaves", () => {
    // Flush, 590 x 757: the left column (Pages, Notes) is folded by width into the left rail. Findings leaves the right
    // column, the content gets room back, and the left column reopens: the lifted item rides over it.
    const s = kitScene(FLUSH, { W: 590, H: 757 });
    expect(solve(s).rails.left!.segments.map((x) => x.id)).toEqual(["pages", "notes"]);
    for (let x = 0; x <= 9; x++) expect(pickAt(s, "findings", x, 378), `x ${x}`).toMatch(/^rail:left:/);
    expect(refusals(s, "findings").filter((r) => r.edge === "rail:left")).toEqual([]);
    for (const t of targets(s, "findings").filter((q) => q.id.startsWith("rail:left:"))) {
      // The slot is the landing: preview = landing, a rider bar or a tile, whichever the hand fold shows.
      const after = t.after({ x: t.hit.x + t.hit.width / 2, y: t.hit.y + t.hit.height / 2 });
      expect(after.layout.items.findings!.rect, t.id).toEqual(t.slot);
      expect(after.scene.items.findings!.from, t.id).toBeGreaterThanOrEqual(1);
    }
  });

  it("property: wherever the item would end up collapsed at the side of an occupied rail, the rail offers stops and refuses nothing", () => {
    // New category: scenes, flush or inset, rails on both sides, hand folds that ride, a width at which a side's column
    // folds into its rail, and the dragged panel docked on the other side or in the same column.
    let checked = 0;
    for (const k of [FLUSH, INSET])
      for (const left of [[["pages", "notes"]], [["pages"]]])
        for (const right of [[["findings"]], [["notes"]]])
          for (let W = 420; W <= 1000; W += 20) {
            const s = kitScene(k, { W, H: 757, left, right });
            const l = solve(s);
            for (const drag of ["pages", "notes", "findings"]) {
              for (const side of ["left", "right"] as const) {
                const rail = l.rails[side];
                if (!rail || rail.segments.length === 0 || l.items[drag]?.rail === side) continue;
                checked++;
                const label = `${k === FLUSH ? "flush" : "inset"} ${JSON.stringify(left)} ${JSON.stringify(right)} W ${W} ${drag} ${side}`;
                expect(targets(s, drag).some((t) => t.id.startsWith(`rail:${side}:`)), label).toBe(true);
                expect(refusals(s, drag).filter((r) => r.edge === `rail:${side}`), label).toEqual([]);
              }
            }
          }
    expect(checked).toBeGreaterThan(20);
  });

  it("property: an occupied rail's stops that land the same are one stop (a rider bar at the top is not offered twice)", () => {
    let railed = 0;
    for (const k of [FLUSH, INSET])
      for (let W = 420; W <= 700; W += 10)
        for (const drag of ["pages", "notes", "findings"]) {
          const s = kitScene(k, { W, H: 757 });
          const l = solve(s);
          for (const side of ["left", "right"] as const) {
            if (!l.rails[side]?.segments.length) continue;
            const mine = stops(s, drag).filter((t) => t.place.kind === "rail" && t.place.side === side);
            const landings = mine.map((t) => JSON.stringify(t.after({ x: t.hit.x + 1, y: t.hit.y + 1 }).layout.items[drag]?.rect));
            expect(new Set(landings).size, `${k === FLUSH ? "flush" : "inset"} W ${W} ${drag} ${side}: ${landings.join(" ")}`).toBe(landings.length);
            if (mine.length) railed++;
          }
        }
    expect(railed).toBeGreaterThan(10);
  });

  it("with the panel strip on, an occupied side keeps the line for a new outermost column: the strip, then the line just inside it, then the column's gaps", () => {
    for (const k of [FLUSH, INSET]) {
      const s: Scene = { ...kitScene(k, { W: 1280, H: 800 }), railDrop: { panel: { railStripWidth: 24 } } };
      const ts = targets(s, "findings");
      const strip = ts.find((t) => t.id === "rail:left:0")!.strip!;
      const line = ts.find((t) => t.id === "column:left:0")!;
      // Just inside the strip, and it lands as the outermost column.
      expect(line.hit.x, k === FLUSH ? "flush" : "inset").toBe(strip.x + strip.width);
      expect(line.place).toEqual({ kind: "column", side: "left", ring: 0 });
      expect(line.after({ x: line.hit.x + 3, y: 30 }).layout.items.findings!.edge).toBeDefined();
      // A sweep along the top, between the column's gaps: the strip, the line, then no gap there (the panel's body: the float).
      const along = (y: number): string[] => {
        const seen: string[] = [];
        for (let x = 0; x < 330; x++) {
          const id = pickAt(s, "findings", x, y);
          if (seen.at(-1) !== id) seen.push(id);
        }
        return seen;
      };
      expect(along(30).slice(0, 3)).toEqual(["rail:left:0", "column:left:0", "float:findings"]);
      // At the gap between the left column's two panels (y 400) the line keeps its band too, as it does with no strip (it
      // beats the inner column it would push): the strip, the line, then the column's own gap.
      expect(along(400).slice(0, 3)).toEqual(["rail:left:0", "column:left:0", "gap:left-0:start:1"]);
      // A host's "Move to ›" reaches it: it is a stop.
      expect(stops(s, "findings").some((t) => t.id === "column:left:0")).toBe(true);
    }
  });

  it("property: wherever the panel strip is on, every occupied side offers the new outermost column line, inside the strip, with no category broken", () => {
    let checked = 0;
    for (const k of [FLUSH, INSET])
      for (const W of [900, 1100, 1280, 1440])
        for (const drag of ["notes", "findings"]) {
          const s: Scene = { ...kitScene(k, { W, H: 800 }), railDrop: { panel: { railStripWidth: 24 } } };
          const l = solve(s);
          const ts = targets(s, drag);
          for (const side of ["left", "right"] as const) {
            // An occupied side: an open column holding something other than the item.
            const col = s.edges.find((e) => e.side === side && e.items.some((x) => x !== drag) && !l.edges[e.id]?.folded);
            if (!col) continue;
            checked++;
            const label = `${k === FLUSH ? "flush" : "inset"} W ${W} ${drag} ${side}`;
            const strip = ts.find((t) => t.id === `rail:${side}:0`)?.strip;
            const line = ts.find((t) => t.place.kind === "column" && t.place.side === side && t.place.ring === 0);
            expect(strip, label).toBeDefined();
            expect(line, label).toBeDefined();
            // Lies beside the strip, on the window's inside: never under it.
            const under = Math.min(line!.hit.x + line!.hit.width, strip!.x + strip!.width) - Math.max(line!.hit.x, strip!.x);
            expect(under, label).toBeLessThanOrEqual(0);
          }
        }
    expect(checked).toBeGreaterThanOrEqual(12);
  });

  /** A flush kit window with card halves (`hitBand: "middle"`) and the default panel strip. */
  const middle = (W: number, k = FLUSH): Scene => {
    const s = kitScene(k, { W, H: 800, left: [["pages", "notes"]], right: [["findings"]] });
    return {
      ...s,
      edges: s.edges.map((e) => (e.column ? { ...e, hitBand: "middle" as const } : e)),
      columns: { left: { ...s.columns!.left!, hitBand: "middle" }, right: { ...s.columns!.right!, hitBand: "middle" } },
      railDrop: { panel: {} },
    };
  };

  it("card halves (hitBand middle) and the strip: the line for a new outermost column keeps its band just inside the strip, and is a stop", () => {
    const s = middle(1400);
    const ts = targets(s, "notes");
    const strip = ts.find((t) => t.id === "rail:right:0")!.strip!;
    const line = ts.find((t) => t.id === "column:right:0");
    expect(line, "column:right:0 is offered").toBeDefined();
    expect(line!.hit.x + line!.hit.width).toBe(strip.x);
    // The card halves stop short of it.
    for (const g of ts.filter((t) => t.place.kind === "gap" && t.place.edge === "right-0")) for (const h of g.hits ?? [g.hit]) expect(h.x + h.width, g.id).toBeLessThanOrEqual(line!.hit.x);
    expect(stops(s, "notes").some((t) => t.id === "column:right:0"), "Move to › reaches it").toBe(true);
    expect(line!.after({ x: line!.hit.x + 2, y: 400 }).layout.items.notes!.edge).toBe("right-1");
  });

  it("property: with card halves and the strip on, every occupied side's line lies inside the strip, beats the card halves and is a stop", () => {
    let checked = 0;
    for (const k of [FLUSH, INSET])
      for (const W of [900, 1100, 1280, 1400, 1440])
        for (const drag of ["pages", "notes", "findings"]) {
          const s = middle(W, k);
          const l = solve(s);
          const ts = targets(s, drag);
          const st = stops(s, drag);
          for (const side of ["left", "right"] as const) {
            const col = s.edges.find((e) => e.side === side && e.items.some((x) => x !== drag) && !l.edges[e.id]?.folded);
            const strip = ts.find((t) => t.id === `rail:${side}:0`)?.strip;
            if (!col || !strip) continue;
            checked++;
            const label = `${k === FLUSH ? "flush" : "inset"} W ${W} ${drag} ${side}`;
            const line = ts.find((t) => t.place.kind === "column" && t.place.side === side && t.place.ring === 0);
            expect(line, label).toBeDefined();
            expect(st.some((t) => t.id === line!.id), `${label}: a stop`).toBe(true);
            const under = Math.min(line!.hit.x + line!.hit.width, strip.x + strip.width) - Math.max(line!.hit.x, strip.x);
            expect(under, label).toBeLessThanOrEqual(0);
            // At mid-height, beside the strip, the point picks the line, not a card half (in the item's own column its own
            // place wins, as with no strip).
            const x = side === "left" ? line!.hit.x + 1 : line!.hit.x + line!.hit.width - 1;
            if (!col.items.includes(drag)) expect(pickAt(s, drag, x, 400), label).toBe(line!.id);
          }
        }
    expect(checked).toBeGreaterThanOrEqual(20);
  });
});
