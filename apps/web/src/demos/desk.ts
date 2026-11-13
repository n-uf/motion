/**
 * Desk layouts: nine ways to lay out a toolbar, five tool panels and the open documents, and the drawing of a layout
 * as an SVG string. Four are @n-uf/placement/desk's presets (docks, docksFull, dockTear, navigator), laid out by
 * `presetLayout` on ./panels and mapped to the drawing here; the other five are sketches this site draws with its own
 * rules. Pure, so the server renders the default desk and the island renders every later state with the same code.
 */
import { PRESETS, presetLayout, type PresetId } from "@n-uf/placement/desk";
import { float, type PanelDef, type PanelsNote, type PanelsOptions } from "@n-uf/placement/panels";

export const G = 6, BAR = 34, RAIL = 34, TITLE = 22;
export const PANELS: Record<string, number> = { Files: 130, Outline: 110, Notes: 100, Inspector: 100, History: 150 };
export const LEFT = ["Files", "Outline"], RIGHT = ["Notes", "Inspector", "History"];
export const DOCS = ["Quarterly plan", "Meeting notes", "Reading list", "Budget draft"];
export const DOC_MIN = { w: 240, h: 160 };

export type Kind = "toolbar" | "panel" | "header" | "rail" | "tabs" | "tabsFloat" | "doc" | "float" | "palette" | "track" | "thumb";
export interface Box {
  x: number; y: number; w: number; h: number; kind: Kind; label: string;
  /** What the glide follows it by, when not its label (a panel keeps its key as it moves between a column and the band). */
  key?: string;
  round?: boolean; shadow?: boolean; accent?: boolean; noTitle?: boolean;
  /** A rail's icons, and each one's top inside the rail (default: every 32 px from 6). */
  icons?: string[]; iconY?: number[]; side?: string; tabs?: string[]; active?: string;
}
/** The stage's switches: the toolbar (top or bottom; room kept clear or over the documents) and the bottom band. */
export interface Opt { toolbar: string; toolbarSpace: string; band: string; span: string }
export type Area = { x: number; y: number; w: number; h: number };

const box = (x: number, y: number, w: number, h: number, kind: Kind, label: string, extra: Partial<Box> = {}): Box => ({ x, y, w, h, kind, label, ...extra });
export const OPT: Opt = { toolbar: "top", toolbarSpace: "reserved", band: "reserved", span: "between" };

/** A toolbar pill floating at the top or the bottom of the region [y0, y1]; returns the pill and the band left for documents. */
function pill(cx: number, cw: number, H: number, y0 = 0, y1 = H): { box: Box; top: number; bottom: number } {
  const pw = Math.min(320, cw - 24), ph = BAR - 4;
  const atTop = OPT.toolbar === "top";
  // Reserved: the documents keep a band clear for the pill. Overlay: the pill floats over them and takes no space.
  const overlay = OPT.toolbarSpace === "overlay";
  return {
    box: box(cx + cw / 2 - pw / 2, atTop ? y0 + G : y1 - G - ph, pw, ph, "toolbar", "Toolbar", { round: true, shadow: overlay }),
    top: atTop && !overlay ? y0 + BAR + 2 * G : y0 + G,
    bottom: !atTop && !overlay ? y1 - BAR - 2 * G : y1 - G,
  };
}

/** Master and stack: the first document takes the left part, the rest stack on the right. */
function tiles(r: Area, names: string[]): Box[] {
  if (names.length === 0) return [];
  if (names.length === 1) return [box(r.x, r.y, r.w, r.h, "doc", names[0]!)];
  const mw = Math.round((r.w - G) * 0.56);
  const out = [box(r.x, r.y, mw, r.h, "doc", names[0]!)];
  const rest = names.slice(1);
  const sh = (r.h - G * (rest.length - 1)) / rest.length;
  rest.forEach((n, i) => out.push(box(r.x + mw + G, r.y + i * (sh + G), r.w - mw - G, sh, "doc", n)));
  return out;
}

interface Leaf { label: string; kind: Kind; where: "L" | "R" | "C"; born: number }
/** Dwindle: each new tile splits the last one along its longer side. */
function dwindle(r: Area, names: Leaf[]): Box[] {
  const out: Box[] = [];
  let cur = { ...r };
  names.forEach((n, i) => {
    if (i === names.length - 1) {
      out.push(box(cur.x, cur.y, cur.w, cur.h, n.kind, n.label));
      return;
    }
    if (cur.w >= cur.h) {
      const w = (cur.w - G) / 2;
      out.push(box(cur.x, cur.y, w, cur.h, n.kind, n.label));
      cur = { x: cur.x + w + G, y: cur.y, w, h: cur.h };
    } else {
      const h = (cur.h - G) / 2;
      out.push(box(cur.x, cur.y, cur.w, h, n.kind, n.label));
      cur = { x: cur.x, y: cur.y + h + G, w: cur.w, h };
    }
  });
  return out;
}

