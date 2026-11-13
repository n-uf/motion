/**
 * The Stack · forms page: a column and a bar of the same six sample items (three panels, three groups) on
 * @n-uf/placement/stack. The length and width sliders, and a toggle per item, drive `fitStack`; every rect drawn is the
 * solver's. The page writes every word: the package gives forms, kinds and coded notes.
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

let items = freshState();
let clock = 6;
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

/** The items as placed: those shown, a panel folded by hand starting at its header. */
const placed = (): Placed[] =>
  ALL.filter((id) => items[id].shown).map((id) => ({ id, used: items[id].used, kept: items[id].kept, from: isPanel(id) && !items[id].open ? 1 : 0 }));

// --- the page --------------------------------------------------------------------------------------------------------

let colFit: StackFit = fitStack(inputOf("column", length, placed(), width));
let barFit: StackFit = fitStack(inputOf("row", length, placed()));

function render(): void {
  colFit = fitStack(inputOf("column", length, placed(), width));
  barFit = fitStack(inputOf("row", length, placed()));
  column.draw(colFit);
  bar.draw(barFit);
  stage.style.width = `${BAR_AT.x + length + 24}px`;
  stage.style.height = `${COLUMN_AT.y + Math.max(length, barFit.cross) + 24}px`;
  lengthOut.textContent = `${length} px`;
  widthOut.textContent = `${width} px`;
  for (const id of ALL) {
    const row = table.querySelector<HTMLElement>(`[data-id="${id}"]`);
    if (!row) continue;
    row.querySelector<HTMLInputElement>(".sf-shown")!.checked = items[id].shown;
    const open = row.querySelector<HTMLInputElement>(".sf-open");
    if (open) open.checked = items[id].open;
    row.querySelector<HTMLInputElement>(".sf-kept")!.checked = items[id].kept;
    row.querySelector<HTMLElement>(".sf-used")!.textContent = String(items[id].used);
  }
  status.textContent = `${sayFit("Column", colFit)} ${sayFit("Bar", barFit)}`;
}

function buildTable(): void {
  table.replaceChildren(
    ...ALL.map((id) => {
      const tr = document.createElement("tr");
      tr.dataset.id = id;
      tr.innerHTML = `<th scope="row">${titleOf(id)}</th>` +
        `<td><label><input type="checkbox" class="sf-shown" aria-label="Show ${titleOf(id)}" /> shown</label></td>` +
        `<td>${isPanel(id) ? `<label><input type="checkbox" class="sf-open" aria-label="${titleOf(id)} open" /> open</label>` : ""}</td>` +
        `<td><label><input type="checkbox" class="sf-kept" aria-label="Keep ${titleOf(id)}" /> kept</label></td>` +
        `<td><span class="sf-used"></span> <button type="button" class="sf-use" aria-label="Use ${titleOf(id)}">use</button></td>`;
      tr.querySelector(".sf-shown")!.addEventListener("change", (e) => setShown(id, (e.target as HTMLInputElement).checked));
      tr.querySelector(".sf-open")?.addEventListener("change", (e) => setOpen(id, (e.target as HTMLInputElement).checked));
      tr.querySelector(".sf-kept")!.addEventListener("change", (e) => setKept(id, (e.target as HTMLInputElement).checked));
      tr.querySelector(".sf-use")!.addEventListener("click", () => use(id));
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
function setShown(id: ItemId, shown: boolean): void {
  items[id].shown = shown;
  // Showing is a use of it.
  if (shown) items[id].used = ++clock;
  render();
}
function setOpen(id: ItemId, open: boolean): void {
  items[id].open = open;
  // Opening is a use of it.
  if (open) items[id].used = ++clock;
  render();
}
function setKept(id: ItemId, kept: boolean): void {
  items[id].kept = kept;
  render();
}
function use(id: ItemId): void {
  items[id].used = ++clock;
  render();
}
/** Give every item an age by hand (oldest first), for the scenarios. */
function setAges(order: readonly ItemId[]): void {
  order.forEach((id, i) => (items[id].used = i + 1));
  clock = order.length;
  render();
}
function reset(): void {
  items = freshState();
  clock = 6;
  length = DEFAULT_LENGTH;
  width = DEFAULT_WIDTH;
  lengthIn.value = String(length);
  widthIn.value = String(width);
  render();
}

lengthIn.addEventListener("input", () => setLength(Number(lengthIn.value)));
widthIn.addEventListener("input", () => setWidth(Number(widthIn.value)));
document.getElementById("sf-reset")!.addEventListener("click", reset);
// A click on an item is a use of it.
stage.addEventListener("click", (e) => {
  const it = (e.target as HTMLElement).closest<HTMLElement>(".st-item");
  if (it?.dataset.id) use(it.dataset.id as ItemId);
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
  /** Items as given to the solver (axis-independent). */
  placed,
};
export type FormsPage = typeof page;
