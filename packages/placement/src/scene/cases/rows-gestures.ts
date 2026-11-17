/**
 * The panel gestures P1 to P15 (and their variants) as rows, on window A with the left and right columns 300 px
 * wide (stored sizes): Pages above Annotations in the left column, Findings in the right, all open, 1120 x 800.
 *
 * The kits' steps map onto the gesture grammar like this: `lift(id)` is a `press` and a `move` (a `move` with a place
 * lifts); `to(target)` is a `move` to a `place`; `toPoint` a `move` to a `point`; `hold` a `hold`; `drop` a `release`;
 * `escape` a `key` Escape; `press(id)` a `press` and a `release`; `scroll(dy)` a `scroll`; the commands are `click`s on
 * the item's controls (`close`, `open`, `float`, `dock`) or on a "Move to ›" row (`place`). A negative expectation ("no
 * target is offered here") is a `move` to a point and a layout with no slot: the held item is out of the layout.
 */
import { rect as r } from "../../geometry";
import type { Scene } from "../index";
import { g } from "./gestures";
import type { CaseRow } from "./types";
import { form } from "./world";
import { WINDOW_A, winScene } from "./windows";

const win = (o: Parameters<typeof winScene>[1] = {}): Scene => winScene(WINDOW_A, { size: 300, ...o });

/** A fixed window title bar across the top, 28 px (a title that shrinks to 80 and grows). */
function withTitle(s: Scene): Scene {
  return {
    ...s,
    edges: [{ id: "titlebar", side: "top", ring: 0, span: "full", accepts: ["group"], items: ["window-title"], cross: { min: 28, max: 28, rail: 28 } }, ...s.edges],
    items: { ...s.items, "window-title": { id: "window-title", kind: "title", used: 0, fixed: true, forms: { row: [form("row", 80, 160, 28, { grows: true })] } } },
  };
}

const RIGHT_EDGE = 1108;
/**
 * Past a column's outer edge, in the window's 12 px inset: the rail stop holds the outer 10 px from the window's edge,
 * so the new column's line is reached 1 px past the column (11 px from the window's edge).
 */
const LINE_OUT = 1;

