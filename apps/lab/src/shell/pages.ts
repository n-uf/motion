/**
 * The lab's pages, in sidebar order. A page is a route (`#/<id>`), a title, one line on what it shows, and what runs
 * it: its markup (an HTML partial in src/pages) and its module (which sets `window.__motionLab`). Several pages can
 * share one module: `view` picks the scenarios the page runs (a name substring or a test on the name).
 *
 * To add a page: add an entry here. A page module needs nothing from the shell; it may call `onReset` (./api) to
 * give the header's Reset button its own reset. A kit case registers in src/kits/cases.ts instead and becomes a page
 * by itself (./kit-page).
 *
 * The groups: Overview, Motion (two pages), Edge stack, Checks, and an Archive of pages whose models are on hold or
 * whose cases move into the edge stack. Archived pages still run on the Checks page; they leave once covered.
 */

export type GroupId = "overview" | "motion" | "stack" | "checks" | "archive";
export const GROUPS: readonly { id: GroupId; title: string }[] = [
  { id: "overview", title: "Overview" },
  { id: "motion", title: "Motion" },
  { id: "stack", title: "Edge stack" },
  { id: "checks", title: "Checks" },
  { id: "archive", title: "Archive" },
];

/** Which scenarios a page runs: those whose name contains it, or passes it. */
export type View = string | ((scenario: string) => boolean);

export interface PageDef {
  /** The route: `#/<id>`. */
  readonly id: string;
  readonly group: GroupId;
  /** In the sidebar (default: the title). */
  readonly nav?: string;
  readonly title: string;
  /** One line on what it shows. */
  readonly line: string;
  /** More about it (HTML), folded under the line. */
  readonly about?: string;
  /** The page's markup, injected before its module loads. */
  readonly markup?: () => Promise<string>;
  /** The page module (it sets `window.__motionLab`), and its styles. */
  readonly load?: () => Promise<unknown>;
  /** The module behind it, for the Checks page: pages that share a module run it once. */
  readonly module?: string;
  /** The scenarios it runs (default: all of its module's). */
  readonly view?: View;
  /** Put this element first on the page. */
  readonly first?: string;
  /** The page's own Reset (a button's selector); default: reload the page. */
  readonly reset?: string;
  /** Room for a wide stage. */
  readonly wide?: boolean;
}

import { KIT_CASES } from "../kits/cases";
import type { KitCase } from "../kits/kit-case";

const raw = (load: () => Promise<{ default: string }>) => () => load().then((m) => m.default);

const tiling = {
  markup: raw(() => import("../pages/tiling.html?raw")),
  load: () => import("../main"),
  module: "tiling",
};
const desk = {
  markup: raw(() => import("../pages/desk.html?raw")),
  load: () => import("../desk"),
  module: "desk",
  reset: "[data-act=reset]",
  wide: true,
};
const kitsPanels = {
  markup: raw(() => import("../pages/kits-panels.html?raw")),
  load: () => Promise.all([import("../kits/kits-panels.css"), import("../kits/kits-panels").then(() => import("../kits/kits-panels-scenarios"))]),
  module: "kits-panels",
  reset: "#kp-reset",
  wide: true,
};

