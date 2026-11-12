/**
 * Window chrome made of toolbar groups: every figure's bars (and the toolbar-groups page's sample window) are a set
 * of hosts (the title bar, a top and a bottom bar, the left and right edges, floating) with start, centre and end
 * zones. Each group of two or more controls has one dotted handle that leads it and is its separator; it carries the
 * group's actions:
 *
 * - drag: move the group (before all, after all, between two; over the stage it floats). The drop follows the drag
 *   intent (an aim gate, a 160 ms hold before it shows, held at borders) and the figure's preview mode: an insertion
 *   marker (Drop indicator), the neighbours opening the gap (Open gap), or the group gliding into it (Snap to slot).
 *   A group's own place is home, never a target. The real group is lifted, no copy; it lands from where it was let go.
 * - double-click, Enter or Space: collapse to handle + », or expand. Bars never wrap: when one runs out of room its
 *   trailing groups collapse.
 * - right-click, long-press or Shift+F10: its menu (Collapse, Move to ›, Float/Dock, Move this bar's groups to ›,
 *   Reset position, Reset all).
 * - frozen (the lock): no grips, nothing moves; holding Alt brings them back while held.
 *
 * The module moves the server-rendered group elements between zones (so their controls keep their listeners), and
 * one instance runs per window; a page may hold several. An arrangement can persist per figure in localStorage.
 */
import type { Point, Settle } from "@n-uf/motion";
import { drive, flip, forget, glideFrom, newSettle } from "./motion";
import { dropMode, previewPlan } from "./drop-mode";
import { setDragging } from "./showcase";
import { HOSTNAME, HOSTS, ZONENAME, ZONES, clone, type Host, type Model, type Zone } from "../demos/toolbar";

export interface ChromeOptions {
  /** The window: the element holding the bars, zones and groups (`.win`). */
  root: HTMLElement;
  /** Each group's name, for labels and the menu. */
  labels: Record<string, string>;
  /** The arrangement the server rendered. */
  initial: Model;
  /** What "Reset" restores (default: `initial`). */
  defaults?: Model;
  /** Persist the arrangement under this localStorage key. */
  storageKey?: string;
  /** The freeze lock's checkbox and its label element. */
  freeze?: { input: HTMLInputElement; lock: HTMLElement };
  /** A line of status text after each action. */
  onStatus?: (text: string) => void;
  /** After every change the user made (a drop, a menu action). */
  onChange?: (model: Model) => void;
}

export interface Chrome {
  model(): Model;
  /** Show another arrangement (a case), gliding from where each group is drawn. */
  setModel(m: Model, animate?: boolean): void;
  /** The drag in progress, for checks. */
  drag(): { shown: string | null; snapped: boolean; marker: boolean } | null;
}

interface R { x: number; y: number; w: number; h: number; area?: boolean }
interface Target { h: Host; z: Zone; i: number; rect: R; bar: DOMRect; zone: DOMRect; label: string; float?: false }
interface FloatTarget { float: true; doc: DOMRect; label: string }
type AnyTarget = Target | FloatTarget;
interface Drag {
  id: string;
  start: Point;
  last: Point;
  lifted: boolean;
  samples: { x: number; y: number; t: number }[];
  shown: AnyTarget | null;
  pending?: AnyTarget | null;
  pendingSince?: number;
  anchor?: Point;
  stillSince?: number;
  grab?: Point;
  size?: { w: number; h: number };
  targets?: AnyTarget[];
  ghost?: HTMLElement;
  hold?: HTMLElement;
  slot?: HTMLElement | null;
  home?: { h: Host; z: Zone; i: number } | null;
  pos?: Settle<Point>;
  glide?: (() => void) | null;
  snapTo?: HTMLElement | null;
  returning?: boolean;
}

let openMenuEl: HTMLElement | null = null;
const closeMenu = (): void => {
  openMenuEl?.remove();
  openMenuEl = null;
};
document.addEventListener("pointerdown", (e) => { if (openMenuEl && !openMenuEl.contains(e.target as Node)) closeMenu(); });

