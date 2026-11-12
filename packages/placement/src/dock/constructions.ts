/**
 * The nine desk constructions, presets built from the parts: a state, the stage size and the options in, a placed
 * rect per item out, plus notes saying how it gave way. How each one gives way when width or height runs out:
 *
 * - A edge docks: sections fold to headers (least recently used first), the bottom dock folds to its header, the
 *   docks fold to their rails (right first). A2 runs the bottom dock across the full width.
 * - B one tiling tree: the newest tile that breaks a minimum floats.
 * - C navigator + inspector: the sides fold to icon tabs; height never matters.
 * - D scrolling strip: a column whose minimums don't fit splits in two; the strip scrolls to the focus.
 * - E drawers: below a width a drawer slides over the documents instead of pushing them.
 * - F1 palettes over the documents, F2 palettes with the documents tiled around them: the least recently used
 *   shade to their title bars; narrow, the stacks merge in one corner.
 * - F3 edge docks + tear-off: as A, and torn-off panels float (and shade when they don't fit).
 */
import { clampInto, rect, type Size } from "../geometry";
import { columnHeights, share } from "./arrange";
import {
  DRAWER_DOCK,
  OVER_MARGIN,
  TORN_W,
  TREE_COLUMN,
  accordion,
  aroundDocs,
  bar,
  dockGeometry,
  intoRail,
  paletteArea,
  palettes,
  pill,
  pillBetween,
  plural,
  rail,
  stripGeometry,
  stripMin,
  tabbed,
  tabbedIntoRail,
  tileMin,
  tiles,
  treeArea,
  treeFloats,
  treeRails,
  treeShown,
  treeTiles,
  DOCK,
  type Out,
} from "./parts";
import { BAR, G, LAYER, RAIL, TITLE, catalogOf, idOf, isDocKey, panelKey, startState, type Catalog, type DeskSpec, type DeskState, type Layout, type Options, type Side } from "./model";

// --- A, A2, F3: edge docks -----------------------------------------------------------------------------------------

function docks(cat: Catalog, s: DeskState, size: { width: number; height: number }, opt: Options, mode: "between" | "full", notes: string[]): Out {
  const out: Out = new Map();
  const { width: W, height: H } = size;
  const d = dockGeometry(cat, s, size, opt, mode, notes);
  rail(out, "left", 0, 0, d.h, s.left);
  rail(out, "right", W - RAIL, 0, d.h, d.right);
  let folded = 0;
  if (d.lOpen) folded += accordion(cat, out, s, RAIL + G, G, DOCK - G, d.h - 2 * G, s.left);
  else intoRail(cat, out, 0, 0, DOCK - G, s.left, "left");
  if (d.rOpen) folded += accordion(cat, out, s, W - RAIL - DOCK, G, DOCK - G, d.h - 2 * G, d.right);
  else intoRail(cat, out, W - RAIL, 0, DOCK - G, d.right, "right");
  if (folded) notes.push(`${plural(folded, "section", "sections")} folded to ${folded > 1 ? "headers" : "a header"}`);
  // Reserved: the documents end above the bottom dock. Overlay: it floats over the documents' lower part.
  const overlay = opt.bottom === "overlay";
  if (d.bottomRect) {
    const b = d.bottomRect;
    const n = s.bottom.length;
    const w = (b.width - G * (n - 1)) / n;
    s.bottom.forEach((id, i) => {
      const open = d.bh > TITLE;
      out.set(panelKey(id), {
        rect: rect(b.x + i * (w + G), b.y, w, b.height),
        look: overlay ? (open ? "float" : "header") : open ? "section" : "header",
        layer: overlay ? LAYER.overlay : LAYER.dock,
        accent: true,
        ...(overlay ? { shadow: true } : {}),
        ...(open ? { min: { height: cat.natural(id) } } : {}),
      });
    });
  }
  const docsBottom = d.bottomOn && !overlay ? H - G - d.bh : H;
  const p = pill(opt, d.x0, d.x1 - d.x0, 0, overlay && d.bottomOn ? H - G - d.bh : docsBottom);
  // With the bottom dock floating, the documents run down under it (but never under a reserved bottom pill).
  const bottomOfDocs = overlay && d.bottomOn && !(opt.toolbar === "bottom" && opt.toolbarSpace === "reserved") ? H - G : p.bottom;
  tiles(out, rect(d.x0, p.top, d.x1 - d.x0, bottomOfDocs - p.top), s.docs);
  out.set("toolbar", p.placed);
  return out;
}

