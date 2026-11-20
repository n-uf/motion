/**
 * The home hero's docking illustration: the lab's Document window (apps/lab/src/docwin), drawn static. A faithful, trimmed
 * copy of what the lab does, with its class names prefixed `hd-` (this site's home has its own `dw-` desk classes):
 *
 * - **The scene** is the lab's `defaultScene` (docwin/model.ts) of `@n-uf/placement/scene` today (a `DockState` of
 *   `@n-uf/docking` after the coming release): the title bar (a fixed title, the Zoom toolbar, the window controls), the
 *   bottom bar (Views and Review), a left column (Pages above Notes), a right column (Findings) and Tools floating at the
 *   content's top-right corner. `solve` gives every rect and the form each item took at this size.
 * - **The drawing** is the lab's own markup (docwin/scene.ts: `inner`, `groupContent`, `body`, `head`, `itemHtml`) with the
 *   buttons as plain spans, and its CSS (styles/hero-doc.css, from docwin.css). Static: nothing in it is a control.
 * - **The group sizes** are what the lab measures from its rendered buttons on start (`measureGroups`); here they are
 *   measured once from this copy at the lab's font (12 px) and written down (`MEASURED`).
 */
import type { Rect, Size } from "@n-uf/placement";
import { solve, type Edge, type Scene, type SceneItem, type SceneLayout } from "@n-uf/placement/scene";
import type { StackForm } from "@n-uf/placement/stack";
import { MEASURED, TITLE_SIZES } from "./hero-doc-measured";

type PanelId = "pages" | "notes" | "findings";
type GroupId = "zoom" | "tools" | "views" | "review";
type ItemId = PanelId | GroupId | "title" | "controls";
type EdgeId = "title" | "top" | "left" | "right" | "bottom" | "rail-left" | "rail-right";
const PANELS: readonly PanelId[] = ["pages", "notes", "findings"];
const GROUPS: readonly GroupId[] = ["zoom", "tools", "views", "review"];
const ALL: readonly ItemId[] = [...PANELS, ...GROUPS, "title", "controls"];

const COUNTS = { notes: 2, findings: 20, marked: 22, pages: 12, zoom: 86 };
const BAR = 32;
const BAR_INSET = 8;
// The lab's columns ask for 240 px (at least 180); this miniature asks for 128 (at least 104), so the page keeps its room.
const COL_MIN = 104;
const COL_NATURAL = 128;
const COL_WIDE = 400;
const RAIL = 30;

/** What the lab measures from its buttons: each group's sizes and each panel's rail title length (see `MEASURED`). */
interface Measure {
  readonly row: number;
  readonly words: readonly number[];
  readonly gap: number;
  readonly wrapRow: number;
  readonly lead: number;
  readonly icons: { readonly width: number; readonly height: number };
  readonly iconsRow: number;
  readonly fold: number;
  readonly variants: readonly number[];
}

const form = (kind: StackForm["kind"], main: number | { min: number; natural: number; grows?: boolean }, cross: number, extra: Partial<StackForm> = {}): StackForm => ({
  kind,
  main: typeof main === "number" ? { min: main, natural: main } : main,
  cross: { natural: cross },
  ...extra,
});
const MENU = form("menu", 0, 0);

const TITLES: Record<ItemId, string> = { pages: "Pages", notes: "Notes", findings: "Findings", zoom: "Zoom", tools: "Tools", views: "Views", review: "Review", title: "Title", controls: "Window controls" };
const ZOOM_CONTROLS: readonly { readonly id: string | null; readonly label: string }[] = [{ id: "-", label: "−" }, { id: null, label: "" }, { id: "+", label: "+" }, { id: "fit", label: "H-FIT" }];
/** Zoom's compact row variants, by the controls each hides. */
const ROW_VARIANTS: Readonly<Partial<Record<GroupId, readonly (readonly string[])[]>>> = { zoom: [["fit"], ["-", "+", "fit"]] };

