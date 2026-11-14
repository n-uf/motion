/**
 * The Stack · store, freeze, no jump page: the same window as the floats page, on the stored form (`storeStack`,
 * `storeFloats` in localStorage; Reload rebuilds from it, C13), a freeze that hides the grips and moves nothing unless
 * Alt is held (C14, the app's flag read at the press) and a count badge and a phase on every item that move no other
 * item when they change (C15).
 *
 * The page writes every word. The scripted scenarios (keep-scenarios.ts) drive it through `page`.
 */
import { createBoard, type Board } from "./board";
import { ALL, PHASES, isPanel, titleOf, type ItemId, type Phase } from "./sample";

const stage = document.getElementById("sk-stage") as HTMLDivElement;
const status = document.getElementById("st-status") as HTMLParagraphElement;
const freeze = document.getElementById("sk-freeze") as HTMLInputElement;
const table = document.getElementById("sk-items") as HTMLTableSectionElement;
const stored = document.getElementById("sk-stored") as HTMLPreElement;
const heightIn = document.getElementById("sk-height") as HTMLInputElement;
const heightOut = document.getElementById("sk-height-out") as HTMLOutputElement;

let board: Board | undefined;
const rows = new Map<ItemId, HTMLTableRowElement>();

/** Show the board's state in the controls: counts, phases, kept, folded, the freeze and the stored form. */
function refresh(): void {
  if (!board) return;
  const meta = board.meta;
  const kept = board.kept;
  const from = board.from;
  for (const id of ALL) {
    const row = rows.get(id);
    if (!row) continue;
    const count = row.querySelector<HTMLInputElement>(".sk-count")!;
    if (document.activeElement !== count) count.value = String(meta[id].count);
    row.querySelector<HTMLSelectElement>(".sk-phase")!.value = meta[id].phase;
    row.querySelector<HTMLInputElement>(".sk-kept")!.checked = kept.includes(id);
    const fold = row.querySelector<HTMLButtonElement>(".sk-fold");
    if (fold) fold.textContent = (from[id] ?? 0) >= 1 ? "open" : "fold";
  }
  freeze.checked = board.frozen;
  heightIn.value = String(board.height);
  heightOut.textContent = `${board.height} px`;
  const s = board.stored();
  stored.textContent = `column ${s.column}\nbar ${s.bar}\nfloats ${s.floats}`;
}

board = createBoard({ stage, status, key: "motion-lab:stack-keep", autosave: true, restore: true, onChange: refresh });

for (const id of ALL) {
  const tr = document.createElement("tr");
  tr.dataset.id = id;
  tr.innerHTML =
    `<th scope="row">${titleOf(id)}</th>` +
    `<td><input type="number" class="sk-count" min="0" max="100000" step="1" aria-label="${titleOf(id)} count" style="width:5.5em" /></td>` +
    `<td><select class="sk-phase" aria-label="${titleOf(id)} phase">${PHASES.map((p) => `<option>${p}</option>`).join("")}</select></td>` +
    `<td><input type="checkbox" class="sk-kept" aria-label="Keep ${titleOf(id)}" /></td>` +
    `<td>${isPanel(id) ? `<button type="button" class="sk-fold" aria-label="Fold ${titleOf(id)} by hand">fold</button>` : ""}</td>`;
  tr.querySelector(".sk-count")!.addEventListener("input", (e) => board!.setMeta(id, { count: Math.max(0, Number((e.target as HTMLInputElement).value) || 0) }));
  tr.querySelector(".sk-phase")!.addEventListener("change", (e) => board!.setMeta(id, { phase: (e.target as HTMLSelectElement).value as Phase }));
  tr.querySelector(".sk-kept")!.addEventListener("change", (e) => board!.keep(id, (e.target as HTMLInputElement).checked));
  tr.querySelector(".sk-fold")?.addEventListener("click", () => board!.fold(id));
  rows.set(id, tr);
  table.append(tr);
}
freeze.addEventListener("change", () => board!.setFrozen(freeze.checked));
heightIn.addEventListener("input", () => board!.setHeight(Number(heightIn.value)));
document.getElementById("sk-reload")!.addEventListener("click", () => board!.reload());
document.getElementById("sk-reset")!.addEventListener("click", () => board!.reset());
refresh();

/** What the scenarios read and drive. */
export const page = {
  board: board as Board,
  reset(): void {
    board!.reset();
  },
  get freezeBox() {
    return freeze;
  },
};
export type KeepPage = typeof page;
