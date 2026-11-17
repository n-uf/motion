/**
 * The lab's pages, in sidebar order. A page is a route (`#/<id>`), a title, one line on what it shows, and what runs
 * it: its markup (an HTML partial in src/pages) and its module (which sets `window.__motionLab`). Several pages can
 * share one module: `view` picks the scenarios the page runs (a name substring or a test on the name).
 *
 * To add a page: add an entry here. A page module needs nothing from the shell; it may call `onReset` (./api) to
 * give the header's Reset button its own reset. A docking case is no page: it is a Document window case, or a
 * conformance row of `@n-uf/placement/scene/cases`.
 *
 * The groups: Overview, Motion (two pages), Edge stack, Checks, and an Archive of pages whose models are on hold or
 * whose cases move into the edge stack. Archived pages still run on the Checks page; they leave once covered.
 */

import type { PageDef } from "./page-defs";

const raw = (load: () => Promise<{ default: string }>) => () => load().then((m) => m.default);

const tiling = {
  markup: raw(() => import("../pages/tiling.html?raw")),
  load: () => import("../main"),
  module: "tiling",
};
/** The Document window: the lab's one Scene host. The drag intent's page opens it on the drag intent's cases. */
const docwin = {
  markup: raw(() => import("../pages/docwin.html?raw")),
  load: () => Promise.all([import("../docwin/docwin.css"), import("../docwin/docwin")]),
  module: "docwin",
  reset: "#dw-reset",
  wide: true,
};
/** The Edge stack's check fixtures (FIXTURES below): each has its own markup, module and scenarios. */
const stackForms = {
  markup: raw(() => import("../pages/stack-forms.html?raw")),
  load: () => Promise.all([import("../stack/stack.css"), import("../stack/forms").then(() => import("../stack/forms-scenarios"))]),
  module: "stack-forms",
  reset: "#sf-reset",
  wide: true,
};
const stackDrop = {
  markup: raw(() => import("../pages/stack-drop.html?raw")),
  load: () => Promise.all([import("../stack/stack.css"), import("../stack/drop").then(() => import("../stack/drop-scenarios"))]),
  module: "stack-drop",
  reset: "#sd-reset",
  wide: true,
};
const stackFloats = {
  markup: raw(() => import("../pages/stack-floats.html?raw")),
  load: () => Promise.all([import("../stack/stack.css"), import("../stack/floats").then(() => import("../stack/floats-scenarios"))]),
  module: "stack-floats",
  reset: "#fl-reset",
  wide: true,
};
const stackKeep = {
  markup: raw(() => import("../pages/stack-keep.html?raw")),
  load: () => Promise.all([import("../stack/stack.css"), import("../stack/keep").then(() => import("../stack/keep-scenarios"))]),
  module: "stack-keep",
  reset: "#sk-reset",
  wide: true,
};
const stackToolbar = {
  markup: raw(() => import("../pages/stack-toolbar.html?raw")),
  load: () => Promise.all([import("../stack/toolbar.css"), import("../stack/toolbar").then(() => import("../stack/toolbar-scenarios"))]),
  module: "stack-toolbar",
  reset: "#tb-reset",
  wide: true,
};

/** The Document window's runs the Motion page "Drag intent and previews" shows: the drag intent's cases. */
const INTENT = (n: string): boolean => n.startsWith("intent-");

