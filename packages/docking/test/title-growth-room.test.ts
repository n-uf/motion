/**
 * Q7: a growing fixed item (a title) no longer takes its zone's drop room. Its growth is spare room, not owned room: a
 * drop beside it lands when the bar makes room the way the title rule makes it, the toolbars taking their compact
 * variants (steps within a step group) while the title holds its natural length. The title yields its growth to the
 * landing, never its natural length; a step that changes a form's group (icons, a fold, the ») still refuses the drop,
 * since the title rule takes it only after the title's own shrink.
 */
import { controlLadder, type ControlLadderSpec } from "@n-uf/placement/stack";
import { describe, expect, it } from "vitest";
import { solve, targets, type DockItem, type DockState } from "../src";
import { doc, form, tweakEdge } from "../src/testing/world";

const ladder = (id: string): ControlLadderSpec => ({ controls: [{ id: `${id}1`, tiers: [60, 40, 24] }, { id: `${id}2`, tiers: [60, 40, 24] }], gap: 4, grip: 10, more: 14, cross: 28 });
const grp = (id: string, used: number): DockItem => ({ id, kind: "group", used, forms: { row: controlLadder(ladder(id)).row } });

/** The title bar: a growing title (natural 160), a laddered toolbar after it, the controls; `tools` (laddered) is held. */
function win(width: number, grows = true): DockState {
  const s = tweakEdge(tweakEdge(doc({ width }), "titlebar", { items: ["title", "zoom", "controls"] }), "toolbar", { items: ["views", "tools"] });
  const title = { ...s.items.title!, forms: { row: [form("row", 80, 160, 32, grows ? { grows: true } : {})] } };
  return { ...s, items: { ...s.items, title, zoom: grp("zoom", 6), tools: grp("tools", 5) } };
}

/** The drop of Tools right after Zoom in the title bar's start zone, solved. */
const dropAfterZoom = (s: DockState) => targets(s, "tools").find((t) => t.id === "gap:titlebar:start:2");

describe("a growing fixed item's growth is spare room for a drop", () => {
  it("a drop that makes the toolbar beside it take a compact variant lands, the title at its natural length", () => {
    const widths = [600, 580, 560, 540, 520, 500];
    const landed = widths.filter((w) => {
      const s = win(w);
      const t = dropAfterZoom(s);
      if (!t) return false;
      const l = t.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout;
      return l.items.zoom!.form > solve(s).items.zoom!.form;
    });
    expect(landed.length).toBeGreaterThan(0);
    for (const w of landed) {
      const l = dropAfterZoom(win(w))!.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout;
      expect(l.items.title!.rect.width, `${w}`).toBeGreaterThanOrEqual(160 - 0.5);
      expect(l.items.zoom!.formKind).toBe("row");
      expect(l.items.tools!.edge).toBe("titlebar");
    }
  });

  it("never squeezes the title under its natural length, and never puts a neighbor in its fold or the »", () => {
    for (let w = 300; w <= 700; w += 20) {
      const s = win(w);
      for (const t of targets(s, "tools").filter((x) => x.id.startsWith("gap:titlebar"))) {
        const l = t.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout;
        expect(l.items.title!.rect.width, `${w} ${t.id}`).toBeGreaterThanOrEqual(160 - 0.5);
        expect(l.items.zoom!.inMenu ?? false).toBe(false);
        expect(l.items.zoom!.formKind).toBe("row");
      }
    }
  });
});
