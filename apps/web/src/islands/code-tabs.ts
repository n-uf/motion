/**
 * The copy button of the "Use it" examples: it copies the open tab's code. Without a clipboard (or without this
 * script) it stays hidden; the tabs themselves need no script.
 */
const copy = document.querySelector<HTMLButtonElement>(".ct [data-copy]");
const label = copy?.querySelector<HTMLElement>("[data-copy-label]");

if (copy && label && navigator.clipboard) {
  let reset = 0;
  copy.hidden = false;
  copy.addEventListener("click", () => {
    const open = document.querySelector<HTMLInputElement>(".ct-in:checked")?.value;
    const code = document.querySelector(`.ct-panel[data-tab="${open}"] pre`)?.textContent ?? "";
    const say = (text: string) => {
      label.textContent = text;
      clearTimeout(reset);
      reset = window.setTimeout(() => (label.textContent = "Copy"), 1600);
    };
    navigator.clipboard.writeText(code).then(
      () => say("Copied"),
      () => say("Copy failed"),
    );
  });
}
