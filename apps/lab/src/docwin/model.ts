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
 * The words of each group as drawn (px, measured on the page), and the gap between neighbouring words: Views'
 * "Pages · Notes 2 · Findings 20" (a "·" between words), Review's capsule, Zoom's −, value, +, FIT, Tools' five tools.
 */
export const WORD_WIDTHS: Record<GroupId, { widths: number[]; gap: number }> = {
  views: { widths: [47, 72, 86], gap: 12 },
  review: { widths: [80, 56, 66, 23], gap: 0 },
  zoom: { widths: [20, 34, 20, 30], gap: 4 },
  tools: { widths: [24, 24, 24, 24, 24], gap: 4 },
};
/** Words that wrap beside the grip (a hanging indent), never one word alone on a row that isn't the last. */
const wrap = (id: GroupId): StackForm => ({ kind: "wrap", main: { min: 0, natural: 0 }, cross: { natural: 0 }, wrap: { widths: WORD_WIDTHS[id].widths, gap: WORD_WIDTHS[id].gap, lead: GRIP, row: WRAP_ROW } });
/** Icons stacked under a horizontal grip on top (16 px). */
const icons = (n: number): StackForm => f("icons", n * 26 + 16, 28, { grip: 16 });

// In a column: one row while the column is wide enough, then the words wrapping, then icons, then the menu.
const GROUP_COLUMN: Record<GroupId, StackForm[]> = {
  zoom: [f("row", 32, 168), wrap("zoom"), icons(3), MENU],
  tools: [f("row", 32, 164), wrap("tools"), icons(5), MENU],
  views: [f("row", 32, 250), wrap("views"), icons(3), MENU],
  review: [f("row", 32, 320), wrap("review"), icons(4), MENU],
};
const GROUP_ROW: Record<GroupId, StackForm[]> = {
  zoom: [f("row", 168, BAR), f("fold", 44, BAR), MENU],
  tools: [f("row", 164, BAR), f("fold", 44, BAR), MENU],
  views: [f("row", 250, BAR), f("icons", 3 * 26 + 24, BAR), f("fold", 44, BAR), MENU],
  review: [f("row", 320, BAR), f("icons", 4 * 26 + 24, BAR), f("fold", 44, BAR), MENU],
};
const FLOAT_SIZE: Record<PanelId | GroupId, Size> = {
  pages: { width: 260, height: 360 },
  notes: { width: 260, height: 240 },
  findings: { width: 260, height: 300 },
  zoom: { width: 168, height: BAR },
  tools: { width: 164, height: BAR },
  views: { width: 250, height: BAR },
  review: { width: 320, height: BAR },
};

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
  if (isPanel(id)) return { id, kind: "panel", forms: { column: PANEL_COLUMN[id] }, floatSize: FLOAT_SIZE[id], used };
  if (isGroup(id)) return { id, kind: "group", forms: { column: GROUP_COLUMN[id], row: GROUP_ROW[id] }, floatSize: FLOAT_SIZE[id], used };
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
    floats: [{ id: "tools", rect: { x: 0, y: 0, width: FLOAT_SIZE.tools.width, height: FLOAT_SIZE.tools.height }, anchor: "content-top-right" }],
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