const panels = {
  markup: raw(() => import("../pages/panels.html?raw")),
  load: () => Promise.all([import("../panels/panels.css"), import("../panels/panels").then(() => import("../panels/panels-scenarios"))]),
  module: "panels",
  reset: "#pn-reset",
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

const TOOLBAR = "toolbar groups";
/** The desk module's scenarios the Motion page "Drag intent and previews" shows: the drag model and the held drag's snap. */
const INTENT = (n: string): boolean => n.includes("drag model") || n.includes("snap");

/**
 * The kit cases, in order: patterns an app meets when it brings its own drag onto the pair. Case 1 is its own page
 * module (kits-panels); the others are the `KitCase`s registered in src/kits/cases.ts, each mounted as a page
 * (./kit-page). A number with no registered case has no page. They are archived: each becomes an Edge stack case.
 * Case 8 (Frozen layout) is gone: the Edge stack's C14 proves the same rule.
 */
const KIT_LIST: readonly { n: number; title: string; line: string }[] = [
  { n: 1, title: "Panels vs groups", line: "Do toolbar groups and dock panels feel the same? Panels on ./dock next to a plain ghost drag." },
  { n: 2, title: "Host map", line: "Which of an app's places map to which toolbar hosts." },
  { n: 3, title: "Floats and orientation", line: "Whether a floating group keeps a vertical form." },
  { n: 4, title: "Fold or collapse", line: "An animated fold, trailing-first collapse, and which group folds last." },
  { n: 5, title: "Drop preview", line: "Snap to slot, open gap or drop indicator: three ways to show where a group lands." },
  { n: 6, title: "Constraints", line: "A forbidden place is no target: no slot, no label; a release there glides home." },
  { n: 7, title: "Keyboard moves", line: "The arrows step through a group's places in order; Move to › lists the same places." },
  { n: 9, title: "Vocabulary", line: "One word set for the places, through the targets' labels." },
  { n: 10, title: "Scaled page", line: "On a scaled page the app converts the pointer into page space, so the slot lands under it." },
];

const numberOf = (kc: KitCase): number => Number.parseInt(kc.title, 10);
function kitPage(k: (typeof KIT_LIST)[number]): PageDef[] {
  const kc = KIT_CASES.find((c) => numberOf(c) === k.n);
  if (!kc) return [];
  return [{ id: `kits/${kc.id}`, group: "archive", nav: `Kit ${k.n} · ${k.title}`, title: kc.title, line: k.line, load: () => import("./kit-page").then((m) => m.mountKitCase(kc, document.getElementById("lab-page")!)), module: `kit:${kc.id}`, wide: true }];
}

export const PAGES: readonly PageDef[] = [
  {
    id: "overview",
    group: "overview",
    title: "Motion and placement lab",
    line: "Every demo and check for @n-uf/motion and @n-uf/placement, on the real packages.",
    markup: raw(() => import("../pages/overview.html?raw")),
  },
  {
    id: "motion/settle",
    group: "motion",
    nav: "Settle and tiling",
    title: "Settle and tiling",
    line: "Windows glide to their places on one critically damped settle, never past the target; tiled windows reorder by drag with a drop preview.",
    about:
      "Window motion rules of <code>@n-uf/motion</code>: <b>settle</b> (one fast-then-gentle curve, never past its target), <b>hold</b> (what the pointer owns is glued to it) and <b>reveal</b> (content is never stretched). Open, close, swap and maximize windows at the tempo you pick. The same windows tile master-and-stack, dwindle, columns or grid: drag one by its title bar to another place, and the preview shows the slot (indicator) or glides the window into it (snap); switching layouts moves every window on the settle. The four layouts are this lab's own code: <code>@n-uf/placement</code> has no tiling entry yet. Every move is sampled per frame and checked below.",
    ...tiling,
  },
  {
    id: "motion/intent",
    group: "motion",
    nav: "Drag intent and previews",
    title: "Drag intent and previews",
    line: "The drop indicator shows only while you aim, never while you fly over targets; the real item follows the pointer, and the three previews land the same.",
    about:
      "<code>@n-uf/motion/drag</code>'s intent: the indicator shows once the pointer slows down or holds still, holds 150 ms before it switches, and a release lands where it showed. Drag a panel by its title bar; the drag-model scenarios fly, wobble and flick across the targets. <code>@n-uf/motion/layout</code>'s held drag: no copy, the item itself under the pointer, gliding into a slot (snap) and back out, and landing from where it was let go. Pick the preview (indicator, open gap, snap to slot) in the Preview switch.",
    ...desk,
    view: INTENT,
  },
  {
    id: "stack",
    group: "stack",
    nav: "Edge stack",
    title: "Edge stack",
    line: "One stage: a side column, a top bar, pages that scroll under them and floats above. Pick a case to set it up, see what to expect and check it.",
    about:
      "<code>@n-uf/placement/stack</code> on one stage, driven by <code>@n-uf/motion/drag</code>'s intent. Panels (Pages, Annotations, Findings) go open → header → rail icon → the » menu; groups (Views, Tools, Zoom) a row of words → stacked words → icons → the » menu in the column, and in the top bar, a toolbar edge 40 px tall at most, a row → a fold in line → the » menu, with Tools the ranked primary. The item used longest ago gives way first, kept ones last; spare length goes to the open panels. Drag any item by its grip into any gap, or onto the pages to float it; floats stay put while the pages scroll and are kept clear of the docked items and inside the stage. The layout is stored (Reload restores it), Freeze hides the grips (hold Alt to move), and counts and phases never move another item. Each case on the left is a preset of the settings and the starting state, with its check; the stage stays live to play with.",
    markup: raw(() => import("../pages/stack.html?raw")),
    load: () => Promise.all([import("../stack/stack.css"), import("../stack/edge.css"), import("../stack/edge")]),
    module: "stack-edge",
    reset: "#es-reset",
    wide: true,
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
  // --- Archive: on hold, or moving into the Edge stack page; each still runs on the Checks page. -------------------
  {
    id: "placement/desk",
    group: "archive",
    nav: "Desk constructions",
    title: "Desk constructions",
    line: "Nine ways to build a desk from docks, rails, palettes and documents, and how each gives way.",
    about:
      "Nine ways to build a desk from a toolbar, five tool panels (Files, Outline, Notes, Inspector, History) and open documents, from <code>@n-uf/placement/dock</code>. Pick one with the Construction switch; change the stage's size to see how it gives way when width or height runs out. Drag a panel by its title bar (or its tab), and in the tiling tree and the strip a document too: each construction offers its own drop targets (<code>@n-uf/placement/targets</code>). From the keyboard: focus a title bar, Space picks it up, the arrow keys step through the targets, Enter drops, Escape cancels. Archived: the dock models are on hold.",
    ...desk,
    view: (n) => !n.startsWith(TOOLBAR),
  },
  {
    id: "placement/toolbar",
    group: "archive",
    nav: "Toolbar groups",
    title: "Toolbar groups",
    line: "Groups in five hosts and three zones, dragged by their handles, collapsing behind » when room runs out.",
    about:
      "<code>@n-uf/placement/toolbar</code> lays the groups out; its targets and <code>@n-uf/motion</code>'s intent and held drag move them. The windows' cases switch the arrangement; drag a group by its handle (the dots), or Tab to it and use the arrows. Archived: its unique parts become Edge stack cases.",
    ...desk,
    view: TOOLBAR,
    first: "#toolbar-cases",
  },
  {
    id: "panels",
    group: "archive",
    nav: "Panels",
    title: "Panels",
    line: "Columns per side on @n-uf/placement/panels: defaults, every option, and the desk presets, on one desk.",
    about:
      "<code>@n-uf/placement/panels</code>, on hold. <b>Defaults</b>: give-way oldest by use, floats clamped to the view; three columns on the left, two on the right, a float that moves with the page and one pinned to the view. <b>Options</b>: give-way oldest or newest first, by use or by opening, floats clamped or free, folded columns to the rail or riding, top and bottom bands (off, reserved, overlay; between the columns or full width), and room kept clear for a toolbar. <b>Presets</b>: <code>@n-uf/placement/desk</code>'s presets, each panels options and a start state. Drag a panel by its title to tear it off, dock it back, stack it or put it on a rail; from the keyboard: Tab to a title, Space, the arrows, Enter; Escape cancels. Archived: the Edge stack's floats have no pin, so this page's pinned float is the old model.",
    ...panels,
  },
  {
    id: "kits/panels",
    group: "archive",
    nav: "Kit 1 · Panels vs groups",
    title: "1 · Panels vs groups",
    line: KIT_LIST[0]!.line,
    about:
      "A document viewer window on the real packages: the toolbar groups on <code>@n-uf/placement</code>'s toolbar targets, the panels on its edge docks with tear-off, and every item on <code>@n-uf/motion</code>'s drag intent and held drag. Drag a group by its handle, a panel by its title bar or its rail icon. The switch puts the panels on a naive drag (a ghost copy, an insert line, an instant drop), so both can be felt in one window. Sample content only.",
    ...kitsPanels,
  },
  ...KIT_LIST.slice(1).flatMap(kitPage),
];

/**
 * The Edge stack's check fixtures: the five earlier stages its scenarios were written on (forms, drop, floats, store
 * and freeze, toolbar). They are in no menu; the Checks page runs every one of their scenarios under Edge stack, so no
 * assertion was lost when their pages became the one Edge stack page. Each Edge stack case names the fixture scenarios
 * that prove it in more depth.
 */
export const FIXTURES: readonly PageDef[] = [
  { id: "stack/forms", group: "stack", title: "Edge stack fixture · forms", line: "Two independent stacks of the same six items, for C2, C6, C8, C9, C10 and C23.", ...stackForms },
  { id: "stack/drop", group: "stack", title: "Edge stack fixture · drop", line: "A column and a bar, for drops into every gap: C1, C3 and C4.", ...stackDrop },
  { id: "stack/floats", group: "stack", title: "Edge stack fixture · floats", line: "Floats over scrolling pages: C5, C7, C16 and C17.", ...stackFloats },
  { id: "stack/keep", group: "stack", title: "Edge stack fixture · store, freeze, no jump", line: "The stored form, the freeze and the counts: C13, C14 and C15.", ...stackKeep },
  { id: "stack/toolbar", group: "stack", title: "Edge stack fixture · toolbar", line: "A toolbar of four groups and a panel: T1 to T6, N1 and N2.", ...stackToolbar },
];

export const pageById = (id: string): PageDef | undefined => PAGES.find((p) => p.id === id) ?? FIXTURES.find((p) => p.id === id);
