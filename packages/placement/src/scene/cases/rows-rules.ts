/**
 * The rules the Scene builds in (C24 to C29) and the gap cases (gaps as bands, `content-changed`, the float slot,
 * every gap its own slot), and a bar's three zones (R6), on the document window of `doc()`: a title bar (fixed title that grows, fixed controls), a
 * toolbar, a status bar, a left and a right column, panels (pages, findings, notes) and groups (views, tools, zoom,
 * search, marks).
 *
 * C24 and the DOM half of C26 are host rules (the root says a drag is on, nothing else reacts), so those rows are mostly
 * DOM checks; a host without a page skips them and the rest of the row (the layout while held, and after) still runs.
 * A negative ("nothing is offered here") is a `move` to a point: with no target under it, the held item is out of the
 * preview layout and no slot is drawn.
 */
import { rect as r } from "../../geometry";
import type { Scene } from "../index";
import { g } from "./gestures";
import type { CaseRow } from "./types";
import { doc, tweakEdge } from "./world";

/** The window with only panels floating (groups don't), and its left column taking panels only. */
const panelsOnly = (): Scene => tweakEdge({ ...doc(), floatKinds: ["panel"] }, "left", { accepts: ["panel"] });

/** The window with only panels floating, and its left column a panel column with a tray of toolbars at its foot. */
const trayColumn = (): Scene => tweakEdge({ ...doc(), floatKinds: ["panel"] }, "left", { zoneAccepts: { start: ["panel"], end: ["group"] } });

/** The window with Views leading and Zoom trailing in the toolbar, and Tools floating (the bar's zones, R6). */
function barZones(): Scene {
  const s = tweakEdge(doc(), "toolbar", { items: ["views", "zoom"] });
  return { ...s, floats: [...s.floats, { id: "tools", rect: r(500, 300, 200, 28) }] };
}

