/**
 * The drop preview mode every drag demo shares: "snap" (the dragged item glides into its slot once you aim) or
 * "indicator" (an outline marks the slot; the item stays under the pointer until release). Snap is the default.
 * The choice is remembered per visitor.
 */
export type DropMode = "snap" | "indicator";
const KEY = "motion-drop-mode";

let mode: DropMode = (() => {
  try {
    return localStorage.getItem(KEY) === "indicator" ? "indicator" : "snap";
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

/** Bind the "Snap to slot | Drop indicator" buttons (`[data-drop-mode]`) under `root`. */
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
