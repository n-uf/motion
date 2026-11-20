/**
 * The document window as a case host (`AsyncCaseHost` of `@n-uf/docking/testing`): every conformance row loads its
 * own state into the live window, plays its gestures on the page's own drag session (the same press, intent, targets,
 * preview and commit a mouse uses, frames driven by a clock the host steps), and reads back what the page draws.
 *
 * - `press` / `move` / `hold` / `release`: the session's `begin`, `move`, `frame` and `release`; a `move` to a `place` aims
 *   with `resolvePlace` under `@n-uf/motion/drag`'s `targetAt`, the one pick rule, with the state's refusals
 *   (`withRefusals`); the page itself refuses a drop there and marks the refusal (`data-drag-refusal`).
 * - `click`: the window's controls (open, close, a use), or the DockState's change that the menu row commits.
 * - `key`: Escape cancels, Alt holds the unfreeze key, Reload stores the state and reads it back.
 * - the root: the session mark on the page's root, slots, markers and items in window px.
 */
import { targetAt } from "@n-uf/motion/drag";
import { center } from "@n-uf/placement";
import { closeItem, dockHome, floatAt, foldItem, homeFor, markUsed, openItem, storeDockState, type DockState, type DockLayout } from "@n-uf/docking";
import { readDocwin } from "./store";
import { END_REACH, LIFT_THRESHOLD, resizeStep, resolvePlace, withRefusals, type AsyncCaseHost, type CaseSettings, type DomRoot, type Gesture } from "@n-uf/docking/testing";
import type { ItemId } from "./model";
import type { Docwin } from "./dock-state";

/** A frame every 16 ms of the host's clock. */
const FRAME = 16;
/** The least a `hold` rests: long enough for the intent's dwell, switch delay and room delay to settle. */
const SETTLE_MS = 400;

const nextPaint = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