/** F3: torn-off panels float over the documents; one that doesn't fit the stage's height shades to its title bar. */
function tornOff(cat: Catalog, out: Out, s: DeskState, size: Size, notes: string[]): void {
  const docRects = [...out.entries()].filter(([k]) => isDocKey(k)).map(([, p]) => p.rect);
  const right = docRects.length ? Math.max(...docRects.map((r) => r.x + r.width)) : size.width / 2;
  const top = docRects.length ? Math.min(...docRects.map((r) => r.y)) : 0;
  let shaded = 0;
  s.torn.forEach((f, i) => {
    const full = cat.natural(f.id);
    const at = f.at ?? { x: right - 12 - TORN_W - 22 * i, y: top + 40 + 22 * i };
    const fits = at.y + full <= size.height - G;
    const shade = s.folded.includes(f.id) || !fits;
    if (!fits && !s.folded.includes(f.id)) shaded++;
    const r = clampInto(rect(at.x, at.y, TORN_W, shade ? TITLE : full), rect(0, 0, size.width, size.height));
    out.set(panelKey(f.id), { rect: r, look: shade ? "header" : "float", layer: LAYER.float, shadow: true, ...(shade ? {} : { min: { height: full } }) });
  });
  if (s.torn.length) notes.push(`${s.torn.map((f) => cat.title(panelKey(f.id))).join(", ")} ${s.torn.length > 1 ? "float" : "floats"}; drop on a dock or its rail icon to dock again`);
  if (shaded) notes.push(`${plural(shaded, "floating panel", "floating panels")} shaded`);
}

// --- B: one tiling tree --------------------------------------------------------------------------------------------

function tree(cat: Catalog, s: DeskState, size: Size, notes: string[]): Out {
  const out: Out = new Map();
  const area = treeArea(size, s);
  // A column folded to its rail: icons at the stage's edge, its panels hidden into them.
  const rails = treeRails(s);
  for (const side of ["left", "right"] as const) {
    if (!rails[side]) continue;
    const ids = (side === "left" ? s.tree.L : s.tree.R).map(idOf);
    const x = side === "left" ? 0 : size.width - RAIL;
    rail(out, side, x, BAR, size.height - BAR, ids);
    intoRail(cat, out, x, BAR, TREE_COLUMN, ids, side);
  }
  if (rails.left || rails.right) notes.push(`${rails.left && rails.right ? "both side columns" : `the ${rails.left ? "left" : "right"} column`} folded to ${rails.left && rails.right ? "their rails" : "its rail"}`);
  const { tree: t, floats } = treeFloats(cat, treeShown(s), area);
  for (const [k, r] of treeTiles(cat, t, area)) out.set(k, { rect: r, look: isDocKey(k) ? "doc" : "tile", layer: LAYER.doc, min: tileMin(cat, k) });
  floats.forEach((k, i) => {
    const m = isDocKey(k) ? { w: 300, h: 190 } : { w: 200, h: cat.natural(idOf(k)) };
    const r = clampInto(rect(size.width / 2 - m.w / 2 + 22 * i, BAR + 40 + 22 * i, m.w, m.h), rect(0, 0, size.width, size.height));
    out.set(k, { rect: r, look: isDocKey(k) ? "doc" : "float", layer: LAYER.float, shadow: true });
  });
  if (floats.length) notes.push(`${plural(floats.length, "tile floats", "tiles float")} (newest first): ${floats.map(cat.title).join(", ")}`);
  out.set("toolbar", bar(size.width));
  return out;
}

