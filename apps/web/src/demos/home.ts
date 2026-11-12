/**
 * The home page's live demo and thumbnails: the three windows and their layouts, the settle-versus-spring curve and
 * the two desk states. Strings and plain data, so the server renders every first frame and the island animates them.
 */
import { createSettle, type Rect } from "@n-uf/motion";
import { DEFAULT_OPTIONS, createDesk } from "@n-uf/placement/dock";

// ---- The hero demo -------------------------------------------------------------------------------------------------
type Slot = (W: number, H: number) => Rect;
/** The demo box at a 1440 px viewport (the hero's side edges hold Preview, Tempo and Speed). */
export const DEMO = { w: 1106, h: 380 };
/** The band at the bottom of the stage kept free for the floating tools, so no window's title bar is ever under them. */
export const RESERVE = 50;
/** The drawing tools (a floating group at the bottom of the hero): select, text, erase, box, pen. Pen is selected. */
export const TOOLS = [["pointer", "Select"], ["text", "Text"], ["eraser", "Erase"], ["rect", "Box"], ["pen", "Pen"]] as const;
export const DEFAULT_TOOL = "pen";
/**
 * The desk's layouts are placement's: three constructions of `@n-uf/placement/dock` laid out for the three open
 * documents on a stage of the demo's size (no panels, so only the documents' rects matter), each window's slot being
 * that document's rect. */
const DESK = createDesk({ panels: [], start: { left: [], right: [], bottom: [] }, docTitle: (id) => WINDOWS[id - 1]?.title ?? `Document ${id}` });
const OPTIONS = { ...DEFAULT_OPTIONS, toolbarHidden: true };
/**
 * The layouts the shuffle cycles through, by placement's construction id: with no panels, the three differ in shape
 * (a master with a stack, three tiled columns, a strip of columns that runs past the stage's edge), and each is named by
 * the package's own title for it.
 */
const CONSTRUCTIONS = ["navigator", "tree", "strip"] as const;
export interface DeskLayout {
  /** The three windows' rects, in the stage's px. */
  readonly rects: readonly Rect[];
  /** Placement's give-way note codes for this stage (empty when nothing gave way). */
  readonly notes: readonly string[];
}
let cached: { key: string; layout: DeskLayout } | null = null;
/** Placement's layout `index` (see {@link LAYOUTS}) for a stage of `W` × `H`; the last answer is kept. */
export function deskLayout(index: number, W: number, H: number): DeskLayout {
  const key = `${index}:${W}:${H}`;
  if (cached?.key === key) return cached.layout;
  const c = DESK.constructionOf(CONSTRUCTIONS[index]!);
  // The strip starts scrolled to its first column (placement's own start scrolls to the focus, leaving the first off stage).
  const start = c.initial([1, 2, 3]);
  const state = c.id === "strip" ? { ...start, stripScroll: 0 } : start;
  const { items, notes } = c.layout(state, { width: Math.max(1, W), height: Math.max(1, H) }, OPTIONS);
  const layout: DeskLayout = { rects: [1, 2, 3].map((id) => ({ ...items.get(`doc:${id}`)!.rect })), notes: notes.map((n) => n.code) };
  cached = { key, layout };
  return layout;
}
export const LAYOUTS: { name: string; id: string; slots: Slot[] }[] = CONSTRUCTIONS.map((id, index) => ({
  /** placement's own title for the construction, as it is. */
  name: DESK.constructionOf(id).title,
  id,
  slots: [0, 1, 2].map((i): Slot => (W, H) => deskLayout(index, W, H).rects[i]!),
}));
export const WINDOWS = [
  { title: "Quarterly plan.pdf", meta: "P 02/04", rows: 7 },
  { title: "Meeting notes", meta: "Thu", rows: 4 },
  { title: "Budget draft", meta: "v3", rows: 4 },
];
/** A window's inner markup: frame, then the body laid out at its target size. */
export function demoWindowHTML(i: number): string {
  const w = WINDOWS[i]!;
  return `<div class="dw-frame"></div><div class="dw-body"><div class="dw-bar"><span class="dw-grip"><i></i><i></i><i></i><i></i><i></i><i></i></span><span class="dw-title">${w.title}</span><span class="dw-meta">${w.meta}</span></div><div class="dw-lines">${"<i></i>".repeat(w.rows)}</div></div>`;
}
/**
 * The first layout as the island draws it: the box at 0, 0 sized to its slot, placed by transform. A slot is linear in
 * the demo's width and height (the whole-pixel rounding aside), so the server writes each number as a calc() of the demo
 * box's container units (`cqw`, `cqh`: `.demo` is a size container), fitted at the 1440 px box (exact there, within a
 * pixel at other widths). The island's first paint then writes the same boxes and the same transform scheme: nothing
 * moves when it starts, with or without reduced motion.
 */
