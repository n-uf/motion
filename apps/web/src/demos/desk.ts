/**
 * Desk layouts: nine constructions that lay out a toolbar, five tool panels and the open documents, each by its own
 * rules, and the drawing of a layout as an SVG string. Pure, so the server renders the default desk and the island
 * renders every later state with the same code.
 */
export const G = 6, BAR = 34, RAIL = 34, TITLE = 22;
export const PANELS: Record<string, number> = { Files: 130, Outline: 110, Notes: 100, Inspector: 100, History: 150 };
export const LEFT = ["Files", "Outline"], RIGHT = ["Notes", "Inspector", "History"];
export const DOCS = ["Quarterly plan", "Meeting notes", "Reading list", "Budget draft"];
export const DOC_MIN = { w: 240, h: 160 };

export type Kind = "toolbar" | "panel" | "header" | "rail" | "tabs" | "tabsFloat" | "doc" | "float" | "palette" | "track" | "thumb";
export interface Box {
  x: number; y: number; w: number; h: number; kind: Kind; label: string;
  round?: boolean; shadow?: boolean; accent?: boolean; noTitle?: boolean;
  icons?: string[]; side?: string; tabs?: string[]; active?: string;
}
export interface Opt { toolbar: string; toolbarSpace: string; bottom: string; bottomSpace: string }
export type Area = { x: number; y: number; w: number; h: number };

const box = (x: number, y: number, w: number, h: number, kind: Kind, label: string, extra: Partial<Box> = {}): Box => ({ x, y, w, h, kind, label, ...extra });
export const OPT: Opt = { toolbar: "top", toolbarSpace: "reserved", bottom: "on", bottomSpace: "reserved" };

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

/** An accordion: sections share the height; the least recently used fold to headers until the open ones fit. */
function accordion(x: number, y: number, w: number, h: number, names: string[], notes: string[]): Box[] {
  const open = [...names];
  const need = (): number => names.reduce((s, n) => s + (open.includes(n) ? PANELS[n]! : TITLE), 0) + G * (names.length - 1);
  while (open.length > 1 && need() > h) open.shift();
  const spare = h - need();
  const weight = open.reduce((s, n) => s + PANELS[n]!, 0);
  const out: Box[] = [];
  let cy = y;
  for (const n of names) {
    const hh = open.includes(n) ? PANELS[n]! + spare * (PANELS[n]! / weight) : TITLE;
    out.push(box(x, cy, w, hh, open.includes(n) ? "panel" : "header", n));
    cy += hh + G;
  }
  const folded = names.length - open.length;
  if (folded) notes.push(`${folded} section${folded > 1 ? "s" : ""} folded to ${folded > 1 ? "headers" : "a header"}`);
  return out;
}

const railBox = (x: number, y: number, h: number, names: string[], side?: string): Box => box(x, y, RAIL, h, "rail", "", { icons: names, side });

