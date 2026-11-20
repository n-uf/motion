/**
 * Home hero, the shared window (island): the only thing on the hero that moves. The Inspector panel is dropped near its
 * slot and glides in on `@n-uf/motion/layout` (the layout motion on the site's frame loop, at its tempo and slow motion),
 * then settles; a pause, and again. Everything else in components/HeroWindow.astro (the dock layout from `solve`, the
 * Share menu from `positionPopup`) is the server's finished still and never changes.
 *
 * The loop is registered with the page's showcase controller: reduced motion has no auto-play (the panel stays in its
 * slot with the path shown), and it stops off screen and in a hidden tab. A stopped loop leaves the panel in its slot.
 */
import type { Rect } from "@n-uf/motion";
import { createLayoutMotion, type Drawable } from "@n-uf/motion/layout";
import { getSpeed, loop, omega, onMotionChange, reduced } from "./motion";
import { registerShowcase } from "./showcase";

export function startHeroWindow(root: HTMLElement): void {
  const panel = root.querySelector<SVGSVGElement>("#hw-insp")!;
  const [sx, sy, sw, sh] = panel.dataset.slot!.split(",").map(Number) as [number, number, number, number];
  const [dx, dy] = panel.dataset.drop!.split(",").map(Number) as [number, number];
  const slot: Rect = { x: sx, y: sy, width: sw, height: sh };
  const drop: Rect = { x: dx, y: dy, width: sw, height: sh };

  const motion = createLayoutMotion({ loop, omega: omega(), reducedMotion: reduced });
  // The panel is a nested svg: the drawn rect is its x, y, width and height (the svg clips its content, so a size change is
  // revealed rather than stretched).
  const drawable: Drawable = {
    layOut() {},
    draw(frame) {
      const r = frame.drawn;
      panel.setAttribute("x", String(r.x));
      panel.setAttribute("y", String(r.y));
      panel.setAttribute("width", String(Math.max(0, r.width)));
      panel.setAttribute("height", String(Math.max(0, r.height)));
    },
  };
  const item = motion.add("inspector", drawable, slot);
  onMotionChange(() => motion.configure({ omega: omega() }));

  let ctl = { dead: false };
  let cancelWait: (() => void) | null = null;
  const abort = (): void => {
    ctl.dead = true;
    cancelWait?.();
    cancelWait = null;
  };
  const wait = (ms: number, c: { dead: boolean }): Promise<void> =>
    new Promise((res, rej) => {
      const t = setTimeout(() => (c.dead ? rej(c) : res()), ms / getSpeed());
      cancelWait = () => { clearTimeout(t); rej(c); };
    });
  async function run(c: { dead: boolean }): Promise<void> {
    try {
      await wait(1800, c);
      for (;;) {
        // Picked up again: it fades out of its slot, and is dropped near it.
        panel.classList.add("out");
        await wait(240, c);
        item.jumpTo(drop);
        panel.classList.remove("out");
        await wait(1200, c);
        item.moveTo(slot);
        await motion.idle();
        await wait(2000, c);
      }
    } catch (e) {
      if (e !== c) throw e;
    }
  }
  registerShowcase(root, {
    start() {
      ctl = { dead: false };
      void run(ctl);
    },
    stop() {
      abort();
      panel.classList.remove("out");
      item.jumpTo(slot);
    },
  });
}
