/**
 * The Stack · forms page: a column and a bar of the same six sample items (three panels, three groups) on
 * @n-uf/placement/stack. The length and width sliders, and a toggle per item, drive `fitStack`; every rect drawn is the
 * solver's. The column and the bar are independent examples with their own ages, kept and open state: a use in one never
 * changes the other. A bar is a toolbar edge, so a panel there starts at its header (it has no open form) and the bar is
 * at most 40 px tall. The page writes every word: the package gives forms, kinds and coded notes.
 * The scripted scenarios (forms-scenarios.ts) drive it through `page`.
 */
import { fitStack, type StackFit } from "@n-uf/placement/stack";
import { ALL, GROUPS, PANELS, inputOf, isPanel, titleOf, type ItemId, type Placed } from "./sample";
import { createStackView, type StackView } from "./view";
import { sayFit } from "./words";

const DEFAULT_LENGTH = 520;
const DEFAULT_WIDTH = 360;
const COLUMN_AT = { x: 24, y: 44 };
const BAR_AT = { x: 430, y: 44 };

interface State {
  /** In the stacks at all (the solver is given the item or not). */
  shown: boolean;
  /** A panel: open, or folded by hand to its header. (A group has none.) */
  open: boolean;
  kept: boolean;
  used: number;
}
const item = (used: number): State => ({ shown: true, open: true, kept: false, used });
const freshState = (): Record<ItemId, State> => ({
  pages: item(1),
  annotations: item(2),
  findings: item(3),
  views: item(4),
  tools: item(5),
  zoom: item(6),
});

/**
 * The column and the bar are two independent examples: each has its own items' state (shown, open, kept, used) and its
 * own use clock, so a click or a use in one never changes the other. They share the sliders and nothing else.
 */
type Side = "column" | "bar";
const SIDES: readonly Side[] = ["column", "bar"];
const bothFresh = (): Record<Side, Record<ItemId, State>> => ({ column: freshState(), bar: freshState() });
let items = bothFresh();
let clock: Record<Side, number> = { column: 6, bar: 6 };
const sidesOf = (side?: Side): readonly Side[] => (side ? [side] : SIDES);
let length = DEFAULT_LENGTH;
let width = DEFAULT_WIDTH;

const stage = document.getElementById("sf-stage") as HTMLDivElement;
const status = document.getElementById("st-status") as HTMLParagraphElement;
const lengthIn = document.getElementById("sf-length") as HTMLInputElement;
const widthIn = document.getElementById("sf-width") as HTMLInputElement;
const lengthOut = document.getElementById("sf-length-out") as HTMLOutputElement;
const widthOut = document.getElementById("sf-width-out") as HTMLOutputElement;
const table = document.getElementById("sf-items") as HTMLTableSectionElement;

const label = (text: string, x: number, y: number): void => {
  const l = document.createElement("div");
  l.className = "st-zone-label";
  l.textContent = text;
  l.style.left = `${x}px`;
  l.style.top = `${y}px`;
  stage.append(l);
};
label("Column (a side edge)", COLUMN_AT.x, 18);
label("Bar (the top edge)", BAR_AT.x, 18);
const column = createStackView(stage, "column", "Column");
const bar = createStackView(stage, "row", "Bar");
column.el.style.left = `${COLUMN_AT.x}px`;
column.el.style.top = `${COLUMN_AT.y}px`;
bar.el.style.left = `${BAR_AT.x}px`;
bar.el.style.top = `${BAR_AT.y}px`;

/** One stack's items as placed: those shown; in the column a panel folded by hand starts at its header (the bar's panels already do). */
const placedIn = (side: Side): Placed[] =>
  ALL.filter((id) => items[side][id].shown).map((id) => ({ id, used: items[side][id].used, kept: items[side][id].kept, from: side === "column" && isPanel(id) && !items[side][id].open ? 1 : 0 }));
/** The column's items as placed (for the scenarios that look at one list). */
const placed = (): Placed[] => placedIn("column");

// --- the page --------------------------------------------------------------------------------------------------------

let colFit: StackFit = fitStack(inputOf("column", length, placedIn("column"), width));
let barFit: StackFit = fitStack(inputOf("row", length, placedIn("bar")));

/**
 * Draw. `keep` solves with the fit on screen as `previous`, as a host does for a press: the forms that still fit stay, so a
 * change of ages alone reshapes nothing. Everything else (a slider, a toggle, a scenario's setup) solves fresh.
 */
function render(keep = false): void {
  colFit = fitStack(inputOf("column", length, placedIn("column"), width), keep ? { previous: colFit } : {});
  barFit = fitStack(inputOf("row", length, placedIn("bar")), keep ? { previous: barFit } : {});
  column.draw(colFit);
  bar.draw(barFit);
  stage.style.width = `${BAR_AT.x + length + 24}px`;
  stage.style.height = `${COLUMN_AT.y + Math.max(length, barFit.cross) + 24}px`;
  lengthOut.textContent = `${length} px`;
  widthOut.textContent = `${width} px`;
  for (const id of ALL) {
    const row = table.querySelector<HTMLElement>(`[data-id="${id}"]`);
    if (!row) continue;
    for (const side of SIDES) {
      const cell = row.querySelector<HTMLElement>(`[data-side="${side}"]`)!;
      cell.querySelector<HTMLInputElement>(".sf-shown")!.checked = items[side][id].shown;
      const open = cell.querySelector<HTMLInputElement>(".sf-open");
      if (open) open.checked = items[side][id].open;
      cell.querySelector<HTMLInputElement>(".sf-kept")!.checked = items[side][id].kept;
      cell.querySelector<HTMLElement>(".sf-used")!.textContent = String(items[side][id].used);
    }
  }
  status.textContent = `${sayFit("Column", colFit)} ${sayFit("Bar", barFit)}`;
}

