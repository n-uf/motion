/**
 * The drag-intent model (island): how a dragged panel finds its drop target. The indicator shows only once you aim,
 * holds on borders, and the drop lands where it showed. "This model" is `@n-uf/motion/drag`'s `createDragIntent`
 * (the lift rule, `liftDecision`, and the preview plan, `previewPlan`, are the library's too); the recorded paths
 * compare it with a naive model that is the page's own. The server drew the desk, the panel and the case rail; this
 * feeds the model the pointer and draws what it says.
 */
import { createDragIntent, DRAG_DEFAULTS, inRect, liftDecision, previewPlan, targetAt, type DragFrame, type DragTarget, type Point, type PreviewMode, type Rect } from "@n-uf/motion/drag";
import { $, caseRail } from "./rail";
import { drive, newSettle, reduced } from "./motion";
import { dropMode } from "./drop-mode";
import { figureChrome } from "./figure-chrome";
import { xrayOf, type XR } from "./xray";
import { CASES, CHIP_HOME, FLASH, HOME, PATHS, T, type Key, type Path, type R } from "../demos/drag";

const rectOf = (r: R): Rect => ({ x: r.x, y: r.y, width: r.w, height: r.h });
const HOME_RECT = rectOf(HOME);

/** A drop target of this page: a `DragTarget` that also says how the indicator draws it (`ind`; else a slot marker). */
interface Zone extends DragTarget {
  readonly label: string;
  readonly ind?: Rect;
}
/**
 * The page's targets as the library's: `priority`, `hit` and `slot` (where the panel lands: the room a slot between
 * sections opens, or the indicator's rect for a rail, a tab or the bottom dock), and `free` for the float.
 */
const ZONES: readonly Zone[] = T.map((t): Zone => ({
  id: t.id,
  label: t.label,
  priority: t.prio as 1 | 2 | 3,
  hit: rectOf(t.hit),
  ...(t.float ? { free: true as const } : t.slot ? { slot: { x: t.slot.x, y: t.slot.y - 18, width: t.slot.w, height: 36 } } : { slot: rectOf(t.ind!), ind: rectOf(t.ind!) }),
}));

type Mode = "model" | "naive";
type ModelFrame = Pick<DragFrame<Zone>, "shown" | "room" | "aiming">;
/** The drag model: feed it pointer samples; it says what the indicator shows, and what a release lands on. */
function createModel(mode: Mode, lift: Point) {
  if (mode === "naive") {
    // The comparison: highlight whatever is under the pointer (the most precise target), with no aim, band or delay.
    return {
      update(p: Point): ModelFrame {
        const shown = inRect(HOME_RECT, p) ? null : targetAt(ZONES, p);
        return { shown, room: !!shown && !shown.free, aiming: false };
      },
      release(p: Point): Zone | null {
        return inRect(HOME_RECT, p) ? null : targetAt(ZONES, p);
      },
    };
  }
  const intent = createDragIntent<Zone>({ home: HOME_RECT, lift });
  return {
    update: (p: Point, t: number): ModelFrame => intent.update(p, t, ZONES),
    release: (p: Point, t: number): Zone | null => intent.release(p, t, ZONES),
  };
}

/** The site's drop preview modes (and the ids they had before) as the library's. */
const PREVIEW: Record<string, PreviewMode> = { outline: "outline", placeholder: "placeholder", glide: "glide", indicator: "outline", gap: "placeholder", snap: "glide" };

