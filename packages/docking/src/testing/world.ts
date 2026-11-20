/**
 * The sample worlds the rows are written on. Generic names, plain numbers.
 *
 * - `bench(...)`: the edge stack stage as a `DockState`: a top bar (a toolbar edge, 40 px at most) and a left column
 *   under it, three panels (pages, annotations, findings), three control groups (views, tools, zoom) and floats.
 * - `doc(...)`: a document window: a title bar (a fixed title that grows, fixed window controls), a toolbar, a status
 *   bar, a left and a right column, panels, groups and a float. This is the shape a document window draws.
 * - `windowState(...)` (./windows): the two pinned document windows with dynamic columns and rails.
 */
import type { Rect } from "@n-uf/placement";
import type { StackForm } from "@n-uf/placement/stack";
import type { DockEdge, DockState, DockItem, DockFloat } from "../index";

export const form = (kind: StackForm["kind"], min: number, natural: number, cross: number, extra: { grows?: boolean; crossMin?: number; rank?: number; setsCross?: boolean } = {}): StackForm => ({
  kind,
  main: { min, natural, ...(extra.grows ? { grows: true } : {}) },
  cross: { natural: cross, ...(extra.crossMin !== undefined ? { min: extra.crossMin } : {}) },
  ...(extra.rank !== undefined ? { rank: extra.rank } : {}),
  ...(extra.setsCross !== undefined ? { setsCross: extra.setsCross } : {}),
});

// --- the bench: the edge stack stage -------------------------------------------------------------------------

type BenchId ="pages" | "annotations" | "findings" | "views" | "tools" | "zoom";
const BENCH_PANELS:readonly BenchId[] = ["pages", "annotations", "findings"];
const BENCH_GROUPS:readonly BenchId[] = ["views", "tools", "zoom"];

const PANEL_SIZE: Record<string, { column: number; wide: number }> = {
  pages: { column: 150, wide: 200 },
  annotations: { column: 130, wide: 240 },
  findings: { column: 170, wide: 220 },
};
const WORDS = 3;
const iconsMain = (axis: "column" | "row"): number => (axis === "column" ? 18 : 16) + 26 * WORDS;
const FOLD = 40;
const MENU = 28;
const BENCH_RAIL = 30;
const BENCH_BAR_MAX = 40;

/** A panel's forms down a column (open, header, rail icon, menu) and along a bar (a header, a rail icon, the menu). */
function benchPanel(id: BenchId, used: number, more: Partial<DockItem> = {}): DockItem {
  const s = PANEL_SIZE[id]!;
  return {
    id,
    kind: "panel",
    used,
    forms: {
      column: [form("open", 90, s.column, s.wide, { grows: true, crossMin: 100 }), form("header", 30, 30, s.wide, { crossMin: 56 }), form("rail", 26, 26, BENCH_RAIL), form("menu", 0, 0, 0)],
      row: [form("header", 110, 110, 28), form("rail", 26, 26, 26), form("menu", 0, 0, 0)],
    },
    floatSize: { width: s.wide, height: s.column + 40 },
    ...more,
  };
}

/** A group's forms down a column (a row of words, stacked words, icons, menu) and along a toolbar (row, icons or stacked, then its own fold). */
function benchGroup(id: BenchId, used: number, more: Partial<DockItem> = {}): DockItem {
  const row = 244;
  const ranked = (f: StackForm, rank: number): StackForm => ({ ...f, rank });
  const bar: StackForm[] =
    id === "tools"
      ? [ranked(form("row", row, row, 28), 0), ranked(form("icons", iconsMain("row"), iconsMain("row"), 28), 0), ranked(form("fold", FOLD, FOLD, 28), 1)]
      : id === "zoom"
        ? [form("row", row, row, 28), form("stacked", row, row, 30), form("fold", FOLD, FOLD, 28), ranked(form("menu", 0, 0, 0), 2)]
        : [form("row", row, row, 28), form("fold", FOLD, FOLD, 28), ranked(form("menu", 0, 0, 0), 2)];
  return {
    id,
    kind: "group",
    used,
    forms: {
      column: [form("row", 30, 30, 240), form("stacked", 84, 84, 84), form("icons", iconsMain("column"), iconsMain("column"), 28), form("menu", 0, 0, 0)],
      row: bar,
    },
    floatSize: { width: row, height: 34 },
    ...more,
  };
}