/** One stack's controls for an item: shown, open (a column's panel; a bar's has no open form), kept, and its age with a use button. */
const cellFor = (id: ItemId, side: Side): string =>
  `<td data-side="${side}"><label><input type="checkbox" class="sf-shown" aria-label="Show ${titleOf(id)} in the ${side}" /> shown</label> ` +
  (isPanel(id) && side === "column" ? `<label><input type="checkbox" class="sf-open" aria-label="${titleOf(id)} open in the column" /> open</label> ` : "") +
  `<label><input type="checkbox" class="sf-kept" aria-label="Keep ${titleOf(id)} in the ${side}" /> kept</label> ` +
  `<span class="sf-used"></span> <button type="button" class="sf-use" aria-label="Use ${titleOf(id)} in the ${side}">use</button></td>`;

function buildTable(): void {
  table.replaceChildren(
    ...ALL.map((id) => {
      const tr = document.createElement("tr");
      tr.dataset.id = id;
      tr.innerHTML = `<th scope="row">${titleOf(id)}</th>${cellFor(id, "column")}${cellFor(id, "bar")}`;
      for (const side of SIDES) {
        const cell = tr.querySelector<HTMLElement>(`[data-side="${side}"]`)!;
        cell.querySelector(".sf-shown")!.addEventListener("change", (e) => setShown(id, (e.target as HTMLInputElement).checked, side));
        cell.querySelector(".sf-open")?.addEventListener("change", (e) => setOpen(id, (e.target as HTMLInputElement).checked, side));
        cell.querySelector(".sf-kept")!.addEventListener("change", (e) => setKept(id, (e.target as HTMLInputElement).checked, side));
        cell.querySelector(".sf-use")!.addEventListener("click", () => use(id, side));
      }
      return tr;
    }),
  );
}

function setLength(n: number): void {
  length = Math.min(Math.max(Math.round(n), Number(lengthIn.min)), Number(lengthIn.max));
  lengthIn.value = String(length);
  render();
}
function setWidth(n: number): void {
  width = Math.min(Math.max(Math.round(n), Number(widthIn.min)), Number(widthIn.max));
  widthIn.value = String(width);
  render();
}
// Each takes the side it acts on; none means both (a scenario setting up a start for both examples).
function setShown(id: ItemId, shown: boolean, side?: Side): void {
  for (const s of sidesOf(side)) {
    items[s][id].shown = shown;
    // Showing is a use of it.
    if (shown) items[s][id].used = ++clock[s];
  }
  render();
}
function setOpen(id: ItemId, open: boolean, side?: Side): void {
  for (const s of sidesOf(side)) {
    items[s][id].open = open;
    // Opening is a use of it.
    if (open) items[s][id].used = ++clock[s];
  }
  render();
}
function setKept(id: ItemId, kept: boolean, side?: Side): void {
  for (const s of sidesOf(side)) items[s][id].kept = kept;
  render();
}
function use(id: ItemId, side?: Side): void {
  for (const s of sidesOf(side)) items[s][id].used = ++clock[s];
  render();
}
/** A press on an item: it counts as a use, and the stack keeps the forms that still fit (C23). */
function press(id: ItemId, side?: Side): void {
  for (const s of sidesOf(side)) items[s][id].used = ++clock[s];
  render(true);
}
/** Give every item an age by hand (oldest first), for the scenarios. */
function setAges(order: readonly ItemId[], side?: Side): void {
  for (const s of sidesOf(side)) {
    order.forEach((id, i) => (items[s][id].used = i + 1));
    clock[s] = order.length;
  }
  render();
}
function reset(): void {
  items = bothFresh();
  clock = { column: 6, bar: 6 };
  length = DEFAULT_LENGTH;
  width = DEFAULT_WIDTH;
  lengthIn.value = String(length);
  widthIn.value = String(width);
  render();
}

lengthIn.addEventListener("input", () => setLength(Number(lengthIn.value)));
widthIn.addEventListener("input", () => setWidth(Number(widthIn.value)));
document.getElementById("sf-reset")!.addEventListener("click", reset);
// A click on an item is a use of it, in the stack it is in: the other stack has its own ages.
stage.addEventListener("click", (e) => {
  const it = (e.target as HTMLElement).closest<HTMLElement>(".st-item");
  const stack = it?.closest<HTMLElement>(".st-stack");
  if (it?.dataset.id && stack) press(it.dataset.id as ItemId, stack.dataset.axis === "row" ? "bar" : "column");
});

buildTable();
render();

/** What the scenarios read and drive. */
export const page = {
  stage,
  column: column as StackView,
  bar: bar as StackView,
  setLength,
  setWidth,
  setShown,
  setOpen,
  setKept,
  use,
  press,
  setAges,
  reset,
  panels: PANELS,
  groups: GROUPS,
  all: ALL,
  get colFit() {
    return colFit;
  },
  get barFit() {
    return barFit;
  },
  get length() {
    return length;
  },
  get width() {
    return width;
  },
  get items() {
    return items;
  },
  get status() {
    return status.textContent ?? "";
  },
  /** The column's items as given to the solver. */
  placed,
  placedIn,
};
export type FormsPage = typeof page;
