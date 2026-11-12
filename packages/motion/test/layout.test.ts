import { describe, expect, it } from "vitest";
import { createFakeClock, createFrameLoop } from "../src/clock";
import { createLayoutMotion, domDrawable, drawBox, flip, holdItem, type Drawable, type DrawFrame, type StyleLike } from "../src/layout";
import type { Rect } from "../src/shapes";
import { checkMonotonic, checkNoJumps, checkNoOvershoot, type TargetSample } from "../src/testing";
import { SETTLE_TEMPO } from "../src/values";

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const OMEGA = SETTLE_TEMPO.default;

/** A surface on the fake clock, and a drawable that records what it was asked to lay out and draw. */
function surface() {
  const clock = createFakeClock();
  const loop = createFrameLoop({ clock });
  const motion = createLayoutMotion({ loop, omega: OMEGA });
  const layOuts: Rect[] = [];
  const frames: { t: number; frame: DrawFrame }[] = [];
  const drawable: Drawable = {
    layOut: (box) => void layOuts.push({ ...box }),
    draw: (frame) => void frames.push({ t: clock.now(), frame }),
  };
  /** Run frames until nothing moves (at most `max`). */
  const settle = (max = 400): void => {
    for (let i = 0; i < max && motion.running; i++) clock.frame();
  };
  const samples = (from = 0): TargetSample[] => frames.slice(from).map(({ t, frame }) => ({ t, rect: frame.drawn, target: frame.box }));
  return { clock, loop, motion, drawable, layOuts, frames, settle, samples };
}

describe("layout motion: settle to every new target", () => {
  it("retargets from the drawn rect: the redraw at the retarget is where it was drawn, then no jump", () => {
    const s = surface();
    const item = s.motion.add("a", s.drawable, rect(0, 0, 100, 50));
    item.moveTo(rect(300, 0, 100, 50));
    for (let i = 0; i < 5; i++) s.clock.frame();
    const mid = { ...item.drawn };
    expect(mid.x).toBeGreaterThan(0);
    expect(mid.x).toBeLessThan(300);
    const at = s.frames.length;
    item.moveTo(rect(100, 200, 160, 80));
    // The immediate redraw: drawn exactly where it was, laid out in the new box.
    expect(s.frames[at]!.frame.drawn).toEqual(mid);
    expect(s.frames[at]!.frame.box).toEqual(rect(100, 200, 160, 80));
    s.settle();
    expect(item.drawn).toEqual(rect(100, 200, 160, 80));
    const after = s.samples(at);
    expect(checkNoJumps(after, OMEGA).failures).toEqual([]);
    expect(checkNoOvershoot(after, mid, rect(100, 200, 160, 80)).failures).toEqual([]);
  });

  it("never overshoots or jumps, however often it is retargeted", () => {
    const s = surface();
    const item = s.motion.add("a", s.drawable, rect(0, 0, 100, 100));
    const goals = [rect(400, 0, 100, 100), rect(380, 300, 220, 60), rect(-50, 120, 90, 300), rect(10, 10, 100, 100)];
    for (const g of goals) {
      const from = { ...item.drawn };
      const at = s.frames.length;
      item.moveTo(g);
      for (let i = 0; i < 6; i++) s.clock.frame();
      const part = s.samples(at);
      expect(checkNoOvershoot(part, from, g).failures).toEqual([]);
      expect(checkNoJumps(part, OMEGA).failures).toEqual([]);
    }
    const from = { ...item.drawn };
    const at = s.frames.length;
    s.settle();
    expect(checkMonotonic(s.samples(at), rect(10, 10, 100, 100)).failures).toEqual([]);
    expect(checkNoOvershoot(s.samples(at), from, rect(10, 10, 100, 100)).failures).toEqual([]);
    expect(s.motion.running).toBe(false);
  });

  it("reveals a size change: the content is laid out once at the target size, the frame clipped, never scaled", () => {
    const s = surface();
    const item = s.motion.add("a", s.drawable, rect(0, 0, 100, 100));
    const before = s.layOuts.length;
    const at = s.frames.length;
    item.moveTo(rect(0, 0, 300, 40));
    s.settle();
    // One layout for the new box, none per frame.
    expect(s.layOuts.slice(before)).toEqual([rect(0, 0, 300, 40)]);
    for (const { frame } of s.frames.slice(at)) {
      expect(frame.box).toEqual(rect(0, 0, 300, 40));
      expect(frame.reveal.width).toBeCloseTo(frame.drawn.width, 9);
      expect(frame.reveal.height).toBeCloseTo(frame.drawn.height, 9);
      expect(frame.reveal.clipRight).toBeCloseTo(Math.max(0, 300 - frame.drawn.width), 9);
      expect(frame.reveal.clipBottom).toBeCloseTo(Math.max(0, 40 - frame.drawn.height), 9);
      expect(frame.pop.scale).toBe(1);
    }
  });

  it("draws a DOM box with one move, the frame at the drawn size and the content clipped: no non-uniform scale", () => {
    const style = (): StyleLike => ({ left: "", top: "", width: "", height: "", transform: "", opacity: "", clipPath: "", visibility: "" });
    const nodes = { node: { style: style() }, frame: { style: style() }, content: { style: style() } };
    const s = surface();
    const item = s.motion.add("a", domDrawable(nodes), rect(10, 20, 200, 100));
    expect([nodes.node.style.left, nodes.node.style.width]).toEqual(["10px", "200px"]);
    item.moveTo(rect(10, 20, 400, 100));
    s.clock.frame();
    const d = item.drawn;
    expect(nodes.node.style.width).toBe("400px");
    expect(nodes.frame.style.width).toBe(`${d.width}px`);
    expect(nodes.content.style.clipPath).toBe(`inset(0 ${400 - d.width}px 0px 0)`);
    expect(nodes.node.style.transform).not.toMatch(/scale\([^,)]*,/);
    // Appearing: a uniform scale about the centre.
    item.show(false, { now: true });
    item.show(true);
    s.clock.frame();
    expect(nodes.node.style.transform).toMatch(/scale\([0-9.]+\)/);
    // Gone: hidden.
    drawBox(nodes, { ...{ drawn: d, box: d, reveal: { dx: 0, dy: 0, width: d.width, height: d.height, clipRight: 0, clipBottom: 0 }, pop: { scale: 0.87, opacity: 0 }, shown: 0 }, gone: true });
    expect(nodes.node.style.visibility).toBe("hidden");
  });
});

