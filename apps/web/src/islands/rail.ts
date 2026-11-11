/**
 * Shared island helpers: start a figure when it scrolls into view, bind the case rail the server rendered, and
 * paint range tracks.
 */

/** Run `start` once, the first time `el` comes near the viewport. */
export function whenVisible(el: Element, start: () => void): void {
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      start();
    },
    { rootMargin: "200px" },
  );
  io.observe(el);
}

/**
 * Bind the case buttons the server rendered in `host`; `pick(i)` runs on a click. Returns a function that marks case
 * `i` as pressed (or none with -1) and keeps it in view inside the rail, without scrolling the page.
 */
export function caseRail(host: HTMLElement, pick: (i: number) => void): (i: number) => void {
  const buttons = [...host.querySelectorAll<HTMLButtonElement>("button.case")];
  buttons.forEach((b, i) => b.addEventListener("click", () => pick(i)));
  return (active: number) => {
    buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(i === active)));
    const b = buttons[active];
    if (!b) return;
    const vertical = host.scrollHeight > host.clientHeight + 1;
    const horizontal = host.scrollWidth > host.clientWidth + 1;
    if (vertical) {
      if (b.offsetTop < host.scrollTop) host.scrollTop = b.offsetTop - 8;
      else if (b.offsetTop + b.offsetHeight > host.scrollTop + host.clientHeight) host.scrollTop = b.offsetTop + b.offsetHeight - host.clientHeight + 8;
    } else if (horizontal) {
      if (b.offsetLeft < host.scrollLeft) host.scrollLeft = b.offsetLeft - 8;
      else if (b.offsetLeft + b.offsetWidth > host.scrollLeft + host.clientWidth) host.scrollLeft = b.offsetLeft + b.offsetWidth - host.clientWidth + 8;
    }
  };
}

/** Paint a range's filled part (WebKit has no progress pseudo-element). */
export function fillRange(input: HTMLInputElement): void {
  const min = +input.min || 0, max = +input.max || 100;
  input.style.setProperty("--fill", `${((+input.value - min) / (max - min)) * 100}%`);
}
export function fillRanges(root: ParentNode): void {
  root.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach((r) => {
    fillRange(r);
    r.addEventListener("input", () => fillRange(r));
  });
}

export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
