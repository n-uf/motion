/**
 * The drag-intent model (island): how a dragged panel finds its drop target. The indicator shows only once you aim,
 * holds on borders, and the drop lands where it showed. Recorded paths compare it with a naive model. The server
 * drew the desk, the panel and the case rail; this runs the model on them.
 */
import type { Point, Rect } from "@n-uf/motion";
import { $, caseRail } from "./rail";
import { drive, newSettle, reduced } from "./motion";
import { dropMode, previewPlan } from "./drop-mode";
import { figureChrome } from "./figure-chrome";
import { createAimGate } from "../demos/intent";
import { xrayOf, type XR } from "./xray";
import { BAND, CASES, CHIP_HOME, FLASH, GAP_GRACE, HOME, LIFT, PATHS, ROOM_AFTER, T, type Key, type Path, type R, type Target } from "../demos/drag";

const inside = (r: R, p: Point, m = 0): boolean => p.x >= r.x - m && p.x <= r.x + r.w + m && p.y >= r.y - m && p.y <= r.y + r.h + m;
const area = (r: R): number => r.w * r.h;

/** The most precise target under a point (priority, then the smaller zone). */
function rawTarget(p: Point): Target | null {
  let best: Target | null = null;
  for (const t of T) if (inside(t.hit, p) && (!best || t.prio < best.prio || (t.prio === best.prio && area(t.hit) < area(best.hit)))) best = t;
  return best;
}

type Mode = "model" | "naive";
/** The drag model: feed it pointer samples; it says what the indicator shows, and what a release lands on. */
function createModel(mode: Mode) {
  let cur: Target | null = null, lastInside = 0, shown: Target | null = null, shownSince = 0, leftHome = false;
  // Aiming: the shared aim gate (speed smoothed over the last 50 ms, or a dwell within 12 px for 90 ms).
  const gate = createAimGate(true);
  return {
    get speed() { return gate.speed; },
    update(p: Point, t: number): { shown: Target | null; room: boolean } {
      const aiming = gate.update(p, t);
      if (!inside(HOME, p, -6)) leftHome = true;
      const atHome = inside(HOME, p);
      const raw = atHome ? null : rawTarget(p);
      if (mode === "naive") {
        shown = raw;
        return { shown, room: !!shown };
      }
      // Hysteresis: keep the current target inside its band, unless a more precise one is clearly under the pointer.
      let next = raw;
      if (cur && inside(cur.hit, p, BAND) && !atHome) {
        const breaks = raw && raw !== cur && raw.prio < cur.prio && inside(raw.hit, p, -4);
        next = breaks ? raw : cur;
      }
      if (!next && cur && t - lastInside < GAP_GRACE && !atHome) next = cur;
      if (next && inside(next.hit, p)) lastInside = t;
      if (next !== cur) cur = next;
      const want = cur && leftHome && aiming ? cur : null;
      if (want !== shown) {
        // Once shown, the indicator stays while the target holds, even if the pointer speeds up a little.
        if (!(shown && want === null && cur === shown)) { shown = want; shownSince = t; }
      }
      return { shown, room: !!shown && !shown.float && t - shownSince >= ROOM_AFTER };
    },
    release(p: Point): Target | null {
      if (inside(HOME, p)) return null;
      if (shown && inside(shown.hit, p, BAND)) return shown;
      return rawTarget(p);
    },
  };
}

