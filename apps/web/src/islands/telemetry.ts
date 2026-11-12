/**
 * Telemetry (island): the two panes above the one desk window (components/Telemetry.astro), live off the desk's tap.
 *
 * - Motion's pane prints the frames the desk's windows drew: each window's settle is a real `@n-uf/motion` settle, and
 *   every frame of a run is recorded (`RectSample`s on the desk's own frame clock). When the run rests, the real checks
 *   of `@n-uf/motion/testing` judge it (`checkNoOvershoot`, `checkMonotonic`, `checkTempo`, read by `judge` in
 *   demos/hero.ts); while a window is held they judge `checkHeld`. A retarget mid-flight starts a new run from where the
 *   window is drawn. Nothing here is typed in: the numbers are the frames.
 * - Placement's pane prints the rects `@n-uf/placement/dock` laid the desk out with (the layout the windows' slots are),
 *   its give-way notes (codes), and, while a window is dragged, the drop targets (a slot per window) and the one shown.
 *
 * It only reads: the desk tells it (islands/desk-tap.ts), and the one control it owns is the shared slow motion.
 */
import type { Rect } from "@n-uf/motion";
import { checkHeld, type HeldSample, type RectSample } from "@n-uf/motion/testing";
import { deskTap, type DeskFrame, type DeskPlan } from "./desk-tap";
import { getSpeed, omega, onMotionChange, setSpeed } from "./motion";
import { judge, type RunReport } from "../demos/hero";
import { WINDOWS } from "../demos/home";
import { FRAME_ROWS, checkLine, frameRow, rectRow, verdict } from "../demos/telemetry";

interface Run {
  from: Rect;
  to: Rect;
  samples: RectSample[];
  rows: string[];
  t: number;
  omega: number;
}
const sameRect = (a: Rect, b: Rect): boolean => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height)) < 0.01;

