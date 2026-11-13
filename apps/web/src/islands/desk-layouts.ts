/**
 * Desk layouts (island): the server drew the default desk, the case rail and the comparison table; this lays out the
 * picked card live (a preset through @n-uf/placement/desk's `presetLayout`, a sketch by the page's own rules) and lets
 * the drawing glide: every box, and the desk's own size, settles from where it is drawn to its new rect.
 */
import type { Rect } from "@n-uf/motion";
import { $, caseRail, fillRanges } from "./rail";
import { RectField } from "./motion";
import { figureChrome } from "./figure-chrome";
import { xrayOf, type XR } from "./xray";
import { BAND_MODES, CARDS, DEFAULT, HAS_BAND, HAS_PILL, SPAN_MODES, TOOLBAR_MODES, defaultOpts, deskSVG, keyed, layout, statusHTML, type Box, type Opt } from "../demos/desk";

/** One button of a switch: its text, whether it is on, and what pressing it does. */
type Mode = { text: string; on: () => boolean; pick: () => void };
const views = CARDS.map((c) => ({ c, opts: defaultOpts(c.key) }));
let active = CARDS.findIndex((c) => c.pick);
const casesEl = $("cases");
const compare = $<HTMLTableElement>("compare");
const markCase = caseRail(casesEl, (i) => {
  active = i;
  syncCases();
  renderSegs();
  render();
});
function syncCases(): void {
  markCase(active);
  compare.querySelectorAll("tbody tr").forEach((r, i) => r.setAttribute("aria-current", String(i === active)));
}

/** A label and its bar buttons, one pressed. */
function segmented(label: string, modes: Mode[]): DocumentFragment {
  const row = document.createDocumentFragment();
  const lab = document.createElement("span");
  lab.className = "lab";
  lab.textContent = label;
  row.appendChild(lab);
  for (const m of modes) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tb text";
    b.textContent = m.text;
    b.setAttribute("aria-pressed", String(m.on()));
    // The span switch shows only while the band is on, so a press redraws the whole row.
    b.addEventListener("click", () => { m.pick(); renderSegs(); render(); });
    row.appendChild(b);
  }
  return row;
}
function renderSegs(): void {
  const v = views[active]!, o: Opt = v.opts, host = $("segs");
  const focused = host.contains(document.activeElement) ? [...host.querySelectorAll("button")].indexOf(document.activeElement as HTMLButtonElement) : -1;
  host.replaceChildren();
  if (HAS_PILL.has(v.c.key)) host.appendChild(segmented("Toolbar", TOOLBAR_MODES.map(([t, s, text]) => ({ text, on: () => o.toolbar === t && o.toolbarSpace === s, pick: () => { o.toolbar = t; o.toolbarSpace = s; } }))));
  if (HAS_BAND.has(v.c.key)) {
    host.appendChild(segmented("Bottom band", BAND_MODES.map(([m, text]) => ({ text, on: () => o.band === m, pick: () => { o.band = m; } }))));
    if (o.band !== "off") host.appendChild(segmented("Span", SPAN_MODES.map(([s, text]) => ({ text, on: () => o.span === s, pick: () => { o.span = s; } }))));
  }
  if (!host.children.length) host.innerHTML = `<span class="quiet">No floating toolbar or bottom band to switch</span>`;
  if (focused >= 0) host.querySelectorAll("button")[focused]?.focus();
  $("desk-name").textContent = v.c.title;
}