const m = (id: GroupId): Measure => MEASURED[id];
const railForms = (id: PanelId): StackForm[] => [{ ...form("rail", TITLE_SIZES[id], 28), title: true }, form("rail", 28, 28)];
const panelColumn = (id: PanelId): StackForm[] => {
  const open: Record<PanelId, { min: number; natural: number }> = { pages: { min: 160, natural: 320 }, notes: { min: 120, natural: 200 }, findings: { min: 140, natural: 260 } };
  return [form("open", { ...open[id], grows: true }, COL_NATURAL, { cross: { natural: COL_NATURAL, min: COL_MIN } }), form("header", 32, COL_NATURAL, { cross: { natural: COL_NATURAL, min: 60 } }), ...railForms(id), MENU];
};
const wrap = (id: GroupId): StackForm => ({ kind: "wrap", main: { min: 0, natural: 0 }, cross: { natural: 0 }, wrap: { widths: [...m(id).words], gap: m(id).gap, lead: m(id).lead, row: m(id).wrapRow } });
const icons = (id: GroupId): StackForm => form("icons", m(id).icons.height, m(id).icons.width, { grip: 16 });
const groupColumn = (id: GroupId): StackForm[] => [form("row", 32, m(id).row), wrap(id), icons(id), MENU];
const groupRow = (id: GroupId): StackForm[] => [
  form("row", m(id).row, BAR),
  ...(ROW_VARIANTS[id] ?? []).map((hides, i) => form("row", m(id).variants[i]!, BAR, { hides })),
  ...(id === "views" || id === "review" ? [form("icons", m(id).iconsRow, BAR)] : []),
  form("fold", m(id).fold, BAR),
  MENU,
];
const isPanel = (id: string): id is PanelId => (PANELS as readonly string[]).includes(id);
const isGroup = (id: string): id is GroupId => (GROUPS as readonly string[]).includes(id);
const floatSize = (id: PanelId | GroupId): Size => (isPanel(id) ? { width: 260, height: 300 } : { width: m(id).row, height: BAR });
const PRIORITY: Partial<Record<GroupId, number>> = { zoom: 10, review: 10 };

function itemOf(id: ItemId, used: number): SceneItem {
  if (isPanel(id)) return { id, kind: "panel", forms: { column: panelColumn(id) }, floatSize: floatSize(id), used };
  if (isGroup(id)) return { id, kind: "group", forms: { row: groupRow(id), column: groupColumn(id) }, floatSize: floatSize(id), used, ...(PRIORITY[id] !== undefined ? { priority: PRIORITY[id] } : {}) };
  if (id === "title") return { id, kind: "chrome", forms: { row: [form("row", { min: 140, natural: 220, grows: true }, BAR)] }, used: 0, fixed: true };
  return { id, kind: "chrome", forms: { row: [form("row", 3 * 22 + 8, BAR)] }, used: 0, fixed: true, align: "end" };
}
const bar = (id: EdgeId, side: "top" | "bottom", ring: number, items: ItemId[]): Edge => ({ id, side, ring, accepts: ["group"], items, cross: { min: BAR, max: BAR, rail: BAR }, gap: 8, pad: { start: BAR_INSET, end: BAR_INSET } });
const rail = (id: EdgeId, side: "left" | "right", items: ItemId[]): Edge => ({ id, side, ring: 0, accepts: ["group"], items, cross: { min: RAIL, max: RAIL, rail: RAIL }, compact: true, gap: 4, pad: { start: 4, end: 4 } });
const column = (id: EdgeId, side: "left" | "right", items: ItemId[]): Edge => ({
  id,
  side,
  ring: 1,
  accepts: ["panel", "group"],
  zoneAccepts: { start: ["panel"], end: ["group"] },
  items,
  cross: { min: COL_MIN, max: COL_WIDE, rail: RAIL },
  gap: 6,
  pad: { start: 6, end: 6 },
});

/** The lab's default layout at `size`: Pages above Notes on the left, Findings on the right, Zoom in the title bar, Views and Review in the bottom bar, Tools floating at the content's top-right corner. */
function defaultScene(size: Size): Scene {
  const order: ItemId[] = ["findings", "review", "views", "zoom", "tools", "notes", "pages", "title", "controls"];
  const items = Object.fromEntries(ALL.map((id) => [id, itemOf(id, order.indexOf(id) + 1)])) as Record<ItemId, SceneItem>;
  return {
    stage: { x: 0, y: 0, width: size.width, height: size.height },
    edges: [{ ...bar("title", "top", 0, ["title", "zoom", "controls"]), priority: -1 }, bar("top", "top", 1, []), column("left", "left", ["pages", "notes"]), column("right", "right", ["findings"]), bar("bottom", "bottom", 0, ["views", "review"]), rail("rail-left", "left", []), rail("rail-right", "right", [])],
    items,
    floats: [{ id: "tools", rect: { x: 0, y: 0, width: floatSize("tools").width, height: floatSize("tools").height }, anchor: "content-top-right" }],
    floatKinds: ["panel", "group"],
  };
}

