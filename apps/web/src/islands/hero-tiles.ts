/**
 * Home hero, placement's slot (island): the tiling demo of components/HeroTiles.astro, run live on the packages.
 *
 * - **The layout** is `@n-uf/placement/tiling`: `layoutSplit` gives every pane's rect from the split tree, `paneTargets` one
 *   drop target per pane, `paneRegion` the region of a pane under the pointer (a side splits it, the center swaps), and
 *   `dropOnPane` the tree a drop makes. Placement moves nothing: it returns trees and rects.
 * - **The motion** is `@n-uf/motion/layout`: every pane is a real element on the layout motion, so a new tree glides
 *   there; a held pane follows the pointer (`holdItem`), and the drag intent (`@n-uf/motion/drag`) decides when a target
 *   shows and which one a release lands on.
 *
 * The showcase (a pane dropped on another, over and over) is registered with the page's showcase controller, like the
 * hero's: a visitor's action pauses it, reduced motion has no auto-play, and it stops off screen. The indicator is the
 * drop's own colour (the signal orange) and shows the rect the dragged pane would take.
 */
import type { Point, Rect } from "@n-uf/motion";
import { createDragIntent, type DragIntent } from "@n-uf/motion/drag";
import { createLayoutMotion, drawBox, holdItem, type Drawable, type HeldDrag, type LayoutItem } from "@n-uf/motion/layout";
import { dropOnPane, paneRegion, paneTargets, type PaneRegion, type PaneTarget } from "@n-uf/placement/tiling";
import { getSpeed, loop, omega, onMotionChange, reduced } from "./motion";
import { registerShowcase, setDragging } from "./showcase";
import { AREA, START, STEPS, afterStep, rectsOf, sayDrop, titleOf, type PaneId, type Tree } from "../demos/hero-tiles";

type Target = PaneTarget<PaneId>;