/**
 * B's start: on a stage too narrow for the documents to tile between the side columns, the columns start folded to
 * their rails (the right one first), then the centre's panels join the folded right column, so nothing floats
 * until a rail icon opens a column.
 */
function treeStart(cat: Catalog, docs: readonly number[], size?: Size): DeskState {
  const s = startState(cat, docs);
  if (!size) return s;
  const both = { ...s, closed: ["right", "left"] as Side[] };
  const panels = s.tree.C.filter((k) => !isDocKey(k));
  const tries: DeskState[] = [s, { ...s, closed: ["right"] }, both, { ...both, tree: { ...s.tree, R: [...s.tree.R, ...panels], C: s.tree.C.filter(isDocKey) } }];
  return tries.find((st) => treeFloats(cat, treeShown(st), treeArea(size, st)).floats.length === 0) ?? tries.at(-1)!;
}

// --- C: navigator + inspector, and E: drawers ----------------------------------------------------------------------

const NAV_L = 240;
const NAV_R = 240;
const NAV_MIN = 380;

function navigator(cat: Catalog, s: DeskState, size: Size, opt: Options, notes: string[]): Out {
  const out: Out = new Map();
  const { width: W, height: H } = size;
  let lw = s.left.length ? NAV_L : 0;
  let rw = s.right.length ? NAV_R : 0;
  if (rw && W - lw - rw < NAV_MIN) {
    rw = RAIL;
    notes.push("inspector folded to icon tabs");
  }
  if (lw && W - lw - rw < NAV_MIN) {
    lw = RAIL;
    notes.push("navigator folded to icon tabs");
  }
  const side = (sd: Side, x: number, w: number, full: number, ids: readonly number[]): void => {
    if (w === RAIL) {
      rail(out, sd, x, 0, H, ids);
      tabbedIntoRail(cat, out, sd, ids, x, 0, full);
    } else if (w > 0) {
      rail(out, sd, sd === "left" ? x : x + w - RAIL, 0, H, ids, true);
      tabbed(out, sd, ids, s.active[sd], x, 0, w, H, false);
    }
  };
  side("left", 0, lw, NAV_L, s.left);
  side("right", W - rw, rw, NAV_R, s.right);
  const cx = lw + G;
  const cw = W - lw - rw - 2 * G;
  const p = pill(opt, cx, cw, 0, H);
  tiles(out, rect(cx, p.top, cw, p.bottom - p.top), s.docs);
  out.set("toolbar", p.placed);
  return out;
}

const DRAWER_L = 240;
const DRAWER_R = 240;

function drawers(cat: Catalog, s: DeskState, size: Size, notes: string[]): Out {
  const out: Out = new Map();
  const { width: W, height: H } = size;
  const y = BAR;
  const h = H - BAR;
  const rDocked = W >= DRAWER_DOCK.right;
  const lDocked = W >= DRAWER_DOCK.left;
  const lOpen = s.left.length > 0 && !s.closed.includes("left");
  const rOpen = s.right.length > 0 && !s.closed.includes("right");
  if (!rDocked && rOpen) notes.push("right drawer slides over the documents");
  if (!lDocked && lOpen) notes.push(rDocked || !rOpen ? "left drawer slides over the documents" : "left drawer slides over too");
  rail(out, "left", 0, y, h, s.left);
  rail(out, "right", W - RAIL, y, h, s.right);
  const x0 = RAIL + (lDocked && lOpen ? DRAWER_L : 0) + G;
  const x1 = W - RAIL - (rDocked && rOpen ? DRAWER_R : 0) - G;
  tiles(out, rect(x0, y + G, x1 - x0, h - 2 * G), s.docs);
  // Both sliding over a stage too narrow for the two side by side: each takes half the room between the rails.
  const both = !lDocked && !rDocked && lOpen && rOpen;
  const half = (W - 2 * RAIL - G) / 2;
  const lw = both ? Math.min(DRAWER_L, half) : DRAWER_L;
  const rw = both ? Math.min(DRAWER_R, half) : DRAWER_R;
  if (lOpen) tabbed(out, "left", s.left, s.active.left, RAIL, y, lw, h, !lDocked);
  else tabbedIntoRail(cat, out, "left", s.left, 0, y, DRAWER_L);
  if (rOpen) tabbed(out, "right", s.right, s.active.right, W - RAIL - rw, y, rw, h, !rDocked);
  else tabbedIntoRail(cat, out, "right", s.right, W - RAIL, y, DRAWER_R);
  out.set("toolbar", bar(W));
  return out;
}