// ---- The presets: @n-uf/placement/desk lays them out, this maps the layout to boxes -----------------------------------

/** The five panels as the panels engine sees them: widths, section heights, a band height and a float size. History may go to the bottom band. */
const def = (id: string, natural: number, sides?: PanelDef["sides"]): PanelDef => ({
  id,
  width: { min: 160, natural: 190, max: 300 },
  height: { min: 120, natural },
  band: { min: 100, max: 300, natural: 180 },
  float: { min: { width: 160, height: 120 }, natural: { width: 200, height: 150 } },
  ...(sides ? { sides } : {}),
});
export const PANEL_DEFS: readonly PanelDef[] = [def("Files", 170), def("Outline", 190), def("Notes", 150), def("Inspector", 170), def("History", 160, ["left", "right", "bottom"])];
/** Where they start: History in the band when it is on (else on the right, before Inspector, so dockTear tears Inspector off either way). */
const PRESET_RIGHT = ["Notes", "History", "Inspector"];
/** The drawing's chrome sizes, handed to the layout so its bars and rails are the size they are drawn. */
const CHROME: Partial<PanelsOptions> = { rail: RAIL, bar: TITLE, segment: 32, railInset: 6 };
/** The toolbar room kept clear when the toolbar is reserved: the pill and a gap above and below it. */
const ROOM = BAR + 2 * G;

/** Each layout note in this page's words; the code is the library's. */
function noteText(n: PanelsNote): string {
  const who = (ids: readonly string[]): string => ids.join(" + ");
  const px = (v: number): string => `${Math.round(v)} px`;
  switch (n.code) {
    case "column-shrunk": return `the ${n.side} column narrowed from ${px(n.from)} to ${px(n.to)}`;
    case "column-folded": return `the ${n.side} column (${who(n.items)}) folded to its rail`;
    case "kept-folded": return "edge" in n ? `the kept ${n.edge} band folded to a bar` : `the kept ${n.side} column folded to its rail`;
    case "section-folded": return `${who(n.items)} folded to ${n.items.length > 1 ? "title bars" : "a title bar"}: the ${n.side} column ran short`;
    case "pages-under-min": return `the documents are ${px(n.width)} wide, under their ${px(n.min)} minimum, with every column folded`;
    case "float-clamped": return `${who(n.items)} moved to stay in view`;
    case "float-resized": return `${who(n.items)} resized to fit the view`;
    case "band-shrunk": return `the ${n.edge} band shrank from ${px(n.from)} to ${px(n.to)}`;
    case "band-folded": return `the ${n.edge} band folded to a bar`;
    case "band-off": return `${who(n.items)} ${n.items.length > 1 ? "are" : "is"} hidden: the ${n.edge} band is off`;
    case "pages-short": return `the documents are ${px(n.height)} tall, under their ${px(n.min)} minimum`;
  }
}

/** One line of what gave way: the page's words, and the library's note code when there is one. */
export interface Note { text: string; code?: string }

/**
 * Lay preset `id` out with `presetLayout` at W × H and draw it: columns, rails and tab strips, the bottom band
 * (outlined), floats, then the documents in the pages' rect and the toolbar pill in the room kept for it (or over the
 * documents). Every rect comes from the layout; the drawing only insets them by half a gap.
 */
