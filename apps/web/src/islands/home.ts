/**
 * Home (island): the live desk demo, built on @n-uf/motion (settle, reveal, held drag, drag intent), and the four cards'
 * thumbnails, on one frame loop. The server rendered every first frame; this animates them. `startHero` starts one
 * instance of the demo (components/HeroDemo.astro), with its own windows, chrome, ↺ Reset and showcase.
 *
 * Dragging a window onto another swaps them, by the drag-intent rules: nothing shows while the pointer flies; once it
 * aims at another window the drop shows by the preview mode (Drop indicator: an outline, nothing moves; Open gap: the
 * other window makes room after 160 ms, the dragged one stays under the pointer; Snap to slot: it makes room and the
 * dragged window glides into the slot); the release lands on what was shown. Its own slot is home: a release there
 * changes nothing. The automatic showcase (layouts and a swap, cycling the three modes on its own, never changing the
 * visitor's) pauses as soon as you act and resumes 10 s after your last action. Speed slows every glide; Tempo sets
 * the settle's.
 */
import { reveal, type Point, type Rect, type Settle } from "@n-uf/motion";
import { $ } from "./rail";
import { flip, getSpeed, loop, newSettle, reduced, RectField, virtualNow } from "./motion";
import { registerShowcase, setDragging } from "./showcase";
import { DROP_MODES, dropMode, onDropMode, previewPlan, type DropMode } from "./drop-mode";
import { figureChrome } from "./figure-chrome";
import { createIntent, type Intent } from "../demos/intent";
import { CURVE, CURVES, DEFAULT_TOOL, DESK_A, DESK_B, LAYOUTS, RESERVE, WINDOWS, curvePoint, curveX, deskLayout } from "../demos/home";
import { deskTap } from "./desk-tap";
import type { Model } from "../demos/toolbar";
import { xrayOf, type XR } from "./xray";

interface Win { i: number; el: HTMLElement; frame: HTMLElement; body: HTMLElement; settle: Settle<Rect>; slot: number; target: Rect; hold: boolean; /** The rect `paint` last wrote to the element (its target plus the reveal's offsets, and the frame's size). */ painted: Rect }
interface Drag {
  w: Win;
  dx: number;
  dy: number;
  intent: Intent<Win>;
  shown: Win | null;
  room: Win | null;
  snapped: boolean;
  returning: boolean;
  last: Point;
  scripted: boolean;
  /** The drag intent's state, for X-ray. */
  aim: "fly" | "aim" | "room";
}
const inside = (r: Rect, p: Point): boolean => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

/**
 * Start one desk demo: the window `fig` (components/HeroDemo.astro), whose elements' ids carry `prefix`. `checks` names
 * the global the headless checks read. A `#loop-strip` on the page (the home's four steps) is lit as a drag goes: 1
 * placement's targets at the lift, 2 motion's intent while aiming or showing, 3 placement's new layout at a drop, 4
 * motion's settle while the windows glide; X-ray then shows that step's package.
 */
