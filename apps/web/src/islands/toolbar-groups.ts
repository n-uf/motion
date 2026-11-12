/**
 * Toolbar groups (island): the sample window's groups dock into five hosts of three zones each, or float; one dotted
 * handle leads each group and carries all its actions. It runs on the same chrome module as every figure's bars
 * (islands/chrome.ts); the server rendered the default state and the cases, and this binds them.
 */
import { $, caseRail } from "./rail";
import { createChrome } from "./chrome";
import { figureChrome } from "./figure-chrome";
import { CASES, GROUPS, clone } from "../demos/toolbar";

const figure = $("figure");
const statusEl = $("status");
const setStatus = (t: string): void => void (statusEl.textContent = t);

// The figure's own chrome; its lock freezes the sample window too, and its ↺ Reset puts the sample back to case 1.
let activeCase = 0;
const outer = figureChrome(figure);
const freezeInput = figure.querySelector<HTMLInputElement>("[data-chrome-freeze]")!;
const sample = createChrome({
  root: $("win"),
  labels: Object.fromEntries(Object.entries(GROUPS).map(([k, g]) => [k, g.label])),
  initial: CASES[0]!.m,
  freeze: { input: freezeInput, lock: freezeInput.closest<HTMLElement>(".lock")! },
  onStatus: setStatus,
  onChange: () => {
    activeCase = -1;
    syncCases(-1);
    outer.demoChanged();
  },
});

const casesEl = $("cases");
function pick(i: number): void {
  activeCase = i;
  sample.setModel(clone(CASES[i]!.m));
  syncCases(i);
  setStatus(CASES[i]!.note);
  outer.demoChanged();
}
const syncCases = caseRail(casesEl, pick);
syncCases(0);
outer.setDemo({
  isDefault: () => activeCase === 0 && JSON.stringify(sample.model()) === JSON.stringify(CASES[0]!.m),
  reset: () => pick(0),
});

(window as unknown as Record<string, unknown>).__toolbarSketch = {
  cases: CASES.length,
  apply: (i: number) => (casesEl.querySelectorAll("button.case")[i] as HTMLElement).click(),
  model: () => sample.model(),
  drag: () => sample.drag(),
  chrome: () => outer.model(),
};