function presetDesk(id: PresetId, W: number, H: number, n: number, o: Opt): { boxes: Box[]; notes: Note[] } {
  const preset = PRESETS[id];
  const hasBand = !!preset.options.bands?.bottom;
  const band = hasBand && o.band !== "off" ? { mode: o.band as "reserved" | "overlay", span: o.span as "between" | "full" } : null;
  let state = preset.start(PANEL_DEFS, { left: LEFT, right: PRESET_RIGHT, bottom: band ? ["History"] : [] });
  const toolbar = o.toolbar === "bottom" ? "bottom" : "top";
  const reserved = o.toolbarSpace !== "overlay";
  // The torn-off panel starts next to the left column (the preset's place), moved down clear of a top toolbar.
  const torn = state.floats[0];
  if (torn && toolbar === "top") state = float(state, torn.id, { ...torn.rect, y: torn.rect.y + ROOM });
  const options: Partial<PanelsOptions> = { ...CHROME, reserve: reserved ? { [toolbar]: ROOM } : {}, ...(hasBand ? { bands: band ? { bottom: band } : {} } : {}) };
  const l = presetLayout(preset, PANEL_DEFS, state, { width: W, height: H }, options);

  const out: Box[] = [];
  const d = G / 2;
  const inset = (r: { x: number; y: number; width: number; height: number }, top = d, bottom = d): Area => ({ x: r.x + d, y: r.y + top, w: Math.max(0, r.width - 2 * d), h: Math.max(0, r.height - top - bottom) });
  const at = (a: Area, kind: Kind, label: string, extra: Partial<Box> = {}): Box => box(a.x, a.y, a.w, a.h, kind, label, extra);

  for (const side of ["left", "right"] as const) {
    const r = l.rails[side];
    if (r) out.push(box(r.rect.x, r.rect.y, r.rect.width, r.rect.height, "rail", "", { key: `rail:${side}`, side, icons: r.segments.map((s) => s.id), iconY: r.segments.map((s) => s.rect.y - r.rect.y) }));
  }
  for (const c of l.columns) if (c.strip) out.push(at(inset(c.strip, d, 0), "tabs", "", { key: `tabs:${c.side}:${c.index}`, tabs: [...c.panels], active: c.active }));
  const overlayBand = l.bands.bottom?.mode === "overlay";
  for (const [pid, p] of l.items) {
    if (p.hidden || p.kind === "segment") continue;
    if (p.kind === "column") out.push(at(p.tab ? inset(p.rect, 0) : inset(p.rect), "panel", pid, { noTitle: !!p.tab }));
    else if (p.kind === "band") out.push(at(inset(p.rect), overlayBand ? "float" : "panel", pid, { accent: true }));
    else if (p.kind === "bar") out.push(at(inset(p.rect, 1, 1), "header", pid, { accent: !!p.edge }));
    else if (p.kind === "float") out.push(at(inset(p.rect), "float", `${pid} (torn off)`, { key: pid }));
  }
  // Floats on top, as their layer says; the documents under everything else.
  out.sort((a, b) => Number(a.kind === "float" && !a.accent) - Number(b.kind === "float" && !b.accent));
  const docs = inset(l.pages);
  out.unshift(...tiles(docs, DOCS.slice(0, n)));

  const pw = Math.min(320, docs.w - 24), ph = BAR - 4;
  const room = l.reserved[toolbar];
  let py: number;
  if (reserved && room) py = room.y + (room.height - ph) / 2;
  else if (toolbar === "top") py = l.pages.y + G;
  else py = (overlayBand && l.bands.bottom ? l.bands.bottom.rect.y : l.pages.y + l.pages.height) - G - ph;
  out.push(box(docs.x + docs.w / 2 - pw / 2, py, pw, ph, "toolbar", "Toolbar", { round: true, shadow: !reserved }));
  return { boxes: out, notes: l.notes.map((note) => ({ text: noteText(note), code: note.code })) };
}

/** A sketch's rail; with a side it has the presets' key for that side's rail, so switching cards glides it. */
const railBox = (x: number, y: number, h: number, names: string[], side?: string): Box => box(x, y, RAIL, h, "rail", "", { icons: names, side, ...(side ? { key: `rail:${side}` } : {}) });

// ---- The sketches: five more ways this page draws by its own rules (no library preset lays them out) ------------------

