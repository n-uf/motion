/**
 * A small menu for the desk's handles: anchored at a point, items with a check, a greyed state and a submenu (a
 * flyout to the side); a note line on top. Keyboard: the arrows move between items (right opens a submenu, left
 * closes it), Enter or Space picks, Escape closes; a press outside closes it. One menu at a time.
 */

export interface MenuItem {
  readonly label: string;
  readonly disabled?: boolean;
  readonly checked?: boolean;
  /** A line that only says something (why items are greyed). */
  readonly note?: boolean;
  readonly items?: readonly MenuItem[];
  readonly action?: () => void;
}

let open: { root: HTMLElement; close: () => void } | null = null;

export const menuOpen = (): HTMLElement | null => open?.root ?? null;
export function closeMenu(): void {
  open?.close();
}

/** Open a menu at (x, y) in `host`'s coordinates (absolutely positioned there); `label` names it for assistive tech. */
export function openMenu(host: HTMLElement, x: number, y: number, items: readonly MenuItem[], label: string, returnFocus?: HTMLElement): HTMLElement {
  closeMenu();
  const root = build(items, label);
  root.style.left = `${x}px`;
  root.style.top = `${y}px`;
  host.append(root);
  // Keep it inside the host.
  const maxX = host.clientWidth - root.offsetWidth - 4;
  if (x > maxX) root.style.left = `${Math.max(4, maxX)}px`;
  const outside = (e: PointerEvent): void => {
    if (!root.contains(e.target as Node)) closeMenu();
  };
  const close = (): void => {
    root.remove();
    document.removeEventListener("pointerdown", outside, true);
    open = null;
    returnFocus?.focus();
  };
  document.addEventListener("pointerdown", outside, true);
  open = { root, close };
  first(root)?.focus();
  return root;
}

const first = (list: HTMLElement): HTMLButtonElement | null => list.querySelector<HTMLButtonElement>(":scope > li > button:not([disabled])");

function build(items: readonly MenuItem[], label: string): HTMLUListElement {
  const ul = document.createElement("ul");
  ul.className = "tg-menu";
  ul.setAttribute("role", "menu");
  ul.setAttribute("aria-label", label);
  for (const it of items) {
    const li = document.createElement("li");
    if (it.note) {
      li.className = "tg-menu-note";
      li.textContent = it.label;
      ul.append(li);
      continue;
    }
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", it.checked === undefined ? "menuitem" : "menuitemradio");
    if (it.checked !== undefined) b.setAttribute("aria-checked", String(it.checked));
    b.disabled = !!it.disabled;
    b.innerHTML = `<span class="tg-menu-check">${it.checked ? "✓" : ""}</span><span class="tg-menu-label"></span>${it.items ? '<span class="tg-menu-sub">›</span>' : ""}`;
    b.querySelector(".tg-menu-label")!.textContent = it.label;
    li.append(b);
    if (it.items) {
      const sub = build(it.items, it.label);
      sub.classList.add("tg-submenu");
      li.append(sub);
      b.setAttribute("aria-haspopup", "menu");
      const show = (): void => {
        ul.querySelectorAll(":scope > li.open").forEach((x) => x !== li && x.classList.remove("open"));
        li.classList.add("open");
      };
      b.addEventListener("pointerenter", show);
      b.addEventListener("click", () => {
        show();
        first(sub)?.focus();
      });
    } else {
      b.addEventListener("pointerenter", () => ul.querySelectorAll(":scope > li.open").forEach((x) => x.classList.remove("open")));
      b.addEventListener("click", () => {
        if (b.disabled) return;
        closeMenu();
        it.action?.();
      });
    }
    ul.append(li);
  }
  ul.addEventListener("keydown", (e) => {
    const buttons = [...ul.querySelectorAll<HTMLButtonElement>(":scope > li > button:not([disabled])")];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    const go = (i: number): void => buttons[(i + buttons.length) % buttons.length]?.focus();
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "ArrowRight" && buttons[at]!.getAttribute("aria-haspopup")) buttons[at]!.click();
    else if (e.key === "ArrowLeft" && ul.classList.contains("tg-submenu")) {
      ul.parentElement?.classList.remove("open");
      ul.parentElement?.querySelector<HTMLButtonElement>(":scope > button")?.focus();
    } else if (e.key === "Escape") closeMenu();
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
  return ul;
}