export function createDocwinHost(c: Docwin): AsyncCaseHost {
  let start: DockState | null = null;
  let t = 1_000_000;
  /** A press not yet lifted: the item, where it was pressed (window px), the grab. */
  let pressed: { readonly id: ItemId; readonly down: { x: number; y: number }; pointer: { x: number; y: number } } | null = null;

  const state = (): DockState => c.state;

  function lift(): boolean {
    const p = pressed!;
    pressed = null;
    return c.begin(p.id, p.down, p.pointer, t);
  }

  function step(ms: number): void {
    for (let left = ms; left > 0; left -= FRAME) {
      t += FRAME;
      c.frame(t);
    }
  }

  function press(g: Gesture): void {
    pressed = null;
    const id = g.item as ItemId | undefined;
    if (!id) throw new Error("a press needs an item");
    const it = Object.hasOwn(state().items, id) ? state().items[id] : undefined;
    if (!it) throw new Error(`no item ${id}`);
    const l = c.layout.items[id];
    // No grip: fixed and closed items never lift, nor one in the » menu.
    if (it.fixed || it.closed || !l || l.inMenu) return;
    c.grip(id);
    const r = c.layout.items[id]!.rect;
    const grab = g.point ?? { x: Math.min(8, r.width / 2), y: Math.min(8, r.height / 2) };
    const down = { x: r.x + grab.x, y: r.y + grab.y };
    pressed = { id, down, pointer: down };
  }

  function move(g: Gesture): void {
    if (pressed && g.place) {
      if (!lift()) return;
    }
    if (g.place) {
      const d = c.drag;
      if (!d) return;
      const list = d.targets;
      const own = c.layout.items[d.id]?.rect;
      const p = resolvePlace(list, g.place, d.id, { stage: state().stage, content: c.layout.content, ...(own ? { own } : {}) }, withRefusals(targetAt, c.refusals(d.id)));
      if (!p) throw new Error(`no point reaches the target at ${JSON.stringify(g.place)} (targets: ${list.map((x) => x.id).join(", ") || "none"})`);
      c.move(p);
      t += FRAME;
      c.frame(t);
      return;
    }
    if (!g.point) throw new Error("a move needs a point or a place");
    if (pressed) {
      pressed.pointer = { x: g.point.x, y: g.point.y };
      if (Math.hypot(g.point.x - pressed.down.x, g.point.y - pressed.down.y) <= LIFT_THRESHOLD) return;
      if (!lift()) return;
    }
    if (!c.dragging) return;
    c.move(g.point);
    t += FRAME;
    c.frame(t);
  }

  function release(): void {
    pressed = null;
    if (!c.dragging) return;
    t += FRAME;
    c.release(t);
  }

  function click(g: Gesture): void {
    const id = g.item as ItemId | undefined;
    if (!id) throw new Error("a click needs an item");
    const s = state();
    const it = Object.hasOwn(s.items, id) ? s.items[id] : undefined;
    if (!it) throw new Error(`no item ${id}`);
    const moves = g.place !== undefined || g.key === "float" || g.key === "dock";
    if (moves && c.frozen && c.root.dataset.alt === undefined) return;
    if (g.place) {
      const stop = c.stops(id).find((x) => JSON.stringify(x.place) === JSON.stringify(g.place)) ?? c.stops(id).find((x) => x.place.kind === g.place!.kind && g.place!.kind === "float");
      if (!stop) throw new Error(`${JSON.stringify(g.place)} is not one of ${id}'s stops`);
      c.commit(stop.place.kind === "float" ? markUsed(floatAt(s, id), id) : stop.after(center(s.stage)).state);
      return;
    }
    switch (g.key) {
      case undefined:
        // The window's own control: a rail icon's or a Views word's click opens it (unfolded, or back from closed).
        if (it.closed || (it.from ?? 0) > 0) return c.open(id);
        return c.grip(id);
      case "use":
        return c.press(id);
      case "open":
        return c.commit(markUsed(openItem(s, id), id));
      case "close":
        return c.commit(closeItem(s, id));
      case "fold":
        return c.commit(markUsed(foldItem(s, id,true), id));
      case "unfold":
        return c.commit(markUsed(foldItem(s, id,false), id));
      case "float":
        return c.commit(markUsed(floatAt(s, id), id));
      case "dock":
        if (!homeFor(s, id, start!)) throw new Error(`the loaded state puts ${id} nowhere`);
        return c.commit(markUsed(dockHome(s, id, start!), id));
      default:
        throw new Error(`no control ${g.key}`);
    }
  }

  /** An edge's size, an item measured again (a count gained digits) or the window's size: the DockState's step, committed. */
  function resizeNow(g: Gesture): void {
    const next = resizeStep(state(), start!, c.layout, g);
    start = next.start;
    c.commit(next.state);
  }

  function key(k: string | undefined): void {
    if (k === "Escape") {
      pressed = null;
      if (c.dragging) c.release(t, true);
    } else if (k === "Alt") c.altOn(true);
    else if (k === "Alt:up") c.altOn(false);
    else if (k === "Reload") {
      pressed = null;
      // The window's own stored form (the DockState's, plus the window's size), read back over the loaded state.
      const data: unknown = JSON.parse(JSON.stringify(c.stored()));
      c.setState(readDocwin(data, start!).state);
    } else throw new Error(`no key ${k}`);
  }

  /** The page's root as the checks read it: the session mark on the root; selectors and rects in the window's px. */
  const root: DomRoot = {
    getAttribute: (name) => c.root.getAttribute(name),
    querySelectorAll: (sel) => c.win.querySelectorAll(sel),
    getBoundingClientRect: () => {
      const r = c.win.getBoundingClientRect();
      return { left: r.left + c.win.clientLeft, top: r.top + c.win.clientTop, width: c.win.clientWidth, height: c.win.clientHeight };
    },
  };

  return {
    async load(s: DockState, settings: CaseSettings = {}) {
      if (c.dragging) c.release(t, true);
      pressed = null;
      c.drive(true);
      c.hostRules({ endReach: END_REACH });
      // The rows' preview: the slot and the room made for it (the snap preview draws no slot for a slotted target).
      c.setDropPreview("gap");
      c.altOn(false);
      c.setFrozen(settings.frozen === true);
      const stage = settings.stage ? { x: 0, y: 0, width: settings.stage.w, height: settings.stage.h } : s.stage;
      start = { ...s, stage };
      c.win.querySelector<HTMLElement>(".dw-scroll")!.scrollTop = 0;
      c.setState(start);
      c.pause();
      await nextPaint();
    },
    async perform(g: Gesture) {
      switch (g.type) {
        case "press":
          press(g);
          break;
        case "move":
          move(g);
          break;
        case "hold":
          step(Math.max(g.ms ?? 0, SETTLE_MS));
          break;
        case "release":
          release();
          break;
        case "key":
          key(g.key);
          break;
        case "click":
          click(g);
          break;
        case "resize":
          resizeNow(g);
          break;
        case "scroll":
          c.win.querySelector<HTMLElement>(".dw-scroll")!.scrollTop += g.size ?? 0;
          break;
        default:
          throw new Error(`no gesture ${String(g.type)}`);
      }
      await nextPaint();
    },
    layout: (): DockLayout => c.preview(),
    root: () => root,
    itemSelector: (id) => `.dw-items [data-id="${id}"]`,
    stored: () => storeDockState(state()),
    stops: (item) => c.stops(item as ItemId).map((x) => x.place),
    pick: targetAt,
  };
}
