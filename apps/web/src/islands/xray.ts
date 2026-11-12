/**
 * X-ray: a demo window's switch (the title bar's "X-ray", window chrome like ↺ Reset) that shows which package does
 * what. Each part draws its own layer over the window, in its own colour:
 *
 * - placement (where things go): every drop target's hit zone as a thin dashed outline labelled with its id and
 *   priority, and the slot rects it computed (the one shown drawn stronger);
 * - motion (how things move): the settle's target against the rect drawn now, the held item's trail, and the aiming
 *   state as a dot at the pointer (grey while flying, accent while aiming, a ring once the room opens).
 *
 * Owners (the window's chrome, its demo) draw frames in viewport coordinates; the layer keeps them relative to the
 * window, so a static frame stays right while the page scrolls. Off by default, and never stored.
 */
import type { Point } from "@n-uf/motion";

export type XR = { x: number; y: number; w: number; h: number };
export interface XrayFrame {
  /** Placement: hit zones (dashed), labelled "id · p<priority>" (no label: the outline only). */
  zones?: { r: XR; label?: string }[];
  /** Placement: slot rects (labelled when a label is given); `on` is the one the drop shows. */
  slots?: { r: XR; label?: string; on?: boolean }[];
  /** Motion: the settle's target, and the rect drawn now. */
  target?: XR | null;
  drawn?: XR | null;
  /** Motion: where the held item has been (its top-left corners, oldest first). */
  trail?: Point[];
  /** Motion: the pointer and the drag intent's state. */
  aim?: { p: Point; state: "fly" | "aim" | "room" } | null;
}
export interface Xray {
  readonly on: boolean;
  set(on: boolean): void;
  onChange(f: (on: boolean) => void): void;
  /** Draw this owner's layer (null clears it). A no-op while X-ray is off. */
  draw(owner: string, frame: XrayFrame | null): void;
  /** Show only one package's layer (the home page's lit step), or both (null). */
  focus(part: "placement" | "motion" | null): void;
}

const SVG = "http://www.w3.org/2000/svg";
const all = new WeakMap<HTMLElement, Xray>();
const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** The X-ray of a window (the figure); one per window, shared by its chrome and its demo. */
export function xrayOf(win: HTMLElement): Xray {
  const have = all.get(win);
  if (have) return have;
  let on = false;
  let only: "placement" | "motion" | null = null;
  const listeners = new Set<(on: boolean) => void>();
  const frames = new Map<string, XrayFrame>();
  const layer = document.createElementNS(SVG, "svg");
  layer.setAttribute("class", "xray-layer");
  layer.setAttribute("aria-hidden", "true");
  win.appendChild(layer);
  const key = document.createElement("div");
  key.className = "xray-key";
  key.setAttribute("aria-hidden", "true");
  key.innerHTML = `<span class="xk-p">placement</span> hit zones · slots <span class="xk-m">motion</span> target · trail · aim`;
  win.appendChild(key);

  const render = (): void => {
    if (!on) {
      layer.innerHTML = "";
      return;
    }
    const o = win.getBoundingClientRect();
    // The key sits at the stage's bottom left, clear of the bars.
    const stage = [...win.querySelectorAll<HTMLElement>(".stage-host")].find((s) => s.closest(".win") === win);
    if (stage) {
      const s = stage.getBoundingClientRect();
      key.style.left = s.left - o.left + 8 + "px";
      key.style.top = s.bottom - o.top - key.offsetHeight - 8 + "px";
    }
    // Frames are stored relative to the window (see draw), so they render where they were drawn whatever the scroll.
    const R = (r: XR): string => `x="${r.x.toFixed(1)}" y="${r.y.toFixed(1)}" width="${Math.max(0, r.w).toFixed(1)}" height="${Math.max(0, r.h).toFixed(1)}"`;
    const out: string[] = [];
    // A label sits at its rect's bottom left, inside the window.
    const label = (r: XR, text: string, cls = ""): string => {
      const x = Math.max(3, Math.min(r.x + 3, o.width - 120)), y = Math.max(11, Math.min(r.y + r.h - 3, o.height - 3));
      return `<text class="xp-label${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}">${esc(text)}</text>`;
    };
    for (const f of frames.values()) {
      if (only !== "motion") {
        for (const z of f.zones ?? []) out.push(`<rect class="xp-zone" ${R(z.r)}/>${z.label ? label(z.r, z.label) : ""}`);
        for (const s of f.slots ?? []) out.push(`<rect class="xp-slot${s.on ? " on" : ""}" ${R(s.r)}/>${s.label ? label(s.r, s.label, s.on ? " on" : "") : ""}`);
      }
      if (only === "placement") continue;
      if (f.trail && f.trail.length > 1) out.push(`<polyline class="xm-trail" points="${f.trail.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}"/>`);
      if (f.drawn) out.push(`<rect class="xm-drawn" ${R(f.drawn)}/>`);
      if (f.target) out.push(`<rect class="xm-target" ${R(f.target)}/><circle class="xm-dot" cx="${f.target.x.toFixed(1)}" cy="${f.target.y.toFixed(1)}" r="3"/>`);
      if (f.aim) {
        const cx = (f.aim.p.x + 14).toFixed(1), cy = (f.aim.p.y - 14).toFixed(1);
        out.push(`<circle class="xm-aim ${f.aim.state}" cx="${cx}" cy="${cy}" r="5"/>`);
        if (f.aim.state === "room") out.push(`<circle class="xm-ring" cx="${cx}" cy="${cy}" r="9"/>`);
      }
    }
    layer.innerHTML = out.join("");
  };
  const x: Xray = {
    get on() { return on; },
    set(v) {
      if (v === on) return;
      on = v;
      win.classList.toggle("xray", on);
      if (!on) frames.clear();
      render();
      listeners.forEach((f) => f(on));
    },
    onChange: (f) => void listeners.add(f),
    focus(part) {
      if (part === only) return;
      only = part;
      win.dataset.xrayFocus = part ?? "";
      render();
    },
    draw(owner, frame) {
      if (!on) return;
      if (frame) frames.set(owner, relative(frame));
      else frames.delete(owner);
      render();
    },
  };
  /** A frame drawn in viewport coordinates, made relative to the window as it is now. */
  function relative(f: XrayFrame): XrayFrame {
    const o = win.getBoundingClientRect();
    const r = (q: XR): XR => ({ x: q.x - o.left, y: q.y - o.top, w: q.w, h: q.h });
    const pt = (p: Point): Point => ({ x: p.x - o.left, y: p.y - o.top });
    return {
      zones: f.zones?.map((z) => ({ ...z, r: r(z.r) })),
      slots: f.slots?.map((s) => ({ ...s, r: r(s.r) })),
      target: f.target && r(f.target),
      drawn: f.drawn && r(f.drawn),
      trail: f.trail?.map(pt),
      aim: f.aim && { ...f.aim, p: pt(f.aim.p) },
    };
  }
  // Frames are kept relative to the window: a resize redraws them where they are.
  new ResizeObserver(() => { if (on) render(); }).observe(win);
  all.set(win, x);
  return x;
}

/** Bind a window's "X-ray" switch (`[data-chrome-xray]` in its title bar). */
export function bindXray(win: HTMLElement): Xray {
  const x = xrayOf(win);
  const btn = [...win.querySelectorAll<HTMLButtonElement>("[data-chrome-xray]")].find((b) => b.closest(".win") === win);
  if (btn) {
    btn.addEventListener("click", () => x.set(!x.on));
    x.onChange((on) => btn.setAttribute("aria-pressed", String(on)));
  }
  return x;
}