describe("held drag", () => {
  it("holds the real item 1:1 from the grab offset, and lands from the release rect (exactly)", () => {
    const s = surface();
    const item = s.motion.add("a", s.drawable, rect(50, 50, 120, 40));
    const held = holdItem(item, { x: 20, y: 10 });
    for (const p of [{ x: 90, y: 70 }, { x: 160, y: 140 }, { x: 241.5, y: 233.25 }]) {
      held.move(p);
      s.clock.frame();
      expect(item.drawn).toEqual(rect(p.x - 20, p.y - 10, 120, 40));
    }
    const at = s.frames.length;
    const release = held.land(rect(400, 300, 120, 40));
    expect(release).toEqual(rect(221.5, 223.25, 120, 40));
    // The landing's first frame is the release rect (±0), then it settles into the slot.
    expect(s.frames[at]!.frame.drawn).toEqual(release);
    s.settle();
    expect(item.drawn).toEqual(rect(400, 300, 120, 40));
    expect(checkNoOvershoot(s.samples(at), release, rect(400, 300, 120, 40)).failures).toEqual([]);
  });

  it("cancels back home from the release rect", () => {
    const s = surface();
    const item = s.motion.add("a", s.drawable, rect(0, 0, 80, 30));
    const held = holdItem(item, { x: 5, y: 5 });
    held.move({ x: 305, y: 205 });
    const at = s.frames.length;
    const release = held.cancel(rect(0, 0, 80, 30));
    expect(s.frames[at]!.frame.drawn).toEqual(release);
    expect(release).toEqual(rect(300, 200, 80, 30));
    s.settle();
    expect(item.drawn).toEqual(rect(0, 0, 80, 30));
  });

  it("snaps into a slot, glides back to the pointer when it leaves, and a release in the slot finishes that glide", () => {
    const s = surface();
    const item = s.motion.add("a", s.drawable, rect(0, 0, 80, 30));
    const held = holdItem(item, { x: 0, y: 0 });
    held.move({ x: 100, y: 100 });
    expect(held.snapTo(rect(200, 100, 160, 30))).toBe("snapped");
    expect(held.snapTo(rect(200, 100, 160, 30))).toBe(null);
    s.settle();
    expect(item.drawn).toEqual(rect(200, 100, 160, 30));
    // Out of the slot: it glides back to the pointer (moving meanwhile) and is held again once there.
    expect(held.snapTo(null)).toBe("left");
    held.move({ x: 120, y: 140 });
    let caught = false;
    for (let i = 0; i < 400 && !caught; i++) {
      s.clock.frame();
      caught = held.follow();
    }
    expect(caught).toBe(true);
    expect(item.drawn).toEqual(rect(120, 140, 80, 30));
    held.move({ x: 130, y: 150 });
    expect(item.drawn).toEqual(rect(130, 150, 80, 30));
    // Snapped again, then let go there: already in the slot, nothing more moves.
    held.snapTo(rect(200, 100, 160, 30));
    s.settle();
    const release = held.land(rect(200, 100, 160, 30));
    expect(release).toEqual(rect(200, 100, 160, 30));
    expect(s.motion.running).toBe(false);
  });
});

