/**
 * A tap on the one desk window (islands/home.ts), for the telemetry panes further down the home (islands/telemetry.ts): the desk
 * says what its windows drew on each frame and which layout placement gave it; the panes read, never touch.
 * No listeners, no work: the desk only builds a frame's report while something listens.
 */
import type { Rect } from "@n-uf/motion";

/** One window's frame: the rect it is drawn at, the rect it is heading for, and whether a pointer holds it. */
export interface WindowFrame {
  readonly i: number;
  /** The layout slot it sits in (a swap trades two windows' slots). */
  readonly slot: number;
  /** The rect the desk last wrote to the window's element: its target plus the reveal's offsets, and the frame's size. */
  readonly drawn: Rect;
  readonly target: Rect;
  /** Its settle is stepping this frame. */
  readonly moving: boolean;
  /** A pointer holds it: drawn exactly where the pointer puts it. */
  readonly held: boolean;
  /** Where the pointer puts the held window (the rect it should be drawn at), while it is held. */
  readonly expected?: Rect;
}
/** The desk's frame: every window, the time the frame stepped them by, and the drag in progress. */
export interface DeskFrame {
  /** Ms of motion time this frame stepped (0 for the frame that only paints). */
  readonly dt: number;
  readonly windows: readonly WindowFrame[];
  /** The dragged window's index, and the window whose slot the drop would take (the shown target), or null. */
  readonly held: number | null;
  readonly shown: number | null;
  /** The same two, as layout slots (the rows of the rects pane are slots). */
  readonly heldSlot: number | null;
  readonly shownSlot: number | null;
}
/** The layout placement gave the desk: each window's slot rect, the stage it was laid out for, and the give-way notes. */
export interface DeskPlan {
  readonly name: string;
  readonly construction: string;
  readonly slots: readonly Rect[];
  readonly stage: { readonly width: number; readonly height: number };
  readonly notes: readonly string[];
}

const frames = new Set<(f: DeskFrame) => void>();
const plans = new Set<(p: DeskPlan) => void>();
let lastPlan: DeskPlan | null = null;

export const deskTap = {
  /** Whether anything listens to frames (the desk skips building them otherwise). */
  get active(): boolean {
    return frames.size > 0;
  },
  onFrame(f: (frame: DeskFrame) => void): void {
    frames.add(f);
  },
  frame(frame: DeskFrame): void {
    frames.forEach((f) => f(frame));
  },
  /** Listen to the layout; the current one is delivered at once. */
  onPlan(f: (plan: DeskPlan) => void): void {
    plans.add(f);
    if (lastPlan) f(lastPlan);
  },
  plan(plan: DeskPlan): void {
    lastPlan = plan;
    plans.forEach((f) => f(plan));
  },
  get lastPlan(): DeskPlan | null {
    return lastPlan;
  },
};
