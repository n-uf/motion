/**
 * The drop preview every drag demo shares, in three modes (the switch reads "Drop indicator · Open gap · Snap to
 * slot"; Snap to slot is the default, remembered per visitor):
 *
 * - "indicator": nothing moves while dragging; only the outline or the insertion marker.
 * - "gap": after the room delay the neighbours open the slot; the item stays under the pointer.
 * - "snap": the gap opens and the item glides into it.
 *
 * `previewPlan` turns a mode into what a demo does. It mirrors `previewPlan` in `@n-uf/motion/drag`; once that lands,
 * importing it from there is the only change.
 */
export type DropMode = "indicator" | "gap" | "snap";
export const DROP_MODES: readonly DropMode[] = ["indicator", "gap", "snap"];
const KEY = "motion-drop-mode";

export interface PreviewPlan {
  /** Draw the outline or insertion marker. */
  readonly outline: boolean;
  /** The neighbours make room: the slot opens. */
  readonly room: boolean;
  /** The dragged item glides into the opened slot. */
  readonly glide: boolean;
}
export function previewPlan(mode: DropMode): PreviewPlan {
  return { outline: mode !== "snap", room: mode !== "indicator", glide: mode === "snap" };
}

let mode: DropMode = (() => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "indicator" || v === "gap" ? v : "snap";
  } catch {
    return "snap";
  }
})();
const listeners = new Set<(m: DropMode) => void>();

export const dropMode = (): DropMode => mode;

/** Set the mode; `remember` stores it for the visitor (the showcase's own switches don't). */
export function setDropMode(m: DropMode, remember = true): void {
  mode = m;
  if (remember) {
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* storage blocked: the choice lasts for this page */
    }
  }
  listeners.forEach((f) => f(m));
}

/** Call `f` when the mode changes. */
export const onDropMode = (f: (m: DropMode) => void): void => void listeners.add(f);

/** Bind the "Drop indicator · Open gap · Snap to slot" buttons (`[data-drop-mode]`) under `root`. */
export function bindDropMode(root: ParentNode, onChange?: (m: DropMode) => void): void {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-drop-mode]")];
  const sync = (m: DropMode): void => buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.dropMode === m)));
  buttons.forEach((b) => b.addEventListener("click", () => setDropMode(b.dataset.dropMode as DropMode)));
  listeners.add((m) => {
    sync(m);
    onChange?.(m);
  });
  sync(mode);
}
