/**
 * Q7: a growing fixed item (a title) no longer takes its zone's drop room. Growth is spare room, not owned room: for
 * target room a growing fixed item counts at its natural length, not its grown length, so a drop beside it lands exactly
 * where it would beside a fixed item of that length that doesn't grow, and the title yields its growth to the landing,
 * never its natural length.
 */
import { describe, expect, it } from "vitest";
import { solve, stops, targets, type DockState } from "../src";
import { doc, form, tweakEdge } from "../src/testing/world";

/** The title bar: a title (`min` = `natural` = 160, growing or not), Views after it, the controls; Zoom is held. */
function caseB(width: number, grows: boolean): DockState {
  const s = tweakEdge(doc({ width }), "titlebar", { items: ["title", "views", "controls"] });
  return { ...s, items: { ...s.items, title: { ...s.items.title!, forms: { row: [form("row", 160, 160, 32, grows ? { grows: true } : {})] } } } };
}
const ORIGIN = { x: 0, y: 0 };
const titleStops = (s: DockState) => stops(s, "zoom").filter((t) => t.id.startsWith("gap:titlebar"));

describe("a growing fixed item's growth is spare room for a drop", () => {
  it("case B: beside a growing title the drop lands as it does beside the same title not growing", () => {
    for (let w = 520; w <= 600; w += 20) {
      const grown = titleStops(caseB(w, true));
      const plain = titleStops(caseB(w, false));
      expect(grown.map((t) => t.id), `${w}`).toEqual(plain.map((t) => t.id));
      expect(grown.length, `${w}`).toBeGreaterThan(0);
      for (const t of grown) {
        const a = t.after(ORIGIN, ORIGIN).layout;
        const b = plain.find((x) => x.id === t.id)!.after(ORIGIN, ORIGIN).layout;
        expect(a.items.title!.rect.width, `${w} ${t.id}`).toBeGreaterThanOrEqual(160 - 0.5);
        for (const id of ["zoom", "views", "controls"]) expect([a.items[id]!.form, !!a.items[id]!.inMenu], `${w} ${t.id} ${id}`).toEqual([b.items[id]!.form, !!b.items[id]!.inMenu]);
      }
    }
  });

  it("no neighbor steps when growth alone makes room", () => {
    const s0 = doc({ width: 900 });
    const s: DockState = { ...s0, items: { ...s0.items, title: { ...s0.items.title!, forms: { row: [form("row", 80, 160, 32, { grows: true })] } } } };
    const before = solve(s);
    expect(before.items.title!.rect.width).toBeGreaterThan(160 + 200);
    const places = targets(s, "zoom").filter((t) => t.id.startsWith("gap:titlebar"));
    expect(places.length).toBeGreaterThan(0);
    for (const t of places) {
      const l = t.after(ORIGIN, ORIGIN).layout;
      expect(l.items.title!.rect.width, t.id).toBeGreaterThanOrEqual(160 - 0.5);
      expect(l.items.zoom!.form, t.id).toBe(0);
      for (const [id, p] of Object.entries(before.items)) if (id !== "zoom" && id !== "title") expect([l.items[id]?.form, !!l.items[id]?.inMenu], `${t.id} ${id}`).toEqual([p.form, !!p.inMenu]);
    }
  });

  it("never yields its natural length: no place where only squeezing the title makes room", () => {
    for (let w = 300; w <= 700; w += 20) {
      const s0 = doc({ width: w });
      const s: DockState = { ...s0, items: { ...s0.items, title: { ...s0.items.title!, forms: { row: [form("row", 80, 160, 32, { grows: true })] } } } };
      for (const t of targets(s, "zoom").filter((x) => x.id.startsWith("gap:titlebar"))) expect(t.after(ORIGIN, ORIGIN).layout.items.title!.rect.width, `${w} ${t.id}`).toBeGreaterThanOrEqual(160 - 0.5);
    }
  });
});
