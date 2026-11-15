/**
 * The toolbar rows T1 to T6 and the "previous" rows N1, N2, G1 and G2: how a bar gives way (a fold in line per group,
 * only to shorter forms, the ranked primary last), real gaps and padding, a panel that lands as its header, and what
 * `previous` keeps (a use, a count gaining or losing digits, room coming back in the reverse order).
 *
 * T2 and T4 are one row (a step goes only to a form that shortens the bar). G1 and G2 run on small hand-made groups,
 * as the solver's own repros do.
 */
import { rect as r } from "../../geometry";
import type { StackForm } from "../../stack";
import type { Edge, Scene, SceneItem } from "../index";
import { g } from "./gestures";
import type { CaseRow } from "./types";
import { bench, form } from "./world";

const NO_FLOATS = { column: [], bar: ["views", "tools", "zoom"], floats: [] } as const;

/** A bare bar of hand-made groups (no gap, no padding, the » entry `menu` px), `width` long. */
function tiny(width: number, items: SceneItem[], menu = 28): Scene {
  const edge: Edge = { id: "tbar", side: "top", ring: 0, accepts: ["group"], items: items.map((i) => i.id), cross: { min: 28, max: 40, rail: 28 }, gap: 0, pad: { start: 0, end: 0 }, menu: { main: menu } };
  return { stage: { x: 0, y: 0, width, height: 100 }, edges: [edge], items: Object.fromEntries(items.map((i) => [i.id, i])), floats: [], floatKinds: [] };
}
const row = (id: string, used: number, forms: StackForm[]): SceneItem => ({ id, kind: "group", used, forms: { row: forms } });
const f = (kind: StackForm["kind"], main: number): StackForm => form(kind, main, main, 28);

