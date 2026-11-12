/**
 * Start a figure's chrome (components/Chrome.astro): its groups become draggable, collapsible and movable between the
 * bars, the arrangement persists per figure, and the playback controls every figure shares (speed, tempo, the drop
 * preview) are bound. Dragging a group counts as user activity for the showcases.
 */
import { createChrome, type Chrome, type DemoState } from "./chrome";
import { bindDropMode } from "./drop-mode";
import { getSpeed, getTempo, onMotionChange, setSpeed, setTempo, type Tempo } from "./motion";
import { watchActions } from "./showcase";
import type { Model } from "../demos/toolbar";

export function figureChrome(fig: HTMLElement, opts: { onChange?: (m: Model) => void; demo?: DemoState } = {}): Chrome {
  const initial = JSON.parse(fig.dataset.chromeModel!) as Model;
  const labels = JSON.parse(fig.dataset.chromeLabels!) as Record<string, string>;
  const freezeInput = [...fig.querySelectorAll<HTMLInputElement>("[data-chrome-freeze]")].find((i) => i.closest(".win") === fig);
  const chrome = createChrome({
    root: fig,
    labels,
    initial,
    storageKey: `motion-chrome:${fig.dataset.chrome}`,
    freeze: freezeInput ? { input: freezeInput, lock: freezeInput.closest<HTMLElement>(".lock")! } : undefined,
    onChange: opts.onChange,
  });
  if (opts.demo) chrome.setDemo(opts.demo);
  watchActions(fig);
  bindDropMode(fig);
  bindPlayback(fig);
  return chrome;
}

/** The Speed (¼× · ½× · 1×) and Tempo (Calm · Default · Quick) buttons under `root`. */
export function bindPlayback(root: ParentNode): void {
  const speeds = [...root.querySelectorAll<HTMLButtonElement>("[data-speed]")];
  const tempos = [...root.querySelectorAll<HTMLButtonElement>("[data-tempo]")];
  const sync = (): void => {
    speeds.forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.speed) === getSpeed())));
    tempos.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tempo === getTempo())));
    root.querySelectorAll<HTMLElement>("[data-slowmo]").forEach((h) => {
      h.hidden = getSpeed() === 1;
      h.textContent = `Slow motion ${getSpeed() === 0.25 ? "¼" : "½"}×`;
      h.title = "Only the visuals slow down: the drag's timing rules (aim 90 ms, hold 150 ms, room 160 ms) and the showcase pause stay real-time";
    });
  };
  speeds.forEach((b) => b.addEventListener("click", () => setSpeed(Number(b.dataset.speed))));
  tempos.forEach((b) => b.addEventListener("click", () => setTempo(b.dataset.tempo as Tempo)));
  onMotionChange(sync);
  sync();
}
