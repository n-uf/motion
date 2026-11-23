/**
 * A movable grower on a bottom bar, flicked over the page and let go early, played as a Snap host plays it: the
 * landing model over `dockDrag`, the item held by motion's `holdItem` on a layout motion, snapped into the landing the
 * model decides (its home spot while the pointer is still on it), and a float's landing followed 1:1 by the grab.
 *
 * The release glide heads for the landing, size and position, and settles there. While held, the item is held at the
 * size it was lifted at (its grown home rect) until the host resizes it (`HeldDrag.resize`), and once it has left a slot
 * it chases the pointer, which a flick outruns: those two are what the last held frame shows, not the release.
 */
import { describe, expect, it } from "vitest";
import { createFakeClock, createFrameLoop } from "@n-uf/motion/clock";
import { createLayoutMotion, holdItem, type Drawable, type HeldDrag, type LayoutItem } from "@n-uf/motion/layout";
import type { Rect } from "@n-uf/placement";
import { dockDrag, solve, type DockState } from "../src";
import { doc, form } from "../src/testing/world";
import { modelOver } from "./landing-model";

const NATURAL = 200;

/** The document window with Tools (row: min 180, natural 200) growing, moved to the start of the bottom status bar. */
function world(width = 1200): DockState {
  const s0 = doc({ width });
  const tools = s0.items.tools!;
  const row = [form("row", NATURAL - 20, NATURAL, 28, { grows: true }), ...tools.forms.row!.slice(1)];
  return {
    ...s0,
    items: { ...s0.items, tools: { ...tools, forms: { ...tools.forms, row } } },
    edges: s0.edges.map((e) => (e.id === "status" ? { ...e, items: ["tools", ...e.items] } : e.id === "toolbar" ? { ...e, items: e.items.filter((x) => x !== "tools") } : e)),
  };
}

const none: Drawable = { layOut: () => {}, draw: () => {} };
const sizeOf = (r: Rect): [number, number] => [r.width, r.height];
const close = (a: Rect, b: Rect, eps = 0.5): boolean => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height)) < eps;

/** One flick from a press on the grower at `gx` along its grown rect to `end`, in `steps` frames, let go at once. */
function flick(gx: number, end: { x: number; y: number }, steps: number) {
  const s = world();
  const seen = solve(s);
  const home = seen.items.tools!.rect;
  const grab = { x: gx, y: home.height / 2 };
  const press = { x: home.x + grab.x, y: home.y + grab.y };
  const drag = dockDrag(s, "tools", { previous: seen, grab });
  const m = modelOver(drag, { preview: { mode: "snap" } });
  const clock = createFakeClock();
  const motion = createLayoutMotion({ loop: createFrameLoop({ clock }) });
  const item: LayoutItem = motion.add("tools", none, home);
  const held: HeldDrag = holdItem(item, grab);
  held.move(press);
  let last: ReturnType<typeof m.update> | null = null;
  for (let k = 0; k <= steps; k++) {
    const p = { x: press.x + ((end.x - press.x) * k) / steps, y: press.y + ((end.y - press.y) * k) / steps };
    held.move(p);
    const f = m.update(p, k * 16);
    // As the host: a float's landing is held 1:1 by the grab (no glide), any other landing is a snap into it.
    const free = f.landing !== null && f.region === "open";
    if (free) held.move({ x: f.landing!.x + grab.x, y: f.landing!.y + grab.y });
    if (free) held.preview({ snapItem: false }, null);
    else if (f.landing) held.preview({ snapItem: true }, f.landing);
    else held.preview({ snapItem: false }, null);
    clock.frame();
    last = f;
  }
  return { home, held, item, motion, clock, last: last!, release: m.model.release(end, steps * 16 + 16), drag };
}

describe("a grower on a bottom bar flicked over the page and let go early", () => {
  it("the release glide heads for the landing, size and position, from where the item is drawn, and settles there", () => {
    for (const gx of [12, 150, 400]) {
      for (const steps of [3, 8, 20]) {
        const at = `${gx} ${steps}`;
        const r = flick(gx, { x: 1200 - 14, y: 330 }, steps);
        expect(r.last.region, at).toBe("open");
        expect(r.release?.kind, at).toBe("float");
        const landing = r.last.landing!;
        // The landing is the natural size, smaller than the grown home rect it was lifted from.
        expect(sizeOf(landing), at).toEqual([NATURAL, 28]);
        expect(r.home.width, at).toBeGreaterThan(NATURAL);
        expect(landing, at).toEqual(r.drag.landingOf(r.release!));
        const drawn = { ...r.item.drawn };
        const from = r.held.land(landing);
        // Let go from where it is drawn, heading for the landing: its size and its position.
        expect(from, at).toEqual(drawn);
        expect(r.item.target, at).toEqual(landing);
        r.clock.frames(200);
        expect(close(r.item.drawn, landing, 0.1), at).toBe(true);
      }
    }
  });

  it("the last held frame: held at the lifted (grown) size until resized, and a flick outruns the chase after the home snap", () => {
    const r = flick(150, { x: 1200 - 14, y: 330 }, 20);
    const landing = r.last.landing!;
    // The held rect is the lifted size, not the landing's: `holdItem` holds at the drawn size at the lift.
    expect(sizeOf(r.held.held!)).toEqual(sizeOf(r.home));
    expect(sizeOf(r.held.held!)).not.toEqual(sizeOf(landing));
    // It left its home snap for the float, so it is returning, chasing the pointer: drawn behind the landing's corner.
    expect(r.held.returning).toBe(true);
    expect(Math.abs(r.item.drawn.y - landing.y)).toBeGreaterThan(1);
    // The host's resize to the landing's size makes the held rect the landing.
    r.held.resize({ width: landing.width, height: landing.height });
    expect(sizeOf(r.held.held!)).toEqual(sizeOf(landing));
  });
});
