/**
 * The home hero's shared window: one believable app window where the three libraries each do their part.
 *
 * - **Docking** lays it out: the dock state is a `Scene` of `@n-uf/placement/scene` today (a `DockState` of `@n-uf/docking`
 *   after the coming release) and `solve` gives every rect: the bar, its toolbar groups, the » menu, the columns, the
 *   panels in the form they took, the documents. Nothing here is hand-placed except the scene's own numbers.
 * - **Placement** places one popup: `positionPopup` from `@n-uf/placement` puts the Share button's menu below the button,
 *   flips it up because below would leave the window, and says where "below" would have been (the ghost).
 * - **Motion** moves the one thing that moves: the Inspector panel is dropped near its slot and glides in
 *   (islands/hero-window.ts).
 *
 * Plain data and pure functions the server renders (the finished state); the island only moves the panel.
 */
import { BELOW_LEFT, positionPopup, type Rect } from "@n-uf/placement";
import { solve, type Edge, type Scene, type SceneItem, type SceneLayout } from "@n-uf/placement/scene";
import type { StackForm } from "@n-uf/placement/stack";

/** The window: its title strip, and its stage (what `solve` lays out), in px. The frame is the window. */
export const STRIP = 24;
export const STAGE = { width: 720, height: 396 };
/** Room under the window for the placement ghost, which crosses its bottom edge. */
export const BELOW = 78;

const BAR = 30;
const form = (kind: StackForm["kind"], main: number | { min: number; natural: number; grows?: boolean }, cross: number, extra: Partial<StackForm> = {}): StackForm => ({
  kind,
  main: typeof main === "number" ? { min: main, natural: main } : main,
  cross: { natural: cross },
  ...extra,
});
const MENU = form("menu", 0, 0);

/** A toolbar group: its label and words in a row (as wide as that text), then (if it has one) its folded handle, then the » menu. */
interface Group {
  readonly id: "file" | "edit" | "view";
  readonly label: string;
  readonly words: readonly string[];
  readonly fold: number | null;
  readonly used: number;
  readonly priority: number;
}
const GROUPS: readonly Group[] = [
  { id: "file", label: "File", words: ["New", "Open", "Save", "Print"], fold: 62, used: 3, priority: 5 },
  { id: "edit", label: "Edit", words: ["Undo", "Redo", "Cut", "Copy", "Paste", "Find"], fold: 66, used: 2, priority: 2 },
  { id: "view", label: "View", words: ["Zoom", "Fit", "Grid", "Guides"], fold: null, used: 1, priority: 0 },
];
/** The room a row of text takes at the drawn size, px (its padding included). */
const rowWidth = (g: Group): number => Math.round(26 + `${g.label}   ${g.words.join("   ")}`.length * 6.6);

const group = (g: Group): SceneItem => ({
  id: g.id,
  kind: "group",
  used: g.used,
  priority: g.priority,
  forms: { row: [form("row", rowWidth(g), BAR), ...(g.fold ? [form("fold", g.fold, BAR)] : []), MENU] },
});
/** A panel: open down a column (as tall as its text asks, at least `min`), then its header; the one used longest ago gives way first. */
const panel = (id: string, used: number, min: number, grows: boolean): SceneItem => ({
  id,
  kind: "panel",
  used,
  forms: { column: [form("open", { min, natural: min + 40, grows }, 190, { cross: { natural: 190, min: 170 } }), form("header", 26, 190, { cross: { natural: 190, min: 40 } }), form("rail", 30, 30), MENU] },
});

function scene(): Scene {
  const edges: Edge[] = [
    { id: "bar", side: "top", ring: 0, span: "full", accepts: ["group"], items: GROUPS.map((g) => g.id), cross: { min: BAR, max: BAR }, gap: 6, pad: { start: 8, end: 8 }, menu: { main: 28 } },
    { id: "left", side: "left", ring: 0, accepts: ["panel"], items: ["files", "outline"], cross: { min: 170, max: 200, rail: 30 } },
    { id: "right", side: "right", ring: 0, accepts: ["panel"], items: ["inspector"], cross: { min: 170, max: 200, rail: 30 } },
  ];
  return {
    stage: { x: 0, y: 0, ...STAGE },
    gutter: 0,
    edges,
    items: {
      ...Object.fromEntries(GROUPS.map((g) => [g.id, group(g)])),
      // Both left panels ask for 200 px at least: the column is shorter than that for both, so the one used longest ago gives way.
      files: panel("files", 2, 200, true),
      outline: panel("outline", 1, 200, false),
      inspector: panel("inspector", 3, 160, true),
    },
    floats: [],
    floatKinds: [],
    rails: { left: { width: 30, accepts: ["panel"] }, right: { width: 30, accepts: ["panel"] } },
    contentMin: { width: 200, height: 80 },
  };
}

/** The share menu: what the popup lists, and its size. */
export const MENU_ITEMS = ["Copy link", "Export", "Invite"] as const;
const POPUP = { width: 140, height: 96 };
const SHARE = { width: 76, height: 30 };

export interface Windowed {
  readonly layout: SceneLayout;
  /** Group labels with their words, in bar order, for the ones drawn in their row; the others by form. */
  readonly share: { readonly anchor: Rect; readonly popup: Rect; readonly ghost: Rect; readonly flipped: boolean };
  /** The Inspector's slot (its solved rect), and where it is dropped before it glides in. */
  readonly slot: Rect;
  readonly drop: Rect;
  /** What `solve` gave, in words, for the docking callout. */
  readonly said: string;
}

export function windowed(): Windowed {
  const layout = solve(scene());
  const c = layout.content;
  const anchor: Rect = { x: c.x + 36, y: STAGE.height - 56, ...SHARE };
  const bounds: Rect = { x: 0, y: 0, ...STAGE };
  const placed = positionPopup(anchor, POPUP, bounds, BELOW_LEFT);
  const ghost = positionPopup(anchor, POPUP, bounds, { ...BELOW_LEFT, flip: false, slide: false, resize: false }).rect;
  const slot = layout.items.inspector!.rect;
  const drop: Rect = { x: slot.x - 64, y: slot.y + 70, width: slot.width, height: slot.height };

  const headers = ["files", "outline"].filter((id) => layout.items[id]!.formKind === "header").map((id) => id.charAt(0).toUpperCase() + id.slice(1));
  const menu = GROUPS.filter((g) => layout.items[g.id]!.inMenu).map((g) => g.label);
  const parts: string[] = [];
  if (headers.length) parts.push(`${headers.join(" and ")} folded to its header`);
  if (menu.length) parts.push(`${menu.join(" and ")} went to the » menu`);
  const said = `Who sits where. ${parts.join("; ")}.`;
  return { layout, share: { anchor, popup: placed.rect, ghost, flipped: placed.flipped.y }, slot, drop, said };
}

/** The groups as the page draws them: label and words, by the form `solve` gave. */
export const groups = GROUPS.map((g) => ({ id: g.id, label: g.label, words: g.words }));
