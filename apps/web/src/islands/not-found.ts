/**
 * The 404 page (island): the headline's words are live. The server drew them (real text in the h1) and an aria-hidden
 * overlay; this moves them, by transform only, so nothing shifts.
 *
 * - **@n-uf/motion**: each word is an item of one layout motion (`createLayoutMotion`, from `/layout`): it settles
 *   into place on the page's entrance, and a held word follows the pointer 1:1 (`holdItem`) and settles back from
 *   where it was let go. Under reduced motion there is no entrance and no demo, and a let-go word is at its place
 *   at once. A drag the pointer loses (a cancel, a lost capture, the window losing focus) sends the word home.
 * - **@n-uf/motion/drag**: a right-hand panel is dragged by the drag intent (`liftDecision`, `createDragIntent`,
 *   `previewPlan`, the "gap" preview): the indicator shows once you aim at its slot, and the panel lands in it when
 *   you let go.
 * - **@n-uf/placement**: `clampInto` keeps a dragged word inside the viewport, so it can't be lost off the page.
 *
 * A few cycles of the demo play by themselves (a synthetic pointer through the same code), until the first real press,
 * the tab is hidden, or reduced motion is on (at load, or turned on later).
 */
import type { Point, Rect } from "@n-uf/motion";
import { createDragIntent, DRAG_DEFAULTS, liftDecision, previewPlan, type DragIntent, type DragTarget } from "@n-uf/motion/drag";
import { createLayoutMotion, holdItem, type DrawFrame, type HeldDrag, type LayoutItem } from "@n-uf/motion/layout";
import { clampInto } from "@n-uf/placement";
import { loop, omega, onMotionChange, reduced } from "./motion";

const stage = document.getElementById("nf-head");
const layer = document.getElementById("nf-layer");
if (stage && layer) start(stage, layer);

interface Word {
  readonly el: HTMLElement;
  readonly kind: "m" | "p";
  /** Where the page lays it out, in the stage's coordinates. */
  home: Rect;
  item: LayoutItem;
}

/** A word being dragged: by the pointer, or by the demo's synthetic one. */
interface Session {
  readonly w: Word;
  readonly held: HeldDrag;
  readonly grab: Point;
  readonly auto: boolean;
  readonly intent: DragIntent<DragTarget> | null;
  readonly targets: DragTarget[];
  ptr: Point;
}

/**
 * The drop preview of a panel: the indicator on its slot once you aim at it, the panel staying under the pointer
 * until you let go (then it lands in the slot). The "snap" preview would glide it into the slot while you still hold
 * it, with no indicator, so the page's point (aim, then see where it docks) is the "gap" preview's.
 */
const PREVIEW = "gap";
/** How far around a panel's slot the pointer is aiming at it (the drag intent's zone for the slot), px. */
const RING = 44;
const grow = (r: Rect, m: number): Rect => ({ x: r.x - m, y: r.y - m, width: r.width + 2 * m, height: r.height + 2 * m });
const ease = (t: number): number => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