export function startHeroTiles(zone: HTMLElement): void {
  const stage = zone.querySelector<HTMLElement>("#tiles")!;
  const ind = zone.querySelector<HTMLElement>("#tind")!;
  const sayEl = zone.querySelector<HTMLElement>("#tsay")!;
  const els = new Map<PaneId, HTMLElement>([...stage.querySelectorAll<HTMLElement>(".tp")].map((el) => [el.dataset.id as PaneId, el]));

  // ---- Geometry: the area's px to the stage's px --------------------------------------------------------------------------
  let S = stage.clientWidth / AREA.width;
  const toPx = (r: Rect): Rect => ({ x: r.x * S, y: r.y * S, width: r.width * S, height: r.height * S });
  const same = (a: Rect, b: Rect): boolean => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height)) < 0.01;
  const localOf = (e: { clientX: number; clientY: number }): Point => {
    const b = stage.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };

  // ---- The panes: real elements on the layout motion ----------------------------------------------------------------------
  let tree: Tree = START;
  const motion = createLayoutMotion({ loop, omega: omega(), reducedMotion: reduced });
  const drawable = (el: HTMLElement): Drawable => {
    // The pane sits at 0, 0 and is moved by transform alone, so no frame writes a left or a top (no layout shift).
    const nodes = { node: el, frame: el.querySelector<HTMLElement>(".tp-frame")!, content: el.querySelector<HTMLElement>(".tp-body")! };
    let bx = 0, by = 0;
    return {
      layOut(box) {
        bx = box.x;
        by = box.y;
        el.style.width = `${box.width}px`;
        el.style.height = `${box.height}px`;
      },
      draw(frame) {
        drawBox(nodes, frame);
        el.style.transform = `translate(${bx}px, ${by}px) ${el.style.transform}`;
      },
    };
  };
  const rects0 = rectsOf(tree);
  const items = new Map<PaneId, LayoutItem>([...els].map(([id, el]) => [id, motion.add(id, drawable(el), toPx(rects0.get(id)!))]));
  zone.classList.add("go");

  /** Every pane to its rect in `t` (a glide from where it is drawn), except `skip` (the held one). */
  function relayout(t: Tree, skip?: PaneId): void {
    const r = rectsOf(t);
    for (const [id, item] of items) if (id !== skip) item.moveTo(toPx(r.get(id)!));
  }

  // ---- The indicator and the line under the stage ------------------------------------------------------------------------------
  let indAt: Rect | null = null;
  const say = (html: string): void => void (sayEl.innerHTML = html);
  function indicate(slot: Rect | null, label = ""): void {
    if (!slot) { ind.hidden = true; indAt = null; return; }
    indAt = slot;
    ind.style.width = `${slot.width * S}px`;
    ind.style.height = `${slot.height * S}px`;
    ind.style.transform = `translate(${slot.x * S}px, ${slot.y * S}px)`;
    ind.firstElementChild!.textContent = label;
    ind.hidden = false;
  }
  const regionLabel = (r: PaneRegion): string => (r === "center" ? "Swap" : `Split · ${r}`);

  // ---- Drag: a pane under the pointer, the intent reading the aim -------------------------------------------------------------
  interface Drag { id: PaneId; pid: number; held: HeldDrag; intent: DragIntent<Target>; pointer: Point; targets: Target[]; home: Rect; stop: () => void }
  let drag: Drag | null = null;
  const places = new Map<string, PaneRegion>();
  const placeOf = (t: Target, p: Point, previous: string | null): string => {
    const region = paneRegion(t.hit, p, (previous as PaneRegion | null) ?? null);
    places.set(t.id, region);
    return region;
  };
  /** What a release on `t` makes: the tree, and the dragged pane's rect in it. */
  function dropOf(id: PaneId, t: Target): { next: Tree; slot: Rect; region: PaneRegion } {
    const region = places.get(t.id) ?? "center";
    const next = dropOnPane(tree, id, t.pane, region);
    return { next, slot: rectsOf(next).get(id)!, region };
  }
  function dragFrame(d: Drag): void {
    const f = d.intent.update(d.pointer, performance.now(), d.targets);
    if (!f.shown) {
      indicate(null);
      say("drag a pane onto another");
      return;
    }
    const { slot, region } = dropOf(d.id, f.shown);
    indicate(slot, regionLabel(region));
    say(`placement → <b>${sayDrop(d.id, f.shown.pane, region)}</b>`);
  }
  function endDrag(cancelled: boolean, e?: PointerEvent): void {
    const d = drag;
    if (!d) return;
    drag = null;
    d.stop();
    const el = els.get(d.id)!;
    el.classList.remove("held");
    try { if (e) el.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    const p = e ? localOf(e) : d.pointer;
    let target: Target | null = null;
    if (!cancelled) {
      d.intent.update(p, performance.now(), d.targets);
      target = d.intent.release(p, d.targets);
    }
    indicate(null);
    if (target) {
      const drop = dropOf(d.id, target);
      tree = drop.next;
      d.held.land(toPx(drop.slot));
      relayout(tree, d.id);
      say(`dropped · <b>${sayDrop(d.id, target.pane, drop.region)}</b>`);
    } else {
      d.held.cancel(d.home);
      say(cancelled ? "cancelled: it goes back" : "no target: it goes back");
    }
    setDragging(false);
  }
  for (const [id, el] of els) {
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || drag) return;
      e.preventDefault();
      setDragging(true); // pauses every showcase until the drag ends and 10 s after
      abortCycle();
      indicate(null);
      const item = items.get(id)!;
      const p = localOf(e), at = item.drawn;
      const held = holdItem(item, { x: p.x - at.x, y: p.y - at.y });
      const home = toPx(rectsOf(tree).get(id)!);
      places.clear();
      const targets: Target[] = paneTargets(rectsOf(tree), { except: id }).map((t) => ({ ...t, hit: toPx(t.hit) }));
      const intent = createDragIntent<Target>({ home, placeOf });
      held.move(p);
      el.classList.add("held");
      el.setPointerCapture(e.pointerId);
      const d: Drag = { id, pid: e.pointerId, held, intent, pointer: p, targets, home, stop: () => {} };
      d.stop = loop.repeat("input", () => { if (drag !== d) return false; dragFrame(d); return true; });
      drag = d;
    });
    el.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.pid || drag.id !== id) return;
      drag.pointer = localOf(e);
      drag.held.move(drag.pointer);
    });
    el.addEventListener("pointerup", (e) => { if (drag && e.pointerId === drag.pid && drag.id === id) endDrag(false, e); });
    el.addEventListener("pointercancel", (e) => { if (drag && e.pointerId === drag.pid && drag.id === id) endDrag(true, e); });
    el.addEventListener("lostpointercapture", () => { if (drag?.id === id) endDrag(true); });
  }
  window.addEventListener("blur", () => endDrag(true));
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") endDrag(true); });

  // ---- The showcase: a pane is lifted, its drop shown, then made ---------------------------------------------------------------
  let ctl = { dead: false };
  const abortCycle = (): void => { ctl.dead = true; };
  const wait = (ms: number, c: { dead: boolean }): Promise<void> => new Promise((res, rej) => setTimeout(() => (c.dead ? rej(c) : res()), ms / getSpeed()));
  async function showcaseLoop(c: { dead: boolean }): Promise<void> {
    try {
      await wait(2200, c);
      for (;;) {
        for (const s of STEPS) {
          const el = els.get(s.dragged)!;
          const { tree: next, slot } = afterStep(tree, s);
          el.classList.add("lift");
          indicate(slot, regionLabel(s.region));
          say(`placement → <b>${sayDrop(s.dragged, s.at, s.region)}</b>`);
          await wait(1100, c);
          el.classList.remove("lift");
          indicate(null);
          tree = next;
          relayout(tree);
          say(`dropped · <b>${sayDrop(s.dragged, s.at, s.region)}</b>`);
          await motion.idle();
          await wait(1300, c);
        }
        tree = START;
        relayout(tree);
        say("start again · <b>3 panes</b>");
        await motion.idle();
        await wait(1500, c);
      }
    } catch (e) {
      if (e !== c) throw e;
      els.forEach((el) => el.classList.remove("lift"));
      indicate(null);
    }
  }
  registerShowcase(zone, {
    start() {
      ctl = { dead: false };
      void showcaseLoop(ctl);
    },
    stop() {
      abortCycle();
    },
  });

  // ---- Start ----------------------------------------------------------------------------------------------------------------------
  onMotionChange(() => motion.configure({ omega: omega() }));
  new ResizeObserver(() => {
    const was = S;
    S = stage.clientWidth / AREA.width;
    if (was === S) return;
    if (indAt) indicate(indAt);
    if (drag) return;
    const r = rectsOf(tree);
    for (const [id, item] of items) {
      const to = toPx(r.get(id)!);
      if (motion.running) item.moveTo(to);
      else if (!same(item.drawn, to)) item.jumpTo(to);
    }
  }).observe(stage);
  (window as unknown as Record<string, unknown>).__heroTiles = {
    state: () => ({ drag: !!drag, running: motion.running, tree, titles: [...els.keys()].map(titleOf) }),
  };
}