// ---- Rendering --------------------------------------------------------------------------------------------------
const stage = $("stage"), ind = $("ind"), indlabel = $("indlabel");
const chip = $("chip"), ptr = $("ptr");
const place = (d: HTMLElement, r: Rect): void => void Object.assign(d.style, { left: r.x + "px", top: r.y + "px", width: r.width + "px", height: r.height + "px" });
// The chip (the dragged Outline panel) is a rect that settles: held 1:1 under the pointer, gliding home, or, in
// the preview mode that moves it into the slot (`snapItem`), gliding into the slot it aims at, its size revealed (it
// clips, never stretches).
const CHIP = { width: 150, height: 64 };
const chipRect = (x: number, y: number): Rect => ({ x, y, ...CHIP });
const chipSettle = newSettle<Rect>(chipRect(CHIP_HOME.x, CHIP_HOME.y));
let landing: (() => void) | null = null;
const drawChip = (r: Rect): void => void Object.assign(chip.style, { left: r.x + "px", top: r.y + "px", width: r.width + "px", height: r.height + "px" });
/** Put the chip at a place at once (a held drag: it follows the pointer 1:1). */
const placeChip = (x: number, y: number): void => {
  landing?.();
  landing = null;
  chipSettle.jumpTo(chipRect(x, y));
  drawChip(chipSettle.value);
};
/** The chip glides to `r` with settle, from wherever it is drawn. */
function glideChip(r: Rect, done?: () => void): void {
  landing?.();
  chipSettle.setTarget(r);
  landing = drive(chipSettle, drawChip, () => {
    landing = null;
    done?.();
  });
}
/** The chip glides home with settle, from wherever it was let go. */
const chipHome = (): void => glideChip(chipRect(CHIP_HOME.x, CHIP_HOME.y));
drawChip(chipSettle.value);

/** The rect the drop shows for a target (`room`: the room a slot between sections makes has opened). */
function targetRect(s: Zone, room: boolean, p: Point): Rect {
  if (s.free) return { x: Math.min(Math.max(p.x - 75, 222), 658 - 150), y: Math.min(Math.max(p.y - 32, 38), 364 - 64), ...CHIP };
  if (s.ind) return s.ind;
  const slot = s.slot!;
  return room ? slot : { x: slot.x, y: slot.y + slot.height / 2 - 2, width: slot.width, height: 4 };
}

// ---- X-ray: the page's targets (hit zones with ids and priorities, the slot shown), motion's settle and aim ----------
const xray = xrayOf($("figure"));
const vr = (r: R): XR => { const s = stage.getBoundingClientRect(); return { x: s.left + r.x, y: s.top + r.y, w: r.w, h: r.h }; };
const vrect = (r: Rect): XR => vr({ x: r.x, y: r.y, w: r.width, h: r.height });
let trail: Point[] = [];
function xrayPlace(shown: Zone | null = null, room = false, p: Point = { x: 0, y: 0 }): void {
  xray.draw("intent:place", { zones: [{ r: vr(HOME), label: "home" }, ...ZONES.map((z) => ({ r: vrect(z.hit), label: `${z.id} · p${z.priority}` }))], slots: shown ? [{ r: vrect(targetRect(shown, room, p)), on: true, label: shown.label }] : [] });
}
xray.onChange((on) => { if (on) xrayPlace(); });

let stats = { changes: 0, flashes: 0 }, lastShown: Zone | null = null, lastShownAt = 0;
/** Count what the drop shows (both modes), and draw the indicator unless `draw` is off (the plan draws none). */
function showIndicator(s: Zone | null, room: boolean, p: Point, t: number, draw = true): void {
  if (s !== lastShown) {
    if (lastShown && t - lastShownAt < FLASH) stats.flashes++;
    if (s) stats.changes++;
    lastShown = s;
    lastShownAt = t;
  }
  if (!s || !draw) {
    ind.classList.remove("on");
    indlabel.classList.remove("on");
    return;
  }
  const r = targetRect(s, room, p);
  place(ind, r);
  ind.classList.add("on");
  indlabel.textContent = s.label;
  Object.assign(indlabel.style, { left: Math.min(r.x, 880 - 300) + "px", top: Math.max(2, r.y - 26) + "px" });
  indlabel.classList.add("on");
}
const updateStats = (): void => {
  $("s-changes").textContent = String(stats.changes);
  $("s-flashes").textContent = String(stats.flashes);
  $("s-flashes").classList.toggle("bad", stats.flashes > 0);
};
const setDrop = (txt: string): void => void ($("s-drop").textContent = txt);
const setStatus = (txt: string): void => void ($("log").textContent = txt);

