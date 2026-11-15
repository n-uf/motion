/**
 * The document window as a `Scene` from `@n-uf/placement/scene`: the title bar (a fixed title and fixed window controls
 * around the groups it takes), the top and bottom bars, the left and right columns, the panels and control groups, and
 * the floats. Each edge says which kinds it accepts (deny by default) and `floatKinds` which kinds may float; the
 * Scene's `solve` and `targets` enforce them. This file only declares the window: no rule is computed here.
 */
import type { Rect, Size } from "@n-uf/placement";
import type { StackForm } from "@n-uf/placement/stack";
import type { Edge, Scene, SceneItem } from "@n-uf/placement/scene";

export type Kind = "panel" | "group" | "chrome";
export type EdgeId = "title" | "top" | "left" | "right" | "bottom" | "rail-left" | "rail-right";

export const PANELS = ["pages", "notes", "findings"] as const;
export const GROUPS = ["zoom", "tools", "views", "review"] as const;
export const CHROME = ["title", "controls"] as const;
export type PanelId = (typeof PANELS)[number];
export type GroupId = (typeof GROUPS)[number];
export type ItemId = PanelId | GroupId | (typeof CHROME)[number];
export const MOVABLE: readonly ItemId[] = [...PANELS, ...GROUPS];
export const ALL: readonly ItemId[] = [...MOVABLE, ...CHROME];
export const EDGES: readonly EdgeId[] = ["title", "top", "left", "right", "bottom", "rail-left", "rail-right"];
/** The thin rails of vertical toolbars, one per side at the window's edge (compact: icons only). */
export const RAILS: readonly EdgeId[] = ["rail-left", "rail-right"];
export const isSideEdge = (e: EdgeId): boolean => e === "left" || e === "right" || e === "rail-left" || e === "rail-right";

export interface Counts {
  notes: number;
  findings: number;
  marked: number;
  pages: number;
  zoom: number;
}
export const DEFAULT_COUNTS: Counts = { notes: 2, findings: 20, marked: 22, pages: 12, zoom: 86 };

// --- geometry ------------------------------------------------------------------------------------------------------

/** A bar's height (its items are as tall). */
export const BAR = 32;
export const BAR_INSET = 8;
export const COL_MIN = 180;
export const COL_WIDE = 400;
export const RAIL = 30;
export const DEFAULT_SIZE: Size = { width: 1080, height: 640 };

// --- the items' forms ----------------------------------------------------------------------------------------------

const f = (kind: StackForm["kind"], main: number | { min: number; natural: number; grows?: boolean }, cross: number, extra: Partial<StackForm> = {}): StackForm => ({
  kind,
  main: typeof main === "number" ? { min: main, natural: main } : main,
  cross: { natural: cross },
  ...extra,
});
const MENU = f("menu", 0, 0);

const PANEL_COLUMN: Record<PanelId, StackForm[]> = {
  pages: [f("open", { min: 160, natural: 320, grows: true }, 240, { cross: { natural: 240, min: COL_MIN } }), f("header", 32, 240, { cross: { natural: 240, min: 60 } }), f("rail", 28, 28), MENU],
  notes: [f("open", { min: 120, natural: 200, grows: true }, 240, { cross: { natural: 240, min: COL_MIN } }), f("header", 32, 240, { cross: { natural: 240, min: 60 } }), f("rail", 28, 28), MENU],
  findings: [f("open", { min: 140, natural: 260, grows: true }, 240, { cross: { natural: 240, min: COL_MIN } }), f("header", 32, 240, { cross: { natural: 240, min: 60 } }), f("rail", 28, 28), MENU],
};

/** A group's grip cell: the dots and their padding before the words (the lead of a `wrap` form). */
export const GRIP = 17;
/** A wrapped row's height. */
export const WRAP_ROW = 28;
/**
 * A group as the page draws it, measured from its rendered buttons (the page measures before it builds a scene): `row`
 * its one-row width (grip, words, padding and border: the box hugs its content), `words` each word's width in the order
 * the `wrap` form lists them (Views' "Pages · Notes 2 · Findings 20", Review's capsule, Zoom's −, value, +, FIT, Tools'
 * five tools), `gap` the room between neighbouring words (Views' "·" included).
 */