type Build = (W: number, H: number, n: number, notes: string[]) => Box[];
export const C: Record<string, Build> & { docks: (W: number, H: number, n: number, notes: string[], right?: string[], mode?: string) => Box[] } = {
  /** A2: the same docks, with the bottom dock across the full width (the side docks end above it). */
  docksFull: (W, H, n, notes) => C.docks(W, H, n, notes, RIGHT, "full"),

  docks(W, H, n, notes, RIGHT_NAMES = RIGHT, bottomMode = "between") {
    const out: Box[] = [];
    const dock = 190, workMin = 380;
    // The bottom dock (History lives there when it is on): between the side docks, or across the full width with the
    // side docks ending above it. Short on height, it folds to its header like any section.
    const bottomOn = OPT.bottom !== "off";
    const right = bottomOn ? RIGHT_NAMES.filter((k) => k !== "History") : RIGHT_NAMES;
    const bh = !bottomOn ? 0 : H < 480 ? TITLE : PANELS.History! + 30;
    if (bottomOn && bh === TITLE) notes.push("bottom dock folded to its header");
    const full = bottomMode === "full";
    const y = 0, h = full ? H - bh - G : H;
    let lOpen = true, rOpen = true;
    const work = (): number => W - 2 * RAIL - (lOpen ? dock : 0) - (rOpen ? dock : 0) - 2 * G;
    if (work() < workMin) { rOpen = false; notes.push("right dock folded to its rail"); }
    if (work() < workMin) { lOpen = false; notes.push("left dock folded to its rail"); }
    out.push(railBox(0, y, h, LEFT, "left"), railBox(W - RAIL, y, h, right, "right"));
    if (lOpen) out.push(...accordion(RAIL + G, y + G, dock - G, h - 2 * G, LEFT, notes));
    if (rOpen) out.push(...accordion(W - RAIL - dock, y + G, dock - G, h - 2 * G, right, notes));
    const x0 = RAIL + (lOpen ? dock : 0) + G, x1 = W - RAIL - (rOpen ? dock : 0) - G;
    // Reserved: the documents end above the bottom dock. Overlay: it floats over the documents' lower part.
    const overlay = OPT.bottomSpace === "overlay";
    let docsBottom = H, bottomBox: Box | null = null;
    if (bottomOn) {
      const bx = full ? G : x0, bw = full ? W - 2 * G : x1 - x0;
      bottomBox = box(bx, H - G - bh, bw, bh, overlay ? "float" : bh === TITLE ? "header" : "panel", full ? "History · bottom dock, full width" : "History · bottom dock, between the side docks", { accent: true });
      if (!overlay) docsBottom = H - G - bh;
    }
    const p = pill(x0, x1 - x0, H, 0, overlay && bottomBox ? H - G - bh : docsBottom);
    out.push(...tiles({ x: x0, y: p.top, w: x1 - x0, h: (overlay ? H - G : p.bottom) - p.top }, DOCS.slice(0, n)));
    if (bottomBox) out.push(bottomBox);
    out.push(p.box);
    return out;
  },

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

  navigator(W, H, n, notes) {
    const out: Box[] = [];
    let lw = 200, rw = 220;
    const minCanvas = 380;
    if (W - lw - rw < minCanvas) { rw = RAIL; notes.push("inspector folded to icon tabs"); }
    if (W - lw - rw < minCanvas) { lw = RAIL; notes.push("navigator folded to icon tabs"); }
    const side = (x: number, w: number, names: string[], active: string): void => {
      if (w === RAIL) { out.push(railBox(x, 0, H, names)); return; }
      out.push(box(x, 0, w, 28, "tabs", "", { tabs: names, active }));
      out.push(box(x, 28, w, H - 28, "panel", active, { noTitle: true }));
    };
    side(0, lw, LEFT, "Files");
    side(W - rw, rw, RIGHT, "Inspector");
    const cx = lw + G, cw = W - lw - rw - 2 * G;
    const p = pill(cx, cw, H);
    out.push(...tiles({ x: cx, y: p.top, w: cw, h: p.bottom - p.top }, DOCS.slice(0, n)), p.box);
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
      out.push(box(x, y, w, 28, docked ? "tabs" : "tabsFloat", "", { tabs: names, active }));
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

  /** F3: edge docks, and any panel can be torn off to float (here: Inspector). */
  dockTear(W, H, n, notes) {
    const out = C.docks(W, H, n, notes, ["Notes", "History"]);
    const work = out.filter((b) => b.kind === "doc");
    const right = Math.max(...work.map((b) => b.x + b.w));
    const top = Math.min(...work.map((b) => b.y));
    out.push(box(right - 12 - 200, top + 40, 200, PANELS.Inspector! + 50, "float", "Inspector (torn off)"));
    notes.push("Inspector floats; drop it on a dock or its rail icon to dock it again");
    return out;
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

export const CARDS = [
  { key: "docks", title: "A · Edge docks", note: "Docks with rails on each side; the bottom dock sits between them.", idea: "Each side is a dock with a rail of icons. Panels in a dock are accordion sections; short on height, the least recently used fold to headers; short on width, a whole dock folds to its rail. <b>Bottom dock (outlined): between the side docks.</b> The side docks run down to the bottom edge; History is only as wide as the documents." },
  { key: "docksFull", title: "A2 · Full-width bottom dock", note: "As A, but the bottom dock runs under everything.", idea: "Same as A except one thing. <b>Bottom dock (outlined): full width, under everything.</b> The side docks and their rails stop above it; History is as wide as the whole desk (good for a log or a timeline), the side docks are shorter." },
  { key: "tree", title: "B · One tiling tree", note: "Panels and documents are tiles; the newest tile that breaks a minimum floats.", idea: "Panels and documents are tiles of one tree, so a panel can sit beside a document. One rule for all: the newest tile that breaks a minimum floats." },
  { key: "navigator", title: "C · Navigator + inspector", note: "One panel per side, as tabs; the sides fold to icon tabs.", idea: "A fixed left and right side, one panel showing per side (tabs). The toolbar floats over the canvas. Narrow: the sides fold to icon tabs. Height never matters." },
  { key: "strip", title: "D · Scrolling strip", note: "Columns on a strip wider than the screen; the view scrolls to the focus.", idea: "Panels and documents are columns of a strip wider than the screen; nothing shrinks below its minimum, the view scrolls to the focus instead. Short on height, a column splits in two." },
  { key: "drawers", title: "E · Drawers", note: "Drawers with tabs: wide they dock and push, narrow they slide over.", idea: "Documents take the screen; each side is a drawer with tabs. Wide: drawers dock and push. Narrow: they slide over the documents." },
  { key: "floatOver", title: "F1 · Palettes over", note: "Palettes float over the documents, stuck to the top corners.", idea: "Documents take the whole desk; panels are palettes floating over them at their natural size, stuck to the top corners and draggable anywhere. The toolbar floats too (top or bottom). Short on height, the least recently used shade to their title bars; the documents never move." },
  { key: "floatAround", title: "F2 · Palettes, docs around", note: "Palettes float, and the documents tile around them.", idea: "Palettes float at their natural size, but they reserve their footprint: the documents tile in the space between them. Nothing is covered; the space under a short stack stays empty." },
  { key: "dockTear", title: "F3 · Docks + tear-off", pick: true, note: "A's docks; any panel can be torn off to float and dropped back.", idea: "A's docks, and any panel can be torn off to float over the documents and dropped back on a dock or its rail icon. Docked is the default; floating is the exception you choose." },
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
        const cy = b.y + 10 + i * 32;
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

/** Lay out construction `key` at W × H with n documents and these options; returns the boxes and what gave way. */
export function layout(key: string, W: number, H: number, n: number, opts: Opt): { boxes: Box[]; notes: string[] } {
  Object.assign(OPT, opts);
  const notes: string[] = [];
  return { boxes: C[key]!(W, H, n, notes), notes };
}

/** Each box's key: its label, or its kind and how many unlabelled boxes of that kind came before it. */
export function keyed(boxes: Box[]): Map<string, Box> {
  const seen = new Map<string, number>(), out = new Map<string, Box>();
  for (const b of boxes) {
    if (b.label) { out.set(b.label, b); continue; }
    const k = seen.get(b.kind) ?? 0;
    seen.set(b.kind, k + 1);
    out.set(`${b.kind}#${k}`, b);
  }
  return out;
}

export const DEFAULT_OPTS: Opt = { toolbar: "top", toolbarSpace: "reserved", bottom: "on", bottomSpace: "reserved" };
export const DEFAULT = { W: 960, H: 560, n: 2 };

export const HAS_PILL = new Set(["docks", "docksFull", "navigator", "floatOver", "floatAround", "dockTear"]);
export const HAS_BOTTOM = new Set(["docks", "docksFull", "dockTear"]);
export const TOOLBAR_MODES: [string, string, string][] = [
  ["top", "reserved", "Top · reserved"],
  ["top", "overlay", "Top · floating"],
  ["bottom", "reserved", "Bottom · reserved"],
  ["bottom", "overlay", "Bottom · floating"],
];
export const BOTTOM_MODES: [string, string, string][] = [
  ["on", "reserved", "Reserved"],
  ["on", "overlay", "Floating"],
  ["off", "reserved", "Off"],
];

// ---- The comparison table: one row per construction, one column per question -----------------------------------------
export const ASPECTS = ["Toolbar", "Panels on one side", "Height runs out", "Width runs out", "Covers documents", "Things move by themselves", "Drop targets while dragging", "Known from"];
const PILL = "floating pill, top or bottom; reserved space or overlay";
export const TABLE: Record<string, string[]> = {
  docks: [PILL, "accordion: sections fold to headers; bottom dock between the sides", "least-recent sections fold to headers; the bottom dock folds to its header", "docks fold to their rails (right first)", "never (bottom dock: reserved space or overlay)", "rarely: sections and docks fold", "dock edges, slots in a dock, rail, bottom dock", "IDE tool windows (panel \"centred\")"],
  docksFull: ["as A", "as A; the bottom dock runs under the side docks", "as A; side docks are shorter, so they fold sooner", "as A; the bottom dock keeps the full width", "never (bottom dock: reserved space or overlay)", "rarely", "as A", "IDE tool windows (panel \"justified\")"],
  tree: ["bar across the top", "tiles in the same tree as documents", "newest tile floats", "newest tile floats", "only floated tiles", "often: opening a document reshapes panels", "any tile edge", "tiling window managers"],
  navigator: [PILL, "tabs: one panel shows per side", "nothing happens", "sides fold to icon tabs", "never", "never", "left / right tab rows", "design tools"],
  strip: ["bar across the top", "stacked in columns of the strip", "a column splits in two", "the strip scrolls", "never", "the view scrolls to the focus", "between columns, inside a column", "scrollable tiling window managers"],
  drawers: ["bar across the top", "tabs: one panel per drawer", "nothing happens", "drawers slide over instead of pushing", "narrow only", "drawers switch at a width", "left / right tab rows", "tablet apps"],
  floatOver: [PILL, "palettes stacked in a corner, or anywhere", "least-recent palettes shade to title bars", "palettes cover more; narrow, stacks merge in one corner", "always (shown under the stage)", "never", "anywhere (snap to corners, edges, palettes)", "creative tools' floating palettes"],
  floatAround: [PILL, "palettes stacked in a corner, or anywhere", "least-recent palettes shade to title bars", "documents get narrower", "never; leaves empty space under short stacks", "documents re-tile when a palette moves", "anywhere (snap to corners, edges)", "window managers' \"struts\""],
  dockTear: [PILL, "accordion in a dock; any panel can float", "as A; floating panels shade", "as A", "only what you tear off", "rarely", "dock slots, rail, or anywhere to float", "IDE tool windows (floating mode)"],
};