export const RULE_ROWS: readonly CaseRow[] = [
  {
    id: "C24",
    title: "Drag isolation",
    expect: "While an item is held the root says so (data-drag-session) and only its valid targets show: one slot, on the target; the session ends with the drop.",
    group: "kinds",
    scene: doc(),
    gestures: [g.press("pages"), g.to(g.gap("right", 2)), g.hold(), g.release()],
    checkpoints: [{ at: 2, layout: { items: { findings: { rect: r(940, 68, 260, 318) }, marks: { rect: r(940, 386, 84, 96) }, pages: { edge: "right", rect: r(940, 482, 260, 318) } }, order: { right: ["findings", "marks", "pages"] } }, note: "the slot" }],
    expectLayout: { items: { findings: { rect: r(940, 68, 260, 318) }, marks: { rect: r(940, 386, 84, 96) }, pages: { edge: "right", rect: r(940, 482, 260, 318) } }, order: { right: ["findings", "marks", "pages"] } },
    expectDom: [
      { at: 2, attr: { "data-drag-session": "panel" }, note: "the root carries the session while held" },
      { at: 2, select: "[data-drag-target]", count: 1, attr: { "data-drag-target": "gap:right:start:2" }, note: "only the shown target carries a target mark" },
      { at: 3, attr: { "data-drag-session": null }, note: "gone after the drop" },
      { at: 3, select: "[data-drag-target]", count: 0, note: "no target mark after the drop" },
    ],
  },
  {
    id: "C25",
    title: "Targets by kind: a panel in a toolbar",
    expect:
      "An edge takes only the kinds it lists: a panel held over the toolbar is offered no gap there and no float either: the toolbar refuses it (\"No room here\"), and a release there puts it back, the toolbar as it was.",
    group: "kinds",
    scene: doc(),
    // (600, 50) is a real gap for a group (the toolbar's center gap): the control row below lets a group go there.
    gestures: [g.press("pages", { x: 20, y: 10 }), g.at(600, 50), g.hold(), g.release()],
    checkpoints: [{ at: 2, layout: { items: { pages: null, views: { rect: r(8, 32, 200, 36) }, tools: { rect: r(212, 32, 200, 36) }, zoom: { rect: r(992, 32, 200, 36) } }, order: { toolbar: ["views", "tools", "zoom"] } }, note: "refused: no target, the held item out of the layout" }],
    expectLayout: { items: { pages: { edge: "left", floating: false }, views: { rect: r(8, 32, 200, 36) }, tools: { rect: r(212, 32, 200, 36) }, zoom: { rect: r(992, 32, 200, 36) } }, order: { toolbar: ["views", "tools", "zoom"], left: ["pages"] } },
    expectDom: [
      { at: 2, select: "[data-drag-refusal]", count: 1, attr: { "data-drag-refusal": "refuse:toolbar:center" }, note: "the refusal shows where the pointer is" },
      { at: 2, select: "[data-drag-slot]", count: 0, note: "no slot anywhere" },
    ],
  },
  {
    id: "C25-control-bar",
    title: "Targets by kind: the toolbar's gap is real for a group",
    expect: "The same point, with a group held, is the toolbar's center gap: Tools lands in the toolbar's center zone. So the panel's refusal above is the kind's, not an empty spot's.",
    group: "kinds",
    scene: doc(),
    gestures: [g.press("tools"), g.at(600, 50), g.hold(), g.release()],
    expectLayout: { items: { tools: { edge: "toolbar", zone: "center" } }, order: { toolbar: ["views", "tools", "zoom"] } },
  },
  {
    id: "C25b",
    title: "Targets by kind: a group in a panel-only column",
    expect: "A group held over a column that takes panels only is offered nothing: no slot, and the held group is out of the preview.",
    group: "kinds",
    scene: panelsOnly(),
    gestures: [g.press("tools"), g.at(130, 76), g.hold()],
    expectLayout: { items: { tools: null, pages: { rect: r(0, 68, 260, 732) }, views: { rect: r(8, 32, 200, 36) }, zoom: { rect: r(992, 32, 200, 36) } }, order: { left: ["pages"] } },
    expectDom: [{ select: "[data-drag-slot]", count: 0, note: "no slot where the group can't land" }],
  },
  {
    id: "C25b-control-column",
    title: "Targets by kind: the column's gap is real for a panel",
    expect: "The same point, with a panel held, is the left column's top gap: Findings lands first in the column. So the group's refusal above is the kind's, not an empty spot's.",
    group: "kinds",
    scene: panelsOnly(),
    gestures: [g.press("findings"), g.at(130, 76), g.hold(), g.release()],
    expectLayout: { items: { findings: { edge: "left" } }, order: { left: ["findings", "pages"] } },
  },
  {
    id: "C26a",
    title: "No slot inside a panel's area for a group",
    expect: "A group drag never draws a slot over a panel's body, where it can't land: nothing is offered there.",
    group: "kinds",
    scene: panelsOnly(),
    gestures: [g.press("tools"), g.at(130, 400), g.hold()],
    expectLayout: { items: { tools: null, pages: { rect: r(0, 68, 260, 732) }, findings: { rect: r(940, 68, 260, 636) } } },
    expectDom: [{ select: "[data-drag-slot]", count: 0, note: "no slot over a panel" }],
  },
  {
    id: "C26b",
    title: "A panel drag sets the same dragging state as a group drag",
    expect: "The root carries data-drag-session with the dragged item's kind, for a panel as for a group, and it is gone after Escape.",
    group: "kinds",
    scene: doc(),
    gestures: [g.press("pages"), g.at(600, 400), g.hold(), g.escape(), g.press("tools"), g.at(600, 400), g.hold(), g.escape()],
    expectLayout: { items: { pages: { rect: r(0, 68, 260, 732) }, tools: { rect: r(212, 32, 200, 36) } }, notes: { hasNot: ["content-changed"] } },
    expectDom: [
      { at: 2, attr: { "data-drag-session": "panel" }, note: "a panel is held" },
      { at: 3, attr: { "data-drag-session": null }, note: "Escape ends it" },
      { at: 6, attr: { "data-drag-session": "group" }, note: "a group is held" },
      { at: 7, attr: { "data-drag-session": null }, note: "Escape ends it" },
    ],
  },
  {
    id: "C27",
    title: "Floats never cover the bars",
    expect: "A float let go just under the toolbar, where its grab would put its top over the bar, lands clear of every bar, not on them.",
    group: "kinds",
    scene: doc(),
    // (600, 72): the content, 4 px under the toolbar; the grab (10 px down) would put the float's top at 62, over the bar.
    gestures: [g.press("notes", { x: 20, y: 10 }), g.at(600, 72), g.hold(), g.release()],
    checkpoints: [{ at: 2, layout: { items: { notes: { floating: true, rect: r(580, 68, 280, 320) }, title: { rect: r(0, 0, 1116, 32) }, controls: { rect: r(1116, 0, 84, 32) } } }, note: "the preview" }],
    expectLayout: { items: { notes: { floating: true, rect: r(580, 68, 280, 320) }, title: { rect: r(0, 0, 1116, 32) }, controls: { rect: r(1116, 0, 84, 32) } } },
  },
  {
    id: "C27b",
    title: "Floats never cover chrome rects",
    expect: "A float let go over a chrome rect the host draws itself (a status line) lands clear of it.",
    group: "kinds",
    scene: { ...doc(), chrome: [r(300, 640, 600, 60)] },
    gestures: [g.press("notes", { x: 20, y: 10 }), g.at(600, 660), g.hold(), g.release()],
    checkpoints: [{ at: 2, layout: { items: { notes: { floating: true, rect: r(580, 320, 280, 320) } } }, note: "the preview" }],
    expectLayout: { items: { notes: { floating: true, rect: r(580, 320, 280, 320) } } },
  },
  {
    id: "C28",
    title: "A group in a side column takes its own size",
    expect: "A group dropped into a side column takes its own width, from the column's start, never the column's full width.",
    group: "kinds",
    scene: doc(),
    gestures: g.drag("tools", g.gap("left", 0)),
    checkpoints: [{ at: 2, layout: { items: { tools: { formKind: "stacked", edge: "left", rect: r(0, 68, 84, 96) }, pages: { rect: r(0, 164, 260, 636) } }, edges: { left: { cross: 260 } }, order: { left: ["tools", "pages"] } }, note: "the slot is the group's own size" }],
    expectLayout: { items: { tools: { formKind: "stacked", edge: "left", rect: r(0, 68, 84, 96) }, pages: { rect: r(0, 164, 260, 636) } }, edges: { left: { cross: 260 } }, order: { left: ["tools", "pages"] } },
  },
  {
    id: "C29",
    title: "A bar's reserved room",
    expect:
      "A slot in the title bar opens beside the title and controls, never over them: the controls keep their place and size, and the title keeps its start and its natural width. A leading toolbar sits right after the title's natural rect.",
    group: "kinds",
    scene: doc(),
    gestures: [g.press("tools"), g.to(g.gap("titlebar", 1)), g.hold(), g.release()],
    checkpoints: [{ at: 2, layout: { items: { title: { rect: r(0, 0, 160, 32) }, tools: { edge: "titlebar", rect: r(160, 0, 200, 32) }, controls: { rect: r(1116, 0, 84, 32) } }, order: { titlebar: ["title", "tools", "controls"] } }, note: "the slot, right after the title" }],
    expectLayout: { items: { title: { rect: r(0, 0, 160, 32) }, tools: { edge: "titlebar", rect: r(160, 0, 200, 32) }, controls: { rect: r(1116, 0, 84, 32) } }, order: { titlebar: ["title", "tools", "controls"] } },
  },
  {
    id: "C29b",
    title: "Over the title, the gap just after it",
    expect:
      "Held over the title's text (the bar's leading third), a group is offered the leading zone's gap, just after the title; the slot never covers the title's natural rect: the title keeps its natural width, the controls keep theirs.",
    group: "kinds",
    scene: panelsOnly(),
    gestures: [g.press("tools"), g.at(80, 16), g.hold()],
    expectLayout: { items: { tools: { edge: "titlebar", rect: r(160, 0, 200, 32) }, title: { rect: r(0, 0, 160, 32) }, controls: { rect: r(1116, 0, 84, 32) } }, order: { titlebar: ["title", "tools", "controls"] } },
    expectDom: [{ select: "[data-drag-slot][data-drag-target]", count: 1, attr: { "data-drag-target": "gap:titlebar:start:1" }, note: "the slot just after the title" }],
  },

  // --- gaps as bands, content changes, the float slot ---------------------------------------------------------------------
  {
    id: "R4-band-at-a-boundary",
    title: "The hit area's boundary: 2 px past a gap's hit picks nothing (approached from the content)",
    expect:
      "The geometry alone: beside a panel's body a gap's hit is a band around the boundary between the Findings panel and the Marks toolbar below it, so 11 px above the boundary is the gap and 13 px above, over the panel's body, reached from the content (where nothing is shown), picks nothing. Below the boundary the toolbar is a short item, not a body: its whole length belongs to the nearest gap, so 11 and 13 px below are both that gap. Leaving the gap from inside is R4b.",
    group: "bands",
    scene: panelsOnly(),
    // The boundary is at y 704. In: 693, 715 and 717 (over the toolbar). Out: 691 (over the body), reached from the
    // content (600, 400), where a group has no target: the geometry alone, with no target carried over (a host's intent
    // keeps a shown gap a band's width past its hit; that is the intent's rule, checked in @n-uf/motion/drag).
    gestures: [g.press("tools"), g.at(1070, 693), g.hold(), g.at(1070, 715), g.hold(), g.at(600, 400), g.hold(), g.at(1070, 691), g.hold(), g.at(1070, 717), g.hold()],
    checkpoints: [
      { at: 2, layout: { items: { findings: { rect: r(940, 68, 260, 540) }, tools: { edge: "right", rect: r(940, 608, 84, 96) }, marks: { rect: r(940, 704, 84, 96) } }, order: { right: ["findings", "tools", "marks"] } }, note: "11 px above the boundary: in the band" },
      { at: 4, layout: { items: { findings: { rect: r(940, 68, 260, 540) }, tools: { edge: "right", rect: r(940, 608, 84, 96) } }, order: { right: ["findings", "tools", "marks"] } }, note: "11 px below: over the toolbar" },
      { at: 6, layout: { items: { tools: null } }, note: "over the content: no target for a group" },
      { at: 8, layout: { items: { tools: null, findings: { rect: r(940, 68, 260, 636) }, marks: { rect: r(940, 704, 84, 96) } } }, note: "13 px above, over the body: out" },
    ],
    expectLayout: { items: { findings: { rect: r(940, 68, 260, 540) }, tools: { edge: "right", rect: r(940, 608, 84, 96) }, marks: { rect: r(940, 704, 84, 96) } }, order: { right: ["findings", "tools", "marks"] } },
    expectDom: [
      { at: 2, select: "[data-drag-slot][data-drag-target]", count: 1, attr: { "data-drag-target": "gap:right:start:1" }, note: "the slot on the boundary's gap" },
      { at: 8, select: "[data-drag-slot]", count: 0, note: "no slot 13 px off, over the body" },
      { at: 10, select: "[data-drag-slot][data-drag-target]", count: 1, attr: { "data-drag-target": "gap:right:start:1" }, note: "13 px below, over the toolbar: the same gap" },
    ],
  },
  {
    id: "R4b-leaving-the-band",
    title: "Leaving a gap: the drag intent holds it a band's width past its hit",
    expect:
      "A host with a drag intent: Tools shown on the gap 11 px below the boundary, then moved 13 px above it (over the panel's body, just past the gap's hit) and rested, still shows that gap (the intent's band holds a shown target); moved on past the band and rested, it shows nothing.",
    group: "bands",
    scene: panelsOnly(),
    // The gap's hit reaches 12 px above the boundary (y 692); the intent's band 10 px more (682). 691: past the hit, inside
    // the band. 678: past the band.
    gestures: [g.press("tools"), g.at(1070, 715), g.hold(), g.at(1070, 691), g.hold(), g.at(1070, 678), g.hold()],
    requires: { intent: true },
    checkpoints: [
      { at: 2, layout: { items: { tools: { edge: "right", rect: r(940, 608, 84, 96) } }, order: { right: ["findings", "tools", "marks"] } }, note: "on the gap" },
      { at: 4, layout: { items: { tools: { edge: "right", rect: r(940, 608, 84, 96) } }, order: { right: ["findings", "tools", "marks"] } }, note: "past the hit, inside the band: the gap holds" },
    ],
    expectLayout: { items: { tools: null, findings: { rect: r(940, 68, 260, 636) }, marks: { rect: r(940, 704, 84, 96) } } },
    expectDom: [
      { at: 4, select: "[data-drag-slot][data-drag-target]", count: 1, attr: { "data-drag-target": "gap:right:start:1" }, note: "the band holds the gap's slot" },
      { at: 6, select: "[data-drag-slot]", count: 0, note: "past the band: no slot" },
    ],
  },
  {
    id: "R4-no-gap-over-a-body",
    title: "No gap over a panel's body",
    expect: "Away from its edges, a panel's body is no gap: the pointer falls through to the float target, or to nothing.",
    group: "bands",
    scene: panelsOnly(),
    gestures: [g.press("tools"), g.at(1070, 400), g.hold()],
    expectLayout: { items: { tools: null, findings: { rect: r(940, 68, 260, 636) }, marks: { rect: r(940, 704, 84, 96) } }, order: { right: ["findings", "marks"] } },
    expectDom: [{ select: "[data-drag-slot]", count: 0, note: "no slot over a body" }],
  },
  {
    id: "R4-bar-gaps-split-at-the-middle",
    title: "A bar's gaps split at its items' middles",
    expect: "In a bar the band is the whole stretch up to the items' middles: left of Views' middle is the gap before it, right of it the gap after.",
    group: "bands",
    scene: doc(),
    gestures: [g.press("zoom"), g.at(100, 50), g.hold(), g.at(160, 50), g.hold()],
    checkpoints: [{ at: 2, layout: { items: { views: { rect: r(212, 32, 200, 36) }, zoom: { rect: r(8, 32, 200, 36) }, tools: { rect: r(416, 32, 200, 36) } }, order: { toolbar: ["zoom", "views", "tools"] } }, note: "left of Views' middle: before it" }],
    expectLayout: { items: { views: { rect: r(8, 32, 200, 36) }, zoom: { rect: r(212, 32, 200, 36) }, tools: { rect: r(416, 32, 200, 36) } }, order: { toolbar: ["views", "zoom", "tools"] } },
  },
  {
    id: "R4-content-changed",
    title: "content-changed says when to refit",
    expect: "A window resize that changes the content gives a content-changed note, so the host refits its zoom once, after the change.",
    group: "bands",
    scene: doc(),
    gestures: [g.resizeWindow(1000, 800)],
    expectLayout: { content: r(260, 68, 480, 704), notes: { has: ["content-changed"] } },
  },
  {
    id: "R4-no-refit-on-a-float-move",
    title: "A float move never refits",
    expect: "Lifting a float and dropping it elsewhere changes no edge, so there is no content-changed note and no refit.",
    group: "bands",
    scene: doc(),
    gestures: [g.press("notes", { x: 20, y: 10 }), g.at(620, 260), g.hold(), g.release()],
    expectLayout: { items: { notes: { floating: true, rect: r(600, 250, 280, 320) } }, content: r(260, 68, 680, 704), notes: { hasNot: ["content-changed"] } },
  },
  {
    id: "R4-float-slot",
    title: "The float's slot is its after rect",
    expect: "Held over the pages, a float shows a slot: the rect it gets after the drop (the pointer minus where it was held, clear of everything).",
    group: "bands",
    scene: doc(),
    gestures: [g.press("notes", { x: 20, y: 10 }), g.at(600, 400), g.hold(), g.release()],
    checkpoints: [{ at: 2, layout: { items: { notes: { floating: true, rect: r(580, 390, 280, 320) } } }, note: "the slot is where it lands" }],
    expectLayout: { items: { notes: { floating: true, rect: r(580, 390, 280, 320) } } },
    expectDom: [{ at: 2, select: "[data-drag-slot][data-drag-target]", count: 1, attr: { "data-drag-target": "float:notes" }, note: "a slot for the float too" }],
  },
  {
    id: "R4-between-gap-is-its-own-slot",
    title: "Every gap is its own slot",
    expect: "A drop in a column's between gap lands there, not at the top: Pages dropped between Findings and Marks sits between them.",
    group: "bands",
    scene: doc(),
    gestures: g.drag("pages", g.gap("right", 1)),
    checkpoints: [{ at: 2, layout: { items: { findings: { rect: r(940, 68, 260, 318) }, pages: { edge: "right", rect: r(940, 386, 260, 318) }, marks: { rect: r(940, 704, 84, 96) } }, order: { right: ["findings", "pages", "marks"] } }, note: "the slot is the between gap's" }],
    expectLayout: { items: { findings: { rect: r(940, 68, 260, 318) }, pages: { edge: "right", rect: r(940, 386, 260, 318) }, marks: { rect: r(940, 704, 84, 96) } }, order: { right: ["findings", "pages", "marks"] } },
  },
  {
    id: "R4-end-reach-stays-in-its-edge-right",
    title: "A gap's end reach never enters another edge",
    expect: "Views held at (960, 50), inside the toolbar, is offered a toolbar gap, never the right column's top gap, whose end reach would otherwise run up into the toolbar.",
    group: "bands",
    scene: doc(),
    gestures: [g.press("views", { x: 20, y: 10 }), g.at(960, 50), g.hold()],
    expectLayout: { items: { views: { edge: "toolbar" } } },
  },
  {
    id: "R4-end-reach-stays-in-its-edge-left",
    title: "A gap's end reach never enters another edge, left side",
    expect: "Views held at (250, 60), inside the toolbar, is offered a toolbar gap, never the left column's top gap.",
    group: "bands",
    scene: doc(),
    gestures: [g.press("views", { x: 20, y: 10 }), g.at(250, 60), g.hold()],
    expectLayout: { items: { views: { edge: "toolbar" } } },
  },

  // --- a column's tray of toolbars (`Edge.zoneAccepts`) ------------------------------------------------------------------
  {
    id: "R5-group-into-the-tray",
    title: "A group dropped into a panel column lands in its tray",
    expect: "With zoneAccepts (panels at the top, toolbars at the foot), a group dropped into the left column lands in the end-zone tray at the foot, as its icons, and the panels give way first.",
    group: "kinds",
    scene: trayColumn(),
    gestures: g.drag("tools", g.gap("left", 0, "end")),
    expectLayout: { items: { tools: { formKind: "icons", edge: "left", zone: "end", rect: r(0, 716, 28, 84) }, pages: { formKind: "open", rect: r(0, 68, 260, 648) } }, order: { left: ["pages", "tools"] } },
  },
  {
    id: "R5-group-is-offered-no-gap-above-the-tray",
    title: "A group is offered no gap in a panel zone",
    expect: "The column's start zone takes panels only: a group held over its top gap is offered nothing, and the panel stays as it was.",
    group: "kinds",
    scene: trayColumn(),
    gestures: [g.press("tools"), g.at(130, 76), g.hold()],
    expectLayout: { items: { tools: null, pages: { formKind: "open", rect: r(0, 68, 260, 732) } }, order: { left: ["pages"] } },
  },
  {
    id: "R5-group-never-opens-a-column",
    title: "A group never opens a column on its own",
    expect: "An empty column whose start zone takes panels offers its strip (by thirds) to panels only: a group held over it is offered nothing.",
    group: "kinds",
    scene: tweakEdge(trayColumn(), "left", { items: [] }),
    gestures: [g.press("tools"), g.at(10, 400), g.hold()],
    expectLayout: { items: { tools: null, findings: { rect: r(940, 68, 260, 636) } }, order: { left: [] } },
    expectDom: [{ select: "[data-drag-slot]", count: 0, note: "no strip for a group" }],
  },
  {
    id: "R5-panel-opens-an-empty-column",
    title: "A panel opens the empty column",
    expect: "The column's top third (its start zone, which takes panels) takes a panel: Findings let go over it opens the column.",
    group: "kinds",
    scene: tweakEdge(trayColumn(), "left", { items: [] }),
    gestures: [g.press("findings"), g.at(10, 150), g.hold(), g.release()],
    expectLayout: { items: { findings: { formKind: "open", edge: "left", rect: r(0, 68, 260, 732) } }, order: { left: ["findings"] } },
  },
  ...(["start", "center", "end"] as const).map(
    (zone): CaseRow => ({
      id: `R6-bar-${zone}-zone`,
      title: `A toolbar dropped in a bar's ${zone} zone`,
      expect: {
        start: "Tools, floating, dropped after Views in the toolbar's start zone lands leading, right after Views.",
        center: "Tools dropped in the toolbar's center zone lands at the bar's true center, clear of Views at the start and Zoom at the end.",
        end: "Tools dropped in the toolbar's end zone lands trailing, right before Zoom.",
      }[zone],
      group: "groups",
      scene: barZones(),
      gestures: g.drag("tools", g.gap("toolbar", zone === "start" ? 1 : 0, zone)),
      expectLayout: {
        items: { tools: { edge: "toolbar", zone, formKind: "row", rect: r({ start: 212, center: 500, end: 788 }[zone], 32, 200, 36) }, views: { rect: r(8, 32, 200, 36) }, zoom: { rect: r(992, 32, 200, 36) } },
        order: { toolbar: ["views", "tools", "zoom"] },
      },
    }),
  ),
];
