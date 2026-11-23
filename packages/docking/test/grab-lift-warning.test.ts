/**
 * The lift rule, checked in development: a grab function asked again at the item's own form and size must give the
 * press it gave at the lift. One that doesn't (it reads something that changes, here a counter) warns once per
 * function; a pure one never does.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Point } from "@n-uf/placement";
import { dockDrag, solve, type DockGrabForm } from "../src";
import { windowState } from "./fixture";

describe("the lift rule in development", () => {
  afterEach(() => vi.restoreAllMocks());
  const state = windowState(1200, 800);
  const previous = solve(state);
  const own = previous.items.tools!;

  it("a function that strays from its press at the item's own form warns once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let n = 0;
    const drifting = (f: DockGrabForm): Point => ({ x: Math.min(f.rect.width, 4 + n++ * 2), y: 4 });
    for (let i = 0; i < 3; i++) dockDrag(state, "tools", { previous, grab: drifting }).after(null);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("the grab function");
  });

  it("a pure function gives the press back and never warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const pure = (f: DockGrabForm): Point => ({ x: Math.min(f.rect.width, 6), y: Math.min(f.rect.height, 4) });
    const d = dockDrag(state, "tools", { previous, grab: pure });
    expect(d.after(null).grab).toEqual({ x: Math.min(own.rect.width, 6), y: Math.min(own.rect.height, 4) });
    expect(warn).not.toHaveBeenCalled();
  });
});