export function startHero(fig: HTMLElement, prefix = "", checks = "__hero"): void {
  const el = <T extends HTMLElement = HTMLElement>(id: string): T => $<T>(prefix + id);
  const demo = el("demo");
  const readout = el("readout");
  const readoutSide = el("readout-side");
  const layoutName = el("layout-name");
  const shuffle = el("shuffle");
  fig.classList.add("go"); // the controls that do nothing without this island show now (styles/home.css)
  /** The stage keeps a band free for the floating tools while they float at the bottom (their default). */
  let reserve = RESERVE;
  /** Whether the visitor changed the demo (a swap, a layout, a tool): what ↺ Reset puts back. */
  let touched = false;
  /** The showcase's own preview mode during a scripted swap (the visitor's stays as it is). */
  let scriptMode: DropMode | null = null;
  const mode = (): DropMode => scriptMode ?? dropMode();
  const wins: Win[] = [...demo.querySelectorAll<HTMLElement>(".dw")].map((w, i) => ({
    i,
    el: w,
    frame: w.querySelector<HTMLElement>(".dw-frame")!,
    body: w.querySelector<HTMLElement>(".dw-body")!,
    settle: newSettle<Rect>({ x: 0, y: 0, width: 0, height: 0 }),
    slot: i,
    target: { x: 0, y: 0, width: 0, height: 0 },
    hold: false,
    painted: { x: 0, y: 0, width: 0, height: 0 },
  }));
  let layout = 0;
  let running: (() => void) | null = null;
  /** The drag in progress (the user's or the showcase's): set by lift(), cleared by release(). */
  let drag: Drag | null = null;

  // The drop indicator: the site's signal outline on the target slot, with a label.
  const ind = document.createElement("div");
  ind.className = "dw-ind";
  ind.innerHTML = `<span class="dw-ind-label"></span>`;
  demo.appendChild(ind);

  const slotRect = (slot: number): Rect => LAYOUTS[layout]!.slots[slot]!(demo.clientWidth, demo.clientHeight - reserve);

  /** Draw one window at its drawn rect: laid out once at its target, moved and clipped, never stretched. */
  // A window is placed by transform only (its box sits at 0, 0, sized to its target): moving it never changes layout,
  // so its glides count as no layout shift.
  function paint(w: Win): void {
    const f = reveal(w.settle.value, w.target);
    w.el.style.transform = `translate(${w.target.x + f.dx}px, ${w.target.y + f.dy}px)`;
    w.painted = { x: w.target.x + f.dx, y: w.target.y + f.dy, width: f.width, height: f.height };
    w.frame.style.width = f.width + "px";
    w.frame.style.height = f.height + "px";
    w.body.style.clipPath = f.clipRight || f.clipBottom ? `inset(0 ${f.clipRight}px ${f.clipBottom}px 0)` : "";
  }
  function place(w: Win, r: Rect): void {
    w.target = { ...r };
    Object.assign(w.el.style, { left: "0px", top: "0px", width: r.width + "px", height: r.height + "px" });
    paint(w);
  }
  function showReadout(): void {
    const w = wins[0]!, d = w.settle.value, t = w.settle.target;
    const dw = Math.round(d.width), dh = Math.round(d.height), tw = Math.round(t.width), th = Math.round(t.height);
    // While the window is dragged (held 1:1, or snapped into a slot under the pointer) its settle can count as settled;
    // say "held" then, not "at rest".
    const state = drag && drag.w === w ? "held" : w.settle.settled ? "at rest" : "settling";
    readout.innerHTML = `<b>${WINDOWS[0]!.title}</b> · drawn <b>${dw} × ${dh}</b> · target <b>${tw} × ${th}</b> · ${state}`;
    // The side form: a state dot (accent while settling) over the drawn size; the name and target in its tooltip.
    readoutSide.classList.toggle("moving", state !== "at rest");
    readoutSide.querySelector(".ro-w")!.textContent = String(dw);
    readoutSide.querySelector(".ro-h")!.textContent = String(dh);
    readoutSide.title = `${WINDOWS[0]!.title}: drawn ${dw} × ${dh}, target ${tw} × ${th}, ${state}`;
  }

  // ---- The loop strip: which step of the drag is happening, by which package -------------------------------------------
  const strip = document.getElementById("loop-strip");
  let lit = 0, stepTimer = 0, litUntil = 0;
  function setStep(n: number): void {
    if (n === lit) return;
    lit = n;
    clearTimeout(stepTimer);
    // Step 4 stays lit at least 600 ms, so a drop that needs no glide still shows it; then the next frame clears it.
    if (n === 4) {
      litUntil = performance.now() + 600;
      stepTimer = window.setTimeout(() => run(), 620);
    }
    if (strip) {
      if (n) strip.dataset.step = String(n);
      else delete strip.dataset.step;
    }
    // X-ray shows the lit step's package (1 and 3 placement, 2 and 4 motion); both when nothing is lit.
    xrayOf(fig).focus(n ? (n % 2 ? "placement" : "motion") : null);
  }

  // ---- X-ray: placement's slots and hit zones (the layout's rects, a window per target), motion's settles ------------
  const xray = xrayOf(fig);
  const vr = (r: Rect): XR => { const o = demo.getBoundingClientRect(); return { x: o.left + r.x, y: o.top + r.y, w: r.width, h: r.height }; };
  let trail: Point[] = [];
  function xrayHero(): void {
    if (!xray.on) return;
    const d = drag;
    // Placement: at rest, the layout's slots; during a drag, each window's slot as a target zone (priority 2, a slot;
    // the dragged window's own is home), and the one the drop shows.
    xray.draw("hero:place", d ? {
      zones: wins.map((w) => ({ r: vr(slotRect(w.slot)), label: w === d.w ? "home" : `${WINDOWS[w.i]!.title} · p2` })),
      slots: d.shown ? [{ r: vr(slotRect(d.shown.slot)), on: true, label: `swap with ${WINDOWS[d.shown.i]!.title}` }] : [],
    } : { slots: wins.map((w) => ({ r: vr(slotRect(w.slot)), label: `${LAYOUTS[layout]!.name} · slot ${w.slot}` })) });
    // Motion: each window's settle target against what is drawn; the held one's trail and the aim.
    for (const w of wins) {
      const held = !!d && w === d.w;
      xray.draw(`hero:w${w.i}`, held || !w.settle.settled ? { target: vr(w.settle.target), drawn: vr(w.settle.value), trail: held ? trail : undefined, aim: held ? { p: vr({ x: d!.last.x, y: d!.last.y, width: 0, height: 0 }), state: d!.aim } : null } : null);
    }
  }
  xray.onChange(() => xrayHero());

  /** Step every window that isn't held 1:1 until all rest. */
  function run(): void {
    if (running) return;
    const tick = (dt: number): boolean => {
      let moving = false;
      for (const w of wins) {
        if (!w.hold && w.settle.step(dt)) moving = true;
        paint(w);
      }
      showReadout();
      if (deskTap.active) deskTap.frame({ dt, windows: wins.map((w) => ({ i: w.i, slot: w.slot, drawn: { ...w.painted }, target: { ...w.settle.target }, moving: !w.hold && !w.settle.settled, held: w.hold, expected: w.hold && drag && drag.w === w ? pointerRect(drag.last) : undefined })), held: drag ? drag.w.i : null, shown: drag?.shown ? drag.shown.i : null, heldSlot: drag ? drag.w.slot : null, shownSlot: drag?.shown ? drag.shown.slot : null });
      // Step 4 ends when every window rests.
      if (!moving && !drag && lit === 4 && performance.now() >= litUntil) setStep(0);
      if (xray.on) {
        if (drag) {
          trail.push(vr(drag.w.settle.value));
          if (trail.length > 48) trail.shift();
        }
        xrayHero();
      }
      return moving || !!drag;
    };
    if (reduced()) {
      wins.forEach((w) => { if (!w.hold) w.settle.snap(); });
      tick(0);
      return;
    }
    tick(0);
    running = loop.repeat("write", (f) => {
      const m = tick(f.delta);
      if (!m) running = null;
      return m;
    });
  }
  /** Lay every window out at its slot; `animate` glides it there from where it is drawn. */
  function relayout(animate: boolean): void {
    for (const w of wins) {
      if (drag && w === drag.w) continue;
      const r = slotRect(w.slot);
      place(w, r);
      if (!animate) w.settle.jumpTo({ ...r });
      else w.settle.setTarget({ ...r });
    }
    layoutName.textContent = LAYOUTS[layout]!.name;
    const stage = { width: demo.clientWidth, height: demo.clientHeight - reserve };
    deskTap.plan({ name: LAYOUTS[layout]!.name, construction: LAYOUTS[layout]!.id, slots: [0, 1, 2].map((s) => slotRect(s)), stage, notes: deskLayout(layout, stage.width, stage.height).notes });
    shuffle.title = `Next layout · ${LAYOUTS[layout]!.name}`;
    run();
  }
  relayout(false);
  new ResizeObserver(() => { if (!drag) relayout(false); }).observe(demo);

  // ---- Dragging a window onto another --------------------------------------------------------------------------------
  const homeRect = (): Rect => slotRect(drag!.w.slot);
  const pointerRect = (p: Point): Rect => { const h = homeRect(); return { x: p.x - drag!.dx, y: p.y - drag!.dy, width: h.width, height: h.height }; };

  function showIndicator(target: Win | null): void {
    if (!target || !previewPlan(mode()).outline) {
      ind.classList.remove("on");
      return;
    }
    const r = slotRect(target.slot);
    Object.assign(ind.style, { left: r.x + 2 + "px", top: r.y + 2 + "px", width: r.width - 4 + "px", height: r.height - 4 + "px" });
    ind.querySelector(".dw-ind-label")!.textContent = `Swap with ${WINDOWS[target.i]!.title}`;
    ind.classList.add("on");
  }
  /** Start a drag of `w` grabbed at `p` (demo coordinates). */
  function lift(w: Win, p: Point, scripted: boolean): void {
    const d = w.settle.value;
    drag = { w, dx: p.x - d.x, dy: p.y - d.y, intent: createIntent<Win>(), shown: null, room: null, snapped: false, returning: false, last: p, scripted, aim: "fly" };
    trail = [];
    w.hold = true;
    w.settle.hold({ ...d });
    w.el.classList.add("held");
    if (!scripted) setDragging(true);
    // Step 1: the drop targets are worked out at the lift (placement's part).
    setStep(1);
    run();
  }
  /** A pointer sample during a drag (demo coordinates, a timestamp in ms). */
  function move(p: Point, t: number): void {
    const d = drag;
    if (!d) return;
    d.last = p;
    const own = inside(homeRect(), p);
    const raw = own ? null : wins.find((x) => x !== d.w && inside(slotRect(x.slot), p)) ?? null;
    const { shown, room, aiming } = d.intent.update(p, t, raw);
    const plan = previewPlan(mode());
    d.aim = !aiming && !shown ? "fly" : room && plan.room ? "room" : "aim";
    // Step 2 while the intent shows a target or aims away from home (motion's part); 1 while flying or still at home.
    setStep(shown || (aiming && !own) ? 2 : 1);
    if (shown !== d.shown) {
      // The old target goes back to its slot, and a snapped window back to the pointer.
      if (d.room) {
        const back = slotRect(d.room.slot);
        place(d.room, back);
        d.room.settle.setTarget(back);
        d.room = null;
      }
      if (d.snapped) {
        d.snapped = false;
        d.returning = true;
      }
      d.shown = shown;
      showIndicator(shown);
    }
    if (shown && room && plan.room && d.room !== shown) {
      // Making room (Open gap, Snap to slot): the target settles into the dragged window's home slot.
      const home = homeRect();
      place(shown, home);
      shown.settle.setTarget(home);
      d.room = shown;
      if (plan.glide) {
        // Snap to slot: the dragged window glides into the target's slot, its size revealed, never stretched.
        const slot = slotRect(shown.slot);
        d.w.hold = false;
        place(d.w, slot);
        d.w.settle.setTarget(slot);
        d.snapped = true;
        d.returning = false;
      }
    }
    if (!d.snapped) {
      const r = pointerRect(p);
      if (d.returning) {
        // Back to the pointer by settle, then held 1:1 again.
        place(d.w, homeRect());
        d.w.hold = false;
        d.w.settle.setTarget(r);
        const v = d.w.settle.value;
        if (Math.abs(v.x - r.x) < 1 && Math.abs(v.y - r.y) < 1 && Math.abs(v.width - r.width) < 1) d.returning = false;
      } else {
        if (!d.w.hold) place(d.w, homeRect());
        d.w.hold = true;
        d.w.settle.hold(r);
        paint(d.w);
      }
    }
    run();
  }
  /** End the drag: the drop is what was shown; `cancel` (Escape, a lost pointer) always goes home. */
  function release(cancel: boolean): void {
    const d = drag;
    if (!d) return;
    drag = null;
    ind.classList.remove("on");
    const target = cancel ? null : d.shown;
    if (target) [target.slot, d.w.slot] = [d.w.slot, target.slot];
    if (target && !d.scripted) markTouched();
    d.w.hold = false;
    d.w.el.classList.remove("held");
    // Every window settles to its slot from where it is drawn: a snapped one is already on its way, so no second motion.
    const r = slotRect(d.w.slot);
    place(d.w, r);
    d.w.settle.setTarget(r);
    // Step 3: a drop makes a new arrangement, whose rects placement works out; then step 4, the settle there (a release
    // with no target goes straight to 4: the window settles home).
    setStep(target ? 3 : 4);
    if (target) stepTimer = window.setTimeout(() => { setStep(4); run(); }, 280);
    relayout(true);
    if (!d.scripted) setDragging(false);
    trail = [];
    xrayHero();
  }

  // The user's drag.
  let pointerId = -1;
  const local = (e: PointerEvent): Point => { const r = demo.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  demo.addEventListener("pointerdown", (e) => {
    const w = wins.find((x) => x.el === (e.target as HTMLElement).closest<HTMLElement>(".dw"));
    if (!w || e.button !== 0) return;
    e.preventDefault();
    if (drag) release(true);
    pointerId = e.pointerId;
    demo.setPointerCapture(e.pointerId);
    lift(w, local(e), false);
  });
  demo.addEventListener("pointermove", (e) => { if (drag && !drag.scripted && e.pointerId === pointerId) move(local(e), performance.now()); });
  // Dwell counts too: while the user drags, keep feeding the last point when the pointer rests.
  let dwellStop: (() => void) | null = null;
  demo.addEventListener("pointerdown", () => {
    if (!drag || drag.scripted || dwellStop) return;
    dwellStop = loop.repeat("input", () => {
      if (!drag || drag.scripted) { dwellStop = null; return false; }
      move(drag.last, performance.now());
      return true;
    });
  });
  demo.addEventListener("pointerup", (e) => { if (drag && !drag.scripted && e.pointerId === pointerId) release(false); });
  demo.addEventListener("pointercancel", () => { if (drag && !drag.scripted) release(true); });
  // A drag also ends when the pointer capture is lost (the element was removed, a system gesture took it) and when the
  // window loses focus (an alert, a tab switch): the window goes back, never stuck to a pointer that is no longer there.
  demo.addEventListener("lostpointercapture", () => { if (drag && !drag.scripted) release(true); });
  window.addEventListener("blur", () => { if (drag && !drag.scripted) release(true); });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && drag && !drag.scripted) release(true); });
  // The drawing tools: one selected (the accent ring), pen by default.
  const tools = [...fig.querySelectorAll<HTMLButtonElement>("[data-tool]")];
  const selectTool = (id: string): void => tools.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === id)));
  tools.forEach((b) => b.addEventListener("click", () => { selectTool(b.dataset.tool!); markTouched(); }));
  const tool = (): string => tools.find((b) => b.getAttribute("aria-pressed") === "true")?.dataset.tool ?? DEFAULT_TOOL;
  /** The band for the floating tools: kept only while they float at the bottom. */
  const syncReserve = (m: Model): void => {
    const next = m.float.some((f) => f.anchor === "bottom") ? RESERVE : 0;
    if (next === reserve) return;
    reserve = next;
    if (!drag) relayout(true);
  };
  const chrome = figureChrome(fig, {
    onChange: syncReserve,
    demo: {
      isDefault: () => !touched && tool() === DEFAULT_TOOL,
      reset() {
        // Every window glides back to the first layout, its own slot; the pen is the tool again.
        touched = false;
        if (drag) release(true);
        layout = 0;
        wins.forEach((w) => (w.slot = w.i));
        selectTool(DEFAULT_TOOL);
        syncReserve(chrome.model());
        relayout(true);
      },
    },
  });
  function markTouched(): void {
    touched = true;
    chrome.demoChanged();
  }
  syncReserve(chrome.model());
  onDropMode(() => { if (drag) showIndicator(drag.shown); });
  shuffle.addEventListener("click", () => { nextLayout(); markTouched(); });

  // ---- The idle hint: one drag, once per page load, that shows the desk is live -----------------------------------------
  // When the desk is at least 60 % in view and nobody has touched it for 1.5 s, a drawn pointer grabs "Budget draft" by
  // its title bar and flies it toward "Quarterly plan.pdf" through the desk's own lift, move and release (the drop
  // target lights by the visitor's preview mode, exactly as in a real drag), then lets go short of the swap: the
  // release is a cancel, so the windows settle back on motion's settle and the layout state is unchanged. It never
  // plays with reduced motion, and any pointer or key on the desk ends it for good. The showcase waits its turn.
  type HintState = "armed" | "running" | "done";
  let hint: HintState = "armed";
  let hintStop: (() => void) | null = null, hintTimer = 0, inView = false, showStart = 0;
  const HINT_IDLE = 1500, HINT_GATE = 6000;
  const ptr = document.createElement("div");
  ptr.className = "dw-ptr";
  ptr.setAttribute("aria-hidden", "true");
  ptr.innerHTML = `<svg viewBox="0 0 14 20" width="14" height="20" focusable="false"><path d="M1 1v15.2l3.8-3.4 2.6 6 2.4-1.1-2.6-5.9h5.3z"/></svg>`;
  demo.appendChild(ptr);
  /** Whether the showcase should hold back: the hint is playing, or still waiting for its moment (for at most 6 s). */
  const hintBusy = (): boolean => hint === "running" || (hint === "armed" && !reduced() && performance.now() - showStart < HINT_GATE);
  function endHint(): void {
    clearTimeout(hintTimer);
    hintStop?.();
    hintStop = null;
    if (drag?.scripted) release(true);
    ptr.classList.remove("on", "press");
    hint = "done";
  }
  function armHint(): void {
    clearTimeout(hintTimer);
    if (hint !== "armed" || !inView) return;
    hintTimer = window.setTimeout(runHint, HINT_IDLE);
  }
  function runHint(): void {
    if (hint !== "armed" || !inView || drag || touched || reduced() || document.visibilityState !== "visible") return;
    const a = wins[2]!, b = wins[0]!;
    if (layout !== 0 || a.slot !== 2 || b.slot !== 0) { hint = "done"; return; }
    hint = "running";
    const ra = slotRect(a.slot), rb = slotRect(b.slot);
    const from: Point = { x: ra.x + Math.min(78, ra.width * 0.4), y: ra.y + 15 };
    const to: Point = { x: rb.x + rb.width * 0.55, y: rb.y + rb.height * 0.45 };
    const ptrAt = (p: Point): void => { ptr.style.transform = `translate(${p.x - 1}px, ${p.y - 1}px)`; };
    const ease = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
    let lifted = false;
    ptrAt(from);
    ptr.classList.add("on");
    const t0 = performance.now();
    hintStop = loop.repeat("input", () => {
      const now = performance.now(), t = now - t0;
      if (t < 450) return true; // the pointer fades in over the title bar and rests
      if (!lifted) { lifted = true; ptr.classList.add("press"); lift(a, from, true); }
      let p: Point;
      if (t < 1150) { const f = ease((t - 450) / 700); p = { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f }; }
      else if (t < 1750) p = { x: to.x + ((t - 1150) / 600) * 4, y: to.y }; // dwell: the intent shows the target
      else { endHint(); return false; }
      ptrAt(p);
      move(p, now);
      return true;
    });
  }
  /** The visitor's own pointer or key on the desk: no hint now or later. */
  const hintOff = (): void => { if (hint !== "done") endHint(); };
  fig.addEventListener("pointerdown", hintOff, { capture: true });
  fig.addEventListener("keydown", hintOff, { capture: true });
  fig.addEventListener("focusin", hintOff);
  // A moving pointer over the desk only holds the hint back (it waits for 1.5 s of stillness); while it plays, it ends it.
  fig.addEventListener("pointermove", (e) => {
    if (hint === "running") { if (e.movementX || e.movementY) endHint(); } else armHint();
  }, { passive: true });
  new IntersectionObserver(([e]) => {
    inView = !!e && e.intersectionRatio >= 0.6;
    if (!inView && hint === "running") endHint();
    armHint();
  }, { threshold: [0, 0.6] }).observe(fig);

  // ---- The automatic showcase: layouts, then a swap, cycling the three modes; its pace follows the speed -----------
  function nextLayout(): void {
    layout = (layout + 1) % LAYOUTS.length;
    // Each new layout also rotates which window takes which slot.
    wins.forEach((w) => (w.slot = (w.slot + 1) % wins.length));
    relayout(true);
  }
  let showTimer = 0, scriptStop: (() => void) | null = null, step = 0;
  /** A scripted swap in its own preview mode: fly from one window to another, aim, release. */
  function scriptedSwap(m: DropMode): void {
    scriptMode = m;
    const a = wins.find((w) => w.slot === 1)!, b = wins.find((w) => w.slot === 0)!;
    const ra = slotRect(a.slot), rb = slotRect(b.slot);
    const from = { x: ra.x + ra.width / 2, y: ra.y + 16 }, to = { x: rb.x + rb.width * 0.55, y: rb.y + rb.height * 0.45 };
    lift(a, from, true);
    // The scripted pointer moves on the site's clock (slow motion slows it); the drag's own timing rules stay real-time.
    const t0 = virtualNow();
    const ease = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
    scriptStop = loop.repeat("input", () => {
      const t = virtualNow() - t0;
      if (t < 420) {
        const f = ease(t / 420);
        move({ x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f }, performance.now());
      } else if (t < 1300) move({ x: to.x + ((t - 420) / 880) * 4, y: to.y }, performance.now());
      else {
        release(false);
        scriptStop = null;
        scriptMode = null;
        return false;
      }
      return true;
    });
  }
  function showcaseStep(): void {
    showTimer = window.setTimeout(() => {
      if (hintBusy()) return showcaseStep(); // the invitation goes first
      step++;
      if (step % 2 === 1) nextLayout();
      else scriptedSwap(DROP_MODES[(step / 2) % DROP_MODES.length]!);
      showcaseStep();
    }, 2600 / getSpeed());
  }
  registerShowcase(fig, {
    start() {
      // A clean state: the first layout, every window in its own slot, gliding there.
      layout = 0;
      wins.forEach((w) => (w.slot = w.i));
      relayout(true);
      showStart = performance.now();
      step = 0;
      showcaseStep();
    },
    stop() {
      clearTimeout(showTimer);
      if (scriptStop) {
        scriptStop();
        scriptStop = null;
        release(true);
      }
      scriptMode = null;
    },
  });

  // For checks: the windows' slots and the drag's state.
  (window as unknown as Record<string, unknown>)[checks] = {
    slots: () => wins.map((w) => w.slot),
    drag: () => (drag ? { shown: drag.shown ? WINDOWS[drag.shown.i]!.title : null, snapped: drag.snapped } : null),
    settled: () => wins.every((w) => w.settle.settled),
    drawn: () => wins.map((w) => ({ ...w.settle.value })),
    layout: () => layout,
    hint: () => hint,
  };
}