// ---- The lab's markup (docwin/scene.ts), static ---------------------------------------------------------------------------
const px = (n: number): string => `${Math.round(n * 100) / 100}px`;
const esc = (t: string): string => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const badge = (n: number): string => `<span class="hd-badge">${n}</span>`;
const countOf = (id: ItemId): number | null => (id === "pages" ? COUNTS.pages : id === "notes" ? COUNTS.notes : id === "findings" ? COUNTS.findings : null);

function body(id: ItemId): string {
  if (id === "pages") return `<div class="hd-thumbs">${Array.from({ length: COUNTS.pages }, (_, i) => `<i><span>${i + 1}</span></i>`).join("")}</div>`;
  const n = Math.min(40, id === "notes" ? COUNTS.notes : COUNTS.findings);
  const word = id === "notes" ? "Note" : "Finding";
  return `<ul class="hd-list">${Array.from({ length: n }, (_, i) => `<li><b>${word} ${i + 1}</b><span>page ${(i % COUNTS.pages) + 1}</span></li>`).join("")}</ul>`;
}
function head(id: ItemId): string {
  const c = countOf(id);
  return `<header class="hd-head"><span class="hd-dots" aria-hidden="true"></span><b>${TITLES[id]}</b>${c === null ? "" : badge(c)}<span class="hd-pm">⋯</span><span class="hd-x">×</span></header>`;
}
function groupWords(id: ItemId, hidden: readonly string[] = []): string[] {
  if (id === "tools") return Array.from({ length: 5 }, () => `<span class="hd-tool"><i></i></span>`);
  if (id === "zoom") return ZOOM_CONTROLS.filter((c) => c.id === null || !hidden.includes(c.id)).map((c) => (c.id === null ? `<span class="hd-zv">${COUNTS.zoom}%</span>` : `<span class="${c.id === "fit" ? "hd-fit" : "hd-w"}">${c.label}</span>`));
  if (id === "views") return (["pages", "notes", "findings"] as const).map((p) => `<span class="hd-w hd-word">${TITLES[p]}${p === "pages" ? "" : ` <span class="hd-n">${countOf(p)}</span>`}</span>`);
  return [`<span class="hd-w"><span class="hd-n">${COUNTS.marked}</span> marked</span>`, `<span class="hd-w">Original</span>`, `<span class="hd-w" aria-pressed="true">Marked</span>`, `<span class="hd-w">⬇</span>`];
}
function wordRow(id: ItemId, words: string[]): string {
  if (id === "views") return words.join('<span class="hd-sep">·</span>');
  if (id === "review") return `<span class="hd-cap">${words.join("")}</span>`;
  return words.join("");
}
const moreCell = (hidden: readonly string[]): string => (hidden.length === 0 ? "" : `<span class="hd-more"><span class="hd-chev" aria-hidden="true">»</span><span class="hd-cnt" aria-hidden="true">${hidden.length}</span></span>`);
function groupContent(id: ItemId, kind: string, hidden: readonly string[] = []): string {
  const sq = (label: string): string => `<span class="hd-sq">${label}</span>`;
  if (kind === "icons") {
    if (id === "tools") return groupWords(id).join("");
    if (id === "zoom") return sq("−") + sq("+") + sq("F");
    if (id === "views") return (["pages", "notes", "findings"] as const).map((p) => `<span class="hd-sq hd-sq-n">${TITLES[p][0]!}${p === "pages" ? "" : `<small>${countOf(p)}</small>`}</span>`).join("");
    return sq("M") + sq("O") + sq("R") + sq("⬇");
  }
  return wordRow(id, groupWords(id, hidden)) + moreCell(hidden);
}
const railTitle = (id: ItemId, side: "left" | "right"): string => {
  const c = countOf(id);
  return `<span class="hd-railbtn hd-railtitle hd-rt-${side}"><span class="hd-rt">${TITLES[id]}${c === null ? "" : badge(c)}</span></span>`;
};
function inner(it: SceneItem, id: ItemId, kind: string, rows?: readonly (readonly number[])[], hidden: readonly string[] = [], titleSide?: "left" | "right"): string {
  if (it.kind === "chrome") return id === "title" ? '<span class="hd-title-t">Document title</span>' : '<span class="hd-ctl"></span><span class="hd-ctl"></span><span class="hd-ctl"></span>';
  if (it.kind === "panel") {
    if (kind === "open") return head(id) + `<div class="hd-body">${body(id)}</div>`;
    if (kind === "header") return head(id);
    if (titleSide) return railTitle(id, titleSide);
    const c = countOf(id);
    return `<span class="hd-railbtn">${TITLES[id][0]}${c === null ? "" : badge(c)}</span>`;
  }
  if (kind === "fold") return `<span class="hd-dots" aria-hidden="true"></span><span class="hd-sq">»</span>`;
  if (kind === "wrap" && rows) {
    const words = groupWords(id);
    return `<span class="hd-dots" aria-hidden="true"></span><div class="hd-gc hd-wrapbox">${rows.map((row) => `<div class="hd-wrow">${wordRow(id, row.map((i) => words[i] ?? ""))}</div>`).join("")}</div>`;
  }
  return `<span class="hd-dots" aria-hidden="true"></span><div class="hd-gc">${groupContent(id, kind, hidden)}</div>`;
}
function itemHtml(s: Scene, l: SceneLayout, id: ItemId): string {
  const p = l.items[id]!;
  const it = s.items[id]!;
  const edgeSide = p.edge ? l.edges[p.edge]?.side : undefined;
  const axis = edgeSide ? (edgeSide === "left" || edgeSide === "right" ? "column" : "row") : "row";
  const cls = `hd-item hd-${p.kind} hd-k-${p.formKind} hd-ax-${axis}${p.floating ? " hd-float" : ""}`;
  const r = p.rect;
  return `<section class="${cls}" style="left:${px(r.x)};top:${px(r.y)};width:${px(r.width)};height:${px(r.height)}">${inner(it, id, p.formKind, p.rows, p.hidden, p.railTitle)}</section>`;
}

