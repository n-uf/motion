/**
 * Window motion (island): plays each case. The server rendered the first chart, the lanes and the case rail; this
 * redraws them per frame with the same string builders, and builds the stretch-versus-reveal frames.
 */
import { reveal } from "@n-uf/motion";
import { $, caseRail } from "./rail";
import { omega, onMotionChange, reduced, virtualNow } from "./motion";
import { figureChrome } from "./figure-chrome";
import { CASES, LANE, at, chartFrame, chartSVG, lanesHTML, legendHTML, optsFor, type ChartOpt } from "../demos/motion";

function h(tag: string, cls: string, parent?: Element | null, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

interface Built { node: HTMLElement; T: number; draw(ms: number): void; destroy(): void }

/** A chart plus one moving block per curve: drawn as strings, then only the playhead, dots and blocks move. */
function chartStage(opt: ChartOpt, label: string): Built {
  const node = h("div", "sbody two");
  const col = h("div", "chartcol", node);
  const chartWrap = h("div", "chart", col);
  h("div", "legend-box", col).innerHTML = legendHTML(opt);
  const lanesEl = h("div", "lanes", node);
  lanesEl.innerHTML = lanesHTML(opt);
  const span = opt.ymax - opt.ymin;
  const blocks = [...lanesEl.querySelectorAll<HTMLElement>(".blk")];
  const series = [...opt.lines, ...(opt.points || [])].map((s) => s.data);
  let W = 0, tNow = 0, frame = chartFrame(opt, 560);
  let head: SVGLineElement | null = null, dots: SVGCircleElement[] = [];
  const drawChart = (w: number): void => {
    chartWrap.innerHTML = chartSVG(opt, w, label, tNow);
    frame = chartFrame(opt, w);
    head = chartWrap.querySelector<SVGLineElement>(".ph-head");
    dots = [...chartWrap.querySelectorAll<SVGCircleElement>(".ph-dot")];
  };
  const clampY = (v: number): number => Math.max(opt.ymin, Math.min(opt.ymax, v));
  const updateChart = (ms: number): void => {
    if (!head) return;
    const x = String(frame.X(ms));
    head.setAttribute("x1", x);
    head.setAttribute("x2", x);
    opt.lines.forEach((s, i) => {
      const last = s.data[s.data.length - 1]![0];
      dots[i]!.setAttribute("cx", String(frame.X(Math.min(ms, last))));
      dots[i]!.setAttribute("cy", String(frame.Y(clampY(at(s.data, ms)))));
    });
  };
  const ro = new ResizeObserver(() => {
    const w = Math.round(chartWrap.clientWidth);
    if (w && w !== W) {
      W = w;
      drawChart(w);
    }
  });
  ro.observe(chartWrap);
  return {
    node,
    T: opt.T,
    draw(ms) {
      tNow = ms;
      blocks.forEach((b, i) => {
        const n = Math.max(0, Math.min(1, (at(series[i]!, ms) - opt.ymin) / span));
        b.style.left = `calc((100% - ${LANE}px) * ${n})`;
      });
      updateChart(ms);
    },
    destroy() { ro.disconnect(); },
  };
}

/** The shrinking window: two live scenes, then the four frames of each mode. */
function framesStage(): Built {
  const U = 240, W0 = 220, W1 = 140, H1 = 74, times = [0, 30, 60, 120];
  // The drawn width settles from 220 to 140 at the current tempo; reveal() turns it into the frame to draw.
  const w = omega();
  const drawnW = (ms: number): number => W1 + (W0 - W1) * Math.exp((-w * ms) / 1000);
  const target = { x: 0, y: 0, width: W1, height: H1 };
  function scene(parent: HTMLElement, mode: "stretch" | "reveal") {
    const cell = h("div", "cell", parent);
    const sc = h("div", "scene", cell);
    const w = h("div", "w" + (mode === "reveal" ? " reveal" : ""), sc);
    const c = h("div", "c", w);
    c.style.width = (W1 / U) * 100 + "cqw";
    c.innerHTML = "<b>Invoice 0412.pdf</b>Total due 1 240.00<br>Page 2 of 5";
    return {
      cell,
      sc,
      set(ms: number): void {
        const f = reveal({ x: 0, y: 0, width: drawnW(ms), height: H1 }, target);
        w.style.width = (f.width / U) * 100 + "%";
        if (mode === "stretch") c.style.transform = `scaleX(${f.width / W1})`;
      },
    };
  }
  const node = h("div", "sbody");
  const live = h("div", "live", node);
  const liveScenes = ([["stretch", "Stretch (today), live"], ["reveal", "Reveal (proposed), live"]] as const).map(([m, t]) => {
    const f = h("div", "", live);
    h("div", "fh", f, t);
    return scene(f, m);
  });
  const snaps = h("div", "snaps", node);
  const marked: HTMLElement[][] = [];
  ([["stretch", "Stretch (today)"], ["reveal", "Reveal (proposed)"]] as const).forEach(([m, t]) => {
    h("div", "fh", snaps, t);
    times.forEach((ms, i) => {
      const wrap = h("div", "", snaps);
      const s = scene(wrap, m);
      s.set(ms);
      h("div", "cap", wrap, ms + " ms · " + Math.round(drawnW(ms)) + " px");
      (marked[i] = marked[i] || []).push(s.sc);
    });
  });
  return {
    node,
    T: 300,
    draw(ms) {
      liveScenes.forEach((s) => s.set(ms));
      let cur = 0;
      times.forEach((t, i) => { if (t <= ms) cur = i; });
      marked.forEach((list, i) => list.forEach((sc) => sc.classList.toggle("now", i === cur)));
    },
    destroy() {},
  };
}

const stage = $("stage"), casesEl = $("cases"), statusEl = $("status"), loopEl = $<HTMLInputElement>("loop");
let active = -1, cur: Built | null = null, raf = 0, timer = 0, tms = 0;

const markCase = caseRail(casesEl, (i) => select(i));
const setStatus = (t: string): void => void (statusEl.innerHTML = t);
const stat = (ms: number, done: boolean): void => setStatus(`t = <b>${Math.round(ms)}</b> ms of ${cur!.T} ms${done ? " · done" : ""}`);

function stopAnim(): void {
  cancelAnimationFrame(raf);
  raf = 0;
  clearTimeout(timer);
  timer = 0;
}
/** Play the case on the site's clock: Speed slows it, and a speed change mid-run carries on without a jump. */
function play(): void {
  stopAnim();
  const T = cur!.T;
  let t0: number | null = null;
  const step = (): void => {
    const now = virtualNow();
    if (t0 === null) t0 = now;
    const ms = Math.min(T, now - t0);
    tms = ms;
    cur!.draw(ms);
    if (ms < T) { stat(ms, false); raf = requestAnimationFrame(step); }
    else { raf = 0; stat(ms, true); if (loopEl.checked) timer = window.setTimeout(play, 800); }
  };
  cur!.draw(0);
  stat(0, false);
  raf = requestAnimationFrame(step);
}
function seek(ms: number): void {
  stopAnim();
  tms = ms;
  cur!.draw(ms);
  stat(ms, ms >= cur!.T);
}

function select(i: number): void {
  stopAnim();
  if (cur) cur.destroy();
  active = i;
  markCase(i);
  const c = CASES[i]!;
  stage.textContent = "";
  const head = h("div", "shead", stage);
  const tx = h("div", "", head);
  h("p", "stitle", tx, c.name);
  h("p", "", tx, c.desc);
  $("case-name").textContent = c.name;
  cur = c.kind === "frames" ? framesStage() : chartStage(optsFor(omega())[c.kind], c.label);
  stage.appendChild(cur.node);
  if (reduced()) seek(cur.T);
  else play();
}
$("replay").addEventListener("click", () => { if (cur) play(); });
loopEl.addEventListener("change", () => { if (cur && loopEl.checked && !raf && !timer && tms >= cur.T) timer = window.setTimeout(play, 300); });
// A new tempo redraws the proposal's curves (and the frames) at that tempo, and plays the case again.
let lastTempo = omega();
onMotionChange(() => {
  if (omega() === lastTempo) return;
  lastTempo = omega();
  select(active);
});
// ↺ Reset: the first case, Loop off.
const motionChrome = figureChrome($("figure"), {
  demo: {
    isDefault: () => active === 0 && !loopEl.checked,
    reset() {
      loopEl.checked = false;
      select(0);
    },
  },
});
for (const ev of ["change", "click"]) $("figure").addEventListener(ev, () => queueMicrotask(() => motionChrome.demoChanged()));

select(0);
(window as unknown as Record<string, unknown>).__motionSketch = { cases: CASES.length, select, seek, play, time: () => tms };