/**
 * Desk layouts (island): the server drew the default desk, the case rail and the comparison table; this lays out the
 * picked construction live and lets the drawing glide: every box, and the desk's own size, settles from where it is
 * drawn to its new rect.
 */
import type { Rect } from "@n-uf/motion";
import { $, caseRail, fillRanges } from "./rail";
import { RectField } from "./motion";
import { figureChrome } from "./figure-chrome";
import { BOTTOM_MODES, CARDS, DEFAULT_OPTS, HAS_BOTTOM, HAS_PILL, TOOLBAR_MODES, deskSVG, keyed, layout, type Box, type Opt } from "../demos/desk";

type Mode = [string, string, string];
const views = CARDS.map((c) => ({ c, opts: { ...DEFAULT_OPTS } as Opt }));
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
function segmented(label: string, modes: Mode[], isOn: (m: Mode) => boolean, pick: (m: Mode) => void): DocumentFragment {
  const row = document.createDocumentFragment();
  const lab = document.createElement("span");
  lab.className = "lab";
  lab.textContent = label;
  row.appendChild(lab);
  const seg = row;
  const buttons = modes.map((m) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tb text";
    b.textContent = m[2];
    b.addEventListener("click", () => { pick(m); sync(); render(); });
    seg.appendChild(b);
    return { b, m };
  });
  const sync = (): void => buttons.forEach(({ b, m }) => b.setAttribute("aria-pressed", String(isOn(m))));
  sync();
  return row;
}
function renderSegs(): void {
  const v = views[active]!, o = v.opts, host = $("segs");
  host.replaceChildren();
  if (HAS_PILL.has(v.c.key)) host.appendChild(segmented("Toolbar", TOOLBAR_MODES, (m) => o.toolbar === m[0] && o.toolbarSpace === m[1], (m) => { o.toolbar = m[0]; o.toolbarSpace = m[1]; }));
  if (HAS_BOTTOM.has(v.c.key)) host.appendChild(segmented("Bottom dock", BOTTOM_MODES, (m) => o.bottom === m[0] && (m[0] === "off" || o.bottomSpace === m[1]), (m) => { o.bottom = m[0]; o.bottomSpace = m[1]; }));
  if (!host.children.length) host.innerHTML = `<span class="quiet">No floating toolbar or bottom dock to switch</span>`;
  $("desk-name").textContent = v.c.title;
}

// ---- The stage: the drawing is fitted by CSS from its size (--w, --h) ---------------------------------------------------
const svg = $("desk") as unknown as SVGSVGElement;
const SIZE = "\u0000size";
let latest: Box[] = [];
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
  svg.innerHTML = deskSVG(s.width, s.height, drawn);
});
let first = true;
function render(): void {
  const W = +$<HTMLInputElement>("w").value, H = +$<HTMLInputElement>("h").value, n = +$<HTMLInputElement>("n").value;
  $("wo").textContent = String(W);
  $("ho").textContent = String(H);
  $("no").textContent = String(n);
  document.querySelectorAll<HTMLButtonElement>("#presets button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.p === `${W},${H}`)));
  const v = views[active]!;
  const { boxes, notes } = layout(v.c.key, W, H, n, v.opts);
  latest = boxes;
  svg.setAttribute("aria-label", v.c.title + " desk layout");
  const targets = new Map<string, Rect>([[SIZE, { x: 0, y: 0, width: W, height: H }]]);
  keyed(boxes).forEach((b, k) => targets.set(k, { x: b.x, y: b.y, width: b.w, height: b.h }));
  field.set(targets, !first);
  first = false;
  $("status").innerHTML = notes.length ? "<b>Gives way:</b> " + notes.join("; ") : "<b>Everything fits</b> at its natural size.";
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
figureChrome($("figure"));
syncCases();
renderSegs();
render();
(window as unknown as Record<string, unknown>).__deskSketch = { cases: CARDS.length, select: (i: number) => (casesEl.querySelectorAll("button.case")[i] as HTMLElement).click(), active: () => active };