type Build = (W: number, H: number, n: number, notes: string[]) => Box[];
export const C: Record<string, Build> = {
  tree(W, H, n, notes) {
    const out = [box(0, 0, W, BAR, "toolbar", "Toolbar")];
    const area = { x: G, y: BAR + G, w: W - 2 * G, h: H - BAR - 2 * G };
    // Leaves with an age; the newest leaf that breaks a minimum floats, then the tree is laid out again.
    const leaves: Leaf[] = [
      { label: "Files", kind: "panel", where: "L", born: 1 }, { label: "Outline", kind: "panel", where: "L", born: 3 },
      { label: "Notes", kind: "panel", where: "R", born: 2 }, { label: "History", kind: "panel", where: "R", born: 5 },
      { label: DOCS[0]!, kind: "doc", where: "C", born: 10 }, { label: "Inspector", kind: "panel", where: "C", born: 4 },
      ...DOCS.slice(1, n).map((d, i): Leaf => ({ label: d, kind: "doc", where: "C", born: 11 + i })),
    ];
    const minOf = (l: Leaf): { w: number; h: number } => (l.kind === "doc" ? DOC_MIN : { w: 150, h: PANELS[l.label]! });
    let tiled = [...leaves];
    const floats: Leaf[] = [];
    const lay = (): { l: Leaf; b: Box }[] => {
      const L = tiled.filter((l) => l.where === "L"), R = tiled.filter((l) => l.where === "R"), M = tiled.filter((l) => l.where === "C");
      const cw = 180, res: { l: Leaf; b: Box }[] = [];
      let x0 = area.x, x1 = area.x + area.w;
      const column = (list: Leaf[], x: number): void => {
        const sh = (area.h - G * (list.length - 1)) / list.length;
        list.forEach((l, i) => res.push({ l, b: box(x, area.y + i * (sh + G), cw, sh, l.kind, l.label) }));
      };
      if (L.length) { column(L, x0); x0 += cw + G; }
      if (R.length) { column(R, x1 - cw); x1 -= cw + G; }
      dwindle({ x: x0, y: area.y, w: x1 - x0, h: area.h }, M).forEach((b, i) => res.push({ l: M[i]!, b }));
      return res;
    };
    for (;;) {
      const res = lay();
      const bad = res.filter(({ l, b }) => b.w < minOf(l).w - 0.5 || b.h < minOf(l).h - 0.5);
      if (!bad.length || tiled.length <= 1) { out.push(...res.map((r) => r.b)); break; }
      const newest = tiled.reduce((a, b) => (b.born > a.born ? b : a));
      tiled = tiled.filter((l) => l !== newest);
      floats.push(newest);
    }
    floats.forEach((f, i) => {
      const m = f.kind === "doc" ? { w: 300, h: 190 } : { w: 200, h: PANELS[f.label]! + 50 };
      out.push(box(W / 2 - m.w / 2 + 22 * i, BAR + 40 + 22 * i, m.w, m.h, "float", f.label));
    });
    if (floats.length) notes.push(`${floats.length} tile${floats.length > 1 ? "s" : ""} float (newest first): ${floats.map((f) => f.label).join(", ")}`);
    return out;
  },

  strip(W, H, n, notes) {
    const out = [box(0, 0, W, BAR, "toolbar", "Toolbar")];
    const y = BAR + G, h = H - BAR - 2 * G, pw = 180, dw = Math.max(360, Math.min(520, W * 0.5));
    // Columns in order; a panel column whose minimums don't fit splits into two columns.
    const cols: { w: number; items: string[]; kind: Kind }[] = [];
    const panelCols = (names: string[]): string[][] => {
      const need = names.reduce((s, k) => s + PANELS[k]!, 0) + G * (names.length - 1);
      if (need <= h || names.length === 1) return [names];
      const half = Math.ceil(names.length / 2);
      notes.push(`${names.join(" + ")} split into two columns`);
      return [...panelCols(names.slice(0, half)), ...panelCols(names.slice(half))];
    };
    panelCols(LEFT).forEach((c) => cols.push({ w: pw, items: c, kind: "panel" }));
    DOCS.slice(0, n).forEach((d) => cols.push({ w: dw, items: [d], kind: "doc" }));
    panelCols(RIGHT).forEach((c) => cols.push({ w: pw, items: c, kind: "panel" }));
    const total = cols.reduce((s, c) => s + c.w, 0) + G * (cols.length + 1);
    // Focus the first document: centre it, clamped to the strip.
    let x = G, focusX = 0;
    cols.forEach((c) => { if (c.kind === "doc" && !focusX) focusX = x + c.w / 2; x += c.w + G; });
    const scroll = Math.max(0, Math.min(total - W, focusX - W / 2));
    x = G - scroll;
    for (const c of cols) {
      const sh = (h - G * (c.items.length - 1)) / c.items.length;
      c.items.forEach((it, i) => out.push(box(x, y + i * (sh + G), c.w, sh, c.kind, it)));
      x += c.w + G;
    }
    if (total > W) {
      notes.push(`the strip is ${Math.round(total)} wide: ${Math.round(total - W)} px off screen, reached by scrolling`);
      out.push(box(0, H - 5, W, 5, "track", ""), box((scroll / total) * W, H - 5, (W / total) * W, 5, "thumb", ""));
    }
    return out;
  },

  drawers(W, H, n, notes) {
    const out = [box(0, 0, W, BAR, "toolbar", "Toolbar")];
    const y = BAR, h = H - BAR, lw = 200, rw = 220;
    const rDocked = W >= 1040, lDocked = W >= 760;
    if (!rDocked) notes.push("right drawer slides over the documents");
    if (!lDocked) notes.push("left drawer slides over too");
    out.push(railBox(0, y, h, LEFT, "left"), railBox(W - RAIL, y, h, RIGHT, "right"));
    const x0 = RAIL + (lDocked ? lw : 0) + G, x1 = W - RAIL - (rDocked ? rw : 0) - G;
    out.push(...tiles({ x: x0, y: y + G, w: x1 - x0, h: h - 2 * G }, DOCS.slice(0, n)));
    const drawer = (x: number, w: number, names: string[], active: string, docked: boolean): void => {
      out.push(box(x, y, w, 28, docked ? "tabs" : "tabsFloat", "", { key: `tabs:${x < W / 2 ? "left" : "right"}:0`, tabs: names, active }));
      out.push(box(x, y + 28, w, h - 28, docked ? "panel" : "float", active, { noTitle: true }));
    };
    drawer(RAIL, lw, LEFT, "Files", lDocked);
    drawer(W - RAIL - rw, rw, RIGHT, "Inspector", rDocked);
    return out;
  },

  /** F1: palettes float over the documents. */
  floatOver(W, H, n, notes) {
    const p = pill(G, W - 2 * G, H);
    const area = { x: G, y: p.top, w: W - 2 * G, h: p.bottom - p.top };
    const pals = palettes(area, W, 14, notes);
    const covered = pals.reduce((s, b) => s + b.w * b.h, 0) / (area.w * area.h);
    notes.push(`palettes cover ${Math.round(covered * 100)}% of the documents`);
    return [...tiles(area, DOCS.slice(0, n)), ...pals, p.box];
  },

  /** F2: palettes float, and the documents tile around them (the palettes reserve their footprint). */
  floatAround(W, H, n, notes) {
    const p = pill(G, W - 2 * G, H);
    const area = { x: G, y: p.top, w: W - 2 * G, h: p.bottom - p.top };
    const pals = palettes(area, W, 0, notes).map((b): Box => ({ ...b, kind: "palette" }));
    const left = pals.filter((b) => b.x < area.x + area.w / 2), right = pals.filter((b) => b.x >= area.x + area.w / 2);
    const x0 = left.length ? Math.max(...left.map((b) => b.x + b.w)) + G : area.x;
    const x1 = right.length ? Math.min(...right.map((b) => b.x)) - G : area.x + area.w;
    const docs = { x: x0, y: area.y, w: x1 - x0, h: area.h };
    const used = pals.reduce((s, b) => s + b.w * b.h, 0) + docs.w * docs.h;
    const empty = 1 - used / (area.w * area.h);
    notes.push(`documents get ${Math.round(docs.w)} px of width; ${Math.round(empty * 100)}% of the desk stays empty under short stacks`);
    return [...tiles(docs, DOCS.slice(0, n)), ...pals, p.box];
  },
};