function start(stage: HTMLElement, layer: HTMLElement): void {
  // ---- the overlay: one target outline, one drop indicator, the demo's pointer, one caption ----
  const mk = (cls: string, html = ""): HTMLElement => {
    const e = document.createElement("div");
    e.className = cls;
    e.innerHTML = html;
    layer.append(e);
    return e;
  };
  const tgt = mk("nf-ov nf-tgt");
  const ind = mk("nf-ov nf-ind", "<span></span>");
  const indLabel = ind.firstElementChild as HTMLElement;
  const ptrEl = mk("nf-ov nf-ptr");
  const cap = mk("nf-cap");
  const at = (e: HTMLElement, x: number, y: number): void => void (e.style.transform = `translate(${x}px, ${y}px)`);
  const box = (e: HTMLElement, r: Rect, pad: number): void => {
    at(e, r.x - pad, r.y - pad);
    e.style.width = `${r.width + 2 * pad}px`;
    e.style.height = `${r.height + 2 * pad}px`;
  };

  // ---- the words, and the one layout motion that moves them ----
  const stageRect = (): DOMRect => stage.getBoundingClientRect();
  const homeOf = (el: HTMLElement, sr: DOMRect): Rect => {
    const r = el.getBoundingClientRect();
    return { x: r.left - sr.left, y: r.top - sr.top, width: r.width, height: r.height };
  };
  const els = [...stage.querySelectorAll<HTMLElement>("[data-g]")];
  const sr0 = stageRect();
  const homes = els.map((el) => homeOf(el, sr0));

  const motion = createLayoutMotion({ loop, omega: omega(), reducedMotion: reduced });
  onMotionChange(() => motion.configure({ omega: omega() }));

  const words: Word[] = els.map((el, i) => {
    const home = homes[i]!;
    const w = { el, kind: el.dataset.g === "p" ? "p" : "m", home } as Word;
    // The word is laid out by the page: the drawable writes only the move (and the appearance), never the layout.
    w.item = motion.add(`w${i}`, {
      layOut: () => {},
      draw: (f: DrawFrame) => {
        const dx = f.drawn.x - w.home.x;
        const dy = f.drawn.y - w.home.y;
        const move = dx === 0 && dy === 0 ? "" : `translate(${dx}px, ${dy}px)`;
        el.style.transform = f.pop.scale === 1 ? move : `${move} scale(${f.pop.scale})`;
        el.style.opacity = String(f.pop.opacity);
        el.style.visibility = f.gone ? "hidden" : "";
      },
    }, home, { shown: reduced() });
    return w;
  });
  const wordOf = (el: Element | null): Word | undefined => words.find((w) => w.el === el);
  const ms = words.filter((w) => w.kind === "m");
  const ps = words.filter((w) => w.kind === "p");

  // The page changed under the words (resize, a re-wrap): lay them out again, at rest. Not while one is moving.
  let stale = false;
  let session: Session | null = null;
  const measure = (): void => {
    if (session || motion.running) {
      stale = true;
      return;
    }
    stale = false;
    words.forEach((w) => (w.el.style.transform = ""));
    const sr = stageRect();
    words.forEach((w) => {
      w.home = homeOf(w.el, sr);
      w.item.jumpTo(w.home);
    });
  };
  new ResizeObserver(measure).observe(stage);
  motion.onIdle(() => stale && measure());

  // ---- a drag: the same code for the pointer and for the demo ----
  const homing = new Set<Word>();
  let capTimer = 0;
  const caption = (text: string, w: Word, p: Point): void => {
    cap.textContent = text;
    cap.className = `nf-cap ${w.kind} on`;
    const x = Math.max(0, Math.min(p.x + 14, stage.clientWidth - cap.offsetWidth - 2));
    at(cap, x, p.y + 8);
  };
  const fadeCaption = (after: number): void => {
    clearTimeout(capTimer);
    capTimer = window.setTimeout(() => cap.classList.remove("on"), after);
  };

  function lift(w: Word, p: Point, auto: boolean): void {
    clearTimeout(capTimer);
    const d = w.item.drawn;
    const grab = { x: p.x - d.x, y: p.y - d.y };
    const held = holdItem(w.item, grab);
    // A panel is dragged by the drag intent: its slot is the target, a ring around it the zone you aim in.
    const targets: DragTarget[] = w.kind === "p" ? [{ id: "dock", priority: 1, hit: grow(w.home, RING), slot: w.home, label: "Docks here" }] : [];
    const intent = w.kind === "p" ? createDragIntent<DragTarget>({ home: w.home }) : null;
    session = { w, held, grab, auto, intent, targets, ptr: p };
    homing.delete(w);
    w.el.classList.add("held");
    box(tgt, w.home, 3);
    tgt.className = `nf-ov nf-tgt ${w.kind} on`;
    ptrEl.classList.toggle("on", auto);
    motion.wake();
  }

  /** One frame of the drag: the pointer clamped onto the page, the item held, and (a panel) the intent's preview. */
  function step(s: Session, now: number): void {
    const sr = stageRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    // @n-uf/placement: the held rect is moved (not resized) to lie inside the viewport, in the stage's coordinates.
    const area: Rect = { x: 8 - sr.left, y: 8 - sr.top, width: vw - 16, height: vh - 16 };
    const held = clampInto({ x: s.ptr.x - s.grab.x, y: s.ptr.y - s.grab.y, width: s.w.home.width, height: s.w.home.height }, area);
    const p = { x: held.x + s.grab.x, y: held.y + s.grab.y };
    s.held.move(p);
    at(ptrEl, p.x, p.y);
    if (!s.intent) {
      caption("held under the pointer", s.w, p);
      return;
    }
    const frame = s.intent.update(p, now, s.targets);
    const plan = previewPlan(frame, PREVIEW);
    s.held.preview(plan, frame.shown?.slot ?? null);
    if (plan.showIndicator) {
      box(ind, s.w.home, 4);
      indLabel.textContent = frame.shown?.label ?? "";
    }
    ind.classList.toggle("on", plan.showIndicator);
    caption(plan.showIndicator ? "drop to dock" : "torn off · its slot stays", s.w, p);
  }

  /** Let go (`cancel`: the pointer was lost, so no drop: the word goes home). */
  function release(s: Session, now: number, cancel = false): void {
    step(s, now);
    const p = s.held.pointer ?? s.ptr;
    const slot = s.intent && !cancel ? s.intent.release(p, s.targets)?.slot : undefined;
    // Let go into the slot it was shown in, or with no drop: either way it settles from where it was let go.
    if (slot) s.held.land(slot);
    else s.held.cancel(s.w.home);
    const docked = !!slot;
    tgt.classList.remove("on");
    ind.classList.remove("on");
    ptrEl.classList.remove("on");
    homing.add(s.w);
    session = null;
    caption(s.w.kind === "p" ? (docked ? "docked" : "back in its slot") : "settles, never past it", s.w, p);
    fadeCaption(1400);
    motion.wake();
  }

  // ---- the demo: a synthetic pointer through the same lift, step and release ----
  interface Demo { readonly w: Word; readonly t0: number; readonly from: Point; readonly away: Point; readonly near: Point }
  let demo: Demo | null = null;
  let demoOn = !reduced();
  let demoTimer = 0;
  let cycle = 0;
  const ORDER = [2, 5, 0, 7, 1, 4, 6, 3];
  const OUT = 1100;
  const BACK = 1200;
  // Held at the slot long enough for the aim (a dwell), the target to hold and the room to open: the indicator shows.
  const HOLD = 4 * DRAG_DEFAULTS.roomAfter;
  // Where the demo's pointer aims: beside the slot, outside its home (more than `homeInset`) and inside the zone.
  const AIM = RING / 2;

  function nextDemo(): void {
    if (!demoOn || cycle >= 8 || reduced() || session) return;
    const n = cycle++;
    const w = words[ORDER[n]! % words.length]!;
    const c = { x: w.home.x + w.home.width / 2, y: w.home.y + w.home.height / 2 };
    const dir = c.x < stage.clientWidth / 2 ? 1 : -1;
    const dy = n % 2 ? -46 : 70;
    const away = { x: c.x + dir * (w.kind === "p" ? 150 : 120), y: c.y + dy };
    // Aim at the ring beside the slot, where the intent shows the indicator.
    const near = { x: c.x + dir * (w.home.width / 2 + AIM), y: c.y + 4 };
    demo = { w, t0: performance.now(), from: c, away, near };
    lift(w, c, true);
  }
  const stopDemo = (): void => {
    demoOn = false;
    clearTimeout(demoTimer);
    if (demo && session?.auto) release(session, performance.now());
    demo = null;
  };
  // The demo plays only while the page is shown and motion is welcome: a hidden tab or reduced motion ends it.
  document.addEventListener("visibilitychange", () => document.hidden && stopDemo());
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", (ev) => ev.matches && stopDemo());

  /** The synthetic pointer's place at `now`; false once the demo's cycle is over. */
  function driveDemo(d: Demo, s: Session, now: number): boolean {
    const t = now - d.t0;
    const lerp = (a: Point, b: Point, k: number): Point => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
    if (t < OUT) s.ptr = lerp(d.from, d.away, ease(t / OUT));
    else if (d.w.kind === "p") {
      s.ptr = lerp(d.away, d.near, ease((t - OUT) / BACK));
      if (t > OUT + BACK + HOLD) return false;
    } else if (t > OUT + 600) return false;
    else s.ptr = d.away;
    return true;
  }

  motion.task(() => {
    const now = performance.now();
    if (session) {
      if (demo && session.auto) {
        if (!driveDemo(demo, session, now)) {
          release(session, now);
          demo = null;
          demoTimer = window.setTimeout(nextDemo, 2400);
        }
      }
      if (session) step(session, now);
    }
    for (const w of homing) {
      if (!w.item.settled) continue;
      homing.delete(w);
      w.el.classList.remove("held");
    }
    return session !== null || homing.size > 0;
  });

  // ---- the pointer ----
  els.forEach((el) => {
    el.addEventListener("pointerdown", (e) => {
      const w = wordOf(el);
      if (!w || (e.pointerType === "mouse" && e.button !== 0)) return;
      stopDemo();
      if (session) return;
      const t0 = performance.now();
      const sr = stageRect();
      const down = { x: e.clientX - sr.left, y: e.clientY - sr.top };
      const downClient = { x: e.clientX, y: e.clientY };
      const touch = e.pointerType === "touch";
      let lifted = false;
      el.setPointerCapture(e.pointerId);
      const pos = (ev: PointerEvent): Point => {
        const r = stageRect();
        return { x: ev.clientX - r.left, y: ev.clientY - r.top };
      };
      const move = (ev: PointerEvent): void => {
        if (!lifted) {
          // The model's own lift rule: a mouse lifts after 5 px, a touch after a hold, then a few px.
          const verdict = liftDecision({ touch, distance: Math.hypot(ev.clientX - downClient.x, ev.clientY - downClient.y), elapsed: performance.now() - t0 });
          if (verdict === "refuse") return finish("cancel");
          if (verdict === "wait") return;
          // Another press (a second finger) lifted a word first: this one is not a drag, it never replaces that one.
          if (session) return finish("cancel");
          lifted = true;
          lift(w, down, false);
        }
        if (session && !session.auto) session.ptr = pos(ev);
        motion.wake();
      };
      /** End this press: a drop at the pointer's last place, or (the pointer was lost) the word goes home. */
      const finish = (how: "drop" | "cancel", ev?: PointerEvent): void => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", abort);
        el.removeEventListener("lostpointercapture", abort);
        window.removeEventListener("blur", abort);
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
        if (!lifted || !session || session.auto) return;
        if (how === "drop" && ev) session.ptr = pos(ev);
        release(session, performance.now(), how === "cancel");
      };
      const up = (ev: PointerEvent): void => finish("drop", ev);
      // The browser took the pointer (a cancel, a lost capture) or the window lost focus mid-drag: no word stays held.
      const abort = (): void => finish("cancel");
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", abort);
      el.addEventListener("lostpointercapture", abort);
      window.addEventListener("blur", abort);
    });
  });

  // ---- the entrance: the left words settle in, then the panels dock in; then the demo plays a few cycles ----
  const intro = !reduced();
  if (intro) {
    ms.forEach((w, i) => {
      window.setTimeout(() => {
        const h = w.home;
        w.item.glideFrom({ x: h.x + (i % 2 ? 44 : -44), y: h.y + 36 + (i % 3) * 8, width: h.width, height: h.height }, h);
        w.item.show(true);
      }, 150 + i * 110);
    });
    const after = 150 + ms.length * 110 + 450;
    ps.forEach((w, i) => {
      window.setTimeout(() => {
        const h = w.home;
        w.item.glideFrom({ ...h, y: h.y - 26 }, h);
        w.item.show(true);
      }, after + i * 110);
    });
    demoTimer = window.setTimeout(nextDemo, after + ps.length * 110 + 2200);
  }
}