// ---- Rendering --------------------------------------------------------------------------------------------------
const stage = $("stage"), ind = $("ind"), indlabel = $("indlabel");
const chip = $("chip"), ptr = $("ptr");
const place = (d: HTMLElement, r: R): void => void Object.assign(d.style, { left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" });
// The chip (the dragged Outline panel) is a rect that settles: held 1:1 under the pointer, gliding home, or, in
// "Snap to slot" mode, gliding into the slot it aims at, its size revealed (it clips, never stretches).
const CHIP = { width: 150, height: 64 };
const chipRect = (x: number, y: number): Rect => ({ x, y, ...CHIP });
const chipSettle = newSettle<Rect>(chipRect(CHIP_HOME.x, CHIP_HOME.y));
let landing: (() => void) | null = null;
const drawChip = (r: Rect): void => void Object.assign(chip.style, { left: r.x + "px", top: r.y + "px", width: r.width + "px", height: r.height + "px" });
/** Put the chip at a place at once (a held drag: it follows the pointer 1:1). */
const placeChip = (x: number, y: number): void => {
  landing?.();
  landing = null;
  chipSettle.hold(chipRect(x, y));
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

/** The rect the drop shows for a target (`room`: a slot between sections has opened). */
function targetRect(s: Target, room: boolean, p: Point): R {
  if (s.float) return { x: Math.min(Math.max(p.x - 75, 222), 658 - 150), y: Math.min(Math.max(p.y - 32, 38), 364 - 64), w: 150, h: 64 };
  if (s.slot) return room ? { x: s.slot.x, y: s.slot.y - 18, w: s.slot.w, h: 36 } : { x: s.slot.x, y: s.slot.y - 2, w: s.slot.w, h: 4 };
  return s.ind!;
}

// ---- X-ray: placement's targets (hit zones with ids and priorities, the slot shown), motion's settle and aim ---------
const xray = xrayOf($("figure"));
const vr = (r: R): XR => { const s = stage.getBoundingClientRect(); return { x: s.left + r.x, y: s.top + r.y, w: r.w, h: r.h }; };
const vrect = (r: Rect): XR => vr({ x: r.x, y: r.y, w: r.width, h: r.height });
let trail: Point[] = [];
function xrayPlace(shown: Target | null = null, room = false, p: Point = { x: 0, y: 0 }): void {
  xray.draw("intent:place", { zones: [{ r: vr(HOME), label: "home" }, ...T.map((t) => ({ r: vr(t.hit), label: `${t.id} · p${t.prio}` }))], slots: shown ? [{ r: vr(targetRect(shown, room, p)), on: true, label: shown.label }] : [] });
}
xray.onChange((on) => { if (on) xrayPlace(); });

let stats = { changes: 0, flashes: 0 }, lastShown: Target | null = null, lastShownAt = 0;
/** Count what the drop shows (both modes), and draw the indicator unless `draw` is off (a snap draws none). */
function showIndicator(s: Target | null, room: boolean, p: Point, t: number, draw = true): void {
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
function beginDrag(grab: Point) {
  const model = createModel(mode);
  stats = { changes: 0, flashes: 0 };
  lastShown = null;
  updateStats();
  setDrop("…");
  chip.classList.add("lifted");
  // The preview plan: Drop indicator draws the target and moves nothing (a slot stays a thin insertion marker); Open gap
  // opens the slot after the room delay and keeps the chip under the pointer; Snap to slot opens it and glides the chip
  // in, and leaving glides the chip back to the pointer, then it is held 1:1 again. Float here has no slot: it keeps
  // its outline in every mode.
  let snapped: Target | null = null, returning = false;
  return {
    move(p: Point, t: number): void {
      const { shown, room: held } = model.update(p, t);
      const plan = previewPlan(dropMode());
      const room = held && plan.room;
      if (plan.glide && shown && !shown.float && room) {
        if (snapped !== shown) {
          snapped = shown;
          returning = false;
          const r = targetRect(shown, true, p);
          glideChip({ x: r.x, y: r.y, width: r.w, height: r.h });
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
      showIndicator(shown, room, p, t, !!shown && (shown.float || plan.outline));
      updateStats();
      if (xray.on) {
        trail.push(vrect(chipSettle.value));
        if (trail.length > 48) trail.shift();
        xrayPlace(shown, room, p);
        const state = room ? "room" : shown || model.speed < 0.45 ? "aim" : "fly";
        xray.draw("intent:move", { target: vrect(chipSettle.target), drawn: vrect(chipSettle.value), trail, aim: { p: vr({ x: p.x, y: p.y, w: 0, h: 0 }), state } });
      }
    },
    end(p: Point, t: number, cancelled: boolean): Target | null {
      const target = cancelled ? null : model.release(p);
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
let live: Live | null = null, press: { p: Point; grab: Point } | null = null, playing = false, runningAll = false;
const local = (e: { clientX: number; clientY: number }): Point => {
  const r = stage.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};
const yours = (verb: string): string => `Your drag (${modeName()}): the indicator appeared or moved ${stats.changes}×, flashed ${stats.flashes}×, ${verb}`;
chip.addEventListener("pointerdown", (e) => {
  if (playing || runningAll) return;
  chip.setPointerCapture(e.pointerId);
  const p = local(e);
  press = { p, grab: { x: p.x - parseFloat(chip.style.left), y: p.y - parseFloat(chip.style.top) } };
});
chip.addEventListener("pointermove", (e) => {
  if (!press) return;
  const p = local(e);
  if (!live && Math.hypot(p.x - press.p.x, p.y - press.p.y) < LIFT) return;
  if (!live) {
    live = beginDrag(press.grab);
    markCase(0);
    setStatus("Dragging…");
  }
  live.move(p, performance.now());
});
const finish = (e: PointerEvent, cancelled: boolean): void => {
  if (live) {
    const target = live.end(local(e), performance.now(), cancelled);
    setStatus(yours(`the drop landed on “${target ? target.label : "back home"}”.`));
  }
  live = null;
  press = null;
};
chip.addEventListener("pointerup", (e) => finish(e, false));
chip.addEventListener("pointercancel", (e) => finish(e, true));
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && live) {
    live.end({ x: -1, y: -1 }, performance.now(), true);
    setStatus(yours("cancelled: the panel went back home."));
    live = null;
    press = null;
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
    const drag = beginDrag({ x: first.x - CHIP_HOME.x, y: first.y - CHIP_HOME.y });
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
  live = null;
  press = null;
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
  out.innerHTML = `<div class="section-head"><span class="eyebrow">Every path in both modes</span><h2 class="section-title">Naive flashes while flying; the model does not</h2></div><div class="table-scroll"><table class="table"><thead><tr><th>Path</th><th>Mode</th><th>Indicator appeared or moved</th><th>Flashes</th><th>Drop</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  (window as unknown as Record<string, unknown>).__dragModelResults = rows.length;
  runningAll = false;
  syncBusy();
  setStatus("Done: the table below lists every path in both modes. Naive flashes while flying; the model does not.");
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
