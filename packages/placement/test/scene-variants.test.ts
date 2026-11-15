/**
 * Forms carry what they hide: a toolbar's compact variants are row forms between its full row and its next form, each
 * with its own size (its "+N" cell counted) and the control ids it leaves out (`hides`). The ladder treats them as any
 * form: taken in order, giving way by priority then age, coming back in the exact reverse; the layout reports the
 * chosen form's ids as `hidden`, and a target's `after()` previews the variant the drop lands in.
 */
import { describe, expect, it } from "vitest";
import { solve, targets, type Scene, type SceneItem, type SceneLayout } from "../src/scene";
import type { StackForm } from "../src/stack";
import { bar, byId, controls, form, group, title } from "./scene-fixture";

/** Zoom: the full row "− 86% + FIT", the compact "− 86% +" with "+1" (hides FIT), the minimal "86%" with "+3". */
const ZOOM_ROW: StackForm[] = [
  form("row", 150, 150, 28),
  { ...form("row", 118, 118, 28), hides: ["fit"] },
  { ...form("row", 70, 70, 28), hides: ["-", "+", "fit"] },
  form("fold", 30, 30, 28),
  form("menu", 0, 0, 0),
];
const zoom = (used: number, more: Partial<SceneItem> = {}): SceneItem => ({ id: "zoom", kind: "group", used, forms: { row: ZOOM_ROW, column: group("x", 0).forms.column }, ...more });

/** A title bar with the title, Zoom, another toolbar and the controls, `width` wide. */
const titleBar = (width: number): Scene => ({
  stage: { x: 0, y: 0, width, height: 400 },
  edges: [bar("titlebar", "top", 0, ["title", "zoom", "tools", "controls"])],
  items: byId([title(), zoom(5), group("tools", 3), controls()]),
  floats: [],
  floatKinds: ["group"],
});

/** Solves `widths` in turn, each with the layout before as `previous` (a window being resized). */
function sweep(widths: readonly number[]): SceneLayout[] {
  const out: SceneLayout[] = [];
  let prev: SceneLayout | undefined;
  for (const w of widths) {
    const l = solve(titleBar(w), prev ? { previous: prev } : {});
    out.push(l);
    prev = l;
  }
  return out;
}

const down = Array.from({ length: 60 }, (_, i) => 900 - i * 10);
const up = [...down].reverse();

describe("compact variants as forms", () => {
  it("narrowing steps Zoom full → compact → minimal in order (monotone), hidden matching the form", () => {
    const ls = sweep(down);
    const forms = ls.map((l) => l.items.zoom!.form);
    for (let i = 1; i < forms.length; i++) expect(forms[i]!).toBeGreaterThanOrEqual(forms[i - 1]!);
    expect(new Set(forms).has(1)).toBe(true);
    expect(new Set(forms).has(2)).toBe(true);
    for (const l of ls) {
      const z = l.items.zoom!;
      expect(z.hidden).toEqual(z.inMenu ? [] : (ZOOM_ROW[z.form]!.hides ?? []));
      // Never clipped: the item is drawn at its form's own length (its "+N" cell is in it).
      if (!z.inMenu) expect(z.rect.width).toBeCloseTo(ZOOM_ROW[z.form]!.main.natural, 6);
    }
    expect(ls[0]!.items.zoom!.hidden).toEqual([]);
  });

  it("room coming back brings the forms back in the exact reverse, and the edge never jumps", () => {
    const shrink = sweep(down);
    let prev = shrink[shrink.length - 1]!;
    const grow: SceneLayout[] = [];
    for (const w of up) {
      prev = solve(titleBar(w), { previous: prev });
      grow.push(prev);
    }
    // The same width gives the same forms on the way back as on the way down (both toolbars).
    for (let i = 0; i < down.length; i++) {
      const a = shrink[i]!;
      const b = grow[down.length - 1 - i]!;
      for (const id of ["zoom", "tools"]) expect([b.items[id]!.form, !!b.items[id]!.inMenu], `${id} at ${down[i]}`).toEqual([a.items[id]!.form, !!a.items[id]!.inMenu]);
    }
    // Zoom stays in its bar the whole time, the bar where it was.
    for (const l of [...shrink, ...grow]) {
      expect(l.items.zoom!.edge).toBe("titlebar");
      expect(l.edges.titlebar!.rect.y).toBe(0);
    }
  });

  it("a toolbar steps down its compact variants in priority order, then by age", () => {
    // Tools has the higher priority: Zoom takes its compact forms first.
    const s = titleBar(500);
    const hi: Scene = { ...s, items: { ...s.items, tools: { ...s.items.tools!, priority: 5 } } };
    const l = solve(hi);
    expect(l.items.tools!.form).toBe(0);
    expect(l.items.zoom!.form).toBeGreaterThan(0);
  });

  it("after() previews the variant a drop lands in", () => {
    // Zoom floating, dropped into a bar beside a fixed 300 px readout: 450 − 16 padding − 4 gap − 300 leaves 130, room
    // for its compact form (118) but not its full row (150).
    const readout: SceneItem = { id: "readout", kind: "readout", used: 0, fixed: true, align: "end", forms: { row: [form("row", 300, 300, 28)] } };
    const s: Scene = {
      stage: { x: 0, y: 0, width: 450, height: 400 },
      edges: [bar("bottom", "bottom", 0, ["readout"])],
      items: byId([readout, zoom(9)]),
      floats: [{ id: "zoom", rect: { x: 100, y: 200, width: 150, height: 28 } }],
      floatKinds: ["group"],
    };
    const ts = targets(s, "zoom").filter((t) => t.place.kind === "gap" && (t.place as { edge: string }).edge === "bottom");
    expect(ts.length).toBeGreaterThan(0);
    for (const t of ts) {
      const z = t.after({ x: t.hit.x + 1, y: t.hit.y + 1 }).layout.items.zoom!;
      expect(z.form).toBeGreaterThan(0);
      expect(z.hidden).toEqual(ZOOM_ROW[z.form]!.hides ?? []);
      expect(t.slot).toEqual(z.rect);
    }
  });
});