let mode: Mode = "model";
const modeName = (): string => (mode === "model" ? "this model" : "naive");
function setMode(m: Mode): void {
  mode = m;
  document.querySelectorAll<HTMLElement>("[data-mode]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.mode === m)));
}
document.querySelectorAll<HTMLElement>("[data-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode as Mode)));

// One drag: start, feed points, release. Used by both the mouse and the recorded paths.
function beginDrag(grab: Point, lift: Point) {
  const model = createModel(mode, lift);
  stats = { changes: 0, flashes: 0 };
  lastShown = null;
  updateStats();
  setDrop("…");
  chip.classList.add("lifted");
  // The library's `previewPlan(frame, mode)` says what to draw. Outline draws the target and moves nothing (a slot stays
  // a thin insertion marker); placeholder opens the slot once the model makes room and keeps the chip under the
  // pointer; glide opens it and glides the chip in (`snapItem`), and leaving glides the chip back to the pointer, then
  // it is held 1:1 again. Float here has no slot: it keeps its outline in every mode.
  let snapped: Zone | null = null, returning = false;
  return {
    move(p: Point, t: number): void {
      const frame = model.update(p, t);
      const { shown } = frame;
      const plan = previewPlan(frame, PREVIEW[dropMode()] ?? "glide");
      const room = plan.makeRoom;
      if (plan.snapItem && shown) {
        if (snapped !== shown) {
          snapped = shown;
          returning = false;
          glideChip(targetRect(shown, true, p));
        }
      } else {
        if (snapped) {
          snapped = null;
          returning = true;
        }
        const at = chipRect(p.x - grab.x, p.y - grab.y);
        if (returning) {
          const v = chipSettle.value;
          if (Math.abs(v.x - at.x) < 1 && Math.abs(v.y - at.y) < 1 && Math.abs(v.width - at.width) < 1) returning = false;
          else glideChip(at);
        }
        if (!returning) placeChip(at.x, at.y);
      }
      showIndicator(shown, room, p, t, plan.showIndicator);
      updateStats();
      if (xray.on) {
        trail.push(vrect(chipSettle.value));
        if (trail.length > 48) trail.shift();
        xrayPlace(shown, room, p);
        const state = room ? "room" : shown || frame.aiming ? "aim" : "fly";
        xray.draw("intent:move", { target: vrect(chipSettle.target), drawn: vrect(chipSettle.value), trail, aim: { p: vr({ x: p.x, y: p.y, w: 0, h: 0 }), state } });
      }
    },
    end(p: Point, t: number, cancelled: boolean): Zone | null {
      const target = cancelled ? null : model.release(p, t);
      showIndicator(null, false, p, t);
      updateStats();
      chip.classList.remove("lifted");
      setDrop(target ? target.label : "back home");
      trail = [];
      xray.draw("intent:move", null);
      xrayPlace();
      // A snapped drop is already landing: it finishes there (no second motion), then the demo resets.
      if (target && target === snapped) window.setTimeout(chipHome, 900);
      else chipHome();
      return target;
    },
    get snapped() { return snapped ? snapped.label : null; },
  };
}

// Mouse / touch.
type Live = ReturnType<typeof beginDrag>;
let live: Live | null = null, press: { p: Point; grab: Point; at: number; touch: boolean } | null = null, playing = false, runningAll = false;
const local = (e: { clientX: number; clientY: number }): Point => {
  const r = stage.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};
const yours = (verb: string): string => `Your drag (${modeName()}): the indicator appeared or moved ${stats.changes}×, flashed ${stats.flashes}×, ${verb}`;
// The model reads time passing (a dwell, the switch delay, the room), so a held pointer that fires no events is fed
// again once a frame.
let lastP: Point | null = null, lastFed = 0, pump = 0;
const feed = (p: Point): void => {
  lastP = p;
  lastFed = performance.now();
  live?.move(p, lastFed);
};
const tick = (): void => {
  if (!live) return;
  if (lastP && performance.now() - lastFed > 12) feed(lastP);
  pump = requestAnimationFrame(tick);
};
const endPress = (): void => {
  cancelAnimationFrame(pump);
  live = null;
  press = null;
  lastP = null;
};
chip.addEventListener("pointerdown", (e) => {
  if (playing || runningAll) return;
  chip.setPointerCapture(e.pointerId);
  const p = local(e);
  press = { p, grab: { x: p.x - parseFloat(chip.style.left), y: p.y - parseFloat(chip.style.top) }, at: performance.now(), touch: e.pointerType === "touch" };
});
chip.addEventListener("pointermove", (e) => {
  if (!press) return;
  const p = local(e);
  if (!live) {
    // The library's lift rule: a mouse lifts at 5 px; a touch only after a 180 ms hold, then 8 px (moving 8 px before the
    // hold is over is a swipe, not a drag).
    const decision = liftDecision({ touch: press.touch, distance: Math.hypot(p.x - press.p.x, p.y - press.p.y), elapsed: performance.now() - press.at });
    if (decision === "wait") return;
    if (decision === "refuse") {
      press = null;
      setStatus(`A touch drags after a ${DRAG_DEFAULTS.touchHold} ms hold: press and hold the panel, then drag.`);
      return;
    }
    live = beginDrag(press.grab, press.p);
    markCase(0);
    setStatus("Dragging…");
    pump = requestAnimationFrame(tick);
  }
  feed(p);
});
const finish = (e: PointerEvent, cancelled: boolean): void => {
  if (live) {
    const target = live.end(local(e), performance.now(), cancelled);
    setStatus(yours(`the drop landed on “${target ? target.label : "back home"}”.`));
  }
  endPress();
};
chip.addEventListener("pointerup", (e) => finish(e, false));
chip.addEventListener("pointercancel", (e) => finish(e, true));
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && live) {
    live.end({ x: -1, y: -1 }, performance.now(), true);
    setStatus(yours("canceled: the panel went back home."));
    endPress();
  }
});