/** Where the bench's items are: the column's order, the bar's, and the floats (a group floats along a row). */
export interface BenchLayout {
  readonly column: readonly BenchId[];
  readonly bar: readonly BenchId[];
  readonly floats: readonly { readonly id: BenchId; readonly rect: Rect }[];
}
const BENCH_LAYOUT:BenchLayout = {
  column: ["pages", "annotations"],
  bar: ["views", "tools", "zoom"],
  floats: [{ id: "findings", rect: { x: 440, y: 130, width: 220, height: 190 } }],
};

export interface BenchOptions {
  /** The stage's width and height (default 840 x 500). */
  readonly width?: number;
  readonly height?: number;
  /** The column's width limit, an open panel's `cross.max` (default 360). */
  readonly widthLimit?: number;
  readonly gap?: number;
  readonly pad?: number;
  /** Ages: the larger, the newer (default pages 1, annotations 2, findings 3, views 4, tools 5, zoom 6). */
  readonly used?: Partial<Record<BenchId, number>>;
  readonly kept?: readonly BenchId[];
  /** First forms allowed: 1 a panel folded by hand, 2 down to its rail icon. */
  readonly from?: Partial<Record<BenchId, number>>;
}

const DEFAULT_USED: Record<BenchId, number> = { pages: 1, annotations: 2, findings: 3, views: 4, tools: 5, zoom: 6 };

/** The edge stack stage: a bar of groups along the top, a column down the left, floats above. */
export function bench(layout: BenchLayout = BENCH_LAYOUT, o: BenchOptions = {}): DockState {
  const width = o.width ?? 840;
  const height = o.height ?? 500;
  const used = { ...DEFAULT_USED, ...o.used };
  const items: Record<string, DockItem> = {};
  for (const id of BENCH_PANELS) items[id] = benchPanel(id, used[id], { ...(o.kept?.includes(id) ? { kept: true } : {}), ...(o.from?.[id] ? { from: o.from[id]! } : {}) });
  for (const id of BENCH_GROUPS) items[id] = benchGroup(id, used[id], o.kept?.includes(id) ? { kept: true } : {});
  const pad = o.pad ?? 12;
  const edges: DockEdge[] = [
    { id: "bar", side: "top", ring: 0, accepts: ["group", "panel"], items: [...layout.bar], cross: { min: BENCH_BAR_MAX - 4, max: BENCH_BAR_MAX, rail: BENCH_BAR_MAX }, gap: o.gap ?? 8, pad: { start: pad, end: pad }, menu: { main: MENU } },
    { id: "column", side: "left", ring: 0, accepts: ["panel", "group"], items: [...layout.column], cross: { min: 60, max: o.widthLimit ?? 360, rail: BENCH_RAIL }, menu: { main: MENU } },
  ];
  const floats: DockFloat[] = layout.floats.map((f) => ({ id: f.id, rect: { ...f.rect }, ...(BENCH_GROUPS.includes(f.id) ? { orient: "row" as const } : {}) }));
  return { stage: { x: 0, y: 0, width, height }, edges, items, floats, floatKinds: ["panel", "group"] };
}

// --- the document window ---------------------------------------------------------------------------------------------

const panel = (id: string, used: number, more: Partial<DockItem> = {}, wide = 260): DockItem => ({
  id,
  kind: "panel",
  used,
  forms: {
    column: [form("open", 120, 240, wide, { grows: true, crossMin: 180 }), form("header", 28, 28, wide, { crossMin: 60 }), form("rail", 28, 28, 30), form("menu", 0, 0, 0)],
    row: [form("header", 120, 160, 28), form("menu", 0, 0, 0)],
  },
  ...more,
});

