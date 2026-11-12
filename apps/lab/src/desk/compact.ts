/**
 * The toolbar groups' compact forms and their » popover: the foundations' rules for a side edge, the lab's part.
 *
 * - Compact forms (CSS, keyed by the group's `data-g`): on a side edge text never rotates and the edge never widens
 *   for one group. The document's title collapses to its grip + »; zoom stacks + / value / − with the value in mono
 *   and no "%"; words (share, print) become their icons; icon groups stay icons. Captions are dropped there; the
 *   grip's tooltip and its menu's first line name the group.
 * - The » popover: » is a real button (focusable, `aria-haspopup`, `aria-expanded`). It opens a popover anchored to
 *   it, beside a side edge or below/above a bar, showing the group's full horizontal form with working controls (a
 *   press on one presses the group's own control). Escape, a press outside, focus leaving it or a drag starting
 *   anywhere on the window closes it; focus returns to ».
 * - One selected style for segmented controls: the accent inset ring (lab.css).
 */

/** The zoom value's markup: the "%" is its own span, so the side-edge form can drop it. */
export const zoomValue = (pct: number): string => `${pct}<span class="tg-pct">%</span>`;

interface Open {
  readonly root: HTMLElement;
  readonly over: HTMLButtonElement;
  readonly close: (refocus: boolean) => void;
}
let open: Open | null = null;

/** The popover showing now, if any. */
export const overflowOpen = (): HTMLElement | null => open?.root ?? null;

/** Close the popover (focus back on its » when `refocus`). */
export function closeOverflow(refocus = true): void {
  open?.close(refocus);
}

/**
 * Make a group's » a real button that opens its popover. `inner` is the group's content (its `.tg-ctl` is the full
 * form), `layer` the window's overlay the popover is drawn in (window coordinates), `label` the group's name.
 */
export function wireOverflow(over: HTMLButtonElement, inner: HTMLElement, layer: HTMLElement, label: string): void {
  over.tabIndex = 0;
  over.title = `More: ${label}`;
  over.setAttribute("aria-label", `${label}: show all controls`);
  over.setAttribute("aria-haspopup", "dialog");
  over.setAttribute("aria-expanded", "false");
  over.addEventListener("click", (e) => {
    e.stopPropagation();
    if (open?.over === over) closeOverflow();
    else openOverflow(over, inner, layer, label);
  });
}

/** A page rect in `win`'s own coordinates (the window may be drawn scaled). */
function inWindow(win: HTMLElement, r: DOMRect): { x: number; y: number; width: number; height: number } {
  const w = win.getBoundingClientRect();
  const k = win.offsetWidth / (w.width || 1);
  return { x: (r.left - w.left) * k, y: (r.top - w.top) * k, width: r.width * k, height: r.height * k };
}

function openOverflow(over: HTMLButtonElement, inner: HTMLElement, layer: HTMLElement, label: string): void {
  closeOverflow(false);
  const ctl = inner.querySelector<HTMLElement>(".tg-ctl");
  if (!ctl) return;
  const win = layer.parentElement ?? layer;
  const root = document.createElement("div");
  root.className = "tg-pop";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", label);
  const group = document.createElement("div");
  group.className = "tgroup tg-popgroup";
  const row = document.createElement("div");
  row.className = "tg-in";
  group.append(row);
  root.append(group);

  /** The full form, cloned from the group's own controls (so it shows their state now). */
  const originals = (): HTMLButtonElement[] => [...ctl.querySelectorAll<HTMLButtonElement>("button")];
  const fill = (focusAt = -1): void => {
    const copy = ctl.cloneNode(true) as HTMLElement;
    copy.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
      b.tabIndex = 0;
      b.removeAttribute("id");
    });
    row.replaceChildren(copy);
    if (focusAt >= 0) copy.querySelectorAll<HTMLButtonElement>("button")[focusAt]?.focus();
  };
  fill();
  // A press on a control presses the group's own one; the copy then shows its new state.
  root.addEventListener("click", (e) => {
    const b = (e.target as Element).closest("button");
    if (!b) return;
    const i = [...row.querySelectorAll("button")].indexOf(b);
    originals()[i]?.click();
    fill(i);
  });

  layer.append(root);
  // Beside a side edge (away from it), else below a bar in the upper half and above one in the lower half.
  const r = inWindow(win, over.getBoundingClientRect());
  const W = win.clientWidth;
  const H = win.clientHeight;
  const w = root.offsetWidth;
  const h = root.offsetHeight;
  const side = !!over.closest(".tgroup.v");
  let x: number;
  let y: number;
  if (side) {
    x = r.x + r.width / 2 < W / 2 ? r.x + r.width + 8 : r.x - w - 8;
    y = r.y + r.height / 2 - h / 2;
  } else {
    x = r.x + r.width / 2 - w / 2;
    y = r.y + r.height / 2 < H / 2 ? r.y + r.height + 8 : r.y - h - 8;
  }
  root.style.left = `${Math.max(4, Math.min(x, W - w - 4))}px`;
  root.style.top = `${Math.max(4, Math.min(y, H - h - 4))}px`;

  const outside = (e: PointerEvent): void => {
    if (!root.contains(e.target as Node) && e.target !== over && !over.contains(e.target as Node)) closeOverflow(true);
  };
  const keys = (e: KeyboardEvent): void => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    closeOverflow(true);
  };
  const leave = (e: FocusEvent): void => {
    const to = e.relatedTarget as Node | null;
    if (to && !root.contains(to) && to !== over) closeOverflow(false);
  };
  // A drag starting anywhere on the window (a group or a panel lifted) closes it.
  const watch = new MutationObserver(() => {
    if (win.querySelector(".tgroup.lifted, .win.lifted")) closeOverflow(false);
  });
  watch.observe(win, { subtree: true, attributes: true, attributeFilter: ["class"] });
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("keydown", keys, true);
  root.addEventListener("focusout", leave);
  over.setAttribute("aria-expanded", "true");
  const close = (refocus: boolean): void => {
    watch.disconnect();
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", keys, true);
    root.remove();
    over.setAttribute("aria-expanded", "false");
    open = null;
    if (refocus && over.isConnected) over.focus();
  };
  open = { root, over, close };
  root.querySelector<HTMLButtonElement>("button")?.focus();
}