// --- D: scrolling strip --------------------------------------------------------------------------------------------

function strip(cat: Catalog, s: DeskState, size: Size, notes: string[]): Out {
  const out: Out = new Map();
  const { width: W, height: H } = size;
  const g = stripGeometry(cat, s, size, notes);
  g.cols.forEach((c, ci) => {
    // A column of panels: each at its natural height, the last taking the rest; documents share as before.
    const mins = c.map((k) => stripMin(cat, k));
    const heights = c.some(isDocKey) ? share(g.h - G * (c.length - 1), mins) : columnHeights(g.h, mins, G);
    let cy = g.y;
    c.forEach((k, i) => {
      out.set(k, { rect: rect(g.xs[ci]!, cy, g.widths[ci]!, heights[i]!), look: isDocKey(k) ? "doc" : "tile", layer: LAYER.doc, offStage: true, min: { width: g.widths[ci]!, height: mins[i]! } });
      cy += heights[i]! + G;
    });
  });
  const scrolls = g.total > W;
  if (scrolls) notes.push(`the strip is ${Math.round(g.total)} wide: ${Math.round(g.total - W)} px off screen, reached by scrolling`);
  out.set("track", { rect: rect(0, H - 5, W, 5), look: "track", layer: LAYER.toolbar, ...(scrolls ? {} : { hidden: true }) });
  const tw = scrolls ? (W / g.total) * W : W;
  out.set("thumb", { rect: rect(scrolls ? (g.scroll / g.total) * W : 0, H - 5, tw, 5), look: "thumb", layer: LAYER.toolbar, ...(scrolls ? {} : { hidden: true }) });
  out.set("toolbar", bar(W));
  return out;
}

// --- F1, F2: floating palettes -------------------------------------------------------------------------------------

function floatOver(cat: Catalog, s: DeskState, size: Size, opt: Options, notes: string[]): Out {
  const out: Out = new Map();
  const { area } = paletteArea(size, opt);
  const pals = palettes(cat, s, area, size.width, OVER_MARGIN, notes);
  const tb = pillBetween(opt, size, [...pals.values()].map((p) => p.rect));
  tiles(out, area, s.docs);
  let covered = 0;
  for (const [id, p] of pals) {
    out.set(panelKey(id), { rect: p.rect, look: p.shaded ? "header" : "float", layer: LAYER.float, shadow: true, ...(p.shaded ? {} : { min: { height: cat.natural(id) } }) });
    covered += p.rect.width * p.rect.height;
  }
  notes.push(`palettes cover ${Math.round((covered / (area.width * area.height)) * 100)}% of the documents`);
  out.set("toolbar", tb);
  return out;
}