// ---- Thumbnails: each a showcase, so they pause with the heroes -----------------------------------------------------
/** A looping thumbnail: `step(ms)` every frame while it runs. */
function loopThumb(el: Element, period: number, step: (ms: number) => void): void {
  let stop: (() => void) | null = null, t0 = 0;
  registerShowcase(el, {
    start() {
      t0 = virtualNow();
      stop = loop.repeat("write", () => { step((virtualNow() - t0) % period); return true; });
    },
    stop() { stop?.(); stop = null; },
  });
}
/** A thumbnail that changes every `period` ms. */
function tickThumb(el: Element, period: number, tick: () => void, reset: () => void): void {
  let timer = 0;
  registerShowcase(el, {
    start() { reset(); timer = window.setInterval(tick, period / getSpeed()); },
    stop() { clearInterval(timer); },
  });
}

// 1 · Window motion: settle against a spring that overshoots, with a playhead.
{
  const svg = $("thumb-motion");
  const head = svg.querySelector(".t-head")!, d1 = svg.querySelector(".t-dot-other")!, d2 = svg.querySelector(".t-dot")!;
  loopThumb(svg, 2400, (t) => {
    const ms = Math.min(CURVE.Tms, t * 0.25);
    const a = curvePoint(CURVES.spring, ms), b = curvePoint(CURVES.settle, ms);
    head.setAttribute("x1", String(curveX(ms)));
    head.setAttribute("x2", String(curveX(ms)));
    d1.setAttribute("cx", String(a.x)); d1.setAttribute("cy", String(a.y));
    d2.setAttribute("cx", String(b.x)); d2.setAttribute("cy", String(b.y));
  });
}

