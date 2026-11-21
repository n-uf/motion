/**
 * The drop preview every drag demo shares, in the library's own `PreviewMode` ids (`@n-uf/motion/drag`; the switch reads
 * "Outline · Placeholder · Glide", Glide is the default, `DRAG_PREVIEW_DEFAULT`, remembered per visitor):
 *
 * - "outline": nothing moves; only the outline or the insertion marker.
 * - "placeholder": after the room delay the neighbors open the slot; the item stays under the pointer.
 * - "glide": the slot opens and the item glides into it.
 *
 * The library has a fourth mode, "snap" (the dragged item is the only preview, no indicator at all), which the switch
 * leaves out: these demos always draw the slot. `previewPlan` here is the library's, asked for a frame whose landing
 * shows with its room open: what a demo draws once the pointer aims and the room delay has passed. A demo that has a
 * frame gives that frame to the library's `previewPlan` with `dropPreview()` instead.
 */
import { previewPlan as libraryPlan, type DragPreview, type PreviewFrame, type PreviewMode } from "@n-uf/motion/drag";

export type DropMode = Exclude<PreviewMode, "snap">;
export const DROP_MODES: readonly DropMode[] = ["outline", "placeholder", "glide"];
const KEY = "motion-drop-mode";
const DEFAULT: DropMode = "glide";

/** The id a visitor stored before the switch took the library's names: indicator, gap and snap. */
const OLD_ID: Readonly<Record<string, DropMode>> = { indicator: "outline", gap: "placeholder", snap: "glide" };
const asMode = (v: string | null): DropMode => DROP_MODES.find((m) => m === v) ?? OLD_ID[v ?? ""] ?? DEFAULT;

/** What a demo does for a mode (the library's `PreviewPlan`, by the demos' own words). */
export interface DropPlan {
  /** Draw the outline or insertion marker. */
  readonly outline: boolean;
  /** The neighbors make room: the slot opens. */
  readonly room: boolean;
  /** The dragged item glides into the opened slot. */
  readonly glide: boolean;
}

/** A frame whose landing shows in a slotted lane with its room open: the best a drag gets, which is what the modes differ in. */
const OPEN: PreviewFrame = { region: "lane", landing: { x: 0, y: 0, width: 0, height: 0 }, room: true };

export function previewPlan(mode: DropMode): DropPlan {
  const plan = libraryPlan(OPEN, mode);
  return { outline: plan.showIndicator, room: plan.makeRoom, glide: plan.snapItem };
}

let mode: DropMode = (() => {
  try {
    return asMode(localStorage.getItem(KEY));
  } catch {
    return DEFAULT;
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

/** The visitor's preview as the library takes it, for `previewPlan(frame, dropPreview())`: no place guides, as the demos draw none. */
export const dropPreview = (): DragPreview => ({ mode, placeGuides: "off" });

/** Bind the "Outline · Placeholder · Glide" buttons (`[data-drop-mode]`) under `root`. */
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