function floatAround(cat: Catalog, s: DeskState, size: Size, opt: Options, notes: string[]): Out {
  const out: Out = new Map();
  const { area } = paletteArea(size, opt);
  const pals = palettes(cat, s, area, size.width, 0, notes);
  const tb = pillBetween(opt, size, [...pals.values()].map((p) => p.rect));
  const docsRect = aroundDocs(pals, area);
  tiles(out, docsRect, s.docs);
  let used = docsRect.width * docsRect.height;
  for (const [id, p] of pals) {
    out.set(panelKey(id), { rect: p.rect, look: p.shaded ? "header" : "palette", layer: LAYER.palette, shadow: true, ...(p.shaded ? {} : { min: { height: cat.natural(id) } }) });
    used += p.rect.width * p.rect.height;
  }
  notes.push(`documents get ${Math.round(docsRect.width)} px of width; ${Math.max(0, Math.round((1 - used / (area.width * area.height)) * 100))}% of the desk stays empty under short stacks`);
  out.set("toolbar", tb);
  return out;
}

// --- the presets ---------------------------------------------------------------------------------------------------

export type ConstructionId = "docks" | "docksFull" | "tree" | "navigator" | "strip" | "drawers" | "floatOver" | "floatAround" | "dockTear";

export interface Construction {
  readonly id: ConstructionId;
  readonly title: string;
  readonly idea: string;
  /** It has a floating toolbar pill (top or bottom, reserved or overlay). */
  readonly pill: boolean;
  /** It has a bottom dock (reserved, floating or off). */
  readonly bottom: boolean;
  /** The arrangement it starts from (at this stage size, when it depends on one). */
  readonly initial: (docs: readonly number[], size?: Size) => DeskState;
  readonly layout: (s: DeskState, size: Size, opt: Options) => Layout;
  /** The desk it belongs to (its catalog). */
  readonly desk: Desk;
}

/** A desk: the catalog, its nine constructions, and the catalog-bound helpers. */
export interface Desk {
  readonly catalog: Catalog;
  readonly constructions: readonly Construction[];
  readonly constructionOf: (id: ConstructionId) => Construction;
  /** The arrangement every construction starts from, with these documents open. */
  readonly initialState: (docs?: readonly number[]) => DeskState;
  readonly natural: (id: number) => number;
  readonly titleOf: (key: string) => string;
}

type LayoutFn = (s: DeskState, size: Size, opt: Options, notes: string[]) => Out;

const withNotes = (f: LayoutFn) => (s: DeskState, size: Size, opt: Options): Layout => {
  const notes: string[] = [];
  const items = f(s, size, opt, notes);
  return { items, notes };
};

/**
 * A desk for these panels: the nine constructions as presets, each a pure layout over the shared state.
 *
 * ```ts
 * const desk = createDesk({ panels: [{ id: 1, title: "Files", natural: 160 }], start: { left: [1], right: [], bottom: [] } });
 * const c = desk.constructionOf("docks");
 * const { items, notes } = c.layout(c.initial([1, 2]), { width: 960, height: 560 }, DEFAULT_OPTIONS);
 * ```
 */