// 2 · Drag intent: fly over, aim, the indicator shows, the panel lands with a settle and glides home.
{
  const stage = $("thumb-drag"), chip = stage.querySelector<HTMLElement>(".t-chip")!, ind2 = stage.querySelector<HTMLElement>(".t-ind")!;
  const HOMEP: Point = { x: 14, y: 99 }, SLOT: Point = { x: 195, y: 60 }, aimAt: Point = { x: 186, y: 55 };
  const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const settleAt = (from: Point, to: Point, ms: number): Point => { const k = Math.exp((-25 * ms) / 1000); return { x: to.x + (from.x - to.x) * k, y: to.y + (from.y - to.y) * k }; };
  loopThumb(stage, 3600, (t) => {
    let p: Point, on = false, lifted = true;
    if (t < 300) { p = HOMEP; lifted = false; }
    else if (t < 900) { const f = ease((t - 300) / 600); p = { x: HOMEP.x + (aimAt.x - HOMEP.x) * f, y: HOMEP.y + (aimAt.y - HOMEP.y) * f - Math.sin(f * Math.PI) * 40 }; }
    else if (t < 1500) { const f = (t - 900) / 600; p = { x: aimAt.x + 6 * f, y: aimAt.y + 3 * f }; on = t > 1060; }
    else if (t < 2500) { p = settleAt({ x: aimAt.x + 6, y: aimAt.y + 3 }, SLOT, t - 1500); lifted = false; }
    else { p = settleAt(SLOT, HOMEP, t - 2500); lifted = false; }
    chip.style.transform = `translate(${p.x}px, ${p.y}px)`;
    chip.classList.toggle("lifted", lifted);
    ind2.classList.toggle("on", on);
  });
}

