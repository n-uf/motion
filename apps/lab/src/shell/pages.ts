/**
 * The lab's pages, in sidebar order. A page is a route (`#/<id>`), a title, one line on what it shows, and what runs
 * it: its markup (an HTML partial in src/pages) and its module (which sets `window.__motionLab`). Several pages can
 * share one module: `view` picks the scenarios the page runs (a name substring or a test on the name).
 *
 * To add a page: add an entry here. A page module needs nothing from the shell; it may call `onReset` (./api) to
 * give the header's Reset button its own reset. A docking case is no page: it is a Document window case, or a
 * conformance row of `@n-uf/docking/testing`.
 *
 * The groups: Overview, Motion (two pages: settle and tiling, and the drag intent on the Document window), the
 * Document window (the one Reference host) and Checks.
 */

import type { PageDef } from "./page-defs";

const raw = (load: () => Promise<{ default: string }>) => () => load().then((m) => m.default);

const tiling = {
  markup: raw(() => import("../pages/tiling.html?raw")),
  load: () => import("../main"),
  module: "tiling",
};
/** The Document window: the lab's one Reference host. The drag intent's page opens it on the drag intent's cases. */
const docwin = {
  markup: raw(() => import("../pages/docwin.html?raw")),
  load: () => Promise.all([import("../docwin/docwin.css"), import("../docwin/docwin")]),
  module: "docwin",
  reset: "#dw-reset",
  wide: true,
};
/** The Document window's runs the Motion page "Drag intent and previews" shows: the drag intent's cases. */
const INTENT = (n: string): boolean => n.startsWith("intent-");

export const PAGES: readonly PageDef[] = [
  {
    id: "overview",
    group: "overview",
    title: "n-uf motion lab",
    line: "Every demo and check for @n-uf/motion, @n-uf/placement and @n-uf/docking, on the real packages.",
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
      "Window motion rules of <code>@n-uf/motion/layout</code>: <b>settle</b> (one fast-then-gentle curve, never past its target; <code>item.moveTo</code>), a <b>direct drag</b> (<code>holdItem</code>: the window the pointer owns follows it 1:1) and <b>reveal</b> (content is never stretched). Open, close, swap and maximize windows at the tempo you pick. The same windows tile master-and-stack, dwindle, columns or grid: drag one by its title bar to another place, and the drop preview (<code>previewPlan</code>) outlines the slot (Outline), outlines it and opens room (Placeholder) or glides the window into it (Glide); switching layouts moves every window on the settle. The four layouts come from <code>@n-uf/placement/tiling</code>. Every move is sampled per frame and checked below.",
    ...tiling,
  },
  {
    id: "motion/intent",
    group: "motion",
    nav: "Drag intent and previews",
    title: "Drag intent and previews",
    line: "The drop indicator shows only while you aim, never while you travel across targets; the held item follows the pointer, and every drop preview mode (Outline, Placeholder, Snap) lands the same.",
    about:
      "<code>@n-uf/motion/drag</code>'s intent, on the Document window: the indicator shows once the pointer slows down or holds still, waits a 150 ms switch delay before it switches, and a release lands where it showed. Drag a panel by its header or a toolbar by its grip; the cases wobble on a border, flick, cross a border slowly and let go inside a slot's band. With the Snap preview the held item settles into its place once the room is made, and back onto the pointer when it flies off. Pick the drop preview (Outline, Placeholder, Snap) at the top of the page: it changes how the landing is shown, never where it is.",
    ...docwin,
    view: INTENT,
  },
  {
    id: "docwin",
    group: "docwin",
    nav: "Document window",
    title: "Document window",
    line: "A document viewer's window: bars, side columns, scrolling pages and floats, as one DockState (the window as one data model). Each preset sets up a docking case and checks its rules.",
    about:
      "The whole window is one <code>@n-uf/docking</code> DockState: the title bar with its fixed title and controls, the top and bottom bars, the left and right columns, each edge with the kinds it accepts, the floats and the kinds that may float. Every rect drawn comes from <code>solve</code>; a drag runs <code>@n-uf/motion/drag</code>'s intent over <code>targets(state, dragged)</code>, shows the dragged item as the only preview (it sits in a place that takes it, with the room open, and otherwise stays on the pointer, inside the window), and the drop commits what shows: that target's <code>after(...).state</code>. While a drag is on, the root carries <code>data-drag-session</code> and one CSS rule turns hover, resize handles and selection off. Drag a panel by its header, a group by its grip. The Window drawer sets the size, freeze, counts, reload and reset. The Window | Code switch in the header shows the same window as the code a host writes with the public API: the State tab (the stored state as a literal, <code>readDockState</code>, <code>solve</code>, the drag options) and the Last move tab (the <code>dockDrag</code> call, the release's state and its commit, <code>drag.after(release)</code>, of the last drag), both generated from what the window draws; <code>?view=code</code> in the address opens on it. Headless: <code>window.__docwin</code> (<code>code()</code> gives both texts).",
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
 * The routes of pages the Document window replaced (the dock desk, toolbar groups, panels, the edge stack and its
 * fixtures), each opening it: links from the site and older bookmarks keep working. Their models live on only as
 * conformance rows and the Document window's cases.
 */
const ALIASES: Readonly<Record<string, string>> = Object.fromEntries(
  ["placement/desk", "placement/toolbar", "panels", "stack", "stack/forms", "stack/drop", "stack/floats", "stack/keep", "stack/toolbar"].map((id) => [id, "docwin"]),
);

export const pageById = (id: string): PageDef | undefined => PAGES.find((p) => p.id === (ALIASES[id] ?? id));