export interface DocWindow {
  /** The window's inner HTML (what the lab draws into its `dw-win`). */
  readonly html: string;
  readonly size: Size;
  /** What `solve` gave: each item's form, for the page's own words. */
  readonly forms: Readonly<Record<string, string>>;
  /** The middle (the page), as solved. */
  readonly content: Rect;
}

/** The lab's Document window at `size`, solved and drawn. */
export function docWindow(size: Size): DocWindow {
  const s = defaultScene(size);
  const l = solve(s);
  const edges = Object.entries(l.edges)
    .filter(([, e]) => e.rect.width > 0 && e.rect.height > 0)
    .map(([id, e]) => `<div class="${e.side === "left" || e.side === "right" ? "hd-colbg" : "hd-bar"}" data-edge="${esc(id)}" style="left:${px(e.rect.x)};top:${px(e.rect.y)};width:${px(e.rect.width)};height:${px(e.rect.height)}"></div>`)
    .join("");
  const c: Rect = l.content;
  const w = Math.max(80, Math.min(c.width - 40, 640) * (COUNTS.zoom / 86));
  const sheets = Array.from({ length: 2 }, (_, i) => `<div class="hd-sheet" style="width:${px(w)};height:${px(w * 1.3)}"><span>${i + 1}</span><i></i><i></i><i></i><i></i></div>`).join("");
  const scroll = `<div class="hd-scroll" style="left:${px(c.x)};top:${px(c.y)};width:${px(c.width)};height:${px(c.height)}"><div class="hd-sheets">${sheets}</div></div>`;
  const docked = (Object.keys(l.items) as ItemId[]).filter((id) => !l.items[id]!.floating && !l.items[id]!.inMenu).map((id) => itemHtml(s, l, id));
  const floats = l.floats.map((id) => itemHtml(s, l, id as ItemId));
  const menus = Object.keys(l.edges).flatMap((e) => {
    const menu = l.edges[e]?.menu;
    return menu ? [`<span class="hd-menu" style="left:${px(menu.rect.x)};top:${px(menu.rect.y)};width:${px(menu.rect.width)};height:${px(menu.rect.height)}">» ${menu.items.length}</span>`] : [];
  });
  const html = `<div class="hd-edges">${edges}</div>${scroll}<div class="hd-items">${docked.join("")}${menus.join("")}${floats.join("")}</div>`;
  const forms = Object.fromEntries(Object.entries(l.items).map(([id, it]) => [id, it.inMenu ? "menu" : it.formKind]));
  return { html, size, forms, content: l.content };
}