export function startTelemetry(root: HTMLElement): void {
  root.classList.add("go"); // the slow-motion control shows now
  const $ = <T extends Element>(sel: string): T => root.querySelector(sel) as T;
  const who = $<HTMLElement>("#tm-who"), status = $<HTMLElement>("#tm-st"), chk = $<HTMLElement>("#tm-chk");
  const tmRows = [...root.querySelectorAll<HTMLElement>("#tm-rows .rw")];
  const tpRows = [...root.querySelectorAll<HTMLElement>("#tp-rows .rw")];
  const mapRects = [...root.querySelectorAll<SVGRectElement>("#tp-map rect[data-i]")];
  const text = (el: Element, s: string): void => void (el.textContent = s);

  // ---- Motion's pane: the frames of the focus window, and the checks ----------------------------------------------------
  const runs: (Run | null)[] = [null, null, null];
  const last: (Rect | null)[] = [null, null, null];
  let focus = 0;
  let report: RunReport | null = null;
  let held: { i: number; samples: HeldSample[]; rows: string[]; t: number; n: number } | null = null;
  // A window resize re-lays the desk out under a held window: the frames recorded before it (and the next two, while the
  // desk redraws) are not comparable with the pointer's place, so the hold's judgement starts again instead of failing.
  let resized = 0;
  addEventListener("resize", () => { held = null; resized = 2; });

  const drawRows = (rows: readonly string[]): void => {
    const shown = rows.slice(-FRAME_ROWS);
    tmRows.forEach((el, k) => {
      const row = shown[k - (FRAME_ROWS - shown.length)] ?? "";
      text(el, row);
      el.className = `rw${k === FRAME_ROWS - 1 && row ? " last" : ""}`;
    });
  };
  const drawChecks = (r: RunReport | null, heldOk: boolean | null): void => {
    chk.textContent = "";
    const add = (label: string, ok: boolean | null, extra = ""): void => {
      const s = document.createElement("span");
      s.innerHTML = `<span class="cn">${label}</span> <i${ok === false ? ' class="bad"' : ""}>${extra || verdict(ok)}</i>`;
      chk.append(s);
    };
    if (heldOk !== null) {
      add("checkHeld", heldOk);
      const s = document.createElement("span");
      s.textContent = "the held rect is where the pointer puts it, every frame";
      chk.append(s);
      return;
    }
    const c = checkLine(r);
    add(c[0]!.text, c[0]!.ok);
    add(c[1]!.text, c[1]!.ok);
    // the tempo reads "checkTempo 90 % in N ms": its text is the label, its verdict the mark
    add(c[2]!.text, c[2]!.ok);
  };
  const setStatus = (s: string, cls = ""): void => {
    text(status, s);
    status.className = `tr${cls ? ` live ${cls}` : ""}`;
  };
  const title = (i: number): string => `${WINDOWS[i]!.title} · window ${i + 1}`;

  function motionFrame(f: DeskFrame): void {
    if (f.dt <= 0 && !f.windows.some((w) => w.held)) {
      f.windows.forEach((w) => (last[w.i] = w.drawn));
      return;
    }
    for (const w of f.windows) {
      if (w.held) {
        if (resized > 0) { resized--; held = null; continue; }
        // A pointer holds it: record the held frames, judged by checkHeld.
        if (!held || held.i !== w.i) held = { i: w.i, samples: [], rows: [], t: 0, n: 0 };
        held.t += f.dt;
        held.samples.push({ t: held.t, rect: w.drawn, expected: w.expected ?? w.drawn });
        // Only the latest 600 frames are kept; the row's frame number counts every frame of the hold.
        held.n++;
        held.rows.push(frameRow(held.n, held.t, w.drawn));
        if (held.rows.length > FRAME_ROWS) held.rows.shift();
        if (held.samples.length > 600) held.samples.shift();
        runs[w.i] = null;
        last[w.i] = w.drawn;
        focus = w.i;
        text(who, title(w.i));
        setStatus("held · 1:1 under the pointer", "h");
        drawRows(held.rows);
        drawChecks(null, checkHeld(held.samples).ok);
        continue;
      }
      if (held && held.i === w.i) held = null;
      let run = runs[w.i] ?? null;
      if (w.moving || run) {
        if (run && !sameRect(run.to, w.target)) run = null; // retargeted: a new run from where it is drawn
        if (!run) {
          const from = last[w.i] ?? w.drawn;
          run = { from, to: { ...w.target }, samples: [{ t: 0, rect: { ...from } }], rows: [], t: 0, omega: omega() };
          runs[w.i] = run;
          if (w.moving) { focus = w.i; report = null; }
        }
        run.t += f.dt;
        run.samples.push({ t: run.t, rect: { ...w.drawn } });
        run.rows.push(frameRow(run.samples.length - 1, run.t, w.drawn));
        if (run.rows.length > FRAME_ROWS) run.rows.shift();
        if (focus === w.i) {
          text(who, title(w.i));
          drawRows(run.rows);
        }
        if (!w.moving) {
          // At rest: the real checks judge the run's frames.
          runs[w.i] = null;
          if (run.samples.length > 3) {
            const r = judge(run.samples, run.from, run.to, run.omega);
            if (focus === w.i) {
              report = r;
              setStatus("settled");
              drawChecks(r, null);
            }
          }
        } else if (focus === w.i) {
          setStatus("gliding", "");
          status.classList.add("live");
          if (report === null) drawChecks(null, null);
        }
      }
      last[w.i] = w.drawn;
    }
  }

  // ---- Placement's pane: the rects, the notes, the targets ---------------------------------------------------------------
  let plan: DeskPlan | null = null;
  // The dragged window and the target shown, as windows (for the titles) and as slots (the rows and the map are slots).
  let shown: number | null = null, shownSlot: number | null = null;
  let heldIndex: number | null = null, heldSlot: number | null = null;
  const drawTargets = (): void => {
    const el = $<HTMLElement>("#tp-tg");
    if (heldIndex === null) text(el, "none while nothing is held");
    else if (shown === null) text(el, `${plan?.slots.length ?? 3} slots, none shown`);
    else text(el, `${plan?.slots.length ?? 3} slots · shown: swap with ${WINDOWS[shown]!.title}`);
    tpRows.forEach((el2, k) => (el2.className = `rw${shownSlot === k ? " hi" : heldSlot === k ? " last" : ""}`));
    mapRects.forEach((m, k) => m.classList.toggle("t", shownSlot === k));
  };
  function placementPlan(p: DeskPlan): void {
    plan = p;
    text($("#tp-lay"), p.name);
    text($("#tp-sz"), `${Math.round(p.stage.width)} × ${Math.round(p.stage.height)}`);
    tpRows.forEach((el, k) => text(el, rectRow(`doc:${k + 1}`, p.slots[k]!)));
    $<SVGElement>("#tp-map").setAttribute("viewBox", `0 0 ${p.stage.width} ${p.stage.height}`);
    const stage = $<SVGRectElement>("#tp-map rect.stage");
    stage.setAttribute("width", String(p.stage.width));
    stage.setAttribute("height", String(p.stage.height));
    mapRects.forEach((m, k) => {
      const r = p.slots[k]!;
      m.setAttribute("x", String(r.x));
      m.setAttribute("y", String(r.y));
      m.setAttribute("width", String(r.width));
      m.setAttribute("height", String(r.height));
    });
    text($("#tp-notes"), `[${p.notes.map((n) => `'${n}'`).join(", ")}]`);
    drawTargets();
  }
  function placementFrame(f: DeskFrame): void {
    if (f.held === heldIndex && f.shown === shown && f.heldSlot === heldSlot && f.shownSlot === shownSlot) return;
    heldIndex = f.held;
    shown = f.shown;
    heldSlot = f.heldSlot;
    shownSlot = f.shownSlot;
    drawTargets();
  }

  deskTap.onFrame((f) => {
    motionFrame(f);
    placementFrame(f);
  });
  deskTap.onPlan(placementPlan);

  // ---- The shared slow motion ---------------------------------------------------------------------------------------------------
  const speeds = [...root.querySelectorAll<HTMLButtonElement>("[data-speed]")];
  const syncSpeed = (): void => speeds.forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.speed) === getSpeed())));
  speeds.forEach((b) => b.addEventListener("click", () => setSpeed(Number(b.dataset.speed))));
  onMotionChange(syncSpeed);
  syncSpeed();
}