export const GESTURE_ROWS: readonly CaseRow[] = [
  {
    id: "P1-lift-follows-and-nothing-reflows",
    title: "Lifting: the slot is the target's rect and nothing else moves",
    expect: "While Annotations is held over a gap, one slot shows and it is the rect Annotations gets after the drop; everything else is drawn where the drop leaves it.",
    group: "gestures",
    scene: win(),
    gestures: [g.press("annotations"), g.to(g.gap("right-0", 1)), g.hold()],
    expectLayout: { items: { pages: { rect: r(12, 0, 300, 800) }, findings: { rect: r(808, 0, 300, 394) }, annotations: { edge: "right-0", rect: r(808, 406, 300, 394) } }, columns: { left: [["pages"]], right: [["findings", "annotations"]] } },
    expectDom: [
      { attr: { "data-drag-session": "panel" }, note: "the root says a panel is dragged" },
      { select: "[data-drag-held]", count: 1, note: "the held item" },
      { select: "[data-drag-slot][data-drag-target]", count: 1, attr: { "data-drag-target": "gap:right-0:start:1" }, note: "one slot, on the target" },
    ],
  },
  {
    id: "P2-drop-into-another-column-at-a-position",
    title: "Drop into another column at a position",
    expect: "Dropped on the end gap of the right column, Annotations lands there, on the rect the slot showed.",
    group: "gestures",
    scene: win(),
    gestures: g.drag("annotations", g.gap("right-0", 1)),
    checkpoints: [{ at: 2, layout: { items: { pages: { rect: r(12, 0, 300, 800) }, findings: { rect: r(808, 0, 300, 394) }, annotations: { edge: "right-0", rect: r(808, 406, 300, 394) } } }, note: "the slot" }],
    expectLayout: { items: { pages: { rect: r(12, 0, 300, 800) }, findings: { rect: r(808, 0, 300, 394) }, annotations: { edge: "right-0", rect: r(808, 406, 300, 394) } }, columns: { left: [["pages"]], right: [["findings", "annotations"]] } },
  },
  {
    id: "P3-restore-pages-above-annotations",
    title: "Restore Pages above Annotations",
    expect: "Pages moved to the right column and dropped back on the left column's top gap is above Annotations again, as it began.",
    group: "gestures",
    scene: win(),
    gestures: [...g.drag("pages", g.gap("right-0", 1)), ...g.drag("pages", g.gap("left-0", 0))],
    checkpoints: [{ at: 3, layout: { columns: { left: [["annotations"]], right: [["findings", "pages"]] }, items: { annotations: { rect: r(12, 0, 300, 800) }, pages: { rect: r(808, 406, 300, 394) } } }, note: "after the first drop" }],
    expectLayout: { items: { pages: { rect: r(12, 0, 300, 394) }, annotations: { rect: r(12, 406, 300, 394) }, findings: { rect: r(808, 0, 300, 800) } }, columns: { left: [["pages", "annotations"]], right: [["findings"]] } },
  },
  {
    id: "P4-escape-cancels",
    title: "Escape cancels",
    expect: "Escape during a drag changes nothing: the scene is as it was, and no slot or held marker remains.",
    group: "gestures",
    scene: win(),
    gestures: [g.press("annotations"), g.to(g.gap("right-0", 0)), g.hold(), g.escape()],
    expectLayout: { items: { pages: { rect: r(12, 0, 300, 394) }, annotations: { rect: r(12, 406, 300, 394) }, findings: { rect: r(808, 0, 300, 800) } }, columns: { left: [["pages", "annotations"]], right: [["findings"]] } },
    expectDom: [
      { at: 2, select: "[data-drag-slot]", count: 1, note: "the slot while held" },
      { select: "[data-drag-slot]", count: 0, note: "no slot after Escape" },
      { select: "[data-drag-held]", count: 0, note: "no held marker after Escape" },
      { attr: { "data-drag-session": null }, note: "the session is over" },
    ],
  },
  {
    id: "P5-own-place-is-a-no-op",
    title: "Over its own place is a no-op",
    expect: "Lifted and let go over its own place, an item changes nothing, shows no slot and is never floated.",
    group: "gestures",
    scene: win(),
    gestures: [g.press("annotations"), g.to(g.home), g.hold(), g.release()],
    expectLayout: { items: { pages: { rect: r(12, 0, 300, 394) }, annotations: { rect: r(12, 406, 300, 394) }, findings: { rect: r(808, 0, 300, 800) } }, columns: { left: [["pages", "annotations"]], right: [["findings"]] } },
    expectDom: [{ at: 2, select: "[data-drag-slot]", count: 0, note: "no slot over its own place" }],
  },
  {
    id: "P5-gap-beside-it",
    title: "The gap beside it is its own place",
    expect: "The gap just below Annotations in its own column is its own place (home's tile, over Annotations itself): a release there changes nothing.",
    group: "gestures",
    scene: win(),
    gestures: [g.press("annotations"), g.to(g.home), g.release()],
    expectLayout: { items: { pages: { rect: r(12, 0, 300, 394) }, annotations: { rect: r(12, 406, 300, 394) }, findings: { rect: r(808, 0, 300, 800) } }, columns: { left: [["pages", "annotations"]], right: [["findings"]] } },
  },
  {
    id: "P5-neighbour-half-facing-it",
    title: "Over a neighbor's body there is no gap",
    expect: "Annotations let go over Pages' body, away from its edges, finds no gap (over a panel's body a gap is a band around a boundary), so it falls through to the float target: it floats, where the pointer let go. The older rule \"the neighbor half that faces it is its home\" no longer holds.",
    group: "gestures",
    scene: win(),
    gestures: [g.press("annotations", { x: 20, y: 10 }), g.at(160, 200), g.hold(), g.release()],
    expectLayout: { items: { pages: { rect: r(12, 0, 300, 800) }, annotations: { floating: true, rect: r(312, 190, 280, 360) } }, floats: ["annotations"], columns: { left: [["pages"]], right: [["findings"]] } },
  },
  {
    id: "P6-new-outer-column-from-outside",
    title: "A new outer column from outside the right column",
    expect: "Let go 1 px outside the right column's outer edge (11 px from the window's edge, past the rail stop's 10), at 5%, 50% or 95% of the stage's height, Annotations makes the outermost column, on the slot's rect.",
    group: "gestures",
    scene: win(),
    gestures: [g.press("annotations"), g.at(RIGHT_EDGE + LINE_OUT, 40), g.hold(), g.at(RIGHT_EDGE + LINE_OUT, 400), g.hold(), g.at(RIGHT_EDGE + LINE_OUT, 760), g.hold(), g.release()],
    checkpoints: [
      { at: 2, layout: { items: { pages: { rect: r(12, 0, 220, 800) }, annotations: { edge: "right-1", rect: r(888, 0, 220, 800) }, findings: { edge: "right-0", rect: r(576, 0, 300, 800) } }, columns: { left: [["pages"]], right: [["annotations"], ["findings"]] }, notes: { has: ["column-shrunk"] } }, note: "5%" },
      { at: 4, layout: { items: { pages: { rect: r(12, 0, 220, 800) }, annotations: { edge: "right-1", rect: r(888, 0, 220, 800) }, findings: { edge: "right-0", rect: r(576, 0, 300, 800) } }, columns: { left: [["pages"]], right: [["annotations"], ["findings"]] }, notes: { has: ["column-shrunk"] } }, note: "50%" },
      { at: 6, layout: { items: { pages: { rect: r(12, 0, 220, 800) }, annotations: { edge: "right-1", rect: r(888, 0, 220, 800) }, findings: { edge: "right-0", rect: r(576, 0, 300, 800) } }, columns: { left: [["pages"]], right: [["annotations"], ["findings"]] }, notes: { has: ["column-shrunk"] } }, note: "95%" },
    ],
    expectLayout: { items: { pages: { rect: r(12, 0, 220, 800) }, annotations: { edge: "right-1", rect: r(888, 0, 220, 800) }, findings: { edge: "right-0", rect: r(576, 0, 300, 800) } }, columns: { left: [["pages"]], right: [["annotations"], ["findings"]] }, notes: { has: ["column-shrunk"] } },
  },
  {
    id: "P6-new-outer-column-from-inside",
    title: "A new outer column from inside the right column",
    expect: "The new column's line is also reachable from inside the column: Annotations over its outer edge makes the outermost column.",
    group: "gestures",
    scene: win(),
    gestures: g.drag("annotations", g.column("right", 0)),
    expectLayout: { items: { pages: { rect: r(12, 0, 220, 800) }, annotations: { edge: "right-1", rect: r(888, 0, 220, 800) }, findings: { edge: "right-0", rect: r(576, 0, 300, 800) } }, columns: { left: [["pages"]], right: [["annotations"], ["findings"]] }, notes: { has: ["column-shrunk"] } },
  },
  {
    id: "P6-left-outer-edge",
    title: "A new outer column on the left",
    expect: "Findings let go 1 px outside the left column's outer edge (11 px from the window's edge, past the rail stop's 10) makes the outermost left column; the right side is then empty.",
    group: "gestures",
    scene: win(),
    gestures: [g.press("findings"), g.at(12 - LINE_OUT, 400), g.hold(), g.release()],
    expectLayout: { items: { findings: { edge: "left-1", rect: r(12, 0, 220, 800) }, pages: { rect: r(244, 0, 300, 394) }, annotations: { rect: r(244, 406, 300, 394) } }, columns: { left: [["findings"], ["pages", "annotations"]], right: [] } },
  },
  {
    id: "P6-between-columns-line",
    title: "The line between two columns",
    expect: "Dropped on the new-column line at the inner end of the left side, Annotations makes a second left column.",
    group: "gestures",
    scene: win(),
    gestures: g.drag("annotations", g.column("left", 1)),
    expectLayout: { items: { pages: { rect: r(12, 0, 220, 800) }, annotations: { edge: "left-1", rect: r(244, 0, 220, 800) }, findings: { rect: r(808, 0, 300, 800) } }, columns: { left: [["pages"], ["annotations"]], right: [["findings"]] } },
  },
  {
    id: "P7-end-reach",
    title: "A drop just past the end of a stack is its end gap",
    expect: "A drop up to 24 px past the end of a stack is its end gap: Pages let go 14 px below the right column's last member goes last in it.",
    group: "gestures",
    scene: win(),
    gestures: [g.press("pages"), g.at(958, 814), g.hold(), g.release()],
    expectLayout: { items: { annotations: { rect: r(12, 0, 300, 800) }, findings: { rect: r(808, 0, 300, 394) }, pages: { edge: "right-0", rect: r(808, 406, 300, 394) } }, columns: { left: [["annotations"]], right: [["findings", "pages"]] } },
  },
  {
    id: "P8-folded-bar-drags-like-a-card",
    title: "A folded bar drags like a card",
    expect: "Annotations folded by hand to a bar lifts and drops like a card: on the right column's top gap it lands first, still a bar, on the slot's rect.",
    group: "gestures",
    scene: win({ from: { annotations: 1 } }),
    gestures: g.drag("annotations", g.gap("right-0", 0)),
    checkpoints: [{ at: 2, layout: { items: { pages: { rect: r(12, 0, 300, 800) }, annotations: { formKind: "header", edge: "right-0", rect: r(808, 0, 300, 30) }, findings: { rect: r(808, 42, 300, 758) } }, columns: { left: [["pages"]], right: [["annotations", "findings"]] } }, note: "the slot" }],
    expectLayout: { items: { pages: { rect: r(12, 0, 300, 800) }, annotations: { formKind: "header", edge: "right-0", rect: r(808, 0, 300, 30) }, findings: { rect: r(808, 42, 300, 758) } }, columns: { left: [["pages"]], right: [["annotations", "findings"]] } },
  },
  {
    id: "P9-rail-segment-on-its-own-rail",
    title: "A rail segment dropped on its own rail changes nothing",
    expect: "In a narrow window, a rail segment dropped on its own side's rail (even below the last segment) never splits or reorders it.",
    group: "gestures",
    scene: win({ width: 700 }),
    gestures: g.drag("annotations", g.rail("left")),
    expectLayout: { items: { pages: { rail: "left", rect: r(12, 0, 32, 32) }, annotations: { rail: "left", rect: r(12, 32, 32, 32) }, findings: { rect: r(388, 0, 300, 800) } }, rails: { left: ["pages", "annotations"], right: [] }, columns: { right: [["findings"]] } },
  },
  {
    id: "P9-to-the-other-rail",
    title: "A rail segment docks folded on the other rail",
    expect: "Annotations dropped on the right side's rail docks folded there, as a segment.",
    group: "gestures",
    scene: win({ width: 700 }),
    gestures: g.drag("annotations", g.rail("right")),
    expectLayout: { items: { pages: { rail: "left", rect: r(12, 0, 32, 32) }, findings: { rect: r(388, 0, 256, 800) }, annotations: { rail: "right", folded: "hand", rect: r(656, 0, 32, 32) } }, rails: { left: ["pages"], right: ["annotations"] } },
  },
  {
    id: "P10-float-keeps-its-place-and-last-size",
    title: "A float keeps its place and last size",
    expect: "Floated from the menu, Annotations leaves its column and floats at the content's top-right corner at its last float size; scrolling never moves it.",
    group: "gestures",
    scene: { ...win(), items: { ...win().items, annotations: { ...win().items.annotations!, floatSize: { width: 300, height: 440 } } } },
    gestures: [g.click("annotations", "float"), g.scroll(600)],
    expectLayout: { items: { annotations: { floating: true, edge: null, rect: r(496, 0, 300, 440) }, pages: { rect: r(12, 0, 300, 800) } }, floats: ["annotations"], columns: { left: [["pages"]] } },
    // Only a page can show that the float didn't scroll with the pages: it measures where the float is drawn.
    expectDom: [{ at: 1, item: "annotations", count: 1, rect: r(496, 0, 300, 440), note: "the float is drawn where it was after the scroll" }],
  },
  {
    id: "P10-float-moves-by-the-pointer",
    title: "A float moves by exactly the pointer's distance",
    expect: "A float lifted and let go 40 px to the right lands exactly 40 px to the right.",
    group: "gestures",
    scene: win({ floats: [{ id: "annotations", rect: r(400, 100, 300, 440) }], columns: { left: [["pages"]], right: [["findings"]] } }),
    // Pressed at (50, 20) in the float; the pointer then moves from (450, 120) to (490, 120): 40 px right, no vertical move.
    gestures: [g.press("annotations", { x: 50, y: 20 }), g.at(490, 120), g.hold(), g.release()],
    expectLayout: { items: { annotations: { floating: true, rect: r(440, 100, 300, 440) } } },
  },
  {
    id: "P10-float-lands-where-held",
    title: "A float lands where the pointer lets go, as it was held",
    expect: "A float let go over the middle of the pages area lands at the pointer minus where it was held, inside the stage.",
    group: "gestures",
    scene: win({ floats: [{ id: "annotations", rect: r(400, 100, 300, 440) }], columns: { left: [["pages"]], right: [["findings"]] } }),
    gestures: [g.press("annotations", { x: 50, y: 20 }), g.at(560, 400), g.hold(), g.release()],
    expectLayout: { items: { annotations: { floating: true, rect: r(508, 360, 300, 440) } } },
  },
  {
    id: "P11-a-float-never-covers-chrome",
    title: "A float never covers chrome",
    expect: "Annotations let go over the title bar lands below it, clear of every bar, and the slot never covers the title.",
    group: "gestures",
    scene: withTitle(win()),
    gestures: [g.press("annotations", { x: 20, y: 10 }), g.at(600, 12), g.hold(), g.release()],
    checkpoints: [{ at: 2, layout: { items: { annotations: { floating: true, rect: r(528, 28, 280, 360) }, "window-title": { rect: r(12, 0, 1096, 28) }, pages: { rect: r(12, 28, 300, 772) } } }, note: "the preview, below the title bar" }],
    expectLayout: { items: { annotations: { floating: true, rect: r(528, 28, 280, 360) }, "window-title": { rect: r(12, 0, 1096, 28) }, pages: { rect: r(12, 28, 300, 772) } } },
  },
  {
    id: "P11-big-stored-float-is-clamped",
    title: "A big stored float is clamped on read and still draggable",
    expect: "A stored float larger than the stage is drawn inside it, and lifting it still offers every drop target and shows a slot.",
    group: "gestures",
    scene: win({ floats: [{ id: "annotations", rect: r(0, 0, 1300, 1000) }], columns: { left: [["pages"]], right: [["findings"]] } }),
    gestures: [g.press("annotations"), g.to(g.gap("left-0", 1)), g.hold()],
    expectLayout: { items: { pages: { rect: r(12, 0, 300, 394) }, annotations: { edge: "left-0", rect: r(12, 406, 300, 394) } } },
    expectDom: [{ select: "[data-drag-slot][data-drag-target]", count: 1, note: "a slot is shown" }],
  },
  {
    id: "P12-a-press-is-no-use",
    title: "A press is no use",
    expect: "A press on a header or grip, with no drag, reshapes nothing: no column swaps width, no fold changes.",
    group: "gestures",
    scene: win({ width: 870 }),
    gestures: [g.press("pages"), g.release(), g.press("findings"), g.release()],
    expectLayout: { items: { pages: { rect: r(12, 0, 220, 394) }, annotations: { rect: r(12, 406, 220, 394) }, findings: { rect: r(576, 0, 282, 800) } }, notes: { hasNot: ["content-changed"] } },
  },
  {
    id: "P12b-a-press-is-no-use-by-the-stored-ages",
    title: "A press is no use, by the stored ages",
    expect: "A press on Pages' header, with no drag, changes no age: after a reload Pages is still the oldest, so in a narrow window it is the column that folds first, and the stored ages are as they began.",
    group: "gestures",
    scene: win({ width: 700, columns: { left: [["pages"]], right: [["findings"]] } }),
    gestures: [g.press("pages"), g.release(), g.key("Reload")],
    expectLayout: { items: { pages: { rail: "left" }, findings: { formKind: "open", edge: "right-0" } }, rails: { left: ["pages"], right: [] } },
    expectStored: { items: { pages: { used: 1 }, findings: { used: 3 } } },
  },
  {
    id: "P13-kinds",
    title: "Targets by kind: a panel",
    expect: "Lifting a panel offers panel columns, rails, new-column lines and the float target, never a toolbar's gaps: over the tools bar it floats.",
    group: "gestures",
    scene: {
      ...win(),
      edges: [...win().edges, { id: "tools-bar", side: "bottom", ring: 0, span: "full", accepts: ["group"], items: ["tools"], cross: { min: 28, max: 60 } }],
      items: { ...win().items, tools: { id: "tools", kind: "group", used: 0, forms: { row: [form("stacked", 60, 120, 28), form("icons", 40, 40, 28), form("menu", 0, 0, 0)] } } },
    },
    gestures: [g.press("pages", { x: 20, y: 10 }), g.at(560, 780), g.hold()],
    expectLayout: { items: { pages: { floating: true, rect: r(528, 410, 280, 360) }, tools: { edge: "tools-bar", rect: r(12, 770, 120, 30) }, annotations: { rect: r(12, 0, 300, 770) } }, order: { "tools-bar": ["tools"] } },
    expectDom: [{ select: "[data-drag-slot]", count: 1, note: "only the float's slot" }],
  },
  {
    id: "P13-a-group-never-gets-panel-targets",
    title: "Targets by kind: a group",
    expect: "Lifting a group offers none of the panel columns, rails or the float (groups don't float here): held over a column, nothing is offered and no slot shows.",
    group: "gestures",
    scene: {
      ...win(),
      edges: [...win().edges, { id: "tools-bar", side: "bottom", ring: 0, span: "full", accepts: ["group"], items: ["tools"], cross: { min: 28, max: 60 } }],
      items: { ...win().items, tools: { id: "tools", kind: "group", used: 0, forms: { row: [form("stacked", 60, 120, 28), form("icons", 40, 40, 28), form("menu", 0, 0, 0)] } } },
    },
    gestures: [g.press("tools"), g.at(160, 200), g.hold()],
    // No target: the committed layout with Tools' place left empty, and nothing else moved (Pages stays 379 tall).
    expectLayout: { items: { tools: null, pages: { rect: r(12, 0, 300, 379) }, annotations: { rect: r(12, 391, 300, 379) }, findings: { rect: r(808, 0, 300, 770) } }, notes: { hasNot: ["content-changed"] } },
    expectDom: [{ select: "[data-drag-slot]", count: 0, note: "no slot for a group over a panel column" }],
  },
  {
    id: "P14-open-close-and-dock-at-default",
    title: "Close, open, and Dock at the default place",
    expect: "A closed item keeps its place; opening it puts it back where it was and never closes another; Float then Dock puts Pages above Annotations again.",
    group: "gestures",
    scene: win(),
    gestures: [g.click("annotations", "close"), g.click("annotations", "open"), g.click("pages", "float"), g.click("pages", "dock")],
    checkpoints: [
      { at: 0, layout: { items: { annotations: null, pages: { rect: r(12, 0, 300, 800) } } }, note: "closed: out of the column" },
      { at: 1, layout: { items: { annotations: { rect: r(12, 406, 300, 394) }, pages: { rect: r(12, 0, 300, 394) } } }, note: "opened: back below Pages" },
      { at: 2, layout: { items: { pages: { floating: true, rect: r(516, 0, 280, 360) }, annotations: { rect: r(12, 0, 300, 800) } } }, note: "floated" },
    ],
    expectLayout: { items: { pages: { rect: r(12, 0, 300, 394) }, annotations: { rect: r(12, 406, 300, 394) }, findings: { rect: r(808, 0, 300, 800) } }, columns: { left: [["pages", "annotations"]], right: [["findings"]] } },
  },
  {
    id: "P14b-dock-after-a-column-id-is-reused",
    title: "Dock when a new column took a pruned column's id",
    expect:
      "Findings moved into the left column empties its right column, which goes; Pages opened in a new right column gets that column's id again. Dock then gives Findings its own column at the right side's outer end, as at the start, with Pages inside it: never a place beside Pages.",
    group: "gestures",
    scene: win(),
    gestures: [g.moveTo("findings", g.gap("left-0", 2)), g.moveTo("pages", g.column("right", 0)), g.click("findings", "dock")],
    checkpoints: [{ at: 1, layout: { columns: { left: [["annotations", "findings"]], right: [["pages"]] } }, note: "Pages in a new right column" }],
    expectLayout: { columns: { left: [["annotations"]], right: [["findings"], ["pages"]] } },
  },
  {
    id: "P15-stops-for-the-keyboard",
    title: "Move to › stops",
    expect: "The places \"Move to ›\" offers for Annotations are, in this order: the left rail, a new column at the left side's outer end, the gap before Pages, a new column at its inner end, the right rail, a new column at the right side's inner end, the gaps before and after Findings, a new column at its outer end, and a float; each one moves Annotations there, and Dock puts it back.",
    group: "gestures",
    scene: win(),
    gestures: [
      g.moveTo("annotations", g.column("left", 0)),
      g.click("annotations", "dock"),
      g.moveTo("annotations", g.gap("right-0", 0)),
      g.click("annotations", "dock"),
      g.moveTo("annotations", g.float),
      g.click("annotations", "dock"),
    ],
    checkpoints: [
      { at: 0, layout: { items: { annotations: { edge: "left-1", rect: r(12, 0, 220, 800) }, pages: { rect: r(244, 0, 220, 800) } } }, note: "a new column at the left side's outer end" },
      { at: 2, layout: { items: { annotations: { edge: "right-0", rect: r(808, 0, 300, 394) }, findings: { rect: r(808, 406, 300, 394) } } }, note: "before Findings" },
      { at: 4, layout: { items: { annotations: { floating: true, rect: r(516, 0, 280, 360) } } }, note: "the menu's Float: its last size, anchored to the content's top-right" },
    ],
    expectLayout: { items: { pages: { rect: r(12, 0, 300, 394) }, annotations: { rect: r(12, 406, 300, 394) }, findings: { rect: r(808, 0, 300, 800) } }, columns: { left: [["pages", "annotations"]], right: [["findings"]] } },
    expectStops: {
      item: "annotations",
      places: [
        { kind: "rail", side: "left", ring: 0 },
        { kind: "column", side: "left", ring: 0 },
        { kind: "gap", edge: "left-0", zone: "start", at: 0 },
        { kind: "column", side: "left", ring: 1 },
        { kind: "rail", side: "right", ring: 0 },
        { kind: "column", side: "right", ring: 0 },
        { kind: "gap", edge: "right-0", zone: "start", at: 0 },
        { kind: "gap", edge: "right-0", zone: "start", at: 1 },
        { kind: "column", side: "right", ring: 1 },
        { kind: "float" },
      ],
    },
  },
  {
    id: "P15-rail-stop-then-dock",
    title: "Dock after a rail stop restores the item",
    expect: "After \"Move to › rail\" (docked folded), Dock puts Annotations back where the start layout had it, open: Dock restores the item's start fold, not only its place.",
    group: "gestures",
    scene: win(),
    gestures: [g.moveTo("annotations", g.rail("left", 0)), g.click("annotations", "dock"), g.moveTo("annotations", g.rail("right", 0)), g.click("annotations", "dock")],
    checkpoints: [{ at: 1, layout: { items: { pages: { rect: r(12, 0, 300, 394) }, annotations: { formKind: "open", edge: "left-0", rect: r(12, 406, 300, 394) } } }, note: "docked back, open" }],
    expectLayout: { items: { pages: { rect: r(12, 0, 300, 394) }, annotations: { formKind: "open", edge: "left-0", rect: r(12, 406, 300, 394) }, findings: { rect: r(808, 0, 300, 800) } }, columns: { left: [["pages", "annotations"]], right: [["findings"]] } },
    expectStored: { items: { annotations: { from: null } } },
  },
];