function at(keys: Key[], t: number): Point {
  for (let i = 1; i < keys.length; i++) if (t <= keys[i]![0]) {
    const [t0, x0, y0] = keys[i - 1]!, [t1, x1, y1] = keys[i]!;
    const f = (t - t0) / (t1 - t0);
    return { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f };
  }
  const l = keys[keys.length - 1]!;
  return { x: l[1], y: l[2] };
}
const figure = $("figure");
const syncBusy = (): void => void figure.classList.toggle("busy", playing || runningAll);
interface Result { changes: number; flashes: number; drop: string; ok: boolean; snapped: string | null; chipAtRelease: Rect }
function play(path: Path): Promise<Result> {
  return new Promise((resolve) => {
    playing = true;
    syncBusy();
    const start = performance.now(), keys = path.keys, total = keys[keys.length - 1]![0];
    const first = { x: keys[0]![1], y: keys[0]![2] };
    const drag = beginDrag({ x: first.x - CHIP_HOME.x, y: first.y - CHIP_HOME.y }, first);
    ptr.style.opacity = "1";
    // Reduced motion: no playing in real time. The whole path is fed to the model in one go, on the path's own clock
    // (a sample every 16 ms), so the counts and the drop are the same and the chip is drawn where it landed.
    if (reduced()) {
      let p = first;
      for (let t = 0; ; t = Math.min(total, t + 16)) {
        p = at(keys, t);
        ptr.style.left = p.x + "px";
        ptr.style.top = p.y + "px";
        drag.move(p, start + t);
        if (t >= total) break;
      }
      const snapped = drag.snapped, chipAtRelease = { ...chipSettle.value };
      const target = drag.end(p, start + total, false);
      ptr.style.opacity = "0";
      playing = false;
      syncBusy();
      const drop = target ? target.label : "back home";
      resolve({ changes: stats.changes, flashes: stats.flashes, drop, ok: drop === path.expect, snapped, chipAtRelease });
      return;
    }
    const frame = (now: number): void => {
      const t = Math.min(now - start, total), p = at(keys, t);
      ptr.style.left = p.x + "px";
      ptr.style.top = p.y + "px";
      drag.move(p, start + t);
      if (t < total) {
        requestAnimationFrame(frame);
        return;
      }
      const snapped = drag.snapped, chipAtRelease = { ...chipSettle.value };
      const target = drag.end(p, start + t, false);
      ptr.style.opacity = "0";
      playing = false;
      syncBusy();
      const drop = target ? target.label : "back home";
      resolve({ changes: stats.changes, flashes: stats.flashes, drop, ok: drop === path.expect, snapped, chipAtRelease });
    };
    requestAnimationFrame(frame);
  });
}

