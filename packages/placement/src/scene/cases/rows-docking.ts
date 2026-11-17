/**
 * The edge stack cases C1 to C23, as rows on the bench (a top bar, a left column, floats). Each row sets one case
 * up, plays what a user does, and pins the layout the Scene must give. C11 and C12, which are drawing rules for a page
 * (a grip on every movable item and none on the rest), are rows about what lifts: a press on a movable item lifts it, and
 * on a fixed one never does.
 */
import { rect as r } from "../../geometry";
import { g } from "./gestures";
import type { CaseRow } from "./types";
import { bench, doc } from "./world";

const FINDINGS_FLOAT = { id: "findings", rect: { x: 440, y: 130, width: 220, height: 190 } } as const;
const ANNOTATIONS_FLOAT = { id: "annotations", rect: { x: 420, y: 120, width: 240, height: 150 } } as const;

export const DOCKING_ROWS: readonly CaseRow[] = [
  // --- panels in a column ---------------------------------------------------------------------------------------------
  {
    id: "C6",
    title: "A column taller than its content",
    expect: "Groups and folded panels take only their own length; the rest of the column goes to the open panel.",
    group: "panels",
    scene: bench({ column: ["views", "pages"], bar: ["tools", "zoom"], floats: [ANNOTATIONS_FLOAT, FINDINGS_FLOAT] }),
    gestures: [],
    expectLayout: {
      items: { views: { formKind: "stacked", edge: "column", rect: r(0, 40, 84, 84) }, pages: { formKind: "open", rect: r(0, 124, 200, 376) } },
      edges: { column: { cross: 200 } },
    },
  },
  {
    id: "C8",
    title: "Independent panels",
    expect: "Any combination of panels can be open: opening one never closes another.",
    group: "panels",
    scene: bench({ column: ["pages", "annotations", "findings"], bar: ["views", "tools", "zoom"], floats: [] }, { from: { annotations: 1 } }),
    gestures: [g.click("annotations")],
    expectLayout: {
      items: {
        pages: { formKind: "open", rect: r(0, 40, 240, 153.33) },
        annotations: { formKind: "open", rect: r(0, 193.33, 240, 132.89) },
        findings: { formKind: "open", rect: r(0, 326.22, 240, 173.78) },
      },
      order: { column: ["pages", "annotations", "findings"] },
    },
  },
  {
    id: "C9",
    title: "Give-way",
    expect: "When the open panels don't fit their minimum heights, the one used longest ago folds to its header first.",
    group: "panels",
    scene: bench({ column: ["pages", "annotations", "findings"], bar: ["views", "tools", "zoom"], floats: [] }, { height: 300, used: { annotations: 1, findings: 2, pages: 3 } }),
    gestures: [],
    expectLayout: {
      items: { pages: { formKind: "open", rect: r(0, 40, 220, 111.43) }, annotations: { formKind: "header", rect: r(0, 151.43, 220, 30) }, findings: { formKind: "open", rect: r(0, 181.43, 220, 118.57) } },
      notes: { has: ["form-down"] },
    },
  },
  {
    id: "C9b",
    title: "Give-way, then the next oldest",
    expect: "Shorter still, the next oldest (Findings) folds before the newest (Pages); a rail icon only comes after the header.",
    group: "panels",
    scene: bench({ column: ["pages", "annotations", "findings"], bar: ["views", "tools", "zoom"], floats: [] }, { height: 300, used: { annotations: 1, findings: 2, pages: 3 } }),
    gestures: [g.resizeWindow(840, 240)],
    expectLayout: {
      items: { pages: { formKind: "open", rect: r(0, 40, 200, 144) }, annotations: { formKind: "rail", rect: r(0, 184, 200, 26) }, findings: { formKind: "header", rect: r(0, 210, 200, 30) } },
    },
  },
  {
    id: "C18",
    title: "A rail icon opens on click",
    expect: "A click on a panel's rail icon opens that panel; a click is never a drag.",
    group: "panels",
    scene: bench({ column: ["pages", "annotations"], bar: ["views", "tools", "zoom"], floats: [FINDINGS_FLOAT] }, { from: { pages: 2 } }),
    gestures: [g.click("pages")],
    expectLayout: {
      items: { pages: { formKind: "open", rect: r(0, 40, 240, 246.43) }, annotations: { formKind: "open", rect: r(0, 286.43, 240, 213.57) } },
    },
  },
  {
    id: "C23",
    title: "A press is not a reshape",
    expect: "A press on a grip or a header, with no drag and nothing opened, never changes another item's form or rect.",
    group: "panels",
    scene: bench({ column: ["pages", "annotations", "findings"], bar: ["views", "tools", "zoom"], floats: [] }, { height: 300 }),
    gestures: [
      g.press("pages"), g.release(), g.press("annotations"), g.release(), g.press("findings"), g.release(),
      g.press("views"), g.release(), g.press("tools"), g.release(), g.press("zoom"), g.release(),
    ],
    expectLayout: {
      items: {
        pages: { formKind: "header", rect: r(0, 40, 240, 30) },
        annotations: { formKind: "open", rect: r(0, 70, 240, 106.67) },
        findings: { formKind: "open", rect: r(0, 176.67, 240, 123.33) },
        views: { formKind: "row", rect: r(12, 0, 244, 40) },
        tools: { formKind: "row", rect: r(264, 0, 244, 40) },
        zoom: { formKind: "row", rect: r(516, 0, 244, 40) },
      },
    },
  },
  {
    id: "C23b",
    title: "A press is no use, by the stored ages",
    expect: "A press on the oldest panel's header, with no drag, changes no age: after a reload (a fresh solve) the oldest still folds first, and the stored form has the ages it began with.",
    group: "panels",
    scene: bench({ column: ["pages", "annotations", "findings"], bar: ["views", "tools", "zoom"], floats: [] }, { height: 300 }),
    gestures: [g.press("pages"), g.release(), g.key("Reload")],
    expectLayout: {
      items: {
        pages: { formKind: "header", rect: r(0, 40, 240, 30) },
        annotations: { formKind: "open", rect: r(0, 70, 240, 106.67) },
        findings: { formKind: "open", rect: r(0, 176.67, 240, 123.33) },
      },
    },
    expectStored: { items: { pages: { used: 1 }, annotations: { used: 2 }, findings: { used: 3 } } },
  },

  // --- groups and toolbars --------------------------------------------------------------------------------------------
  {
    id: "C2",
    title: "A group alone in a column",
    expect: "A group never sets the column's width: alone, the column is a rail of about 30 px with the group as icons.",
    group: "groups",
    scene: bench({ column: ["views"], bar: ["tools", "zoom", "pages"], floats: [ANNOTATIONS_FLOAT, FINDINGS_FLOAT] }),
    gestures: [],
    expectLayout: { items: { views: { formKind: "icons", edge: "column", rect: r(0, 40, 28, 96) }, pages: { formKind: "header", edge: "bar" } }, edges: { column: { cross: 30 } } },
  },
  {
    id: "C10",
    title: "Group forms by space",
    expect: "A group takes the largest form that fits its column: words in a row, stacked words, icons.",
    group: "groups",
    scene: bench({ column: ["pages", "views", "tools"], bar: ["zoom"], floats: [ANNOTATIONS_FLOAT, FINDINGS_FLOAT] }, { widthLimit: 140 }),
    gestures: [],
    expectLayout: {
      items: { pages: { formKind: "open", rect: r(0, 40, 140, 292) }, views: { formKind: "stacked", rect: r(0, 332, 84, 84) }, tools: { formKind: "stacked", rect: r(0, 416, 84, 84) } },
      edges: { column: { cross: 140 } },
    },
  },
  {
    id: "C10b",
    title: "Group forms by space, wide column",
    expect: "In a column wide enough for its words, a group is a row of words, drawn at its own width.",
    group: "groups",
    scene: bench({ column: ["pages", "views", "tools"], bar: ["zoom"], floats: [ANNOTATIONS_FLOAT, FINDINGS_FLOAT] }, { widthLimit: 360 }),
    gestures: [g.resizeEdge("column", 300)],
    expectLayout: {
      items: { pages: { formKind: "open", rect: r(0, 40, 300, 400) }, views: { formKind: "row", rect: r(0, 440, 240, 30) }, tools: { formKind: "row", rect: r(0, 470, 240, 30) } },
      edges: { column: { cross: 300 } },
    },
  },
  {
    id: "C11",
    title: "Draggable groups",
    expect: "Every control group, the zoom group too, can be lifted by its handle and dropped in the column.",
    group: "groups",
    scene: bench(),
    gestures: [...g.drag("zoom", g.gap("column", 2)), ...g.drag("views", g.gap("column", 0)), ...g.drag("tools", g.gap("column", 1))],
    expectLayout: {
      order: { column: ["views", "tools", "pages", "annotations", "zoom"], bar: [] },
      items: { views: { formKind: "row", edge: "column", rect: r(0, 0, 240, 30) }, tools: { formKind: "row", rect: r(0, 30, 240, 30) }, zoom: { formKind: "row", rect: r(0, 470, 240, 30) } },
    },
  },
  {
    id: "C12",
    title: "No grip where nothing moves",
    expect: "A fixed item (a title, window controls) has no handle: a press on it never lifts anything, and nothing offers a drop onto it.",
    group: "groups",
    scene: doc(),
    gestures: [g.press("title"), g.at(300, 200), g.release(), g.press("controls"), g.at(300, 200), g.release()],
    expectLayout: {
      items: { title: { edge: "titlebar", rect: r(0, 0, 1116, 32) }, controls: { edge: "titlebar", rect: r(1116, 0, 84, 32) }, notes: { floating: true, rect: r(500, 200, 280, 320) } },
      content: r(260, 68, 680, 704),
      notes: { none: true },
    },
  },
  {
    id: "C19",
    title: "A group in icon form keeps its grip",
    expect: "A group drawn as icons still has a handle, and it drags by it.",
    group: "groups",
    scene: bench({ column: ["views"], bar: ["tools", "zoom"], floats: [ANNOTATIONS_FLOAT, FINDINGS_FLOAT] }),
    gestures: [g.press("views", { x: 4, y: 4 }), g.at(520, 260), g.release()],
    expectLayout: { items: { views: { floating: true, edge: null, rect: r(516, 256, 244, 34) } }, order: { column: [] }, floats: ["annotations", "findings", "views"] },
  },
  {
    id: "C21",
    title: "The toolbar never grows tall",
    expect: "The top bar is 40 px tall at most, whatever is in it: a panel there takes its header.",
    group: "groups",
    scene: bench({ column: ["pages", "annotations"], bar: ["views", "tools", "findings"], floats: [] }),
    gestures: [g.resizeItem("findings", 35)],
    expectLayout: { items: { findings: { formKind: "header", edge: "bar", rect: r(516, 0, 145, 40) } }, edges: { bar: { cross: 40 } } },
  },

  // --- dragging -------------------------------------------------------------------------------------------------------
  {
    id: "C1",
    title: "The drop preview is the rect it gets",
    expect: "The slot shown while the item is held is the exact rect it gets after the drop: the same solve with the item inserted.",
    group: "drag",
    scene: bench(),
    gestures: [g.press("annotations"), g.to(g.gap("column", 0)), g.hold(), g.release()],
    checkpoints: [{ at: 2, layout: { items: { annotations: { formKind: "open", rect: r(0, 40, 240, 213.57) }, pages: { rect: r(0, 253.57, 240, 246.43) } }, order: { column: ["annotations", "pages"] } }, note: "the slot" }],
    expectLayout: { items: { annotations: { formKind: "open", rect: r(0, 40, 240, 213.57) }, pages: { rect: r(0, 253.57, 240, 246.43) }, findings: { floating: true, rect: r(440, 130, 220, 190) } }, order: { column: ["annotations", "pages"] } },
    expectDom: [
      { at: 2, attr: { "data-drag-session": "panel" }, note: "the root says a panel is dragged" },
      { at: 2, select: "[data-drag-slot][data-drag-target]", count: 1, attr: { "data-drag-target": "gap:column:start:0" }, note: "one slot, on the top gap" },
      { at: 2, select: "[data-drag-marker]", count: 1, note: "its insertion line" },
      { at: 2, select: "[data-drag-held]", count: 1, note: "the held item" },
      { at: 3, attr: { "data-drag-session": null }, note: "the session ends with the drop" },
      { at: 3, select: "[data-drag-slot]", count: 0, note: "no slot after the drop" },
    ],
  },
  {
    id: "C3",
    title: "Drop into any gap",
    expect: "Every gap of a column opens a slot: above, between and below its panels and groups.",
    group: "drag",
    scene: bench({ column: ["pages", "annotations", "views"], bar: ["tools", "zoom"], floats: [FINDINGS_FLOAT] }),
    gestures: [
      g.press("findings", { x: 20, y: 10 }),
      g.to(g.gap("column", 0)), g.hold(),
      g.to(g.gap("column", 1)), g.hold(),
      g.to(g.gap("column", 2)), g.hold(),
      g.to(g.gap("column", 3)), g.hold(),
      g.escape(),
    ],
    checkpoints: [
      { at: 2, layout: { order: { column: ["findings", "pages", "annotations", "views"] }, items: { findings: { edge: "column", rect: r(0, 40, 240, 161.11) } } }, note: "above the first" },
      { at: 4, layout: { order: { column: ["pages", "findings", "annotations", "views"] }, items: { findings: { rect: r(0, 183.33, 240, 161.11) } } }, note: "between" },
      { at: 6, layout: { order: { column: ["pages", "annotations", "findings", "views"] }, items: { findings: { rect: r(0, 308.89, 240, 161.11) } } }, note: "between the last two" },
      { at: 8, layout: { order: { column: ["pages", "annotations", "views", "findings"] }, items: { findings: { rect: r(0, 338.89, 240, 161.11) } } }, note: "below the last" },
    ],
    expectLayout: { order: { column: ["pages", "annotations", "views"] }, items: { findings: { floating: true, rect: r(440, 130, 220, 190) }, pages: { rect: r(0, 40, 240, 230.36) } } },
  },
  {
    id: "C4",
    title: "A group into the panel column",
    expect: "A group dragged into the column opens a slot and takes the largest column form that fits.",
    group: "drag",
    scene: bench(),
    gestures: g.drag("views", g.gap("column", 2)),
    expectLayout: { items: { views: { formKind: "row", edge: "column", rect: r(0, 470, 240, 30) } }, order: { column: ["pages", "annotations", "views"], bar: ["tools", "zoom"] } },
  },
  {
    id: "C20",
    title: "Back over its own place",
    expect: "Dragged away and back over its own place, the item shows that place, and a release puts it back; nothing else moved.",
    group: "drag",
    scene: bench(),
    // Pressed 20 px in and 10 down; the float aimed at the content's center lands at the pointer minus that grab.
    gestures: [g.press("pages", { x: 20, y: 10 }), g.to(g.float), g.hold(), g.to(g.home), g.hold(), g.release()],
    checkpoints: [
      { at: 2, layout: { items: { pages: { floating: true, rect: r(520, 260, 200, 190) }, annotations: { formKind: "open", rect: r(0, 40, 240, 460) } } }, note: "away, over the pages" },
      { at: 4, layout: { items: { pages: { edge: "column", rect: r(0, 40, 240, 246.43) }, annotations: { rect: r(0, 286.43, 240, 213.57) } } }, note: "back over its own place: the old rect" },
    ],
    expectLayout: { items: { pages: { edge: "column", floating: false, rect: r(0, 40, 240, 246.43) }, annotations: { rect: r(0, 286.43, 240, 213.57) }, findings: { floating: true, rect: r(440, 130, 220, 190) } }, order: { column: ["pages", "annotations"] } },
  },
  {
    id: "C22",
    title: "The whole preview",
    expect: "While a drop is previewed, every other item, floats too, is drawn at its rect after the drop, not only the dropped one.",
    group: "drag",
    // Pages (200 wide) and Findings (220) make a 220 column, with the Views float just beside it. Annotations (240) widens
    // the column to 240, so the float moves clear and Pages and Findings shrink: all of it is drawn before the release.
    scene: bench({ column: ["pages", "findings"], bar: ["tools", "zoom"], floats: [ANNOTATIONS_FLOAT, { id: "views", rect: { x: 222, y: 330, width: 244, height: 34 } }] }, { height: 400 }),
    gestures: [g.press("annotations"), g.to(g.gap("column", 2)), g.hold(), g.release()],
    checkpoints: [{ at: 2, layout: { items: { pages: { rect: r(0, 40, 240, 120) }, findings: { rect: r(0, 160, 240, 130) }, annotations: { edge: "column", rect: r(0, 290, 240, 110) }, views: { floating: true, rect: r(240, 330, 244, 34) } } }, note: "during the preview" }],
    expectLayout: { items: { pages: { rect: r(0, 40, 240, 120) }, findings: { rect: r(0, 160, 240, 130) }, annotations: { edge: "column", rect: r(0, 290, 240, 110) }, views: { floating: true, rect: r(240, 330, 244, 34) } } },
  },

  // --- floats, saving, freeze -----------------------------------------------------------------------------------------
  {
    id: "C5",
    title: "Floats stay put while the pages scroll",
    expect: "A float lies above the pages in the window's px: scrolling the pages never moves it.",
    group: "floats",
    scene: bench(),
    gestures: [g.scroll(300)],
    expectLayout: { items: { findings: { floating: true, rect: r(440, 130, 220, 190) } } },
    // The layout alone can't tell a float that scrolled: only a page can, by measuring where the float is drawn.
    expectDom: [{ item: "findings", count: 1, rect: r(440, 130, 220, 190), note: "the float is drawn where it was after the scroll" }],
  },
  {
    id: "C7",
    title: "A float over a docked panel",
    expect: "A float never covers a docked item's content: dropped over one, it lands clear of it, and the preview says so. This assumes the default `hitBand` (an open panel's body is no drop place): a host whose columns use `hitBand: \"middle\"` gets card halves over the panel, and skips or marks this row.",
    group: "floats",
    requires: { hitBand: "default" },
    scene: bench(),
    gestures: [g.press("findings", { x: 200, y: 10 }), g.at(260, 230), g.hold(), g.release()],
    checkpoints: [{ at: 2, layout: { items: { findings: { floating: true, rect: r(240, 220, 220, 190) } } }, note: "the preview, clear of the column" }],
    expectLayout: { items: { findings: { floating: true, rect: r(240, 220, 220, 190) }, pages: { rect: r(0, 40, 240, 246.43) } } },
  },
  {
    id: "C13",
    title: "A reload restores the layout",
    expect: "A reload restores every item's place and form from the stored form.",
    group: "floats",
    scene: bench({ column: ["annotations", "pages"], bar: ["zoom", "views", "tools"], floats: [{ id: "findings", rect: { x: 520, y: 200, width: 220, height: 190 } }] }, { from: { pages: 1 }, kept: ["annotations"] }),
    // Move a group into the column between the panels, fold the float to its bar, reload: everything comes back.
    gestures: [...g.drag("tools", g.gap("column", 1)), g.click("findings", "fold"), g.key("Reload")],
    checkpoints: [{ at: 4, layout: { items: { annotations: { formKind: "open", rect: r(0, 40, 240, 400) }, tools: { formKind: "row", edge: "column", rect: r(0, 440, 240, 30) }, pages: { formKind: "header", rect: r(0, 470, 240, 30) }, findings: { formKind: "header", floating: true, rect: r(520, 200, 220, 30) } }, order: { column: ["annotations", "tools", "pages"], bar: ["zoom", "views"] } }, note: "before the reload" }],
    expectLayout: { items: { annotations: { formKind: "open", rect: r(0, 40, 240, 400) }, tools: { formKind: "row", edge: "column", rect: r(0, 440, 240, 30) }, pages: { formKind: "header", rect: r(0, 470, 240, 30) }, findings: { formKind: "header", floating: true, rect: r(520, 200, 220, 30) } }, order: { column: ["annotations", "tools", "pages"], bar: ["zoom", "views"] } },
  },
  {
    id: "C14",
    title: "Frozen",
    expect: "Frozen, nothing lifts; holding Alt lets everything move.",
    group: "floats",
    scene: bench(),
    settings: { frozen: true },
    gestures: [g.press("pages", { x: 20, y: 10 }), g.at(300, 240), g.release(), g.key("Alt"), g.press("pages", { x: 20, y: 10 }), g.to(g.float), g.hold(), g.release(), g.key("Alt:up")],
    checkpoints: [{ at: 2, layout: { items: { pages: { edge: "column", rect: r(0, 40, 240, 246.43) }, annotations: { rect: r(0, 286.43, 240, 213.57) } } }, note: "frozen: nothing moved" }],
    expectLayout: { items: { pages: { floating: true, rect: r(520, 260, 200, 190) }, annotations: { rect: r(0, 40, 240, 460) } } },
  },
  {
    id: "C14b",
    title: "Frozen refuses the menu's moves too",
    expect: "Frozen, the menu's Float, Dock and Move to › change nothing either; with Alt down they work.",
    group: "floats",
    scene: bench(),
    settings: { frozen: true },
    gestures: [g.click("pages", "float"), g.moveTo("pages", g.float), g.click("pages", "dock"), g.key("Alt"), g.click("pages", "float"), g.key("Alt:up")],
    checkpoints: [{ at: 2, layout: { items: { pages: { edge: "column", floating: false, rect: r(0, 40, 240, 246.43) }, annotations: { rect: r(0, 286.43, 240, 213.57) } } }, note: "frozen: nothing moved" }],
    // The menu's Float anchors it to the content's top-right corner; the float already there wins, so it lies beside it.
    expectLayout: { items: { pages: { floating: true, rect: r(240, 40, 200, 190) }, annotations: { rect: r(0, 40, 240, 460) } } },
  },
  {
    id: "C15",
    title: "No jump",
    expect: "When an item's own size grows (its count gains digits), no other item moves more than 0.5 px: the last group in the bar grows by 35 px and a float's content grows, and nothing else changes.",
    group: "floats",
    scene: bench(),
    gestures: [g.resizeItem("zoom", 35), g.resizeItem("findings", 35)],
    expectLayout: {
      items: {
        views: { rect: r(12, 0, 244, 40) },
        tools: { rect: r(264, 0, 244, 40) },
        zoom: { rect: r(516, 0, 279, 40) },
        pages: { rect: r(0, 40, 240, 246.43) },
        annotations: { rect: r(0, 286.43, 240, 213.57) },
        findings: { floating: true, rect: r(440, 130, 220, 190) },
      },
      content: r(240, 40, 600, 460),
    },
  },
  {
    id: "C16",
    title: "A float has no pin",
    expect: "There is one kind of float, in the window's px: the stored form carries no pinned flag, and a float survives a reload as a plain float.",
    group: "floats",
    scene: bench(),
    gestures: [g.key("Reload")],
    expectLayout: { items: { findings: { floating: true, rect: r(440, 130, 220, 190) }, pages: { rect: r(0, 40, 240, 246.43) } }, floats: ["findings"] },
    expectStored: { absent: ["pinned"] },
  },
  {
    id: "C17",
    title: "A drop past the stage's edge",
    expect: "A float dropped with the pointer past the stage's edge: the pointer is clamped into the stage first (the host contract; the runner clamps every `move` to a point), and the clamped point picks what is there. Nothing is docked at this stage's right edge, so it picks the float, which lands clamped into the stage; the preview shows it clamped, and the drop never cancels. A window with a docked edge there picks that edge's last gap instead.",
    group: "floats",
    scene: bench(),
    gestures: [g.press("findings", { x: 40, y: 10 }), g.at(920, 240), g.hold(), g.release()],
    checkpoints: [{ at: 2, layout: { items: { findings: { floating: true, rect: r(620, 230, 220, 190) } } }, note: "the preview, clamped into the stage" }],
    expectLayout: { items: { findings: { floating: true, rect: r(620, 230, 220, 190) } } },
  },
];
