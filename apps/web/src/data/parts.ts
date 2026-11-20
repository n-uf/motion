// The three libraries the site presents: @n-uf/motion (how things move), @n-uf/placement (where things fit) and
// @n-uf/docking (where panels and toolbars dock). The nav, the home page's sections and each page's "Built with" line
// read them from here.
import { repoUrl } from "./site";

export type PartId = "motion" | "placement" | "docking";
export interface Part {
  id: PartId;
  /** The section's name in the nav and on the home page. */
  title: string;
  /** Its short form in the top bar. */
  short: string;
  pkg: string;
  idea: string;
  /** The one-line account of the package, as the home page's "What each package does" gives it (the docs index reuses it). */
  does: string;
  readme: string;
  /** Its interactive pages, in reading order. */
  pages: string[];
}

export const PARTS: Part[] = [
  {
    id: "motion",
    title: "How things move",
    short: "Move",
    pkg: "@n-uf/motion",
    idea: "One frame loop, a settle that never overshoots, sizes revealed instead of stretched, direct drags, and a drag intent that shows a drop only once you aim.",
    does: "For desktop-style web apps with windows, panels, docks and toolbars: every change of layout moves the way a good tiling window manager does, and a drag reads what you mean. You give it rects and pointer samples; it moves the real elements.",
    readme: `${repoUrl}/blob/main/packages/motion/README.md`,
    pages: ["/window-motion/", "/drag-intent/"],
  },
  {
    id: "placement",
    title: "Where things fit",
    short: "Place",
    pkg: "@n-uf/placement",
    idea: "Pure functions over rects: a popup placed beside its anchor, a stack that gives way as room runs out, the cut of an edge, the drop places along one edge, and tiled panes.",
    does: "For the same apps: it works out where things fit as the space changes. You give it rects and a rule; it gives back the rects that fit, and moves nothing.",
    readme: `${repoUrl}/blob/main/packages/placement/README.md`,
    // docs only for now (/docs/placement/); a tiling demo may come later
    pages: [],
  },
  {
    id: "docking",
    title: "Where panels and toolbars dock",
    short: "Dock",
    pkg: "@n-uf/docking",
    idea: "Pure state in, rects and drop targets out: a dock state of bars, rails, columns, items and floats, solved into rects, with every place a drag may drop, what refuses it, and the stops for the keyboard.",
    does: "For the same apps: it works out where panels and toolbar groups dock, as the space changes and while something is dragged. You give it a dock state and a size; it gives back rects, notes on what gave way, and drop targets. It draws nothing.",
    readme: `${repoUrl}/blob/main/packages/docking/README.md`,
    pages: ["/docking-layouts/", "/toolbar-groups/"],
  },
];
export const partOf = (id: PartId): Part => PARTS.find((p) => p.id === id)!;

/**
 * Each page's "Built with" line: what the page's code imports (`uses`), and whose rules its demo redraws in the site's
 * own code (`shows`, the package entry the rules live in), each linked to that package's README.
 */
export const BUILT_WITH: Record<string, { part: PartId; kind: "uses" | "shows"; entry?: string; what: string }[]> = {
  "/window-motion/": [{ part: "motion", kind: "uses", what: "createSettle, SETTLE_TEMPO, reveal, createFrameLoop" }],
  "/drag-intent/": [
    { part: "motion", kind: "uses", what: "createSettle, createFrameLoop" },
    { part: "motion", kind: "shows", entry: "/drag", what: "the drag intent and the three drop preview modes" },
  ],
  "/docking-layouts/": [
    { part: "motion", kind: "uses", what: "createSettle (every box glides)" },
    { part: "docking", kind: "uses", what: "solve (the four docked layouts; the page's other five layouts are sketches drawn by the page itself)" },
  ],
  "/toolbar-groups/": [
    { part: "motion", kind: "uses", what: "createSettle" },
    { part: "docking", kind: "shows", what: "toolbar areas, zones, overflow and drop targets" },
    { part: "motion", kind: "shows", entry: "/drag", what: "the drag intent and the three drop preview modes" },
  ],
};
