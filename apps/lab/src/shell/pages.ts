/**
 * The lab's pages, in sidebar order. A page is a route (`#/<id>`), a title, one line on what it shows, and what runs
 * it: its markup (an HTML partial in src/pages) and its module (which sets `window.__motionLab`). Several pages can
 * share one module: `view` picks the scenarios the page runs (a name substring or a test on the name).
 *
 * To add a page: add an entry here. A page module needs nothing from the shell; it may call `onReset` (./api) to
 * give the header's Reset button its own reset. A kit case registers in src/kits/cases.ts instead and becomes a page
 * by itself (./kit-page).
 */

export type GroupId = "overview" | "motion" | "placement" | "panels" | "stack" | "kits" | "checks";
export const GROUPS: readonly { id: GroupId; title: string }[] = [
  { id: "overview", title: "Overview" },
  { id: "motion", title: "Motion" },
  { id: "placement", title: "Placement" },
  { id: "panels", title: "Panels" },
  { id: "stack", title: "Edge stacks" },
  { id: "kits", title: "Kit cases" },
  { id: "checks", title: "Checks" },
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
/** The Edge stacks pages: each has its own markup, module and scenarios. */
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

/** The Panels Options page runs the scenarios that switch an option, Presets those on a preset; Defaults runs the rest. */
const OPTIONS = "options: ";
const PRESETS = "presets: ";

/** The tiling page's settle scenarios (moves the layout makes), the rest are its drags and layouts. */
const SETTLE = new Set(["open", "close", "swap", "two changes 40 ms apart", "maximize, restore after 80 ms"]);
const TOOLBAR = "toolbar groups";

/**
 * The ten kit cases, in order: patterns an app meets when it brings its own drag onto the pair. Case 1 is its own
 * page module (kits-panels); the others are the `KitCase`s registered in src/kits/cases.ts, each mounted as a page
 * (./kit-page). A number with no registered case has no page.
 */
const KIT_LIST: readonly { n: number; title: string; line: string }[] = [
  { n: 1, title: "Panels vs groups", line: "Do toolbar groups and dock panels feel the same? Panels on ./dock next to a plain ghost drag." },
  { n: 2, title: "Host map", line: "Which of an app's places map to which toolbar hosts." },
  { n: 3, title: "Floats and orientation", line: "Whether a floating group keeps a vertical form." },
  { n: 4, title: "Fold or collapse", line: "An animated fold, trailing-first collapse, and which group folds last." },
  { n: 5, title: "Drop preview", line: "Snap to slot, open gap or drop indicator: three ways to show where a group lands." },
  { n: 6, title: "Constraints", line: "A forbidden place is no target: no slot, no label; a release there glides home." },
  { n: 7, title: "Keyboard moves", line: "The arrows step through a group's places in order; Move to › lists the same places." },
  { n: 8, title: "Frozen layout", line: "Freeze hides the grips; holding Alt brings them back; a drag in flight finishes." },
  { n: 9, title: "Vocabulary", line: "One word set for the places, through the targets' labels." },
  { n: 10, title: "Scaled page", line: "On a scaled page the app converts the pointer into page space, so the slot lands under it." },
];

const numberOf = (kc: KitCase): number => Number.parseInt(kc.title, 10);
function kitPage(k: (typeof KIT_LIST)[number]): PageDef[] {
  const kc = KIT_CASES.find((c) => numberOf(c) === k.n);
  if (!kc) return [];
  return [{ id: `kits/${kc.id}`, group: "kits", nav: `${k.n} · ${k.title}`, title: kc.title, line: k.line, load: () => import("./kit-page").then((m) => m.mountKitCase(kc, document.getElementById("lab-page")!)), module: `kit:${kc.id}`, wide: true }];
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
    nav: "Settle and tempo",
    title: "Settle and tempo",
    line: "Windows glide to their places on one critically damped settle: never past the target, at the tempo you pick.",
    about:
      "Window motion rules of <code>@n-uf/motion</code>: <b>settle</b> (one fast-then-gentle curve, never past its target), <b>hold</b> (what the pointer owns is glued to it) and <b>reveal</b> (content is never stretched). Open, close, swap and maximize windows; every move is sampled per frame and checked below.",
    ...tiling,
    view: (n) => SETTLE.has(n),
  },
  {
    id: "motion/intent",
    group: "motion",
    nav: "Drag intent",
    title: "Drag intent",
    line: "When the drop indicator shows: only while you aim, never while you fly over targets.",
    about:
      "<code>@n-uf/motion/drag</code>'s intent on the desk constructions: the indicator shows once the pointer slows down or holds still, holds 150 ms before it switches, and a release lands where it showed. Drag a panel by its title bar; the drag-model scenarios below fly, wobble and flick across the targets.",
    ...desk,
    view: "drag model",
  },
  {
    id: "motion/held",
    group: "motion",
    nav: "Held drag and previews",
    title: "Held drag and previews",
    line: "The real item follows the pointer; the three previews (indicator, open gap, snap to slot) land the same.",
    about:
      "<code>@n-uf/motion/layout</code>'s held drag: no copy, the item itself under the pointer, gliding into a slot (snap) and back out, and landing from where it was let go. Pick the preview in the Preview switch.",
    ...desk,
    view: "snap",
  },
  {
    id: "motion/tiling",
    group: "motion",
    nav: "Tiling drag",
    title: "Tiling drag",
    line: "Windows tiled master-and-stack, dwindle, columns or grid; drag one to reorder, with a drop preview.",
    about: "<code>@n-uf/motion</code> moving windows between tiled slots. The four layouts are this lab's own code: <code>@n-uf/placement</code> has no tiling entry yet. Drag a window by its title bar to another place; the preview shows the slot (indicator) or glides the window into it (snap). Switching layouts moves every window on the settle.",
    ...tiling,
    view: (n) => !SETTLE.has(n),
  },
  {
    id: "placement/desk",
    group: "placement",
    nav: "Desk constructions",
    title: "Desk constructions",
    line: "Nine ways to build a desk from docks, rails, palettes and documents, and how each gives way.",
    about:
      "Nine ways to build a desk from a toolbar, five tool panels (Files, Outline, Notes, Inspector, History) and open documents, from <code>@n-uf/placement/dock</code>. Pick one with the Construction switch; change the stage's size to see how it gives way when width or height runs out. Drag a panel by its title bar (or its tab), and in the tiling tree and the strip a document too: each construction offers its own drop targets (<code>@n-uf/placement/targets</code>). From the keyboard: focus a title bar, Space picks it up, the arrow keys step through the targets, Enter drops, Escape cancels.",
    ...desk,
    view: (n) => !n.startsWith(TOOLBAR),
  },
  {
    id: "placement/toolbar",
    group: "placement",
    nav: "Toolbar groups",
    title: "Toolbar groups",
    line: "Groups in five hosts and three zones, dragged by their handles, collapsing behind » when room runs out.",
    about:
      "<code>@n-uf/placement/toolbar</code> lays the groups out; its targets and <code>@n-uf/motion</code>'s intent and held drag move them. The windows' cases switch the arrangement; drag a group by its handle (the dots), or Tab to it and use the arrows.",
    ...desk,
    view: TOOLBAR,
    first: "#toolbar-cases",
  },
  {
    id: "panels/defaults",
    group: "panels",
    nav: "Defaults",
    title: "Panels: defaults",
    line: "Columns per side, folding to bars and rails, floats in the view, on @n-uf/placement/panels with its defaults.",
    about:
      "<code>@n-uf/placement/panels</code> with its defaults: give-way oldest by use, floats clamped to the view. Three columns on the left, two on the right, a float that moves with the page (Comments) and one pinned to the view (Navigator). Narrow the stage with the Width slider; drag a column's inner edge or a float's corner to resize; fold a panel with ▾, keep it open with ◇; drag a panel by its title to tear it off, dock it back, stack it or put it on a rail. Every drag runs on <code>@n-uf/motion/drag</code>'s intent and <code>@n-uf/motion/layout</code>'s held drag. From the keyboard: Tab to a title, Space, the arrows, Enter; Escape cancels.",
    ...panels,
    view: (n) => !n.startsWith(OPTIONS) && !n.startsWith(PRESETS),
  },
  {
    id: "panels/options",
    group: "panels",
    nav: "Options",
    title: "Panels: options",
    line: "Every give-way order and float rule, top and bottom bands in each mode and span, and room kept clear for a toolbar, on the same desk.",
    about:
      "The same desk with the switches: give-way <b>oldest</b> or <b>newest</b> first, <b>by use</b> (opened or focused) or <b>by opening</b>, floats <b>clamped</b> to the view or <b>free</b>, and folded columns to the <b>rail</b> or <b>riding</b> on the side's first open column. A <b>top</b> and a <b>bottom band</b>: off, <b>reserved</b> (it shortens the pages) or <b>overlay</b> (over the pages), <b>between</b> the columns or <b>full width</b>; short of height a band shrinks, then folds to a bar, as the pages' min height says. The <b>Toolbar room</b> sliders keep px clear along the pages' edges. The defaults are marked. The give-way scenarios set known ages and narrow the stage until one column must fold.",
    ...panels,
    view: OPTIONS,
  },
  {
    id: "panels/presets",
    group: "panels",
    nav: "Presets",
    title: "Panels: presets",
    line: "Desk presets as data on @n-uf/placement/desk: edge docks with a bottom band (between the columns or full width), docks with tear-off, and a tabbed navigator.",
    about:
      "<code>@n-uf/placement/desk</code>'s presets, each panels options and a start state on <code>./panels</code>. The same seven panels, here with natural section heights: lower the Height slider and the docks fold sections to bars, the one used longest ago first, and the bottom band (History) folds to a bar once the pages would go under their min height; raise it and they come back. The Toolbar room sliders keep room clear for a toolbar. The navigator's left column shows tabs: click a tab, or drag a panel into the column to add one. With tear-off, drag a panel over the pages and back. Below the desk, what differs from the matching <code>./dock</code> constructions.",
    ...panels,
    view: PRESETS,
  },
  {
    id: "stack/forms",
    group: "stack",
    nav: "Forms",
    title: "Stack · forms",
    line: "A column and a bar of panels and groups: each item takes the largest form that fits, the oldest gives way first, and a stack with nothing open is a rail.",
    about:
      "<code>@n-uf/placement/stack</code>'s <code>fitStack</code>: panels (Pages, Annotations, Findings) go open → header → rail icon → the » menu, groups (Views, Tools, Zoom) a row of words → stacked words → icons → the » menu, the item used longest ago first (kept ones last). Spare length goes to the open panels. A group never sets a column's width, so a group alone makes a rail of about 30 px. Length and width sliders and a toggle per item drive the same solver for the column and the bar; the status lists its coded notes. Cases C2, C6, C8, C9 and C10.",
    ...stackForms,
  },
  {
    id: "stack/drop",
    group: "stack",
    nav: "Drop",
    title: "Stack · drop",
    line: "Drag any panel or group into any gap of the column or the bar: the dashed preview is the exact rect it gets after the drop.",
    about:
      "<code>@n-uf/placement/stack</code>'s <code>stackTargets</code> on <code>@n-uf/motion/drag</code>'s intent: a target for every gap (before each item and after the last), each carrying the solve with the item inserted. The dashed rectangle is that solve's rect for the dragged item and a line marks where its leading edge lands; hold over a gap and the others move to the places the solve gives them. A release lands on the same rect. Cases C1, C3 and C4.",
    ...stackDrop,
  },
  {
    id: "kits/panels",
    group: "kits",
    nav: "1 · Panels vs groups",
    title: "1 · Panels vs groups",
    line: KIT_LIST[0]!.line,
    about:
      "A document viewer window on the real packages: the toolbar groups on <code>@n-uf/placement</code>'s toolbar targets, the panels on its edge docks with tear-off, and every item on <code>@n-uf/motion</code>'s drag intent and held drag. Drag a group by its handle, a panel by its title bar or its rail icon. The switch puts the panels on a naive drag (a ghost copy, an insert line, an instant drop), so both can be felt in one window. Sample content only.",
    ...kitsPanels,
  },
  ...KIT_LIST.slice(1).flatMap(kitPage),
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

export const pageById = (id: string): PageDef | undefined => PAGES.find((p) => p.id === id);