export const BAR_ROWS: readonly CaseRow[] = [
  {
    id: "T1",
    title: "A » per folded group, in line",
    expect: "Short of room, a group folds to its own handle and », in its place in the bar; the shared » entry comes only after the folds.",
    group: "bars",
    scene: bench(NO_FLOATS),
    gestures: [g.resizeWindow(640, 500), g.resizeWindow(160, 500), g.resizeWindow(150, 500)],
    checkpoints: [
      { at: 0, layout: { items: { views: { formKind: "fold", rect: r(12, 0, 40, 40) }, tools: { formKind: "row", rect: r(60, 0, 244, 40) }, zoom: { formKind: "row", rect: r(312, 0, 244, 40) } }, edges: { bar: { menu: null } } }, note: "640: Views folds where it stands, no shared entry" },
      { at: 1, layout: { items: { views: { formKind: "fold", rect: r(12, 0, 40, 40) }, tools: { formKind: "fold", rect: r(60, 0, 40, 40) }, zoom: { formKind: "fold", rect: r(108, 0, 40, 40) } }, edges: { bar: { menu: null } } }, note: "160: every group folded in line, still no shared entry" },
    ],
    expectLayout: { items: { views: { inMenu: true }, tools: { formKind: "fold", rect: r(12, 0, 40, 40) }, zoom: { formKind: "fold", rect: r(60, 0, 40, 40) } }, edges: { bar: { menu: ["views"] } } },
  },
  {
    id: "T2-T4",
    title: "A step goes only to a shorter form",
    expect: "Zoom's stacked words are as long as its row, so a give-way step never takes them: Zoom goes from its row straight to its fold, and back to its row.",
    group: "bars",
    scene: bench(NO_FLOATS, { used: { zoom: 1 } }),
    gestures: [g.resizeWindow(700, 500), g.resizeWindow(500, 500), g.resizeWindow(360, 500), g.resizeWindow(840, 500)],
    checkpoints: [
      { at: 0, layout: { items: { views: { formKind: "row" }, tools: { formKind: "row" }, zoom: { formKind: "fold", rect: r(516, 0, 40, 40) } } }, note: "700: Zoom's row straight to its fold, not stacked" },
      { at: 1, layout: { items: { views: { formKind: "fold" }, tools: { formKind: "row" }, zoom: { formKind: "fold", rect: r(312, 0, 40, 40) } } }, note: "500" },
      { at: 2, layout: { items: { views: { formKind: "fold" }, tools: { formKind: "icons" }, zoom: { formKind: "fold" } } }, note: "360" },
    ],
    expectLayout: { items: { views: { formKind: "row", rect: r(12, 0, 244, 40) }, tools: { formKind: "row", rect: r(264, 0, 244, 40) }, zoom: { formKind: "row", rect: r(516, 0, 244, 40) } } },
  },
  {
    id: "T3",
    title: "The ranked primary gives way last",
    expect: "Tools, the primary, goes to its icons first and folds only after every other group has folded, even when it was used longest ago.",
    group: "bars",
    scene: bench(NO_FLOATS, { used: { tools: 0 } }),
    gestures: [g.resizeWindow(770, 500), g.resizeWindow(620, 500), g.resizeWindow(410, 500), g.resizeWindow(220, 500), g.resizeWindow(200, 500)],
    checkpoints: [
      { at: 0, layout: { items: { views: { formKind: "row" }, tools: { formKind: "icons", rect: r(264, 0, 94, 40) }, zoom: { formKind: "row" } } }, note: "770: Tools goes to its icons first" },
      { at: 1, layout: { items: { views: { formKind: "fold" }, tools: { formKind: "icons" }, zoom: { formKind: "row" } } }, note: "620: Views folds, Tools keeps its icons" },
      { at: 2, layout: { items: { views: { formKind: "fold" }, tools: { formKind: "icons" }, zoom: { formKind: "fold" } } }, note: "410: Zoom folds too, Tools still icons" },
      { at: 3, layout: { items: { views: { formKind: "fold" }, tools: { formKind: "icons" }, zoom: { formKind: "fold" } } }, note: "220: still icons" },
    ],
    expectLayout: { items: { views: { formKind: "fold", rect: r(12, 0, 40, 40) }, tools: { formKind: "fold", rect: r(60, 0, 40, 40) }, zoom: { formKind: "fold", rect: r(108, 0, 40, 40) } }, edges: { bar: { menu: null } } },
  },
  {
    id: "T5",
    title: "Gaps and padding are real",
    expect: "The bar's gap and padding count in its length and in every rect, and an end gap reaches past the bar's end: a group let go there lands last.",
    group: "bars",
    scene: bench(NO_FLOATS, { gap: 14, pad: 20 }),
    gestures: [g.press("views"), g.at(846, 20), g.hold(), g.release()],
    checkpoints: [{ at: 2, layout: { items: { views: { edge: "bar", rect: r(576, 0, 244, 40) } }, order: { bar: ["tools", "zoom", "views"] } }, note: "the end gap, past the bar's end" }],
    expectLayout: { items: { tools: { rect: r(20, 0, 244, 40) }, zoom: { rect: r(278, 0, 244, 40) }, views: { rect: r(576, 0, 244, 40) } }, order: { bar: ["tools", "zoom", "views"] } },
  },
  {
    id: "T6",
    title: "A panel dropped into the bar lands as a header",
    expect: "An open panel is too thick for a 40 px bar, so dropped there it lands as its header and the bar stays 40 px.",
    group: "bars",
    scene: bench({ column: ["pages", "annotations"], bar: ["views", "zoom"], floats: [{ id: "findings", rect: { x: 440, y: 130, width: 220, height: 190 } }] }),
    gestures: [g.press("findings"), g.to(g.gap("bar", 2)), g.hold(), g.release()],
    checkpoints: [{ at: 2, layout: { items: { findings: { formKind: "header", edge: "bar", rect: r(516, 0, 110, 40) } }, edges: { bar: { cross: 40 } } }, note: "the slot is header-sized" }],
    expectLayout: { items: { findings: { formKind: "header", edge: "bar", floating: false, rect: r(516, 0, 110, 40) } }, edges: { bar: { cross: 40 } }, order: { bar: ["views", "zoom", "findings"] } },
  },

  // --- what `previous` keeps ------------------------------------------------------------------------------------------
  {
    id: "N1",
    title: "A count gaining a digit reshapes nothing else",
    expect: "After uses (the ages all change), a group whose badge gains digits grows by its own width (35 px) and no other form changes, though a fresh solve would give way differently.",
    group: "previous",
    scene: bench(NO_FLOATS, { width: 760 }),
    gestures: [g.click("tools", "use"), g.click("zoom", "use"), g.click("views", "use"), g.resizeItem("tools", 35)],
    expectLayout: { items: { views: { formKind: "fold", rect: r(12, 0, 40, 40) }, tools: { formKind: "row", rect: r(60, 0, 279, 40) }, zoom: { formKind: "row", rect: r(347, 0, 244, 40) } }, edges: { bar: { menu: null } } },
  },
  {
    id: "N2",
    title: "A count losing a digit reshapes nothing else",
    expect: "After uses (the ages all change), a group whose badge loses a digit is 7 px shorter and no other form changes, though a fresh solve would give way differently.",
    group: "previous",
    scene: bench(NO_FLOATS, { width: 764 }),
    gestures: [g.click("tools", "use"), g.click("zoom", "use"), g.click("views", "use"), g.resizeItem("tools", -7)],
    expectLayout: { items: { views: { formKind: "fold", rect: r(12, 0, 40, 40) }, tools: { formKind: "row", rect: r(60, 0, 237, 40) }, zoom: { formKind: "row", rect: r(305, 0, 244, 40) } }, edges: { bar: { menu: null } } },
  },
  {
    id: "G1",
    title: "Items leave the menu when their form is larger",
    expect: "An item in the » menu comes out when its form is larger, even if the bar gets shorter (the last one takes the » entry along); under 140 nothing comes out.",
    group: "previous",
    scene: tiny(128, [row("a", 1, [f("row", 100), f("icons", 20), f("menu", 0)]), row("b", 2, [f("row", 100), f("icons", 20), f("menu", 0)]), row("c", 9, [f("row", 100), f("fold", 60), f("icons", 40), f("menu", 0)])]),
    gestures: [g.click("c", "use"), g.resizeWindow(139, 100), g.resizeWindow(141, 100), g.resizeWindow(150, 100), g.resizeWindow(175, 100)],
    checkpoints: [
      { at: 0, layout: { items: { a: { inMenu: true }, b: { inMenu: true }, c: { formKind: "row", rect: r(0, 0, 100, 28) } }, edges: { tbar: { menu: ["a", "b"] } } }, note: "128, after a use of c: a and b in the menu" },
      { at: 1, layout: { items: { a: { inMenu: true }, b: { inMenu: true }, c: { formKind: "row" } } }, note: "139: both icons plus the row need 140, so nothing comes out" },
      { at: 2, layout: { items: { a: { formKind: "icons", rect: r(0, 0, 20, 28) }, b: { formKind: "icons", rect: r(20, 0, 20, 28) }, c: { formKind: "row", rect: r(40, 0, 100, 28) } }, edges: { tbar: { menu: null } } }, note: "141: both come out together" },
    ],
    expectLayout: { items: { a: { formKind: "icons", inMenu: false }, b: { formKind: "icons", inMenu: false }, c: { formKind: "row" } }, edges: { tbar: { menu: null } } },
  },
  {
    id: "G2",
    title: "Room comes back in the reverse of give-way order",
    expect: "B gave way first, then A; at 90 A can't open (it needs 130), so B doesn't open ahead of it; at 130 A opens first, and B only at 150.",
    group: "previous",
    scene: tiny(60, [row("a", 2, [f("row", 100), f("fold", 30)]), row("b", 1, [f("row", 50), f("fold", 30)])]),
    gestures: [g.resizeWindow(90, 100), g.resizeWindow(129, 100), g.resizeWindow(130, 100), g.resizeWindow(149, 100), g.resizeWindow(150, 100)],
    checkpoints: [
      { at: 0, layout: { items: { a: { formKind: "fold" }, b: { formKind: "fold" } } }, note: "90: both stay folded" },
      { at: 1, layout: { items: { a: { formKind: "fold" }, b: { formKind: "fold" } } }, note: "129" },
      { at: 2, layout: { items: { a: { formKind: "row", rect: r(0, 0, 100, 28) }, b: { formKind: "fold", rect: r(100, 0, 30, 28) } } }, note: "130: A opens first" },
      { at: 3, layout: { items: { a: { formKind: "row" }, b: { formKind: "fold" } } }, note: "149: B still folded" },
    ],
    expectLayout: { items: { a: { formKind: "row", rect: r(0, 0, 100, 28) }, b: { formKind: "row", rect: r(100, 0, 50, 28) } } },
  },
  {
    id: "G2b",
    title: "A group that went into the menu stays there",
    expect: "A group that went into the menu straight from its row stays there while the one ahead of it can't open, from 80 to 129.",
    group: "previous",
    scene: tiny(60, [row("a", 2, [f("row", 100), f("fold", 30)]), row("b", 1, [f("row", 50), f("menu", 0)])], 30),
    gestures: [g.resizeWindow(80, 100), g.resizeWindow(129, 100), g.resizeWindow(130, 100)],
    checkpoints: [
      { at: 0, layout: { items: { a: { formKind: "fold" }, b: { inMenu: true } }, edges: { tbar: { menu: ["b"] } } }, note: "80" },
      { at: 1, layout: { items: { a: { formKind: "fold" }, b: { inMenu: true } }, edges: { tbar: { menu: ["b"] } } }, note: "129" },
    ],
    expectLayout: { items: { a: { formKind: "row", rect: r(0, 0, 100, 28) }, b: { inMenu: true } }, edges: { tbar: { menu: ["b"] } } },
  },
];
