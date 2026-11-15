/**
 * The rules the Scene builds in (C24 to C29) and the revision 4 cases (gaps as bands, `content-changed`, the float slot,
 * every gap its own slot), on the document window of `doc()`: a title bar (fixed title that grows, fixed controls), a
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
    expect: "An edge takes only the kinds it lists: a panel held over the toolbar is offered no gap there, it falls through to the float, and the toolbar is as it was.",
    group: "kinds",
    scene: doc(),
    // (600, 50) is a real gap for a group (the toolbar's centre gap): the control row below lets a group go there.
    gestures: [g.press("pages", { x: 20, y: 10 }), g.at(600, 50), g.hold()],
    expectLayout: { items: { pages: { floating: true, rect: r(580, 68, 280, 360) }, views: { rect: r(8, 32, 200, 36) }, tools: { rect: r(212, 32, 200, 36) }, zoom: { rect: r(992, 32, 200, 36) } }, order: { toolbar: ["views", "tools", "zoom"] } },
  },
  {
    id: "C25-control-bar",
    title: "Targets by kind: the toolbar's gap is real for a group",
    expect: "The same point, with a group held, is the toolbar's centre gap: Tools lands in the toolbar's centre zone. So the panel's refusal above is the kind's, not an empty spot's.",
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
    expect: "A float let go over the title bar lands clear of every bar, not on them.",
    group: "kinds",
    scene: doc(),
    gestures: [g.press("notes", { x: 20, y: 10 }), g.at(600, 12), g.hold(), g.release()],
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

  // --- revision 4 -------------------------------------------------------------------------------------------------------
  {
    id: "R4-band-at-a-boundary",
    title: "A gap is a band around a boundary",
    expect:
      "Beside a panel's body the gap is a band: within 12 px of the boundary between the Findings panel and the Marks toolbar below it there is a gap, 11 px above; 13 px above, over the panel's body, there is none. Below the boundary the toolbar is a short item, not a body: its whole length belongs to the nearest gap, so 11 and 13 px below are both that gap.",
    group: "bands",
    scene: panelsOnly(),
    // The boundary is at y 704. In: 693, 715 and 717 (over the toolbar). Out: 691 (over the body).
    gestures: [g.press("tools"), g.at(1070, 693), g.hold(), g.at(1070, 715), g.hold(), g.at(1070, 691), g.hold(), g.at(1070, 717), g.hold()],
    checkpoints: [
      { at: 2, layout: { items: { findings: { rect: r(940, 68, 260, 540) }, tools: { edge: "right", rect: r(940, 608, 84, 96) }, marks: { rect: r(940, 704, 84, 96) } }, order: { right: ["findings", "tools", "marks"] } }, note: "11 px above the boundary: in the band" },
      { at: 4, layout: { items: { findings: { rect: r(940, 68, 260, 540) }, tools: { edge: "right", rect: r(940, 608, 84, 96) } }, order: { right: ["findings", "tools", "marks"] } }, note: "11 px below: over the toolbar" },
      { at: 6, layout: { items: { tools: null, findings: { rect: r(940, 68, 260, 636) }, marks: { rect: r(940, 704, 84, 96) } } }, note: "13 px above, over the body: out" },
    ],
    expectLayout: { items: { findings: { rect: r(940, 68, 260, 540) }, tools: { edge: "right", rect: r(940, 608, 84, 96) }, marks: { rect: r(940, 704, 84, 96) } }, order: { right: ["findings", "tools", "marks"] } },
    expectDom: [
      { at: 2, select: "[data-drag-slot][data-drag-target]", count: 1, attr: { "data-drag-target": "gap:right:start:1" }, note: "the slot on the boundary's gap" },
      { at: 6, select: "[data-drag-slot]", count: 0, note: "no slot 13 px off, over the body" },
      { at: 8, select: "[data-drag-slot][data-drag-target]", count: 1, attr: { "data-drag-target": "gap:right:start:1" }, note: "13 px below, over the toolbar: the same gap" },
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
    title: "A group gets no strip where the column's zone takes no group",
    expect: "An empty column whose start zone takes panels and whose end zone (its tray) takes groups offers a group only its bottom third: a group held over the middle third is offered nothing.",
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
];