/**
 * Palettes at their natural size, stuck to the top corners of `area` (`m` in from the edges); a stack too tall for
 * the area shades its least recently used palettes to their title bars. Narrow: the left stack joins the right one.
 */
function palettes(area: Area, W: number, m: number, notes: string[]): Box[] {
  const pw = Math.min(200, Math.max(140, W * 0.22));
  const avail = area.h - 2 * m;
  const narrow = W < 640;
  const stacks = narrow ? [[...LEFT, ...RIGHT]] : [LEFT, RIGHT];
  if (narrow) notes.push("both stacks share the right corner");
  const out: Box[] = [];
  let shaded = 0;
  stacks.forEach((names, si) => {
    const open = [...names];
    const need = (): number => names.reduce((s, k) => s + (open.includes(k) ? PANELS[k]! + 30 : TITLE), 0) + G * (names.length - 1);
    while (open.length > 1 && need() > avail) { open.shift(); shaded++; }
    const x = narrow || si === 1 ? area.x + area.w - m - pw : area.x + m;
    let y = area.y + m;
    for (const k of names) {
      const h = open.includes(k) ? PANELS[k]! + 30 : TITLE;
      out.push(box(x, y, pw, h, "float", k));
      y += h + G;
    }
  });
  if (shaded) notes.push(`${shaded} palette${shaded > 1 ? "s" : ""} shaded to ${shaded > 1 ? "title bars" : "a title bar"}`);
  return out;
}

