/**
 * The home hero's docking diagram: one app window held as a dock state (a `Scene` of `@n-uf/placement/scene` today, a
 * `DockState` of `@n-uf/docking` after the coming release), laid out by `solve` at two widths. The server draws both
 * (components/HeroDock.astro); nothing moves. The narrow layout is solved with the wide one as `previous`, as a window that
 * lost room would be, so the steps down are the library's own: a panel steps open, header, rail; a toolbar group steps
 * row, fold, the » menu; a side column folds into its rail. Every rect, form and note drawn is read off `solve`; the
 * page only draws them.
 */
import { solve, type Edge, type Scene, type SceneItem, type SceneLayout } from "@n-uf/placement/scene";
import type { StackForm } from "@n-uf/placement/stack";

/** The window's inner size at each width, in px (drawn at this size, scaled only to fit the column). */
export const WIDE = { width: 320, height: 150 };
export const NARROW = { width: 240, height: 150 };
/** The title strip drawn over the stage: three dots and a hairline, so the frame reads as an app window. */
export const STRIP = 20;

type Id = "file" | "edit" | "view" | "files" | "outline" | "inspector";
const ITEMS: readonly Id[] = ["file", "edit", "view", "files", "outline", "inspector"];
export const TITLES: Readonly<Record<Id, string>> = { file: "File", edit: "Edit", view: "View", files: "Files", outline: "Outline", inspector: "Inspector" };
/** What a group's row shows after its label (its words); folded, the group shows its label and ». */
export const WORDS: Readonly<Record<"file" | "edit" | "view", string>> = { file: "New", edit: "Undo", view: "Zoom" };
export const isGroup = (id: string): id is "file" | "edit" | "view" => id === "file" || id === "edit" || id === "view";

const BAR = 26;
const form = (kind: StackForm["kind"], main: number | { min: number; natural: number; grows?: boolean }, cross: number, extra: Partial<StackForm> = {}): StackForm => ({
  kind,
  main: typeof main === "number" ? { min: main, natural: main } : main,
  cross: { natural: cross },
  ...extra,
});
const MENU = form("menu", 0, 0);

/** A panel: open down a column, then its header, then its title along the rail (`title: true`), then its tile; the one used longest ago gives way first. */
const panel = (id: Id, used: number, titleLength: number, grows: boolean): SceneItem => ({
  id,
  kind: "panel",
  used,
  forms: {
    column: [
      form("open", { min: 44, natural: 90, grows }, 100, { cross: { natural: 100, min: 84 } }),
      form("header", 22, 100, { cross: { natural: 100, min: 40 } }),
      { ...form("rail", titleLength, 28), title: true },
      form("rail", 28, 28),
      MENU,
    ],
  },
});
/** A toolbar group: its row (label and words), then its folded handle, then the bar's » menu; the lowest priority goes first. */
const group = (id: Id, used: number, row: number, fold: number, priority: number): SceneItem => ({
  id,
  kind: "group",
  used,
  priority,
  forms: { row: [form("row", row, BAR), form("fold", fold, BAR), MENU] },
});

/** The window at `W` × `H`: a top bar of three toolbar groups, a column of two panels at the left, one at the right, the documents between. */
function dockScene(W: number, H: number): Scene {
  const edges: Edge[] = [
    { id: "bar", side: "top", ring: 0, span: "full", accepts: ["group"], items: ["file", "edit", "view"], cross: { min: BAR, max: BAR }, gap: 4, pad: { start: 4, end: 4 }, menu: { main: 24 } },
    { id: "left", side: "left", ring: 0, accepts: ["panel"], items: ["files", "outline"], cross: { min: 84, max: 110, rail: 28 }, giveWay: true },
    { id: "right", side: "right", ring: 0, accepts: ["panel"], items: ["inspector"], cross: { min: 84, max: 110, rail: 28 }, giveWay: true },
  ];
  return {
    stage: { x: 0, y: 0, width: W, height: H },
    gutter: 0,
    edges,
    items: {
      file: group("file", 3, 86, 62, 5),
      edit: group("edit", 2, 98, 66, 2),
      view: group("view", 1, 94, 66, 0),
      files: panel("files", 2, 44, false),
      outline: panel("outline", 1, 52, true),
      inspector: panel("inspector", 3, 64, true),
    },
    floats: [],
    floatKinds: [],
    rails: { left: { width: 28, accepts: ["panel"] }, right: { width: 28, accepts: ["panel"] } },
    contentMin: { width: 100, height: 60 },
  };
}

export const wideLayout = (): SceneLayout => solve(dockScene(WIDE.width, WIDE.height));
/** The same dock state with less room, solved after the wide layout as a window that shrank would be. */
export const narrowLayout = (wide: SceneLayout): SceneLayout => solve(dockScene(NARROW.width, NARROW.height), { previous: wide });

/** How an item is drawn in a layout, in the words of its form. */
const stateOf = (l: SceneLayout, id: Id): string => {
  const it = l.items[id];
  return !it ? "gone" : it.inMenu ? "» menu" : it.formKind;
};

/** What changed between two layouts: each item that took another form, as the layouts say it. */
export function changes(before: SceneLayout, after: SceneLayout): string[] {
  const out: string[] = [];
  for (const id of ITEMS) {
    const a = stateOf(before, id), b = stateOf(after, id);
    if (a === b) continue;
    out.push(b === "» menu" ? `${TITLES[id]} → » menu` : `${TITLES[id]}: ${a} → ${b}`);
  }
  return out;
}