// 3 · Desk layouts: the same desk built two ways, gliding between them.
{
  const svg = $("thumb-desk");
  const nodes = new Map<string, SVGElement>();
  svg.querySelectorAll<SVGElement>("rect[data-k]").forEach((n) => nodes.set(n.dataset.k!, n));
  let floating = false;
  const field = new RectField<string>((rects) => rects.forEach((r, k) => {
    const n = nodes.get(k)!;
    n.setAttribute("x", r.x.toFixed(1)); n.setAttribute("y", r.y.toFixed(1));
    n.setAttribute("width", Math.max(0, r.width).toFixed(1)); n.setAttribute("height", Math.max(0, r.height).toFixed(1));
    n.classList.toggle("t-float", floating && k.startsWith("p"));
  }));
  const set = (m: Record<string, Rect>, animate: boolean): void => field.set(new Map(Object.entries(m)), animate);
  set(DESK_A, false);
  tickThumb(svg, 2400, () => { floating = !floating; set(floating ? DESK_B : DESK_A, true); }, () => { if (floating) { floating = false; set(DESK_A, true); } });
}

// 4 · Toolbar groups: groups trade places behind their handles.
{
  const bar = $("thumb-bar");
  tickThumb(bar, 2000, () => {
    const groups = [...bar.querySelectorAll<HTMLElement>(".t-group")];
    flip(groups, () => bar.insertBefore(groups[groups.length - 1]!, groups[0]!));
  }, () => undefined);
}
