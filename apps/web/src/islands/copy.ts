/**
 * Copy (island): the hero's install lines. A `[data-copy]` button copies its command; the button says "Copied" for 1.5 s
 * and a polite live region (#copy-status) announces it. `navigator.clipboard` is called inside the click handler, as
 * browsers require; where it is missing or refused, the command's text is selected instead, so Ctrl/Cmd+C finishes it.
 */
const SHOW = 1500;

export function startCopy(root: ParentNode = document): void {
  const status = document.getElementById("copy-status");
  root.querySelectorAll<HTMLButtonElement>("button[data-copy]").forEach((btn) => {
    const label = btn.textContent ?? "Copy";
    let timer = 0;
    const done = (text: string): void => {
      btn.textContent = text;
      if (status) status.textContent = text === "Copied" ? "Copied the install command" : "";
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        btn.textContent = label;
        if (status) status.textContent = "";
      }, SHOW);
    };
    const select = (): void => {
      const code = btn.parentElement?.querySelector("code");
      const sel = getSelection();
      if (!code || !sel) return;
      const range = document.createRange();
      range.selectNodeContents(code);
      sel.removeAllRanges();
      sel.addRange(range);
    };
    btn.addEventListener("click", () => {
      const text = btn.dataset.copy ?? "";
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => done("Copied"), () => { select(); done("Select"); });
      } else {
        select();
        done("Select");
      }
    });
  });
}