export const PAGES: readonly PageDef[] = [
  {
    id: "overview",
    group: "overview",
    title: "Motion and placement lab",
    line: "Every demo and check for @n-uf/motion and @n-uf/placement, on the real packages.",
    markup: raw(() => import("../pages/overview.html?raw")),
  },
  {
    id: "glossary",
    group: "overview",
    nav: "Glossary",
    title: "Glossary",
    line: "The words the site, the READMEs and the lab use: each term, what it means, and the API name it maps to.",
    markup: raw(() => import("../pages/glossary.html?raw")),
  },
  {
    id: "motion/settle",
    group: "motion",
    nav: "Settle and tiling",
    title: "Settle and tiling",
    line: "Windows glide to their places on one critically damped settle, never past the target; tiled windows reorder by drag with a drop preview.",
    about:
      "Window motion rules of <code>@n-uf/motion</code>: <b>settle</b> (one fast-then-gentle curve, never past its target), <b>direct drag</b> (what the pointer owns is glued to it) and <b>reveal</b> (content is never stretched). Open, close, swap and maximize windows at the tempo you pick. The same windows tile master-and-stack, dwindle, columns or grid: drag one by its title bar to another place, and the preview shows the slot (indicator) or glides the window into it (snap); switching layouts moves every window on the settle. The four layouts are this lab's own code: <code>@n-uf/placement</code> has no tiling entry yet. Every move is sampled per frame and checked below.",
    ...tiling,
  },
  {
    id: "motion/intent",
    group: "motion",
    nav: "Drag intent and previews",
    title: "Drag intent and previews",
    line: "The drop indicator shows only while you aim, never while you travel across targets; the held item follows the pointer, and the three drop preview modes land the same.",
    about:
      "<code>@n-uf/motion/drag</code>'s intent, on the Document window: the indicator shows once the pointer slows down or holds still, waits a 150 ms switch delay before it switches, and a release lands where it showed. Drag a panel by its header or a toolbar by its grip; the cases wobble on a border, flick, cross a border slowly and let go inside a slot's band. With the snap preview the held item settles into its slot once the room is made, and back onto the pointer when it flies off. Pick the drop preview (indicator only, make room, snap to slot) in the Window drawer.",
    ...docwin,
    view: INTENT,
  },
  {
    id: "stack",
    group: "stack",
    nav: "Edge stack",
    title: "Edge stack",
    line: "One stage: a side column, a top bar, content that scrolls under them and floats above. Pick a case to set it up, see what to expect and check it.",
    about:
      "<code>@n-uf/placement/stack</code> on one stage, driven by <code>@n-uf/motion/drag</code>'s intent. Panels (Pages, Annotations, Findings) go open → header → rail icon → the » menu; groups (Views, Tools, Zoom) a row of words → stacked words → icons → the » menu in the column, and in the top bar, a toolbar edge 40 px tall at most, a row → collapsed in line → the » menu, with Tools the ranked primary. The least recently used item gives way first, kept-open ones last; spare length goes to the open panels. Drag any item by its grip to any insertion point, or onto the content to float it; floats stay put while the pages scroll and are kept clear of the docked items and inside the stage. The layout is stored (Reload restores it), Freeze hides the grips (hold Alt to move), and counts and phases never move another item. Each case on the left is a preset of the settings and the starting state, with its check; the stage stays live to play with.",
    markup: raw(() => import("../pages/stack.html?raw")),
    load: () => Promise.all([import("../stack/stack.css"), import("../stack/edge.css"), import("../stack/edge")]),
    module: "stack-edge",
    reset: "#es-reset",
    wide: true,
  },
  {
    id: "docwin",
    group: "docwin",
    nav: "Document window",
    title: "Document window",
    line: "A document viewer's window: bars, side columns, scrolling pages and floats, as one Scene (the window as one data model). Each preset sets up a docking case and checks its rules.",
    about:
      "The whole window is one <code>@n-uf/placement/scene</code> Scene: the title bar with its fixed title and controls, the top and bottom bars, the left and right columns, each edge with the kinds it accepts, the floats and the kinds that may float. Every rect drawn comes from <code>solve</code>; a drag runs <code>@n-uf/motion/drag</code>'s intent over <code>targets(scene, dragged)</code>, draws the dashed slot and marker from the shown target only, and the drop commits that target's <code>after(...).scene</code>. While a drag is on, the root carries <code>data-drag-session</code> and one CSS rule turns hover, resize handles and selection off. Drag a panel by its header, a group by its grip. The Window drawer sets the size, freeze, counts, reload and reset. Headless: <code>window.__docwin</code>.",
    ...docwin,
  },
  {
    id: "checks",
    group: "checks",
    title: "Checks",
    line: "Run every scenario, or one group's, and see green or red per scenario without a terminal.",
    markup: raw(() => import("../pages/checks.html?raw")),
    load: () => import("./checks"),
    wide: true,
  },
];

/**
 * The Edge stack's check fixtures: the five earlier stages its scenarios were written on (forms, drop, floats, store
 * and freeze, toolbar). They are in no menu; the Checks page runs every one of their scenarios under Edge stack, so no
 * assertion was lost when their pages became the one Edge stack page. Each Edge stack case names the fixture scenarios
 * that prove it in more depth.
 */
export const FIXTURES: readonly PageDef[] = [
  { id: "stack/forms", group: "stack", title: "Edge stack fixture · forms", line: "Two independent stacks of the same six items, to check forms, give-way order and the » menu.", ...stackForms },
  { id: "stack/drop", group: "stack", title: "Edge stack fixture · drop", line: "A column and a bar, for drops at every insertion point.", ...stackDrop },
  { id: "stack/floats", group: "stack", title: "Edge stack fixture · floats", line: "Floats over scrolling content.", ...stackFloats },
  { id: "stack/keep", group: "stack", title: "Edge stack fixture · store, freeze, no jump", line: "The stored form, the freeze and the counts.", ...stackKeep },
  { id: "stack/toolbar", group: "stack", title: "Edge stack fixture · toolbar", line: "A toolbar of four groups and a panel.", ...stackToolbar },
];

/**
 * The routes of pages the Document window replaced, each opening it: links from the site and older bookmarks keep
 * working. Their models live on only as conformance rows and the Document window's cases.
 */
const ALIASES: Readonly<Record<string, string>> = {
  "placement/desk": "docwin",
  "placement/toolbar": "docwin",
  panels: "docwin",
};

export const pageById = (id: string): PageDef | undefined => PAGES.find((p) => p.id === (ALIASES[id] ?? id)) ?? FIXTURES.find((p) => p.id === id);
