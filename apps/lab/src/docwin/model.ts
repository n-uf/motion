/**
 * The document window as a `DockState` from `@n-uf/docking`: the title bar (a fixed title and fixed window controls
 * around the groups it takes), the top and bottom bars, the left and right columns, the panels and control groups, and
 * the floats. Each edge says which kinds it accepts (deny by default) and `floatKinds` which kinds may float; the
 * DockState's `solve` and `targets` enforce them. This file only declares the window: no rule is computed here.
 */
import type { Rect, Size } from "@n-uf/placement";
import type { StackForm } from "@n-uf/placement/stack";
import type { DockEdge, DockState, DockItem } from "@n-uf/docking";

export type EdgeId = "title" | "top" | "left" | "right" | "bottom" | "rail-left" | "rail-right";

export const PANELS = ["pages", "notes", "findings"] as const;
export const GROUPS = ["zoom", "tools", "views", "review"] as const;
const CHROME = ["title", "controls"] as const;
export type PanelId = (typeof PANELS)[number];
export type GroupId = (typeof GROUPS)[number];
export type ItemId = PanelId | GroupId | (typeof CHROME)[number];
export const MOVABLE: readonly ItemId[] = [...PANELS, ...GROUPS];
export const ALL: readonly ItemId[] = [...MOVABLE, ...CHROME];
export const EDGES: readonly EdgeId[] = ["title", "top", "left", "right", "bottom", "rail-left", "rail-right"];
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

/**
 * Each panel's rail title, its length along the rail (its name and count turned to run along it, padding included), as
 * the page measures it. Until measured, a panel has no title form and its rail shows its tile, as before.
 */
let titleSizes: Readonly<Partial<Record<PanelId, number>>> = {};
/** The panels' measured rail-title lengths, which every state built (or re-formed) afterwards uses. */
export function setTitleSizes(m: Readonly<Partial<Record<PanelId, number>>>): void {
  titleSizes = m;
}
/** A panel's rail forms: its title (measured), then its 28 px tile. */
const railForms = (id: PanelId): StackForm[] => [...(titleSizes[id] ? [{ ...f("rail", titleSizes[id]!, 28), title: true }] : []), f("rail", 28, 28)];
const panelColumn = (id: PanelId): StackForm[] => {
  const open: Record<PanelId, { min: number; natural: number }> = { pages: { min: 160, natural: 320 }, notes: { min: 120, natural: 200 }, findings: { min: 140, natural: 260 } };
  return [f("open", { ...open[id], grows: true }, 240, { cross: { natural: 240, min: COL_MIN } }), f("header", 32, 240, { cross: { natural: 240, min: 60 } }), ...railForms(id), MENU];
};

/** `s` with every panel's forms built anew from the measured sizes (a count changed the titles' lengths). */
export function reformPanels(s: DockState): DockState {
  const items = { ...s.items };
  for (const id of PANELS) if (items[id]) items[id] = { ...items[id]!, forms: { column: panelColumn(id) } };
  return { ...s, items };
}

/**
 * A group as the page draws it, measured from its rendered buttons (the page measures before it builds a state; the box
 * hugs its content, grip, padding and border included):
 * - `row`: its one-row width;
 * - `words`: each word's width in the order the `wrap` form lists them (Views' "Pages · Notes 2 · Findings 20",
 *   Review's capsule, Zoom's −, value, +, FIT, Tools' five tools), `gap` the room between neighboring words (Views' "·"
 *   included), `wrapRow` a wrapped row's height;
 * - `icons`: its vertical icons form (the grip on top, the icons stacked), `width` across and `height` along;
 * - `iconsRow`: its icons form in a bar, its width (Views and Review have one);
 * - `fold`: its folded form in a bar (the grip and its »), its width.
 */
