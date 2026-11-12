// The pair the site presents: @n-uf/motion (how things move) and @n-uf/placement (where things go). The nav, the
// home page's two sections and each page's "Built with" line read them from here.
import { repoUrl } from "./site";

export type PartId = "motion" | "placement";
export interface Part {
  id: PartId;
  /** The section's name in the nav and on the home page. */
  title: string;
  /** Its short form in the top bar. */
  short: string;
  pkg: string;
  idea: string;
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
    idea: "One frame loop, a settle that never overshoots, sizes revealed instead of stretched, held drags, and a drag intent that shows a drop only once you aim.",
    readme: `${repoUrl}/blob/main/packages/motion/README.md`,
    pages: ["/window-motion/", "/drag-intent/"],
  },
  {
    id: "placement",
    title: "Where things go",
    short: "Place",
    pkg: "@n-uf/placement",
    idea: "Pure state in, rects and drop targets out: desks of docks, rails and palettes, toolbar groups in hosts and zones, and the targets for each.",
    readme: `${repoUrl}/blob/main/packages/placement/README.md`,
    pages: ["/desk-layouts/", "/toolbar-groups/"],
  },
];
export const partOf = (id: PartId): Part => PARTS.find((p) => p.id === id)!;

/**
 * Each page's "Built with" line: what the page's code imports (`uses`) and whose rules its demo shows (`shows`, the
 * package entry the rules live in), each linked to that package's README.
 */
export const BUILT_WITH: Record<string, { part: PartId; kind: "uses" | "shows"; entry?: string; what: string }[]> = {
  "/window-motion/": [{ part: "motion", kind: "uses", what: "createSettle, SETTLE_TEMPO, reveal, createFrameLoop" }],
  "/drag-intent/": [
    { part: "motion", kind: "uses", what: "createSettle, createFrameLoop" },
    { part: "motion", kind: "shows", entry: "/drag", what: "the drag intent and the three previews" },
  ],
  "/desk-layouts/": [
    { part: "motion", kind: "uses", what: "createSettle (every box glides)" },
    { part: "placement", kind: "shows", entry: "/dock", what: "the nine constructions and how they give way" },
  ],
  "/toolbar-groups/": [
    { part: "motion", kind: "uses", what: "createSettle, reveal" },
    { part: "placement", kind: "shows", entry: "/toolbar + /targets", what: "hosts, zones, overflow and drop targets" },
  ],
};