export function firstLayoutStyle(i: number): string {
  const slot = LAYOUTS[0]!.slots[i]!;
  const W0 = DEMO.w, H0 = DEMO.h - RESERVE, D = 1e5;
  const at = (W: number, H: number): Rect => slot(W, H);
  const r0 = at(W0, H0), rw = at(W0 + D, H0), rh = at(W0, H0 + D);
  const num = (v: number): string => String(+v.toFixed(5));
  /** `f` of the demo box as a calc(): a·width + b·(height − RESERVE) + c. */
  const calc = (f: (r: Rect) => number): string => {
    const a = (f(rw) - f(r0)) / D, b = (f(rh) - f(r0)) / D;
    const c = f(r0) - a * W0 - b * H0;
    const px = c - b * RESERVE;
    const terms = [a && `${num(a * 100)}cqw`, b && `${num(b * 100)}cqh`, px && `${num(px)}px`].filter(Boolean) as string[];
    if (terms.length === 0) return "0px";
    if (terms.length === 1) return terms[0]!;
    return `calc(${terms.join(" + ").replace(/\+ -/g, "- ")})`;
  };
  return `left:0px;top:0px;width:${calc((r) => r.width)};height:${calc((r) => r.height)};transform:translate(${calc((r) => r.x)}, ${calc((r) => r.y)})`;
}

// ---- Thumbnail 1: settle against a spring that overshoots ----------------------------------------------------------
export const CURVE = { W: 280, H: 150, L: 16, R: 16, T: 22, B: 18, Tms: 450 };
const cx = (ms: number) => CURVE.L + ((CURVE.W - CURVE.L - CURVE.R) * ms) / CURVE.Tms;
const cy = (v: number) => CURVE.T + (CURVE.H - CURVE.T - CURVE.B) * (1 - v / 1.12);
function curves(): { settle: [number, number][]; spring: [number, number][] } {
  const s = createSettle(0, { omega: 25, restDelta: 1e-5 });
  s.setTarget(1);
  const settle: [number, number][] = [[0, 0]];
  for (let ms = 5; ms <= CURVE.Tms; ms += 5) { s.step(5); settle.push([ms, s.value]); }
  const over = (ms: number): number => { const t = ms / 1000, z = 0.45, w = 22; const wd = w * Math.sqrt(1 - z * z); return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t)); };
  const spring: [number, number][] = [];
  for (let ms = 0; ms <= CURVE.Tms; ms += 5) spring.push([ms, over(ms)]);
  return { settle, spring };
}
export const CURVES = curves();
/** A curve's value at `ms`. */
export const curveAt = (d: [number, number][], ms: number): number => d[Math.min(d.length - 1, Math.round(ms / 5))]![1];
export const curvePoint = (d: [number, number][], ms: number) => ({ x: cx(ms), y: cy(curveAt(d, ms)) });
export function curveSVG(ms: number): string {
  const path = (d: [number, number][]): string => d.map((p, i) => (i ? "L" : "M") + cx(p[0]).toFixed(1) + " " + cy(p[1]).toFixed(1)).join(" ");
  const a = curvePoint(CURVES.spring, ms), b = curvePoint(CURVES.settle, ms);
  return `<line x1="${CURVE.L}" x2="${CURVE.W - CURVE.R}" y1="${cy(1).toFixed(1)}" y2="${cy(1).toFixed(1)}" class="t-target"/>` +
    `<path d="${path(CURVES.spring)}" class="t-other"/><path d="${path(CURVES.settle)}" class="t-settle"/>` +
    `<line class="t-head" x1="${cx(ms).toFixed(1)}" x2="${cx(ms).toFixed(1)}" y1="${CURVE.T - 6}" y2="${CURVE.H - CURVE.B}"/>` +
    `<circle r="4" class="t-dot-other" cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}"/><circle r="4.5" class="t-dot" cx="${b.x.toFixed(1)}" cy="${b.y.toFixed(1)}"/>`;
}
export const curveX = cx;

// ---- Thumbnail 3: the same desk built two ways ------------------------------------------------------------------------
export const DESK_A: Record<string, Rect> = {
  railL: { x: 0, y: 0, width: 14, height: 150 }, railR: { x: 266, y: 0, width: 14, height: 150 },
  p1: { x: 18, y: 4, width: 58, height: 70 }, p2: { x: 18, y: 78, width: 58, height: 68 },
  p3: { x: 204, y: 4, width: 58, height: 142 },
  d1: { x: 80, y: 26, width: 66, height: 120 }, d2: { x: 150, y: 26, width: 50, height: 120 },
  bar: { x: 104, y: 6, width: 72, height: 14 },
};
export const DESK_B: Record<string, Rect> = {
  railL: { x: 0, y: 0, width: 0, height: 150 }, railR: { x: 280, y: 0, width: 0, height: 150 },
  p1: { x: 12, y: 30, width: 54, height: 40 }, p2: { x: 12, y: 74, width: 54, height: 30 },
  p3: { x: 214, y: 30, width: 54, height: 60 },
  d1: { x: 4, y: 24, width: 150, height: 122 }, d2: { x: 158, y: 24, width: 118, height: 122 },
  bar: { x: 104, y: 4, width: 72, height: 14 },
};
export const deskKind = (k: string): string => (k.startsWith("rail") ? "t-rail" : k.startsWith("d") ? "t-doc" : k === "bar" ? "t-pill" : "t-panel");
export function deskThumbSVG(): string {
  return Object.entries(DESK_A).map(([k, r]) => `<rect data-k="${k}" rx="${k === "bar" ? 7 : 4}" class="${deskKind(k)}" x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}"/>`).join("");
}