// ---- Cases: "Drag it yourself" plus the recorded paths -----------------------------------------------------------------
const casesEl = $("cases");
const markCase = caseRail(casesEl, (i) => void runCase(i));
markCase(0);
function resetStage(): void {
  endPress();
  stats = { changes: 0, flashes: 0 };
  lastShown = null;
  updateStats();
  setDrop("–");
  ind.classList.remove("on");
  indlabel.classList.remove("on");
  chip.classList.remove("lifted");
  placeChip(CHIP_HOME.x, CHIP_HOME.y);
}
async function runCase(i: number): Promise<void> {
  if (playing || runningAll) return;
  markCase(i);
  const c = CASES[i]!;
  if (!c.key) {
    resetStage();
    setStatus("Drag the Outline panel yourself. The mode above decides how the indicator behaves.");
    return;
  }
  const path = PATHS[c.key]!;
  setStatus(`Playing “${path.name}” (${modeName()})…`);
  const r = await play(path);
  setStatus(`${path.name} (${modeName()}): the indicator appeared or moved ${r.changes}×, flashed ${r.flashes}×, the drop landed on “${r.drop}”.`);
}

// ---- Run all paths in both modes ---------------------------------------------------------------------------------------
$("runall").addEventListener("click", async () => {
  if (playing || runningAll) return;
  runningAll = true;
  syncBusy();
  resetStage();
  const rows: string[] = [], keys = Object.keys(PATHS);
  let n = 0;
  for (const key of keys) for (const m of ["naive", "model"] as Mode[]) {
    const path = PATHS[key]!;
    setMode(m);
    markCase(1 + keys.indexOf(key));
    setStatus(`Running all paths in both modes… ${++n} of ${keys.length * 2}: “${path.name}”, ${modeName()}.`);
    const r = await play(path);
    rows.push(`<tr><th>${path.name}</th><td>${m === "model" ? "<b>This model</b>" : "Naive"}</td><td class="num">${r.changes}</td><td class="num ${r.flashes ? "bad" : "good"}">${r.flashes}</td><td>${r.drop}</td></tr>`);
    await new Promise((res) => setTimeout(res, 250));
  }
  const out = $("compare");
  out.hidden = false;
  out.innerHTML = `<div class="section-head"><span class="eyebrow">Every path in both modes</span><h2 class="section-title">Naive flashes while travelling; the model does not</h2></div><div class="table-scroll"><table class="table"><thead><tr><th>Path</th><th>Mode</th><th>Indicator appeared or moved</th><th>Flashes</th><th>Drop</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  (window as unknown as Record<string, unknown>).__dragModelResults = rows.length;
  runningAll = false;
  syncBusy();
  setStatus("Done: the table below lists every path in both modes. Naive flashes while travelling; the model does not.");
});
const FIRST_STATUS = "Drag the Outline panel yourself, or pick a recorded path on the left.";
setStatus(FIRST_STATUS);
(window as unknown as Record<string, unknown>).__dragModel = { play: (k: string, m: Mode) => { setMode(m); return play(PATHS[k]!); }, chip: () => ({ ...chipSettle.value }) };
// ↺ Reset: this model, the first case, the panel home, the counts cleared (a recorded path that is playing finishes
// first). Any drag, case or mode change makes it available.
let touched = false;
const intentChrome = figureChrome(figure, {
  demo: {
    isDefault: () => !touched && mode === "model",
    reset() {
      if (playing || runningAll) return;
      touched = false;
      setMode("model");
      markCase(0);
      resetStage();
      setStatus(FIRST_STATUS);
    },
  },
});
for (const ev of ["pointerdown", "click"]) figure.addEventListener(ev, (e) => {
  if ((e.target as HTMLElement).closest("[data-chrome-reset], .group > .g")) return;
  if ((e.target as HTMLElement).closest("#stage, #cases, [data-mode], #runall")) touched = true;
  queueMicrotask(() => intentChrome.demoChanged());
});
