/**
 * The Window drawer's "Drag feel": live controls for every tunable of `./feel`, one section per kind (Panels,
 * Toolbars). A change applies to the next drag and is stored. Each control says the default's reason in its title.
 */
import { RAIL_STRIP_MIN, RAIL_VISIBILITIES } from "@n-uf/placement/scene";
import { DEFAULT_FEEL, MODIFIER_KEYS, readFeel, storeFeel, type DragFeel, type FeelKind, type KindFeel } from "./feel";

const SECTIONS: readonly { readonly kind: FeelKind; readonly title: string }[] = [
  { kind: "panel", title: "Panels" },
  { kind: "group", title: "Toolbars" },
];

/** Why each default is what it is, one line each (the controls' titles). */
const WHY = {
  railStripWidth: `The strip's width at the window's side; "rail width" uses the rail's drawn width, at least ${RAIL_STRIP_MIN} px: an edge target that wide is easy to hit (Fitts's law). 0 turns rail docking off.`,
  railVisibility: "When the strip is drawn: while dragging (the default), always, or never (rail docking off).",
  magnet: "How far the armed strip grows inward, px: a hand that wobbles once armed keeps it. No animation under reduced motion.",
  floatNearEdge: "Whether a float may sit inside the strip's area before it arms.",
  railArmDwellMs: "Spring-loading: how long the pointer rests in the strip before it arms, ms (platform spring-loading is a few hundred ms); 0 arms at once.",
  modifiers: "Keys win over geometry: the float key floats anywhere, the rail key collapses into the nearest rail.",
} as const;

const opt = (v: string, now: string, label = v): string => `<option value="${v}"${v === now ? " selected" : ""}>${label}</option>`;

function sectionHtml(kind: FeelKind, title: string, f: KindFeel): string {
  const auto = f.railStripWidth === null;
  const k = (name: string): string => `data-feel="${kind}.${name}"`;
  return `<fieldset class="dw-feel-sec" data-kind="${kind}"><legend>${title}</legend>
    <label title="${WHY.railStripWidth}">strip <input type="range" min="0" max="96" step="2" ${k("railStripWidth")} value="${auto ? 30 : f.railStripWidth}"${auto ? " disabled" : ""} /> <output>${auto ? "rail width" : `${f.railStripWidth} px`}</output></label>
    <label title="${WHY.railStripWidth}"><input type="checkbox" ${k("auto")}${auto ? " checked" : ""} /> rail width</label>
    <label title="${WHY.railVisibility}">show <select ${k("railVisibility")}>${RAIL_VISIBILITIES.map((v) => opt(v, f.railVisibility, v === "whileDragging" ? "while dragging" : v)).join("")}</select></label>
    <label title="${WHY.magnet}">magnet <input type="range" min="0" max="24" step="1" ${k("magnet")} value="${f.magnet}" /> <output>${f.magnet} px</output></label>
    <label title="${WHY.floatNearEdge}"><input type="checkbox" ${k("floatNearEdge")}${f.floatNearEdge ? " checked" : ""} /> float near the edge</label>
    <label title="${WHY.railArmDwellMs}">dwell <input type="range" min="0" max="800" step="10" ${k("railArmDwellMs")} value="${f.railArmDwellMs}" /> <output>${f.railArmDwellMs} ms</output></label>
    <label title="${WHY.modifiers}"><input type="checkbox" ${k("modifiers.on")}${f.modifiers.on ? " checked" : ""} /> keys</label>
    <label title="${WHY.modifiers}">float <select ${k("modifiers.floatKey")}>${MODIFIER_KEYS.map((m) => opt(m, f.modifiers.floatKey)).join("")}</select></label>
    <label title="${WHY.modifiers}">rail <select ${k("modifiers.railKey")}>${MODIFIER_KEYS.map((m) => opt(m, f.modifiers.railKey)).join("")}</select></label>
  </fieldset>`;
}

/** The feel a control's change gives. */
function changed(feel: DragFeel, path: string, el: HTMLInputElement | HTMLSelectElement): DragFeel {
  const [kind, name, sub] = path.split(".") as [FeelKind, string, string | undefined];
  const f = feel[kind];
  const value = el instanceof HTMLInputElement && el.type === "checkbox" ? el.checked : el instanceof HTMLInputElement && el.type === "range" ? Number(el.value) : el.value;
  let next: KindFeel;
  if (name === "auto") next = { ...f, railStripWidth: value ? null : 30 };
  else if (name === "modifiers" && sub) next = { ...f, modifiers: { ...f.modifiers, [sub]: value } };
  else next = { ...f, [name]: value };
  return { ...feel, [kind]: next };
}

/**
 * Builds the controls into `body`, starting from the stored feel; `apply` gets every change (and the start). Returns
 * `set(feel)` to set it from code (a check), which redraws the controls and stores it.
 */
export function feelPanel(body: HTMLElement, storageKey: string, apply: (feel: DragFeel) => void): { set: (feel: DragFeel) => void; reset: () => void } {
  let feel = readFeel(storageKey);
  const draw = (): void => {
    body.innerHTML = SECTIONS.map((s) => sectionHtml(s.kind, s.title, feel[s.kind])).join("");
  };
  const set = (next: DragFeel, redraw = true): void => {
    feel = next;
    storeFeel(storageKey, feel);
    if (redraw) draw();
    apply(feel);
  };
  body.addEventListener("input", (e) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    const path = el.dataset.feel;
    if (!path) return;
    // A slider keeps its element while it moves (only its readout changes); a toggle or a choice redraws the section.
    const slider = el instanceof HTMLInputElement && el.type === "range";
    set(changed(feel, path, el), !slider);
    const out = el.parentElement?.querySelector("output");
    if (slider && out) out.textContent = `${el.value} ${path.endsWith("DwellMs") ? "ms" : "px"}`;
  });
  draw();
  apply(feel);
  return { set, reset: () => set(DEFAULT_FEEL) };
}