const group = (id: string, used: number, more: Partial<DockItem> = {}): DockItem => ({
  id,
  kind: "group",
  used,
  forms: {
    row: [form("row", 180, 200, 28), form("icons", 84, 84, 28), form("menu", 0, 0, 0)],
    column: [form("stacked", 96, 96, 84), form("icons", 84, 84, 28), form("menu", 0, 0, 0)],
  },
  ...more,
});

/** A fixed title that shrinks to 80 and grows with spare room. */
const title = (id = "title"): DockItem => ({ id, kind: "title", used: 0, fixed: true, forms: { row: [form("row", 80, 160, 32, { grows: true })] } });
/** Fixed window controls, 84 wide, at the end of their bar. */
const controls = (id = "controls"): DockItem => ({ id, kind: "controls", used: 0, fixed: true, align: "end", forms: { row: [form("row", 84, 84, 32)] } });
/** A fixed page readout, 72 wide, centered in its bar. */
const readout = (id = "readout"): DockItem => ({ id, kind: "readout", used: 0, fixed: true, align: "center", forms: { row: [form("row", 72, 72, 28)] } });

const bar = (id: string, side: "top" | "bottom", ring: number, items: string[], more: Partial<DockEdge> = {}): DockEdge => ({
  id,
  side,
  ring,
  accepts: ["group"],
  items,
  cross: { min: 36, max: 36, rail: 36 },
  gap: 4,
  pad: { start: 8, end: 8 },
  ...more,
});

const column = (id: string, side: "left" | "right", ring: number, items: string[], more: Partial<DockEdge> = {}): DockEdge => ({
  id,
  side,
  ring,
  accepts: ["panel", "group"],
  items,
  cross: { min: 160, max: 480, rail: 30 },
  ...more,
});

const byId = (items: readonly DockItem[]): Record<string, DockItem> => Object.fromEntries(items.map((it) => [it.id, it]));

export interface DocOptions {
  readonly width?: number;
  readonly height?: number;
}

/**
 * A document window, 1200 x 800: a title bar (a fixed title and fixed controls; it takes groups too), a toolbar (views,
 * tools, zoom), a status bar between the columns (a centered readout and a search group at the end), a left column
 * (pages), a right column (findings, marks) and one float (notes). Panels: pages, findings, notes. Groups: views,
 * tools, zoom, search, marks. Ages: pages 1, findings 2, notes 3, views 4, tools 5, zoom 6, search 7, marks 8.
 */
export function doc(o: DocOptions = {}): DockState {
  return {
    stage: { x: 0, y: 0, width: o.width ?? 1200, height: o.height ?? 800 },
    edges: [
      { id: "titlebar", side: "top", ring: 0, accepts: ["group"], items: ["title", "controls"], cross: { min: 32, max: 32, rail: 32 } },
      bar("toolbar", "top", 1, ["views", "tools", "zoom"]),
      bar("status", "bottom", 0, ["readout", "search"], { span: "between", cross: { min: 28, max: 28, rail: 28 } }),
      column("left", "left", 0, ["pages"]),
      column("right", "right", 0, ["findings", "marks"]),
    ],
    items: byId([
      title(),
      controls(),
      readout(),
      panel("pages", 1),
      panel("findings", 2),
      panel("notes", 3),
      group("views", 4),
      group("tools", 5),
      group("zoom", 6, { align: "end" }),
      group("search", 7, { align: "end" }),
      group("marks", 8),
    ]),
    floats: [{ id: "notes", rect: { x: 500, y: 200, width: 280, height: 320 } }],
    floatKinds: ["panel", "group"],
  };
}

/** `state` with `patch` merged into the edge. */
export function tweakEdge(state: DockState, id: string, patch: Partial<DockEdge>): DockState {
  return { ...state, edges: state.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
}