export interface GroupMeasure {
  readonly row: number;
  readonly words: readonly number[];
  readonly gap: number;
  readonly wrapRow: number;
  /** A wrapped row's lead: the grip's cell, plus what a row draws after its last word (Review's capsule edge). */
  readonly lead: number;
  readonly icons: { readonly width: number; readonly height: number };
  readonly iconsRow: number;
  readonly fold: number;
  /** Its compact row variants' widths, "+N" cell included, one per `ROW_VARIANTS[id]` entry (Zoom's two). */
  readonly variants: readonly number[];
}

/** Zoom's controls in their row order; the value (id null) is never hidden. */
export const ZOOM_CONTROLS: readonly { readonly id: string | null; readonly label: string }[] = [
  { id: "-", label: "−" },
  { id: null, label: "" },
  { id: "+", label: "+" },
  // The fit control as the kits draw it (their FitToggle): the fit's word in capitals, H-FIT for the height fit.
  { id: "fit", label: "H-FIT" },
];
/**
 * Each group's compact row variants, largest first, by the controls each hides: Zoom's compact "− 86% +" with "+1"
 * (hides FIT) and minimal "86%" with "+3" (hides −, + and FIT). Review gets none (its design is on hold).
 */
export const ROW_VARIANTS: Readonly<Partial<Record<GroupId, readonly (readonly string[])[]>>> = { zoom: [["fit"], ["-", "+", "fit"]] };
let measured: Readonly<Record<GroupId, GroupMeasure>> | null = null;
/** The groups' measured widths, which every state built afterwards uses. */
export function setGroupSizes(m: Readonly<Record<GroupId, GroupMeasure>>): void {
  measured = m;
}
/** The measured widths (the page measures them on start, before its first state). */
function groupSizes():Readonly<Record<GroupId, GroupMeasure>> {
  if (!measured) throw new Error("docwin: the groups are measured on the page before a state is built");
  return measured;
}
/** Words that wrap beside the grip (a hanging indent), never one word alone on a row that isn't the last. */
const wrap = (id: GroupId): StackForm => ({ kind: "wrap", main: { min: 0, natural: 0 }, cross: { natural: 0 }, wrap: { widths: [...groupSizes()[id].words], gap: groupSizes()[id].gap, lead: groupSizes()[id].lead, row: groupSizes()[id].wrapRow } });
/** Icons stacked under a horizontal grip on top (16 px: the dots, their gap and the top padding), as measured. */
const icons = (id: GroupId): StackForm => f("icons", groupSizes()[id].icons.height, groupSizes()[id].icons.width, { grip: 16 });

// In a column: one row while the column is wide enough, then the words wrapping, then icons, then the menu.
const groupColumn = (id: GroupId): StackForm[] => [f("row", 32, groupSizes()[id].row), wrap(id), icons(id), MENU];
// In a bar: the row, its compact variants (Zoom), then (Views and Review) the icons, then folded, then the menu.
const groupRow = (id: GroupId): StackForm[] => [
  f("row", groupSizes()[id].row, BAR),
  // Its compact variants: row forms between the full row and the next form, each at its measured width with its "+N".
  ...(ROW_VARIANTS[id] ?? []).map((hides, i) => f("row", groupSizes()[id].variants[i]!, BAR, { hides })),
  ...(id === "views" || id === "review" ? [f("icons", groupSizes()[id].iconsRow, BAR)] : []),
  f("fold", groupSizes()[id].fold, BAR),
  MENU,
];
const PANEL_FLOAT: Record<PanelId, Size> = {
  pages: { width: 260, height: 360 },
  notes: { width: 260, height: 240 },
  findings: { width: 260, height: 300 },
};
const floatSize = (id: PanelId | GroupId): Size => (isPanel(id) ? PANEL_FLOAT[id] : { width: groupSizes()[id].row, height: BAR });

const isPanel = (id: string): id is PanelId => (PANELS as readonly string[]).includes(id);
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
/** An item's title: this window's own, or, for an item of a state loaded from elsewhere (a conformance row), its id in words. */
export const titleOf = (id: string): string => (TITLES as Readonly<Record<string, string>>)[id] ?? id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, " ");