export interface GroupMeasure {
  readonly row: number;
  readonly words: readonly number[];
  readonly gap: number;
}
let measured: Readonly<Record<GroupId, GroupMeasure>> | null = null;
/** The groups' measured widths, which every scene built afterwards uses. */
export function setGroupSizes(m: Readonly<Record<GroupId, GroupMeasure>>): void {
  measured = m;
}
/** The measured widths (the page measures them on start, before its first scene). */
export function groupSizes(): Readonly<Record<GroupId, GroupMeasure>> {
  if (!measured) throw new Error("docwin: the groups are measured on the page before a scene is built");
  return measured;
}
/** Words that wrap beside the grip (a hanging indent), never one word alone on a row that isn't the last. */
const wrap = (id: GroupId): StackForm => ({ kind: "wrap", main: { min: 0, natural: 0 }, cross: { natural: 0 }, wrap: { widths: [...groupSizes()[id].words], gap: groupSizes()[id].gap, lead: GRIP, row: WRAP_ROW } });
/** Icons stacked under a horizontal grip on top (16 px). */
const icons = (n: number): StackForm => f("icons", n * 26 + 16, 28, { grip: 16 });
const ICONS: Record<GroupId, number> = { zoom: 3, tools: 5, views: 3, review: 4 };

// In a column: one row while the column is wide enough, then the words wrapping, then icons, then the menu.
const groupColumn = (id: GroupId): StackForm[] => [f("row", 32, groupSizes()[id].row), wrap(id), icons(ICONS[id]), MENU];
// In a bar: the row, then (Views and Review) the icons, then folded, then the menu.
const groupRow = (id: GroupId): StackForm[] => [
  f("row", groupSizes()[id].row, BAR),
  ...(id === "views" || id === "review" ? [f("icons", ICONS[id] * 26 + 24, BAR)] : []),
  f("fold", 44, BAR),
  MENU,
];
const PANEL_FLOAT: Record<PanelId, Size> = {
  pages: { width: 260, height: 360 },
  notes: { width: 260, height: 240 },
  findings: { width: 260, height: 300 },
};
const floatSize = (id: PanelId | GroupId): Size => (isPanel(id) ? PANEL_FLOAT[id] : { width: groupSizes()[id].row, height: BAR });

export const isPanel = (id: string): id is PanelId => (PANELS as readonly string[]).includes(id);
export const isGroup = (id: string): id is GroupId => (GROUPS as readonly string[]).includes(id);

export const TITLES: Record<ItemId, string> = {
  pages: "Pages",
  notes: "Notes",
  findings: "Findings",
  zoom: "Zoom",
  tools: "Tools",
  views: "Views",
  review: "Review",
  title: "Title",
  controls: "Window controls",
};

function itemOf(id: ItemId, used: number): SceneItem {
  if (isPanel(id)) return { id, kind: "panel", forms: { column: PANEL_COLUMN[id] }, floatSize: floatSize(id), used };
  if (isGroup(id)) return { id, kind: "group", forms: { column: groupColumn(id), row: groupRow(id) }, floatSize: floatSize(id), used };
  // The title takes the bar's spare length and shrinks to its minimum; the controls are one fixed size at the end.
  if (id === "title") return { id, kind: "chrome", forms: { row: [f("row", { min: 140, natural: 220, grows: true }, BAR)] }, used: 0, fixed: true };
  return { id, kind: "chrome", forms: { row: [f("row", 3 * 22 + 8, BAR)] }, used: 0, fixed: true, align: "end" };
}

