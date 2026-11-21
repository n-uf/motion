/**
 * Home (island): the live demo is the lab's Document window (apps/lab/src/docwin), mounted as it is, not forked: the lab's
 * own `createDocwin` runs here on the page's elements (components/HeroDemo.astro). Everything the window does comes from the
 * three libraries, through that one module:
 *
 * - @n-uf/docking: the window is a `DockState`; `solve` gives every rect, `targets` and the landing model's `lanes` every
 *   place a dragged panel or toolbar can dock, and the drop commits the state the target made;
 * - @n-uf/motion: `@n-uf/motion/drag`'s intent and landing model decide what a drag shows and where it lands, and the
 *   moves glide on its settle (`@n-uf/motion/layout`'s morph for the held copy);
 * - @n-uf/placement: the edge fit and float fit inside `solve`.
 *
 * What this file adds is only the fit to the page: the window is the slot's width and a fixed height, and follows the slot
 * as it resizes. It starts from the lab's default window (its own storage key, never the lab's, and never read back: every
 * visit starts from the default), and does not take focus or scroll the page.
 */
import { createDocwin } from "../../../lab/src/docwin/dock-state";

/** Where the home window keeps its state: its own key, so the lab's stored window and the lab's checks are never written over. */
const KEY = "motion-site:docwin-home";
/** The window's height: the slot's (styles/home.css reserves the same box, by the same breakpoint). */
const heightNow = (): number => (matchMedia("(max-width: 719px)").matches ? 400 : 460);
/** The window is never narrower than this (the lab's own smallest is 560; the model gives way as the room runs out). */
const MIN_WIDTH = 320;

export function startHero(fig: HTMLElement): void {
  const slot = fig.querySelector<HTMLElement>("#docdemo-slot")!;
  const root = fig.querySelector<HTMLElement>("#dw-root")!;
  const win = fig.querySelector<HTMLElement>("#dw-win")!;
  const status = fig.querySelector<HTMLElement>("#dw-status")!;
  const size = (): { width: number; height: number } => {
    return { width: Math.max(MIN_WIDTH, Math.floor(slot.clientWidth)), height: heightNow() };
  };
  // The window is shown (not `hidden`) before it is built: it measures its toolbars from what the page renders.
  root.hidden = false;
  const c = createDocwin({ root, win, status, storageKey: KEY });
  const hint = "Drag a panel by its header or a toolbar by its dots, and drop it beside another, on a side or in a bar.";
  c.reset(size());
  c.say(hint);
  // ↺ Reset: the lab's own reset (the default window at this size, no last move).
  fig.querySelector<HTMLButtonElement>("#dw-reset")!.addEventListener("click", () => {
    c.reset(size());
    c.forgetDrop();
    c.say(hint);
  });
  fig.classList.add("go");
  new ResizeObserver(() => {
    const s = size();
    if (!c.dragging && (s.width !== c.state.stage.width || s.height !== c.state.stage.height)) c.setSize(s.width, s.height);
  }).observe(slot);
}