const SKETCH = "<b>A sketch this page draws, not a library preset.</b> ";
/** The nine, in the page's order. `preset` names the @n-uf/placement/desk preset that lays a card out; the others are sketches. */
export const CARDS: { key: string; title: string; note: string; idea: string; preset?: PresetId; pick?: boolean }[] = [
  { key: "docks", preset: "docks", title: "A · Edge docks", note: "Preset docks: a column on each side, a bottom band between them.", idea: "Laid out live by the <code>docks</code> preset. Each side has one column of stacked sections; each section is as tall as it wants, and the last one takes the rest. When height runs out, the section used longest ago folds to its title bar. When width runs out, the columns narrow, then the oldest folds to its rail. <b>The bottom band (outlined) sits between the columns</b> and shortens the documents; on a short stage it gets lower, then folds to a bar." },
  { key: "docksFull", preset: "docksFull", title: "A2 · Full-width bottom band", note: "Preset docksFull: as A, with the band under everything.", idea: "Laid out live by the <code>docksFull</code> preset. The same as A except for one thing: <b>the bottom band (outlined) runs the full width</b>, and the columns and their rails stand on it. History gets the whole desk's width, which suits a log or a timeline; the columns are shorter." },
  { key: "tree", title: "B · One tiling tree", note: "Sketch: panels and documents are tiles; the newest that breaks a minimum floats.", idea: SKETCH + "Panels and documents are tiles of one tree, so a panel can sit beside a document. One rule for all: the newest tile that breaks a minimum floats." },
  { key: "navigator", preset: "navigator", title: "C · Navigator + inspector", note: "Preset navigator: tabs on the left, a stack on the right.", idea: "Laid out live by the <code>navigator</code> preset. The left column shows one panel at a time under a row of tabs; the right column is a stack of sections. There is no band and nothing floats. When width runs out, the columns narrow, then fold to their rails." },
  { key: "strip", title: "D · Scrolling strip", note: "Sketch: columns on a strip wider than the screen; the view scrolls.", idea: SKETCH + "Panels and documents are columns of a strip wider than the screen; nothing shrinks below its minimum, and the view scrolls to the focus instead. Short on height, a column splits in two." },
  { key: "drawers", title: "E · Drawers", note: "Sketch: drawers with tabs; wide they push, narrow they slide over.", idea: SKETCH + "Documents take the screen; each side is a drawer with tabs. Wide, the drawers dock and push the documents aside. Narrow, they slide over the documents." },
  { key: "floatOver", title: "F1 · Palettes over", note: "Sketch: palettes float over the documents, stuck to the top corners.", idea: SKETCH + "Documents take the whole desk; panels are palettes floating over them at their natural size, stuck to the top corners and draggable anywhere. The toolbar floats too (top or bottom). Short on height, the least recently used shade to their title bars; the documents never move." },
  { key: "floatAround", title: "F2 · Palettes, docs around", note: "Sketch: palettes float, and the documents tile around them.", idea: SKETCH + "Palettes float at their natural size, but they keep their footprint free: the documents tile in the space between them. Nothing is covered, and the space under a short stack stays empty." },
  { key: "dockTear", preset: "dockTear", title: "F3 · Docks + tear-off", pick: true, note: "Preset dockTear: A's docks, and any panel can float.", idea: "Laid out live by the <code>dockTear</code> preset: A's columns and bottom band, and any panel can be torn off to float over the documents, then dropped back on a column or a rail. Inspector starts torn off here. Docked is the default; floating is the exception you choose, and a float always stays in view." },
];


// ---- Drawing: an SVG string ---------------------------------------------------------------------------------------------
const css = (v: string): string => `var(--d-${v})`;
const STYLE: Record<Kind, { fill: string; stroke: string; text?: string; shadow?: boolean }> = {
  toolbar: { fill: css("ink"), stroke: "none", text: css("ink-text") },
  panel: { fill: css("panel"), stroke: css("panel-line"), text: "var(--text)" },
  header: { fill: css("panel-head"), stroke: css("panel-line"), text: "var(--text)" },
  rail: { fill: css("rail"), stroke: "none", text: "var(--text)" },
  tabs: { fill: css("panel-head"), stroke: "none", text: "var(--text)" },
  tabsFloat: { fill: css("float-head"), stroke: "none", text: "var(--text)" },
  doc: { fill: css("doc"), stroke: css("doc-line"), text: "var(--text)" },
  float: { fill: css("float"), stroke: css("float-line"), text: "var(--text)", shadow: true },
  palette: { fill: css("panel"), stroke: css("panel-line"), text: "var(--text)", shadow: true },
  track: { fill: "var(--line-2)", stroke: "none" },
  thumb: { fill: "var(--accent)", stroke: "none" },
};
const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const n1 = (v: number): string => (Math.round(v * 10) / 10).toString();
const tag = (name: string, attrs: Record<string, string | number>, body?: string): string =>
  `<${name}${Object.entries(attrs).map(([k, v]) => ` ${k}="${typeof v === "number" ? n1(v) : v}"`).join("")}${body === undefined ? "/>" : `>${body}</${name}>`}`;

