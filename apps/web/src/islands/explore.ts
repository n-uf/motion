/**
 * Explore (island): the home's interactive pages. The preview on the right follows the entry under the pointer or the
 * keyboard focus, the first by default, and swaps at once (no transition). Nothing moves: the previews are static figures,
 * all in the server HTML, only the current one visible.
 */
export function startExplore(root: HTMLElement): void {
  const entries = [...root.querySelectorAll<HTMLElement>(".card-body")];
  const thumbs = [...root.querySelectorAll<HTMLElement>(".thumb")];
  let on = 0;
  const show = (i: number): void => {
    if (i === on) return;
    entries[on]?.classList.remove("on");
    thumbs[on]?.classList.remove("on");
    on = i;
    entries[i]?.classList.add("on");
    thumbs[i]?.classList.add("on");
  };
  entries.forEach((e, i) => {
    e.addEventListener("pointerenter", () => show(i));
    e.addEventListener("focusin", () => show(i));
  });
}
