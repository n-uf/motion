/** The positioner's rules in order per axis: flip, slide, resize. */
import { describe, expect, it } from "vitest";
import { BELOW_LEFT, positionPopup } from "../index";

const bounds = { x: 0, y: 0, width: 800, height: 600 };
const size = { width: 200, height: 40 };

describe("positionPopup", () => {
  it("places the popup by anchor, gravity and offset when it fits", () => {
    const p = positionPopup({ x: 100, y: 100, width: 50, height: 20 }, size, bounds, BELOW_LEFT);
    expect(p.rect).toEqual({ x: 100, y: 126, width: 200, height: 40 });
    expect([p.flipped, p.slid, p.resized]).toEqual([{ x: false, y: false }, { x: false, y: false }, false]);
  });

  it("flips an axis that would leave the bounds, when the mirror fits", () => {
    const p = positionPopup({ x: 100, y: 570, width: 50, height: 20 }, size, bounds, BELOW_LEFT);
    expect(p.rect.y).toBe(570 - 6 - 40);
    expect(p.flipped.y).toBe(true);
  });

  it("slides what can't flip into the bounds", () => {
    // 650 wide from x 600 runs off the right; mirrored it runs off the left: it slides to end at the right edge.
    const p = positionPopup({ x: 600, y: 100, width: 10, height: 20 }, { width: 650, height: 40 }, bounds, BELOW_LEFT);
    expect(p.rect.x).toBe(150);
    expect([p.flipped.x, p.slid.x]).toEqual([false, true]);
  });

  it("slides in from the start edge too", () => {
    const leftward = { ...BELOW_LEFT, gravity: { x: -1 as const, y: 1 as const }, flip: false, resize: false };
    const p = positionPopup({ x: 100, y: 100, width: 10, height: 20 }, size, bounds, leftward);
    expect([p.rect.x, p.slid.x]).toEqual([0, true]);
  });

  it("a popup wider than the bounds slides to their start edge when it may not resize", () => {
    const inBox = { x: 40, y: 0, width: 800, height: 600 };
    const p = positionPopup({ x: 300, y: 100, width: 10, height: 20 }, { width: 1000, height: 40 }, inBox, { ...BELOW_LEFT, resize: false });
    expect([p.rect.x, p.rect.width, p.slid.x, p.resized]).toEqual([40, 1000, true, false]);
  });

  it("resizes what is larger than the bounds", () => {
    const p = positionPopup({ x: 0, y: 0, width: 10, height: 10 }, { width: 1000, height: 40 }, bounds, BELOW_LEFT);
    expect([p.rect.x, p.rect.width, p.resized]).toEqual([0, 800, true]);
  });

  it("keeps a rule's choices: no flip, no slide", () => {
    const p = positionPopup({ x: 100, y: 570, width: 50, height: 20 }, size, bounds, { ...BELOW_LEFT, flip: false, slide: false, resize: false });
    expect(p.rect.y).toBe(596);
  });
});