/** The inner markup of the desk's <svg> (viewBox 0 0 W H) for these boxes; `id` keeps the clip and shadow ids unique. */
export function deskSVG(W: number, H: number, boxes: Box[], id = "desk"): string {
  const out: string[] = [];
  out.push(`<defs>${tag("clipPath", { id: `${id}-clip` }, tag("rect", { x: 0, y: 0, width: W, height: H }))}${tag("filter", { id: `${id}-sh`, x: "-20%", y: "-20%", width: "140%", height: "150%" }, tag("feDropShadow", { dx: 0, dy: 1, stdDeviation: 1, "flood-opacity": 0.08 }) + tag("feDropShadow", { dx: 0, dy: 8, stdDeviation: 9, "flood-opacity": 0.16 }))}</defs>`);
  out.push(tag("rect", { x: 0, y: 0, width: W, height: H, fill: css("floor") }));
  out.push(`<g clip-path="url(#${id}-clip)">`);
  for (const b of boxes) {
    const s = STYLE[b.kind];
    out.push(tag("rect", { x: b.x + 0.5, y: b.y + 0.5, width: Math.max(0, b.w - 1), height: Math.max(0, b.h - 1), rx: b.round ? b.h / 2 : 6, fill: s.fill, stroke: b.accent ? "var(--accent)" : s.stroke, "stroke-width": b.accent ? 2.5 : 1, ...(s.shadow || b.shadow ? { filter: `url(#${id}-sh)` } : {}) }));
    if ((b.kind === "panel" || b.kind === "float" || b.kind === "palette") && !b.noTitle && b.h > TITLE + 6) {
      const head = b.kind === "float" ? css("float-head") : css("panel-head");
      out.push(tag("path", { d: `M${n1(b.x + 1)} ${n1(b.y + TITLE)}V${n1(b.y + 7)}a6 6 0 0 1 6-6H${n1(b.x + b.w - 7)}a6 6 0 0 1 6 6V${n1(b.y + TITLE)}Z`, fill: head }));
      out.push(tag("line", { x1: b.x + 1, x2: b.x + b.w - 1, y1: b.y + TITLE + 0.5, y2: b.y + TITLE + 0.5, stroke: b.kind === "float" ? css("float-line") : css("panel-line") }));
    }
    if (b.kind === "rail") {
      (b.icons || []).forEach((name, i) => {
        const cy = b.y + (b.iconY?.[i] ?? 6 + i * 32) + 4;
        out.push(tag("rect", { x: b.x + 6.5, y: cy + 0.5, width: RAIL - 13, height: 23, rx: 5, fill: css("panel"), stroke: css("panel-line") }));
        out.push(tag("text", { x: b.x + RAIL / 2, y: cy + 16.5, "text-anchor": "middle", "font-size": 12, "font-weight": 650, fill: "var(--text-2)" }, esc(name[0]!)));
      });
      continue;
    }
    if (b.tabs) {
      const tw = b.w / b.tabs.length;
      b.tabs.forEach((name, i) => {
        if (name === b.active) out.push(tag("rect", { x: b.x + i * tw + 3, y: b.y + 4, width: tw - 6, height: b.h - 4, rx: 5, fill: b.kind === "tabsFloat" ? css("float") : css("panel") }));
        out.push(tag("text", { x: b.x + i * tw + tw / 2, y: b.y + 19, "text-anchor": "middle", "font-size": 12, fill: name === b.active ? "var(--text)" : "var(--text-2)", "font-weight": name === b.active ? 620 : 450 }, esc(tw > 70 ? name : name[0]!)));
      });
      continue;
    }
    if (b.label && b.w > 36) {
      const max = Math.floor((b.w - 14) / 7);
      const text = b.label.length > max ? b.label.slice(0, Math.max(1, max - 1)) + "…" : b.label;
      out.push(tag("text", { x: b.x + 9, y: b.y + (b.kind === "toolbar" ? b.h / 2 + 4.5 : 15.5), "font-size": b.kind === "doc" ? 13 : 12, "font-weight": b.kind === "doc" ? 600 : 620, fill: s.text ?? "var(--text)" }, esc(text)));
    }
    if (b.kind === "doc" && b.h > 60 && b.w > 80) for (let i = 0; i < Math.min(5, Math.floor((b.h - 34) / 16)); i++) out.push(tag("rect", { x: b.x + 10, y: b.y + 30 + i * 14, width: Math.max(10, (b.w - 20) * (i % 3 === 2 ? 0.55 : 0.85)), height: 5, rx: 2.5, fill: css("doc-rule") }));
  }
  out.push("</g>");
  return out.join("");
}

/**
 * Lay out card `key` at W × H with n documents and these options: a preset through `presetLayout`, a sketch by its
 * own rules. Returns the boxes and what gave way.
 */
export function layout(key: string, W: number, H: number, n: number, opts: Opt): { boxes: Box[]; notes: Note[] } {
  const preset = CARDS.find((c) => c.key === key)?.preset;
  if (preset) return presetDesk(preset, W, H, n, opts);
  Object.assign(OPT, opts);
  const notes: string[] = [];
  return { boxes: C[key]!(W, H, n, notes), notes: notes.map((text) => ({ text })) };
}

/** The status line under the stage, as HTML: each give-way line in the page's words, with the library's code after it. */
export function statusHTML(key: string, notes: Note[]): string {
  const sketch = !CARDS.find((c) => c.key === key)?.preset;
  if (!notes.length) return `<b>Everything fits</b> at its natural size${sketch ? " (sketch)" : ""}.`;
  const lines = notes.map((n) => esc(n.text) + (n.code ? ` <code>${n.code}</code>` : ""));
  return `<b>${sketch ? "Sketch, gives way:" : "Gives way:"}</b> ${lines.join("; ")}`;
}

