/**
 * The desk's frozen layout: one state and the one switch that sets it (a lock switch: a track and knob, a lock open
 * or shut, "Layout unlocked" / "Layout frozen", and a "hold Alt to move" hint while frozen). Every part that has grips
 * (the panels', the toolbar groups') only reads the state and listens for changes; nothing else makes a switch.
 */

let frozen = false;
let input: HTMLInputElement | null = null;
const listeners = new Set<() => void>();

/** The layout is frozen (whether Alt is held is each part's own reading of the keyboard). */
export const isLayoutFrozen = (): boolean => frozen;

/** Freeze or unfreeze the layout: the switch shows it, and every listener follows. */
export function setLayoutFrozen(on: boolean): void {
  if (on === frozen) return;
  frozen = on;
  if (input) input.checked = on;
  document.body.dataset.layoutFrozen = String(on);
  for (const f of listeners) f();
}

/** Call `f` whenever the layout freezes or unfreezes; returns how to stop. */
export function onFreezeChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

const OPEN = `<svg class="ico open" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.7"/></svg>`;
const SHUT = `<svg class="ico shut" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>`;

/** Put the lock switch into `where` (once: a second call moves it there). */
export function mountFreezeSwitch(where: Element): HTMLLabelElement {
  let lock = input?.closest<HTMLLabelElement>("label.lock") ?? null;
  if (!lock) {
    lock = document.createElement("label");
    lock.className = "lock";
    lock.title = "Freeze or unfreeze the layout";
    lock.innerHTML = `<input type="checkbox" name="freeze" role="switch" aria-label="Freeze layout" />${OPEN}${SHUT}<span class="state"></span><span class="lockhint">hold <kbd>Alt</kbd> to move</span>`;
    input = lock.querySelector("input")!;
    input.checked = frozen;
    input.addEventListener("change", () => setLayoutFrozen(input!.checked));
  }
  where.append(lock);
  return lock;
}