export function createChrome(o: ChromeOptions): Chrome {
  const root = o.root;
  const defaults = o.defaults ?? o.initial;
  const status = o.onStatus ?? (() => {});
  const label = (g: string): string => o.labels[g] ?? g;
  /** Elements of this window only (a figure's chrome may hold another window, as on the toolbar page). */
  const own = <T extends Element>(sel: string): T[] => [...root.querySelectorAll<T>(sel)].filter((e) => e.closest(".win") === root);
  const groups = new Map<string, HTMLElement>();
  own<HTMLElement>(".group[data-g]").forEach((g) => groups.set(g.dataset.g!, g));
  const mid = own<HTMLElement>(".mid")[0]!;
  const stage = own<HTMLElement>(".stage-host")[0] ?? mid;

  const ids = (m: Model): string[] => [...HOSTS.flatMap((h) => ZONES.flatMap((z) => m[h][z])), ...m.float.map((f) => f.id)].sort();
  const valid = (m: unknown): m is Model => {
    try {
      return JSON.stringify(ids(m as Model)) === JSON.stringify(ids(defaults));
    } catch {
      return false;
    }
  };
  const load = (): Model | null => {
    if (!o.storageKey) return null;
    try {
      const v = JSON.parse(localStorage.getItem(o.storageKey) ?? "null");
      return valid(v) ? v : null;
    } catch {
      return null;
    }
  };
  const persist = (): void => {
    if (!o.storageKey) return;
    try {
      if (JSON.stringify(model) === JSON.stringify(defaults)) localStorage.removeItem(o.storageKey);
      else localStorage.setItem(o.storageKey, JSON.stringify(model));
    } catch {
      /* storage blocked: the arrangement lasts for this page */
    }
  };
  let model: Model = clone(o.initial);
  let auto = new Set<string>();
  const changed = (): void => {
    persist();
    o.onChange?.(clone(model));
  };

  // ---- Rendering: move the group elements into place, gliding from where they were drawn ----------------------------
  let landFrom: { id: string; rect: DOMRect } | null = null;
  function render(animate = true): void {
    closeMenu();
    const before = new Map<HTMLElement, DOMRect>();
    if (animate) groups.forEach((g) => before.set(g, g.getBoundingClientRect()));
    if (landFrom) {
      const g = groups.get(landFrom.id);
      if (g) before.set(g, landFrom.rect);
      landFrom = null;
    }
    for (const h of HOSTS) for (const z of ZONES) {
      const zone = own<HTMLElement>(`.zone[data-host="${h}"][data-zone="${z}"]`)[0];
      if (!zone) continue;
      for (const id of model[h][z]) { const g = groups.get(id); if (g) zone.appendChild(g); }
    }
    own<HTMLElement>(".floating").forEach((f) => f.remove());
    for (const f of model.float) {
      const g = groups.get(f.id);
      if (!g) continue;
      const w = document.createElement("div");
      w.className = "floating";
      w.style.left = f.x + "px";
      w.style.top = f.y + "px";
      w.appendChild(g);
      mid.appendChild(w);
    }
    for (const h of HOSTS) {
      const bar = own<HTMLElement>(`.bar[data-host="${h}"]`)[0];
      if (bar && h !== "title") bar.classList.toggle("empty", ZONES.every((z) => model[h][z].length === 0));
    }
    auto = new Set();
    syncCollapsed();
    if (!root.classList.contains("dragging")) collapseOverflow();
    if (!animate) return;
    before.forEach((a, g) => {
      if (!g.isConnected) return;
      const b = g.getBoundingClientRect();
      glideFrom(g, a.left - b.left, a.top - b.top);
    });
  }
  const syncCollapsed = (): void => groups.forEach((g, id) => g.classList.toggle("collapsed", model.collapsed.includes(id) || auto.has(id)));
  /** Bars never wrap: when one lacks room, its trailing groups collapse to handle + ». */
  function collapseOverflow(): void {
    own<HTMLElement>(".bar").forEach((bar) => {
      const v = bar.classList.contains("v");
      const need = (): boolean => {
        // What the bar's contents need along its axis: the groups and their 12 px gaps, the centre zone's 12 px
        // margins, the window's grip and fixed controls (with their 12 px), within the bar's padding.
        let n = 0;
        bar.querySelectorAll<HTMLElement>(":scope > .zone").forEach((z) => {
          const kids = [...z.children] as HTMLElement[];
          if (!kids.length) return;
          n += kids.reduce((s, c) => s + (v ? c.offsetHeight : c.offsetWidth), 0) + 12 * (kids.length - 1);
          if (z.classList.contains("center")) n += 24;
        });
        const lead = bar.querySelector<HTMLElement>(":scope > .winh");
        if (lead) n += lead.offsetWidth + 12;
        bar.querySelectorAll<HTMLElement>(":scope > .fixed").forEach((f) => (n += f.offsetWidth + 12));
        return n > (v ? bar.clientHeight : bar.clientWidth) - 16;
      };
      if (!need()) return;
      const order = [...bar.querySelectorAll<HTMLElement>(":scope > .zone.end > .group, :scope > .zone.center > .group, :scope > .zone.start > .group")].reverse();
      for (const g of order) {
        if (!need()) break;
        const id = g.dataset.g!;
        if (model.collapsed.includes(id) || auto.has(id)) continue;
        auto.add(id);
        g.classList.add("collapsed");
      }
    });
  }

  // ---- Freeze ---------------------------------------------------------------------------------------------------------
  const isFrozen = (): boolean => !!o.freeze?.input.checked;
  const syncFreeze = (): void => {
    root.classList.toggle("frozen", isFrozen());
    o.freeze?.lock.classList.toggle("on", isFrozen());
  };
  o.freeze?.input.addEventListener("change", syncFreeze);
  window.addEventListener("keydown", (e) => { if (e.key === "Alt") root.classList.add("alt"); });
  window.addEventListener("keyup", (e) => { if (e.key === "Alt") root.classList.remove("alt"); });
  window.addEventListener("blur", () => root.classList.remove("alt"));
  const frozenNow = (e?: { altKey?: boolean } | null): boolean => isFrozen() && !(e && e.altKey) && !root.classList.contains("alt");

  // ---- The menu ---------------------------------------------------------------------------------------------------------
  function placeOf(id: string): { h: Host; z: Zone } | null {
    for (const h of HOSTS) for (const z of ZONES) if (model[h][z].includes(id)) return { h, z };
    return null;
  }
  function removeEverywhere(id: string): void {
    for (const h of HOSTS) for (const z of ZONES) model[h][z] = model[h][z].filter((g) => g !== id);
    model.float = model.float.filter((f) => f.id !== id);
  }
  function openMenu(id: string, anchor: HTMLElement, e: { altKey?: boolean } | null): void {
    closeMenu();
    const frozen = frozenNow(e);
    const p = placeOf(id), collapsed = model.collapsed.includes(id) || auto.has(id);
    const dis = frozen ? " dis" : "";
    const items: string[] = [];
    if (frozen) items.push(`<div class="it note">Frozen: hold Alt to move or collapse</div><div class="sep"></div>`);
    items.push(`<div class="it${dis}" data-act="toggle">${collapsed ? "Expand" : "Collapse"}<span class="kb">double-click</span></div><div class="sep"></div>`);
    items.push(`<div class="it note">Move to</div>`);
    for (const h of HOSTS) items.push(`<div class="it sub${dis}" data-act="move:${h}">${HOSTNAME[h]}${p && p.h === h ? '<span class="kb">✓</span>' : ""}</div>`);
    items.push(p ? `<div class="it${dis}" data-act="float">Float</div>` : `<div class="it${dis}" data-act="dock">Dock</div>`);
    if (p) {
      items.push(`<div class="sep"></div><div class="it note">Move this bar's groups to</div>`);
      for (const h of HOSTS) if (h !== p.h && h !== "title") items.push(`<div class="it sub${dis}" data-act="bar:${h}">${HOSTNAME[h]}</div>`);
    }
    items.push(`<div class="sep"></div><div class="it" data-act="reset">Reset position</div><div class="it" data-act="resetall">Reset all</div>`);
    const m = document.createElement("div");
    m.className = "cmenu";
    m.setAttribute("role", "menu");
    m.innerHTML = items.join("");
    document.body.appendChild(m);
    openMenuEl = m;
    const r = anchor.getBoundingClientRect();
    m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + "px";
    m.style.top = Math.max(8, Math.min(r.bottom + 6, innerHeight - m.offsetHeight - 8)) + "px";
    m.addEventListener("click", (ev) => {
      const act = (ev.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act;
      if (!act) return;
      closeMenu();
      doAct(id, act);
    });
  }
  function doAct(id: string, act: string): void {
    const [k, arg] = act.split(":") as [string, Host | undefined];
    if (k === "toggle") {
      if (auto.has(id)) auto.delete(id);
      else if (model.collapsed.includes(id)) model.collapsed = model.collapsed.filter((g) => g !== id);
      else model.collapsed.push(id);
      status(`${label(id)}: ${model.collapsed.includes(id) ? "collapsed" : "expanded"}`);
    }
    if (k === "move" && arg) {
      removeEverywhere(id);
      model[arg].end.push(id);
      status(`${label(id)} → ${HOSTNAME[arg]}, after all`);
    }
    if (k === "float") {
      removeEverywhere(id);
      model.float.push({ id, x: 40, y: 40 });
      status(`${label(id)} floats`);
    }
    if (k === "dock") {
      removeEverywhere(id);
      model.top.start.push(id);
      status(`${label(id)} docked in the top bar`);
    }
    if (k === "bar" && arg) {
      const p = placeOf(id)!;
      for (const z of ZONES) {
        model[arg][z].push(...model[p.h][z]);
        model[p.h][z] = [];
      }
      status(`${HOSTNAME[p.h]}'s groups → ${HOSTNAME[arg]}`);
    }
    if (k === "reset") {
      removeEverywhere(id);
      let done = false;
      for (const h of HOSTS) for (const z of ZONES) if (!done && defaults[h][z].includes(id)) {
        model[h][z].splice(Math.min(defaults[h][z].indexOf(id), model[h][z].length), 0, id);
        done = true;
      }
      const f = defaults.float.find((x) => x.id === id);
      if (!done && f) model.float.push({ ...f });
      model.collapsed = model.collapsed.filter((g) => g !== id || defaults.collapsed.includes(id));
      status(`${label(id)} back to its default place`);
    }
    if (k === "resetall") {
      model = clone(defaults);
      status("Every group back to its default place");
    }
    render();
    changed();
  }
  root.addEventListener("contextmenu", (e) => {
    const h = (e.target as HTMLElement).closest<HTMLElement>("[data-handle]");
    if (!h || h.closest(".win") !== root) return;
    e.preventDefault();
    openMenu(h.dataset.handle!, h, e);
  });
  root.addEventListener("click", (e) => {
    const ov = (e.target as HTMLElement).closest<HTMLElement>("[data-ovf]");
    if (ov && ov.closest(".win") === root) status(`» shows ${label(ov.dataset.ovf!)}'s hidden controls in a popover`);
  });
  root.addEventListener("keydown", (e) => {
    const h = (e.target as HTMLElement).closest<HTMLElement>("[data-handle]");
    if (!h || h.closest(".win") !== root) return;
    if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") {
      e.preventDefault();
      openMenu(h.dataset.handle!, h, e);
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!frozenNow(e)) doAct(h.dataset.handle!, "toggle");
    }
    if (e.key === "Escape") closeMenu();
  });

  // ---- Dragging a group by its handle -----------------------------------------------------------------------------
  const indlabel = document.createElement("div");
  indlabel.className = "chrome-label";
  indlabel.setAttribute("aria-hidden", "true");
  document.body.appendChild(indlabel);
  const marker = document.createElement("div");
  marker.className = "chrome-marker";
  document.body.appendChild(marker);

  function targetsFor(dragged: string): AnyTarget[] {
    const out: AnyTarget[] = [];
    const g = groups.get(dragged)!;
    const home = g.getBoundingClientRect();
    const homeV = !!g.closest(".bar.v");
    const rowSize = homeV ? { w: home.height, h: home.width } : { w: home.width, h: home.height };
    own<HTMLElement>(".bar .zone").forEach((zEl) => {
      const h = zEl.dataset.host as Host, z = zEl.dataset.zone as Zone, v = h === "left" || h === "right";
      const items = [...zEl.querySelectorAll<HTMLElement>(":scope > .group")].filter((e) => e.dataset.g !== dragged);
      const zr = zEl.getBoundingClientRect(), br = zEl.closest(".bar")!.getBoundingClientRect();
      const names = items.map((e) => e.dataset.g!);
      for (let i = 0; i <= items.length; i++) {
        let p: R;
        // An empty zone: the group's own outline where it will land (flush to the zone's edge, or centred).
        if (!items.length) {
          const fw = v ? br.width - 10 : Math.min(rowSize.w, br.width - 16), fh = v ? Math.min(rowSize.w, br.height - 16) : br.height - 10;
          if (v) p = { x: br.left + 5, y: z === "start" ? br.top + 8 : z === "end" ? br.bottom - 8 - fh : br.top + br.height / 2 - fh / 2, w: fw, h: fh, area: true };
          else p = { x: z === "start" ? br.left + 8 : z === "end" ? br.right - 8 - fw : br.left + br.width / 2 - fw / 2, y: br.top + 5, w: fw, h: fh, area: true };
        } else {
          const r = (i < items.length ? items[i]! : items[items.length - 1]!).getBoundingClientRect();
          p = v ? { x: br.left + 6, y: (i < items.length ? r.top - 6 : r.bottom + 6) - 1.5, w: br.width - 12, h: 3 } : { x: (i < items.length ? r.left - 6 : r.right + 6) - 1.5, y: br.top + 6, w: 3, h: br.height - 12 };
        }
        const where = !items.length ? "" : i === 0 ? "before all" : i === items.length ? "after all" : `between ${label(names[i - 1]!)} and ${label(names[i]!)}`;
        out.push({ h, z, i, rect: p, bar: br, zone: zr, label: `${HOSTNAME[h]} · ${ZONENAME(h, z)}${where ? " · " + where : ""}` });
      }
    });
    out.push({ float: true, doc: stage.getBoundingClientRect(), label: "Float here" });
    return out;
  }

  let drag: Drag | null = null;
  let lastPress: { id: string; t: number } | null = null;
  root.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const h = (e.target as HTMLElement).closest<HTMLElement>("[data-handle]");
    if (!h || h.closest(".win") !== root) return;
    // A second press on the same handle within 350 ms is a double-click: collapse or expand.
    const now = performance.now();
    if (lastPress && lastPress.id === h.dataset.handle && now - lastPress.t < 350) {
      lastPress = null;
      e.preventDefault();
      if (frozenNow(e)) status("Frozen: hold Alt to collapse");
      else doAct(h.dataset.handle!, "toggle");
      return;
    }
    lastPress = { id: h.dataset.handle!, t: now };
    if (frozenNow(e)) {
      status("Frozen: hold Alt to move");
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    drag = { id: h.dataset.handle!, start: { x: e.clientX, y: e.clientY }, lifted: false, samples: [], shown: null, last: { x: e.clientX, y: e.clientY } };
    root.setPointerCapture(e.pointerId);
  });
  root.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const p = { x: e.clientX, y: e.clientY }, t = performance.now();
    drag.last = p;
    if (!drag.lifted) {
      if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) < 5) return;
      lift(drag);
    }
    followPointer(drag, p);
    evaluate(p, t);
  });
  function lift(d: Drag): void {
    d.lifted = true;
    closeMenu();
    setDragging(true);
    // The grab point is measured before the empty bars open as strips (which may move the group under the pointer).
    const g = groups.get(d.id)!;
    const r0 = g.getBoundingClientRect();
    d.grab = { x: d.start.x - r0.left, y: d.start.y - r0.top };
    root.classList.add("dragging");
    render(false);
    // Held drag: the real group is lifted and follows the pointer; no copy. Its old place keeps its size, empty, so
    // nothing else moves until the drop.
    const r = g.getBoundingClientRect();
    const homeV = !!g.closest(".bar.v");
    d.size = homeV ? { w: r.height, h: r.width } : { w: r.width, h: r.height };
    // Where the group came from: dropping there changes nothing, so it is never offered as a target.
    const hp = placeOf(d.id);
    d.home = hp ? { h: hp.h, z: hp.z, i: model[hp.h][hp.z].indexOf(d.id) } : null;
    // Targets are measured once, on the layout as it was at the lift (stable: slots opening never move them).
    d.targets = targetsFor(d.id);
    const hold = document.createElement("div");
    hold.className = "hold";
    hold.style.cssText = `width:${r.width}px;height:${r.height}px;flex:none`;
    const frame = g.closest<HTMLElement>(".floating");
    g.replaceWith(hold);
    d.hold = hold;
    if (frame) frame.style.visibility = "hidden";
    d.ghost = g;
    g.classList.add("lifted");
    g.style.transform = "";
    g.querySelector(".g")!.classList.add("drag");
    document.body.appendChild(g);
    d.pos = newSettle<Point>({ x: d.last.x - d.grab.x, y: d.last.y - d.grab.y });
    const tick = (): void => {
      if (!drag || drag !== d) return;
      evaluate(d.last, performance.now());
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  const drawGhost = (d: Drag): void => {
    const v = d.pos!.value;
    d.ghost!.style.left = v.x + "px";
    d.ghost!.style.top = v.y + "px";
  };
  function glideGhost(d: Drag, to: Point): void {
    d.glide?.();
    d.pos!.setTarget(to);
    d.glide = drive(d.pos!, () => drawGhost(d), () => (d.glide = null));
  }
  /** The lifted group follows the pointer: 1:1, or by settle while it comes back from a slot. */
  function followPointer(d: Drag, p: Point): void {
    if (!d.pos || d.snapTo) return;
    const at = { x: p.x - d.grab!.x, y: p.y - d.grab!.y };
    if (d.returning) {
      const v = d.pos.value;
      if (Math.abs(v.x - at.x) >= 1 || Math.abs(v.y - at.y) >= 1) {
        glideGhost(d, at);
        return;
      }
      d.returning = false;
    }
    d.glide?.();
    d.glide = null;
    d.pos.hold(at);
    drawGhost(d);
  }

  /** The drag intent: an indicator only once aiming (slower than 0.45 px/ms, or still for 90 ms). */
  function evaluate(p: Point, t: number): void {
    const d = drag;
    if (!d || !d.lifted) return;
    d.samples.push({ ...p, t });
    while (d.samples.length > 2 && t - d.samples[0]!.t > 50) d.samples.shift();
    const s0 = d.samples[0]!, speed = Math.hypot(p.x - s0.x, p.y - s0.y) / Math.max(1, t - s0.t);
    if (!d.anchor || Math.hypot(p.x - d.anchor.x, p.y - d.anchor.y) > 12) {
      d.anchor = p;
      d.stillSince = t;
    }
    const aiming = speed < 0.45 || t - d.stillSince! >= 90;
    let best: AnyTarget | null = null, bd = Infinity, inBar = false;
    for (const tg of d.targets!) {
      if (tg.float) continue;
      const b = tg.bar;
      if (p.x < b.left - 18 || p.x > b.right + 18 || p.y < b.top - 18 || p.y > b.bottom + 18) continue;
      inBar = true;
      // An empty zone wins wherever the pointer is inside it; insertion lines win by distance.
      const zr = tg.zone, inZone = p.x >= zr.left && p.x <= zr.right && p.y >= zr.top - 18 && p.y <= zr.bottom + 18;
      const dist = tg.rect.area ? (inZone ? 0 : Infinity) : Math.hypot(p.x - (tg.rect.x + tg.rect.w / 2), p.y - (tg.rect.y + tg.rect.h / 2));
      if (dist < bd) {
        bd = dist;
        best = tg;
      }
    }
    if (!inBar) {
      const f = d.targets!.find((tg): tg is FloatTarget => !!tg.float)!;
      const r = f.doc;
      if (p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom) best = f;
    }
    // The group's own place is home, not a target: no outline there, and a release there is a no-op.
    const hm = d.home;
    if (best && !best.float && hm && best.h === hm.h && best.z === hm.z && best.i === hm.i) best = null;
    // It appears once aiming has held on one target for 160 ms; flying hides it at once.
    if (!aiming) {
      if (best !== d.shown) setShown(d, null, p);
      d.pending = undefined;
    } else if (best !== d.shown) {
      if (best !== d.pending) {
        d.pending = best;
        d.pendingSince = t;
      } else if (t - d.pendingSince! >= 160) setShown(d, best, p);
    }
    if (d.shown && d.shown.float) placeFloatSlot(d, p);
  }
  const slotSize = (d: Drag, h: Host): { w: number; h: number } => (h === "left" || h === "right" ? { w: d.size!.h, h: d.size!.w } : d.size!);
  /**
   * Show a target by the preview plan: an insertion marker or empty-zone outline that moves nothing (Drop indicator);
   * a slot that opens the gap, the neighbours moving aside (Open gap); or that gap with the group gliding into it
   * (Snap to slot). Floating has no slot: it always shows the floating outline.
   */
  function setShown(d: Drag, tg: AnyTarget | null, p: Point): void {
    d.shown = tg;
    const plan = previewPlan(dropMode());
    marker.classList.remove("on");
    flip(own<HTMLElement>(".group"), () => {
      if (d.slot) {
        d.slot.remove();
        d.slot = null;
      }
      if (!tg) return;
      const s = document.createElement("div");
      s.className = "slot";
      if (tg.float) {
        s.classList.add("float");
        s.style.width = d.size!.w + 14 + "px";
        s.style.height = d.size!.h + 10 + "px";
        document.body.appendChild(s);
        d.slot = s;
        return;
      }
      if (!plan.room) return;
      const sz = slotSize(d, tg.h);
      s.style.width = sz.w + "px";
      s.style.height = sz.h + "px";
      const zone = own<HTMLElement>(`.zone[data-host="${tg.h}"][data-zone="${tg.z}"]`)[0]!;
      const gs = [...zone.children].filter((c) => c.classList.contains("group"));
      if (tg.i < gs.length) zone.insertBefore(s, gs[tg.i]!);
      else zone.appendChild(s);
      if (plan.glide) s.classList.add("snap");
      d.slot = s;
    });
    if (tg && !tg.float && !plan.room) {
      // Drop indicator: the insertion marker (or the empty zone's outline); nothing moves.
      const r = tg.rect;
      Object.assign(marker.style, { left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" });
      marker.classList.toggle("area", !!r.area);
      marker.classList.add("on");
    }
    if (tg && tg.float) placeFloatSlot(d, p);
    if (plan.glide && tg && !tg.float && d.slot && d.pos) {
      const r = d.slot.getBoundingClientRect();
      d.snapTo = d.slot;
      d.returning = false;
      glideGhost(d, { x: r.left, y: r.top });
    } else if (d.snapTo) {
      d.snapTo = null;
      d.returning = true;
      followPointer(d, p);
    }
    labelSlot(d);
  }
  function placeFloatSlot(d: Drag, p: Point): void {
    if (!d.slot) return;
    d.slot.style.left = p.x - d.grab!.x + "px";
    d.slot.style.top = p.y - d.grab!.y + "px";
    labelSlot(d);
  }
  function labelSlot(d: Drag): void {
    const anchor = d.shown && (d.shown.float || !previewPlan(dropMode()).room ? (d.slot ?? marker) : d.slot);
    if (!d.shown || !anchor || d.snapTo) {
      indlabel.classList.remove("on");
      return;
    }
    const r = anchor.getBoundingClientRect();
    indlabel.textContent = d.shown.label;
    indlabel.classList.add("on");
    Object.assign(indlabel.style, { left: Math.max(4, Math.min(r.left, innerWidth - indlabel.offsetWidth - 4)) + "px", top: Math.max(4, r.top - 28) + "px" });
  }
  function endDrag(cancel: boolean): void {
    if (!drag) return;
    const d = drag;
    drag = null;
    // The group lands from where it was let go (or glides home on cancel), never from its old slot. A snapped group is
    // already in its slot, so it lands with no second motion.
    d.glide?.();
    if (d.pos) forget(d.pos);
    const released = d.ghost ? d.ghost.getBoundingClientRect() : null;
    if (d.slot) d.slot.remove();
    if (d.hold) d.hold.remove();
    marker.classList.remove("on");
    indlabel.classList.remove("on");
    root.classList.remove("dragging");
    if (d.ghost) {
      d.ghost.classList.remove("lifted");
      d.ghost.querySelector(".g")?.classList.remove("drag");
      d.ghost.style.left = d.ghost.style.top = "";
    }
    if (!d.lifted) return;
    landFrom = released && { id: d.id, rect: released };
    const tg = cancel ? null : d.shown;
    if (tg && tg.float) {
      const wr = mid.getBoundingClientRect();
      removeEverywhere(d.id);
      model.float.push({ id: d.id, x: Math.max(4, d.last.x - d.grab!.x - wr.left), y: Math.max(4, d.last.y - d.grab!.y - wr.top) });
      status(`${label(d.id)} floats: the same group, plus a frame and shadow`);
    } else if (tg) {
      removeEverywhere(d.id);
      model[tg.h][tg.z].splice(tg.i, 0, d.id);
      status(`${label(d.id)} → ${tg.label}`);
    } else status(cancel ? "Cancelled: back where it was" : "Released with no target: back where it was");
    render();
    if (tg) changed();
    setDragging(false);
  }
  root.addEventListener("pointerup", () => endDrag(false));
  root.addEventListener("pointercancel", () => endDrag(true));
  // Never leave a drag half-done: a release anywhere, a lost capture or a move with no button down ends it.
  window.addEventListener("pointerup", () => endDrag(false));
  root.addEventListener("lostpointercapture", () => { if (drag && drag.lifted) endDrag(false); });
  window.addEventListener("pointermove", (e) => { if (drag && drag.lifted && e.buttons === 0) endDrag(false); });
  window.addEventListener("blur", () => endDrag(true));
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      endDrag(true);
      closeMenu();
    }
  });

  // A stored arrangement (the visitor's own) replaces the default once; the default is the server's, so no shift.
  const stored = load();
  if (stored) model = stored;
  render(false);
  syncFreeze();
  // A group that grows or shrinks (a hint appearing, a readout changing) refits the bars: trailing groups collapse
  // when room runs out, and expand again when it comes back.
  let pending = 0;
  const refit = (): void => {
    pending = 0;
    if (root.classList.contains("dragging")) return;
    auto = new Set();
    syncCollapsed();
    collapseOverflow();
  };
  const ro = new ResizeObserver(() => { if (!pending) pending = requestAnimationFrame(refit); });
  groups.forEach((g) => ro.observe(g));
  ro.observe(root);
  return {
    model: () => clone(model),
    setModel(m, animate = true) {
      model = clone(m);
      render(animate);
    },
    drag: () => (drag && drag.lifted ? { shown: drag.shown ? drag.shown.label : null, snapped: !!drag.snapTo, marker: marker.classList.contains("on") } : null),
  };
}
