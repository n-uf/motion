/**
 * The desk's content: its five tool panels (a title, the height they need and some body text) and its documents,
 * and the desk @n-uf/placement builds from them (the nine constructions and their drop targets).
 */
import { createDesk, panelKey as P, type ConstructionId } from "@n-uf/placement/dock";

/**
 * The five tool panels: a title, the height they need (their natural height: the title bar, the sample content's
 * rows and the body's padding, so a section at its natural height shows all of it) and some body text.
 */
export const PANELS = [
  { id: 1, title: "Files", natural: 166, body: "Quarterly plan<br>Meeting notes<br>Reading list<br>Budget draft" },
  { id: 2, title: "Outline", natural: 210, body: "1 Goals<br>2 Scope<br>3 Timeline<br>4 Open questions" },
  { id: 3, title: "Notes", natural: 122, body: "Call back on Monday<br>Book the small room" },
  { id: 4, title: "Inspector", natural: 158, body: "Size 14 KB<br>Modified today<br>Tags: plan, team" },
  { id: 5, title: "History", natural: 166, body: "Opened Meeting notes<br>Renamed Budget draft<br>Moved Reading list" },
] as const;
export const DOC_TITLES = ["Quarterly plan", "Meeting notes", "Reading list", "Budget draft"] as const;
export const MAX_DOCS = DOC_TITLES.length;

/**
 * Files and Outline dock left, Notes and Inspector right, History at the bottom. In the tiling tree Notes and
 * History take the right column and Inspector the centre; in the strip the left and right docks are two columns.
 * The panels were opened Files, Notes, Outline, Inspector, History: the tree floats the newest first.
 */
export const desk = createDesk({
  panels: PANELS,
  docTitle: (id) => DOC_TITLES[(id - 1) % DOC_TITLES.length]!,
  start: {
    left: [1, 2],
    right: [3, 4],
    bottom: [5],
    active: { left: 1, right: 4 },
    tree: { L: [P(1), P(2)], R: [P(3), P(5)], C: [P(4)] },
    cols: [
      [P(1), P(2)],
      [P(3), P(4), P(5)],
    ],
    stacks: { left: [1, 2], right: [3, 4, 5] },
  },
  opened: [1, 3, 2, 4, 5],
});

export const CONSTRUCTIONS = desk.constructions;
export const constructionOf = desk.constructionOf;
export const natural = desk.natural;
export const titleOf = desk.titleOf;
export const DEFAULT_CONSTRUCTION: ConstructionId = "dockTear";