/** The toolbars that go into a » menu last (the highest give-way priority): Zoom and Review. */
const PRIORITY: Partial<Record<GroupId, number>> = { zoom: 10, review: 10 };
/** The title bar's toolbars step down before other bars' (its default priority). */
const TITLE_BAR_PRIORITY = -1;

function itemOf(id: ItemId, used: number): DockItem {
  if (isPanel(id)) return { id, kind: "panel", forms: { column: panelColumn(id) }, floatSizes: { column: floatSize(id) }, used };
  // A toolbar group declares its row forms first, so it floats as a row (`floatOrientOf`).
  if (isGroup(id)) return { id, kind: "group", forms: { row: groupRow(id), column: groupColumn(id) }, floatSize: floatSize(id), used, ...(PRIORITY[id] !== undefined ? { priority: PRIORITY[id] } : {}) };
  // The title takes the bar's spare length and shrinks to its minimum; the controls are one fixed size at the end.
  if (id === "title") return { id, kind: "chrome", forms: { row: [f("row", { min: 140, natural: 220, grows: true }, BAR)] }, used: 0, fixed: true };
  return { id, kind: "chrome", forms: { row: [f("row", 3 * 22 + 8, BAR)] }, used: 0, fixed: true, align: "end" };
}

const bar = (id: EdgeId, side: "top" | "bottom", ring: number, items: ItemId[]): DockEdge => ({
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
const rail = (id: EdgeId, side: "left" | "right", items: ItemId[]): DockEdge => ({
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
const column = (id: EdgeId, side: "left" | "right", items: ItemId[]): DockEdge => ({
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
export function defaultState(size: Size = DEFAULT_SIZE): DockState {
  const order: ItemId[] = ["findings", "review", "views", "zoom", "tools", "notes", "pages", "title", "controls"];
  const items = Object.fromEntries(ALL.map((id) => [id, itemOf(id, order.indexOf(id) + 1)])) as Record<ItemId, DockItem>;
  return {
    stage: { x: 0, y: 0, width: size.width, height: size.height },
    edges: [{ ...bar("title", "top", 0, ["title", "zoom", "controls"]), priority: TITLE_BAR_PRIORITY }, bar("top", "top", 1, []), column("left", "left", ["pages", "notes"]), column("right", "right", ["findings"]), bar("bottom", "bottom", 0, ["views", "review"]), rail("rail-left", "left", []), rail("rail-right", "right", [])],
    items,
    floats: [{ id: "tools", rect: { x: 0, y: 0, width: floatSize("tools").width, height: floatSize("tools").height }, anchor: "content-top-right" }],
    floatKinds: ["panel", "group"],
  };
}

// --- plain edits for the presets (each returns a new state) -----------------------------------------------------------

/** The edge's items set to `ids` (taken out of every other edge and the floats; the edge's fixed items kept around them). */
export function put(s: DockState, edge: EdgeId, ids: ItemId[]): DockState {
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
export function floating(s: DockState, id: ItemId, rect: Rect): DockState {
  return {
    ...s,
    edges: s.edges.map((e) => ({ ...e, items: e.items.filter((x) => x !== id) })),
    floats: [...s.floats.filter((x) => x.id !== id), { id, rect: { ...rect } }],
  };
}

/** Ages in order, oldest first. */
export function ages(s: DockState, ids: ItemId[]): DockState {
  const items = { ...s.items };
  ids.forEach((id, i) => (items[id] = { ...items[id]!, used: i + 1 }));
  return { ...s, items };
}

export const withStage = (s: DockState, size: Size): DockState => ({ ...s, stage: { x: 0, y: 0, width: size.width, height: size.height } });

export const edgeOf = (s: DockState, id: EdgeId): DockEdge => s.edges.find((e) => e.id === id)!;