const bar = (id: EdgeId, side: "top" | "bottom", ring: number, items: ItemId[]): Edge => ({
  id,
  side,
  ring,
  accepts: ["group"],
  items,
  cross: { min: BAR, max: BAR, rail: BAR },
  gap: 8,
  pad: { start: BAR_INSET, end: BAR_INSET },
});
/** A thin rail of vertical toolbars at the window's side (ring 0, outside the column): icons only, stacked, each grip the divider. */
const rail = (id: EdgeId, side: "left" | "right", items: ItemId[]): Edge => ({
  id,
  side,
  ring: 0,
  accepts: ["group"],
  items,
  cross: { min: RAIL, max: RAIL, rail: RAIL },
  compact: true,
  gap: 4,
  pad: { start: 4, end: 4 },
});
const column = (id: EdgeId, side: "left" | "right", items: ItemId[]): Edge => ({
  id,
  side,
  ring: 1,
  accepts: ["panel", "group"],
  // Panels at the top; the groups' tray at the foot (one toolbar per row, wrap or icons); a group never opens it alone.
  zoneAccepts: { start: ["panel"], end: ["group"] },
  items,
  cross: { min: 120, max: COL_WIDE, rail: RAIL },
  gap: 6,
  pad: { start: 6, end: 6 },
});

/**
 * The default layout: Pages above Notes on the left, Findings on the right, Zoom in the title bar, Views and Review in
 * the bottom bar, Tools floating at the content's top-right corner.
 */
export function defaultScene(size: Size = DEFAULT_SIZE): Scene {
  const order: ItemId[] = ["findings", "review", "views", "zoom", "tools", "notes", "pages", "title", "controls"];
  const items = Object.fromEntries(ALL.map((id) => [id, itemOf(id, order.indexOf(id) + 1)])) as Record<ItemId, SceneItem>;
  return {
    stage: { x: 0, y: 0, width: size.width, height: size.height },
    edges: [bar("title", "top", 0, ["title", "zoom", "controls"]), bar("top", "top", 1, []), column("left", "left", ["pages", "notes"]), column("right", "right", ["findings"]), bar("bottom", "bottom", 0, ["views", "review"]), rail("rail-left", "left", []), rail("rail-right", "right", [])],
    items,
    floats: [{ id: "tools", rect: { x: 0, y: 0, width: floatSize("tools").width, height: floatSize("tools").height }, anchor: "content-top-right" }],
    floatKinds: ["panel", "group"],
  };
}

// --- plain edits for the presets (each returns a new scene) -----------------------------------------------------------

/** The edge's items set to `ids` (taken out of every other edge and the floats; the edge's fixed items kept around them). */
export function put(s: Scene, edge: EdgeId, ids: ItemId[]): Scene {
  const moving = new Set<string>(ids);
  return {
    ...s,
    edges: s.edges.map((e) => {
      if (e.id !== edge) return { ...e, items: e.items.filter((x) => !moving.has(x)) };
      const fixed = e.items.filter((x) => s.items[x]?.fixed);
      const lead = fixed.filter((x) => s.items[x]?.align !== "end");
      const trail = fixed.filter((x) => s.items[x]?.align === "end");
      return { ...e, items: [...lead, ...ids, ...trail] };
    }),
    floats: s.floats.filter((x) => !moving.has(x.id)),
  };
}

/** The item floating at `rect` (out of every edge). */
export function floating(s: Scene, id: ItemId, rect: Rect): Scene {
  return {
    ...s,
    edges: s.edges.map((e) => ({ ...e, items: e.items.filter((x) => x !== id) })),
    floats: [...s.floats.filter((x) => x.id !== id), { id, rect: { ...rect } }],
  };
}

/** Ages in order, oldest first. */
export function ages(s: Scene, ids: ItemId[]): Scene {
  const items = { ...s.items };
  ids.forEach((id, i) => (items[id] = { ...items[id]!, used: i + 1 }));
  return { ...s, items };
}

export const withStage = (s: Scene, size: Size): Scene => ({ ...s, stage: { x: 0, y: 0, width: size.width, height: size.height } });

export const edgeOf = (s: Scene, id: EdgeId): Edge => s.edges.find((e) => e.id === id)!;
