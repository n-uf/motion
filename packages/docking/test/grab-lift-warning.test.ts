/**
 * The lift rule, checked where it can be: a grab function asked again at the item's own form and size must give the
 * press it gave at the lift. One that doesn't (it reads something that changes, here a counter) is noted once per
 * function to the host's `onGrabNote` (the library reaches no console); a pure one never is, and the note changes no
 * output.
 */
import { describe, expect, it } from "vitest";
import type { Point } from "@n-uf/placement";
import { dockDrag, solve, type DockGrabForm, type DockGrabNote } from "../src";
import { windowState } from "./fixture";

describe("the lift rule, noted to the host", () => {
  const state = windowState(1200, 800);
  const previous = solve(state);
  const own = previous.items.tools!;

  it("a function that strays from its press at the item's own form is noted once", () => {
    const notes: DockGrabNote[] = [];
    const onGrabNote = (n: DockGrabNote): void => void notes.push(n);
    let n = 0;
    const drifting = (f: DockGrabForm): Point => ({ x: Math.min(f.rect.width, 4 + n++ * 2), y: 4 });
    for (let i = 0; i < 3; i++) dockDrag(state, "tools", { previous, grab: drifting, onGrabNote }).after(null);
    expect(notes.length).toBe(1);
    expect(notes[0]!.code).toBe("lift-drift");
    expect(notes[0]!.press).toEqual({ x: 4, y: 4 });
  });

  it("a pure function gives the press back and is never noted; the note changes nothing", () => {
    const notes: DockGrabNote[] = [];
    const pure = (f: DockGrabForm): Point => ({ x: Math.min(f.rect.width, 6), y: Math.min(f.rect.height, 4) });
    const heard = dockDrag(state, "tools", { previous, grab: pure, onGrabNote: (x) => void notes.push(x) });
    expect(heard.after(null).grab).toEqual({ x: Math.min(own.rect.width, 6), y: Math.min(own.rect.height, 4) });
    expect(notes).toEqual([]);
    const silent = dockDrag(state, "tools", { previous, grab: pure });
    expect(JSON.stringify(silent.regions.lanes)).toBe(JSON.stringify(heard.regions.lanes));
  });
});