describe("enter, exit and fold", () => {
  it("appears and disappears with a uniform fade; gone at rest", () => {
    const s = surface();
    const item = s.motion.add("a", s.drawable, rect(0, 0, 100, 100), { shown: false });
    expect(s.frames.at(-1)!.frame.gone).toBe(true);
    item.show(true);
    s.settle();
    expect(item.shown).toBe(1);
    expect(s.frames.at(-1)!.frame.gone).toBe(false);
    item.show(false);
    const at = s.frames.length;
    s.settle();
    const pops = s.frames.slice(at).map(({ frame }) => frame.pop);
    expect(pops.every((p, i) => i === 0 || (p.scale <= pops[i - 1]!.scale && p.opacity <= pops[i - 1]!.opacity))).toBe(true);
    expect(s.frames.at(-1)!.frame.gone).toBe(true);
  });

  it("folds through reveal: the content laid out at the folded size, never squashed", () => {
    const s = surface();
    const item = s.motion.add("a", s.drawable, rect(0, 0, 200, 160));
    const at = s.frames.length;
    item.moveTo(rect(0, 0, 200, 22));
    s.settle();
    for (const { frame } of s.frames.slice(at)) {
      expect(frame.box.height).toBe(22);
      expect(frame.reveal.height).toBeCloseTo(frame.drawn.height, 9);
    }
    expect(item.drawn).toEqual(rect(0, 0, 200, 22));
  });
});

describe("FLIP for DOM groups", () => {
  it("records where each node is drawn, changes the DOM, and glides each item from its old rect", () => {
    const s = surface();
    // Two containers; moving a node from the first to the second changes its page rect and its local coordinates.
    const origins = { a: { x: 0, y: 0 }, b: { x: 500, y: 300 } };
    let parent: keyof typeof origins = "a";
    const local = rect(10, 4, 90, 26);
    const item = s.motion.add("g", s.drawable, local);
    const node = {
      getBoundingClientRect: () => {
        const d = item.drawn;
        const o = origins[parent];
        return { left: o.x + d.x, top: o.y + d.y, width: d.width, height: d.height };
      },
    };
    const at = s.frames.length;
    flip([{ item, node, place: (before) => ({ from: rect(before.x - origins.b.x, before.y - origins.b.y, before.width, before.height), to: rect(20, 6, 120, 26) }) }], () => {
      parent = "b";
    });
    // Its first frame in the new container is exactly where it was drawn on the page before.
    const first = s.frames[at]!.frame.drawn;
    expect([first.x + origins.b.x, first.y + origins.b.y, first.width]).toEqual([10, 4, 90]);
    s.settle();
    expect(item.drawn).toEqual(rect(20, 6, 120, 26));
    expect(checkNoJumps(s.samples(at), OMEGA).failures).toEqual([]);
  });
});

describe("one shared frame loop", () => {
  it("runs tasks before the items step, listeners after, and stops (idle) once nothing moves", async () => {
    const s = surface();
    const a = s.motion.add("a", s.drawable, rect(0, 0, 10, 10));
    const b = s.motion.add("b", s.drawable, rect(0, 0, 10, 10));
    const order: string[] = [];
    let left = 3;
    s.motion.task(() => {
      order.push("task");
      return --left > 0;
    });
    s.motion.onFrame(() => order.push("frame"));
    let idled = 0;
    s.motion.onIdle(() => idled++);
    a.moveTo(rect(100, 0, 10, 10));
    b.moveTo(rect(0, 100, 10, 10));
    const done = s.motion.idle();
    s.settle();
    await done;
    expect(order.slice(0, 2)).toEqual(["task", "frame"]);
    expect(idled).toBe(1);
    expect(a.drawn.x).toBe(100);
    expect(b.drawn.y).toBe(100);
    expect(s.motion.running).toBe(false);
  });
});
