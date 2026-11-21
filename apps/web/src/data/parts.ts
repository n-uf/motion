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
    does: "The layout math for any interface, in small functions you call where you need them, one job each, with no model of an app. You give a function rects and a rule; it gives back rects. It moves nothing and draws nothing.",
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
    does: "A ready model of an app window. You declare the places (bars, side columns, rails, floats) and what each takes; it keeps who sits where, folds panels and toolbar groups in a set order as room runs out, answers every drag window-wide, refusals included, and stores the layout. It moves nothing and draws nothing: you draw it.",
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
    { part: "motion", kind: "uses", entry: "/drag", what: "createDragIntent, liftDecision and previewPlan (the page draws three of the library's four preview modes: outline, placeholder and glide; snap draws no indicator)" },
  ],
  "/docking-layouts/": [
    { part: "motion", kind: "uses", what: "createLayoutMotion (every box glides)" },
    { part: "docking", kind: "uses", what: "solve (the four docked layouts; the page's other five layouts are sketches drawn by the page itself)" },
    { part: "placement", kind: "uses", what: "masterStack, layoutSplit and splitFromOrder from /tiling (the tiles inside the documents' area)" },
  ],
  "/toolbar-groups/": [
    { part: "motion", kind: "uses", what: "createSettle" },
    { part: "docking", kind: "shows", what: "toolbar areas, zones, overflow and drop targets" },
    { part: "motion", kind: "shows", entry: "/drag", what: "the drag intent and its drop previews (outline, placeholder and glide; the library has a fourth, snap)" },
  ],
};
