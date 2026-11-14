/**
 * The Stack · floats page: a window with a bar and a column of docked items and a sheet of pages under them, and
 * floats above the pages. A float is in the stage's px (`fitFloat`, `floatTarget`): the pages scrolling never move it
 * (C5); dropped over docked content it lands beside it (C7); it has no pinned flag (C16); a drop with the pointer past
 * the stage's edge lands clamped into the stage and never cancels (C17). Every drag runs on @n-uf/motion/drag's intent.
 *
 * The page writes every word. The scripted scenarios (floats-scenarios.ts) drive it through `page`.
 */
import { createBoard } from "./board";

const stage = document.getElementById("fl-stage") as HTMLDivElement;
const status = document.getElementById("st-status") as HTMLParagraphElement;
const scrollIn = document.getElementById("fl-scroll") as HTMLInputElement;
const scrollOut = document.getElementById("fl-scroll-out") as HTMLOutputElement;

// This page starts from its default layout every time; its stored form is written only by the scenarios that read it.
const board = createBoard({ stage, status, key: "motion-lab:stack-floats", autosave: false });

const reach = (): number => board.scroller.scrollHeight - board.scroller.clientHeight;
scrollIn.max = String(Math.max(0, reach()));
const showScroll = (): void => {
  scrollIn.value = String(Math.round(board.scroller.scrollTop));
  scrollOut.textContent = `${Math.round(board.scroller.scrollTop)} px`;
};
scrollIn.addEventListener("input", () => {
  board.scroller.scrollTop = Number(scrollIn.value);
});
board.scroller.addEventListener("scroll", showScroll);
document.getElementById("fl-reset")!.addEventListener("click", () => {
  board.reset();
  showScroll();
});

/** What the scenarios read and drive. */
export const page = {
  board,
  reset(): void {
    board.reset();
    showScroll();
  },
  /** Scroll the pages to `y` px and say how far they went. */
  scrollTo(y: number): number {
    board.scroller.scrollTop = y;
    showScroll();
    return board.scroller.scrollTop;
  },
  get scrollReach() {
    return reach();
  },
};
export type FloatsPage = typeof page;