export function createDesk(spec: DeskSpec): Desk {
  const cat = catalogOf(spec);
  const initial = (docs?: readonly number[]): DeskState => startState(cat, docs);
  const sides = (patch: (s: DeskState) => Partial<DeskState>) => (docs: readonly number[]): DeskState => {
    const s = startState(cat, docs);
    return { ...s, ...patch(s) };
  };
  // Navigator and drawers have no bottom dock: its panels join the right side.
  const noBottom = sides((s) => ({ right: [...s.right, ...s.bottom], bottom: [] }));
  const plain = sides(() => ({}));
  const list: Omit<Construction, "desk">[] = [
    {
      id: "docks",
      title: "A · Edge docks",
      idea: "Each side is a dock with a rail of icons; its panels are accordion sections. Short on height, the least recently used fold to headers; short on width, a whole dock folds to its rail (right first). The bottom dock sits between the side docks.",
      pill: true,
      bottom: true,
      initial: plain,
      layout: withNotes((s, size, opt, notes) => docks(cat, s, size, opt, "between", notes)),
    },
    {
      id: "docksFull",
      title: "A2 · Edge docks, full-width bottom dock",
      idea: "As A, except the bottom dock runs under everything across the full width; the side docks and their rails stop above it, so they fold sooner.",
      pill: true,
      bottom: true,
      initial: plain,
      layout: withNotes((s, size, opt, notes) => docks(cat, s, size, opt, "full", notes)),
    },
    {
      id: "tree",
      title: "B · One tiling tree",
      idea: "Panels and documents are tiles of one tree, so a panel can sit beside a document. One rule for all: the newest tile that breaks a minimum floats. Opened on a narrow stage, the side columns start folded to rails at its edges.",
      pill: false,
      bottom: false,
      initial: (docs, size) => treeStart(cat, docs, size),
      layout: withNotes((s, size, _opt, notes) => tree(cat, s, size, notes)),
    },
    {
      id: "navigator",
      title: "C · Navigator + inspector",
      idea: "A fixed left and right side, one panel showing per side (tabs); the toolbar floats over the canvas. Narrow, the sides fold to icon tabs. Height never matters.",
      pill: true,
      bottom: false,
      initial: noBottom,
      layout: withNotes((s, size, opt, notes) => navigator(cat, s, size, opt, notes)),
    },
    {
      id: "strip",
      title: "D · Scrolling strip",
      idea: "Panels and documents are columns of a strip wider than the screen; nothing shrinks below its minimum, the view scrolls to the focus instead. Short on height, a column splits in two.",
      pill: false,
      bottom: false,
      initial: plain,
      layout: withNotes((s, size, _opt, notes) => strip(cat, s, size, notes)),
    },
    {
      id: "drawers",
      title: "E · Drawers",
      idea: "Documents take the screen; each side is a drawer with tabs. Wide, the drawers dock and push; narrow, they slide over the documents.",
      pill: false,
      bottom: false,
      initial: noBottom,
      layout: withNotes((s, size, _opt, notes) => drawers(cat, s, size, notes)),
    },
    {
      id: "floatOver",
      title: "F1 · Floating palettes over the documents",
      idea: "Documents take the whole desk; panels are palettes floating over them at their natural size, stacked in the top corners and draggable anywhere. Short on height, the least recently used shade to their title bars; the documents never move.",
      pill: true,
      bottom: false,
      initial: plain,
      layout: withNotes((s, size, opt, notes) => floatOver(cat, s, size, opt, notes)),
    },
    {
      id: "floatAround",
      title: "F2 · Floating palettes, documents tile around",
      idea: "Palettes float at their natural size but reserve their footprint: the documents tile in the space between them. Nothing is covered; the space under a short stack stays empty.",
      pill: true,
      bottom: false,
      initial: plain,
      layout: withNotes((s, size, opt, notes) => floatAround(cat, s, size, opt, notes)),
    },
    {
      id: "dockTear",
      title: "F3 · Edge docks + tear-off",
      idea: "A's docks, and any panel can be torn off to float over the documents and dropped back on a dock or its rail icon. Docked is the default; floating is the exception you choose.",
      pill: true,
      bottom: true,
      initial: plain,
      layout: withNotes((s, size, opt, notes) => {
        const out = docks(cat, s, size, opt, "between", notes);
        tornOff(cat, out, s, size, notes);
        return out;
      }),
    },
  ];
  const constructions: Construction[] = [];
  const desk: Desk = {
    catalog: cat,
    constructions,
    constructionOf: (id) => constructions.find((c) => c.id === id)!,
    initialState: initial,
    natural: cat.natural,
    titleOf: cat.title,
  };
  constructions.push(...list.map((c) => ({ ...c, desk })));
  return desk;
}

/** Which items a construction lets the pointer drag: panels everywhere, documents in the tree and the strip. */
export const draggable = (c: Construction, key: string): boolean => key.startsWith("panel:") || (key.startsWith("doc:") && (c.id === "tree" || c.id === "strip"));