/** Each box's key: its own key or label, or its kind and how many unkeyed boxes of that kind came before it. */
export function keyed(boxes: Box[]): Map<string, Box> {
  const seen = new Map<string, number>(), out = new Map<string, Box>();
  for (const b of boxes) {
    const own = b.key ?? b.label;
    if (own) { out.set(own, b); continue; }
    const k = seen.get(b.kind) ?? 0;
    seen.set(b.kind, k + 1);
    out.set(`${b.kind}#${k}`, b);
  }
  return out;
}

/** A card's switches at first: the toolbar at the top with its room kept clear, and the preset's own bottom band. */
export function defaultOpts(key: string): Opt {
  const band = key === "docks" || key === "docksFull" || key === "dockTear";
  return { toolbar: "top", toolbarSpace: "reserved", band: band ? "reserved" : "off", span: key === "docksFull" ? "full" : "between" };
}
export const DEFAULT = { W: 960, H: 560, n: 2 };

/** The cards with a toolbar pill to switch, and the presets with a bottom band. */
export const HAS_PILL = new Set(["docks", "docksFull", "navigator", "floatOver", "floatAround", "dockTear"]);
export const HAS_BAND = new Set(["docks", "docksFull", "dockTear"]);
/** The toolbar: top or bottom; "reserved" keeps room clear for it (a preset's `options.reserve`), "overlay" floats it over the documents. */
export const TOOLBAR_MODES: [string, string, string][] = [
  ["top", "reserved", "Top · reserved"],
  ["top", "overlay", "Top · floating"],
  ["bottom", "reserved", "Bottom · reserved"],
  ["bottom", "overlay", "Bottom · floating"],
];
/**
 * The bottom band (`options.bands.bottom`): off, reserved (it shortens the documents) or overlay (over them); while it
 * is on, one more toggle switches its span between the columns and the full width.
 */
export const BAND_MODES: [string, string][] = [
  ["off", "Off"],
  ["reserved", "Reserved"],
  ["overlay", "Overlay"],
];
export const FULL_WIDTH = "Full width";

// ---- The comparison table: one row per construction, one column per question -----------------------------------------
export const ASPECTS = ["Laid out by", "Toolbar", "Panels on one side", "Height runs out", "Width runs out", "Covers documents", "Things move by themselves", "Drop targets while dragging", "Known from"];
const PILL = "floating pill, top or bottom; reserved space or overlay";
const ROOM_PILL = "pill, top or bottom; room kept clear for it, or floating over the documents";
const SKETCHED = "a sketch on this page";
export const TABLE: Record<string, string[]> = {
  docks: ["preset docks", ROOM_PILL, "stacked sections at their natural heights; a bottom band between the columns", "the section used longest ago folds to its title bar; the band gets lower, then folds to a bar", "columns narrow, then the oldest folds to its rail", "never, unless you lay the band over them", "rarely: sections, columns and the band fold", "a new column, into a column, a rail, the bottom band", "IDE tool windows (panel \"centred\")"],
  docksFull: ["preset docksFull", "as A", "as A; the bottom band runs under the columns", "as A; the columns are shorter", "as A; the band keeps the full width", "as A", "rarely", "as A", "IDE tool windows (panel \"justified\")"],
  tree: [SKETCHED, "bar across the top", "tiles in the same tree as documents", "newest tile floats", "newest tile floats", "only floated tiles", "often: opening a document reshapes panels", "any tile edge", "tiling window managers"],
  navigator: ["preset navigator", ROOM_PILL, "left: tabs, one panel shows; right: stacked sections", "sections on the right fold to title bars; the tabs never change", "columns narrow, then fold to their rails", "never", "rarely: columns fold", "a new column, into a column (a tab on the left), a rail", "design tools"],
  strip: [SKETCHED, "bar across the top", "stacked in columns of the strip", "a column splits in two", "the strip scrolls", "never", "the view scrolls to the focus", "between columns, inside a column", "scrollable tiling window managers"],
  drawers: [SKETCHED, "bar across the top", "tabs: one panel per drawer", "nothing happens", "drawers slide over instead of pushing", "narrow only", "drawers switch at a width", "left / right tab rows", "tablet apps"],
  floatOver: [SKETCHED, PILL, "palettes stacked in a corner, or anywhere", "least-recent palettes shade to title bars", "palettes cover more; narrow, stacks merge in one corner", "always (shown under the stage)", "never", "anywhere (snap to corners, edges, palettes)", "creative tools' floating palettes"],
  floatAround: [SKETCHED, PILL, "palettes stacked in a corner, or anywhere", "least-recent palettes shade to title bars", "documents get narrower", "never; leaves empty space under short stacks", "documents re-tile when a palette moves", "anywhere (snap to corners, edges)", "window managers' \"struts\""],
  dockTear: ["preset dockTear", ROOM_PILL, "as A; any panel can float", "as A; a float stays in view", "as A", "what floats (Inspector starts torn off), or the band if you lay it over them", "rarely", "as A, or anywhere to float", "IDE tool windows (floating mode)"],
};