// ---- The stage: the drawing is fitted by CSS from its size (--w, --h) ---------------------------------------------------
const svg = $("desk") as unknown as SVGSVGElement;
const SIZE = "\u0000size";
let latest: Box[] = [];
// X-ray: placement's rects (each box the construction placed, by its key) and motion's glide (each box drawn against
// its target while it settles).
const xray = xrayOf($("figure"));
const toView = (r: { x: number; y: number; w: number; h: number }): XR => {
  const b = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, kx = b.width / (vb.width || 1), ky = b.height / (vb.height || 1);
  return { x: b.left + r.x * kx, y: b.top + r.y * ky, w: r.w * kx, h: r.h * ky };
};
let moving = new Set<string>();
function xrayDesk(rects?: Map<string, Rect>): void {
  if (!xray.on) return;
  const boxes = keyed(latest);
  xray.draw("desk:place", { slots: [...boxes].map(([k, b]) => ({ r: toView(b), label: k })) });
  const now = new Set<string>();
  if (rects) boxes.forEach((b, k) => {
    const r = rects.get(k);
    if (!r || (Math.abs(r.x - b.x) < 0.5 && Math.abs(r.y - b.y) < 0.5 && Math.abs(r.width - b.w) < 0.5 && Math.abs(r.height - b.h) < 0.5)) return;
    now.add(k);
    xray.draw(`desk:m:${k}`, { target: toView(b), drawn: toView({ x: r.x, y: r.y, w: r.width, h: r.height }) });
  });
  moving.forEach((k) => { if (!now.has(k)) xray.draw(`desk:m:${k}`, null); });
  moving = now;
}
xray.onChange((on) => { if (on) xrayDesk(); });
const field = new RectField<string>((rects) => {
  const s = rects.get(SIZE);
  if (!s) return;
  const drawn: Box[] = [];
  keyed(latest).forEach((b, k) => {
    const r = rects.get(k);
    drawn.push(r ? { ...b, x: r.x, y: r.y, w: r.width, h: r.height } : b);
  });
  svg.setAttribute("viewBox", `0 0 ${s.width} ${s.height}`);
  svg.style.setProperty("--w", String(s.width));
  svg.style.setProperty("--h", String(s.height));
  svg.parentElement?.style.setProperty("--w", String(s.width)); // the stage's own copy: the dimension lines read it
  svg.parentElement?.style.setProperty("--h", String(s.height));
  svg.innerHTML = deskSVG(s.width, s.height, drawn);
  xrayDesk(rects);
});
let first = true;
function render(): void {
  const W = +$<HTMLInputElement>("w").value, H = +$<HTMLInputElement>("h").value, n = +$<HTMLInputElement>("n").value;
  $("wo").textContent = String(W);
  $("ho").textContent = String(H);
  $("no").textContent = String(n);
  // The dimension labels read the sliders' whole numbers (--tw, --th); --w and --h follow the glide, in fractions.
  svg.parentElement?.style.setProperty("--tw", String(W));
  svg.parentElement?.style.setProperty("--th", String(H));
  document.querySelectorAll<HTMLButtonElement>("#presets button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.p === `${W},${H}`)));
  const v = views[active]!;
  const { boxes, notes } = layout(v.c.key, W, H, n, v.opts);
  latest = boxes;
  svg.setAttribute("aria-label", v.c.title + " desk layout");
  const targets = new Map<string, Rect>([[SIZE, { x: 0, y: 0, width: W, height: H }]]);
  keyed(boxes).forEach((b, k) => targets.set(k, { x: b.x, y: b.y, width: b.w, height: b.h }));
  field.set(targets, !first);
  first = false;
  $("status").innerHTML = statusHTML(v.c.key, notes);
  $("idea").innerHTML = v.c.idea;
}
for (const id of ["w", "h", "n"]) $(id).addEventListener("input", render);
document.querySelectorAll<HTMLButtonElement>("#presets button").forEach((b) =>
  b.addEventListener("click", () => {
    const [w, h] = b.dataset.p!.split(",");
    const wi = $<HTMLInputElement>("w"), hi = $<HTMLInputElement>("h");
    wi.value = w!;
    hi.value = h!;
    wi.dispatchEvent(new Event("input", { bubbles: true }));
    hi.dispatchEvent(new Event("input", { bubbles: true }));
  }),
);
fillRanges(document);
// ↺ Reset: the first construction at the default size, every construction's options back to their defaults.
const firstCase = CARDS.findIndex((c) => c.pick);
const sizeIs = (W: number, H: number, n: number): boolean => +$<HTMLInputElement>("w").value === W && +$<HTMLInputElement>("h").value === H && +$<HTMLInputElement>("n").value === n;
const deskChrome = figureChrome($("figure"), {
  demo: {
    isDefault: () => active === firstCase && sizeIs(DEFAULT.W, DEFAULT.H, DEFAULT.n) && views.every((v) => JSON.stringify(v.opts) === JSON.stringify(defaultOpts(v.c.key))),
    reset() {
      views.forEach((v) => (v.opts = defaultOpts(v.c.key)));
      active = firstCase;
      for (const [id, val] of [["w", DEFAULT.W], ["h", DEFAULT.H], ["n", DEFAULT.n]] as const) $<HTMLInputElement>(id).value = String(val);
      fillRanges(document);
      syncCases();
      renderSegs();
      render();
    },
  },
});
// Any control in the figure may change the demo: refresh ↺ Reset after it acts.
for (const ev of ["input", "click"]) $("figure").addEventListener(ev, () => queueMicrotask(() => deskChrome.demoChanged()));
syncCases();
renderSegs();
render();
(window as unknown as Record<string, unknown>).__deskSketch = { cases: CARDS.length, select: (i: number) => (casesEl.querySelectorAll("button.case")[i] as HTMLElement).click(), active: () => active };
