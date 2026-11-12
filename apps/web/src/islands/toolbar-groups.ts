/**
 * Toolbar groups (island): the sample window's groups dock into five slots of three zones each, or float; one dotted
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

// The figure's own chrome; its lock freezes the sample window too.
const outer = figureChrome(figure);
const freezeInput = figure.querySelector<HTMLInputElement>("[data-chrome-freeze]")!;
const sample = createChrome({
  root: $("win"),
  labels: Object.fromEntries(Object.entries(GROUPS).map(([k, g]) => [k, g.label])),
  initial: CASES[0]!.m,
  freeze: { input: freezeInput, lock: freezeInput.closest<HTMLElement>(".lock")! },
  onStatus: setStatus,
  onChange: () => syncCases(-1),
});

const casesEl = $("cases");
const syncCases = caseRail(casesEl, (i) => {
  sample.setModel(clone(CASES[i]!.m));
  syncCases(i);
  setStatus(CASES[i]!.note);
});
syncCases(0);

(window as unknown as Record<string, unknown>).__toolbarSketch = {
  cases: CASES.length,
  apply: (i: number) => (casesEl.querySelectorAll("button.case")[i] as HTMLElement).click(),
  model: () => sample.model(),
  drag: () => sample.drag(),
  chrome: () => outer.model(),
};
