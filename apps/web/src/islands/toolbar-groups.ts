/**
 * Toolbar groups with grips (island): groups dock into five slots of three zones each, or float; one dotted handle
 * leads each group and carries all its actions. The drop follows the drag model; every glide is a settle. The server
 * rendered the window's default state and the case rail; this binds them.
 */
import { $, caseRail } from "./rail";
import { createSettle, type Point, type Settle } from "@n-uf/motion";
import { drive, flip, glideFrom } from "./motion";
import { bindDropMode, dropMode } from "./drop-mode";
import { watchActions } from "./showcase";
import { CASES, HOSTS, ZONES, HOSTNAME, ZONENAME, clone, label, windowHTML, type Host, type Zone } from "../demos/toolbar";

let model = clone(CASES[0]!.m);
let active = 0;
let autoCollapsed = new Set<string>();

// ---- Rendering with a glide ---------------------------------------------------------------------------------------
const win = $("win");
let landFrom: { id: string; rect: DOMRect } | null = null;
function render(animate = true): void {
  const before = new Map<string, DOMRect>();
  if (animate) win.querySelectorAll<HTMLElement>("[data-g]").forEach((e) => before.set(e.dataset.g!, e.getBoundingClientRect()));
  if (landFrom) {
    before.set(landFrom.id, landFrom.rect);
    landFrom = null;
  }
  win.innerHTML = windowHTML(model, autoCollapsed);
  if (!win.classList.contains("dragging")) collapseOverflow();
  if (!animate) return;
  win.querySelectorAll<HTMLElement>("[data-g]").forEach((e) => {
    const a = before.get(e.dataset.g!);
    if (!a) return;
    const b = e.getBoundingClientRect();
    glideFrom(e, a.left - b.left, a.top - b.top);
  });
}
/** Toolbars never wrap: when a bar lacks room, its trailing groups collapse to handle + ». */
function collapseOverflow(): void {
  win.querySelectorAll<HTMLElement>(".bar").forEach((bar) => {
    const v = bar.classList.contains("v");
    const need = (): boolean => {
      let n = 0, used = 0;
      bar.querySelectorAll(".zone").forEach((z) => {
        const kids = [...z.children] as HTMLElement[];
        if (!kids.length) return;
        used++;
        n += kids.reduce((s, c) => s + (v ? c.offsetHeight : c.offsetWidth), 0) + 12 * (kids.length - 1);
      });
      const lead = bar.querySelector<HTMLElement>(".winh");
      if (lead) n += lead.offsetWidth + 12;
      return n + 24 * Math.max(0, used - 1) > (v ? bar.clientHeight : bar.clientWidth) - 16;
    };
    if (!need()) return;
    const order = [...bar.querySelectorAll<HTMLElement>(".zone.end > .group, .zone.center > .group, .zone.start > .group")].reverse();
    for (const g of order) {
      if (!need()) break;
      const id = g.dataset.g!;
      if (model.collapsed.includes(id) || autoCollapsed.has(id)) continue;
      autoCollapsed.add(id);
      g.querySelector(".ctl")!.outerHTML = `<button class="tb ovf" data-ovf="${id}" tabindex="-1">»</button>`;
    }
  });
}

// ---- Cases, freeze -----------------------------------------------------------------------------------------------
const statusEl = $("status");
const setStatus = (t: string): void => void (statusEl.textContent = t);
const casesEl = $("cases");
const syncCases = caseRail(casesEl, (i) => {
  active = i;
  model = clone(CASES[i]!.m);
  autoCollapsed = new Set();
  render();
  syncCases(active);
  setStatus(CASES[i]!.note);
});
const freeze = $<HTMLInputElement>("freeze");
const lock = $("lock");
const syncFreeze = (): void => {
  win.classList.toggle("frozen", freeze.checked);
  lock.classList.toggle("on", freeze.checked);
};
freeze.addEventListener("change", syncFreeze);
window.addEventListener("keydown", (e) => { if (e.key === "Alt") win.classList.add("alt"); });
window.addEventListener("keyup", (e) => { if (e.key === "Alt") win.classList.remove("alt"); });
const frozenNow = (e?: { altKey?: boolean } | null): boolean => freeze.checked && !(e && e.altKey) && !win.classList.contains("alt");

// ---- The menu ------------------------------------------------------------------------------------------------------
let menuEl: HTMLElement | null = null;
function closeMenu(): void {
  if (menuEl) {
    menuEl.remove();
    menuEl = null;
  }
}
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
  const p = placeOf(id), collapsed = model.collapsed.includes(id) || autoCollapsed.has(id);
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
  items.push(`<div class="sep"></div><div class="it" data-act="reset">Reset position</div>`);
  const m = document.createElement("div");
  m.className = "cmenu";
  m.setAttribute("role", "menu");
  m.innerHTML = items.join("");
  document.body.appendChild(m);
  menuEl = m;
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.max(8, Math.min(r.left, innerWidth - m.offsetWidth - 8)) + "px";
  m.style.top = Math.min(r.bottom + 6, innerHeight - m.offsetHeight - 8) + "px";
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
    if (autoCollapsed.has(id)) autoCollapsed.delete(id);
    else if (model.collapsed.includes(id)) model.collapsed = model.collapsed.filter((g) => g !== id);
    else model.collapsed.push(id);
    setStatus(`${label(id)}: ${model.collapsed.includes(id) ? "collapsed" : "expanded"}`);
  }
  if (k === "move" && arg) {
    removeEverywhere(id);
    model[arg].end.push(id);
    setStatus(`${label(id)} → ${HOSTNAME[arg]}, after all`);
  }
  if (k === "float") {
    removeEverywhere(id);
    model.float.push({ id, x: 40, y: 40 });
    setStatus(`${label(id)} floats`);
  }
  if (k === "dock") {
    removeEverywhere(id);
    model.top.start.push(id);
    setStatus(`${label(id)} docked in the top bar`);
  }
  if (k === "bar" && arg) {
    const p = placeOf(id)!;
    for (const z of ZONES) {
      model[arg][z].push(...model[p.h][z]);
      model[p.h][z] = [];
    }
    setStatus(`${HOSTNAME[p.h]}'s groups → ${HOSTNAME[arg]}`);
  }
  if (k === "reset") {
    const def = CASES[0]!.m;
    removeEverywhere(id);
    let done = false;
    for (const h of HOSTS) for (const z of ZONES) if (!done && def[h][z].includes(id)) {
      model[h][z].splice(def[h][z].indexOf(id), 0, id);
      done = true;
    }
    setStatus(`${label(id)} back to its default place`);
  }
  autoCollapsed = new Set();
  active = -1;
  syncCases(active);
  render();
}
document.addEventListener("pointerdown", (e) => { if (menuEl && !menuEl.contains(e.target as Node)) closeMenu(); });
win.addEventListener("contextmenu", (e) => {
  const h = (e.target as HTMLElement).closest<HTMLElement>("[data-handle]");
  if (!h) return;
  e.preventDefault();
  openMenu(h.dataset.handle!, h, e);
});
win.addEventListener("click", (e) => {
  const o = (e.target as HTMLElement).closest<HTMLElement>("[data-ovf]");
  if (o) setStatus(`» shows ${label(o.dataset.ovf!)}'s hidden controls in a popover`);
});
win.addEventListener("keydown", (e) => {
  const h = (e.target as HTMLElement).closest<HTMLElement>("[data-handle]");
  if (!h) return;
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

// ---- Dragging a group by its handle --------------------------------------------------------------------------------
interface R { x: number; y: number; w: number; h: number; area?: boolean }
interface Target { h: Host; z: Zone; i: number; rect: R; bar: DOMRect; zone: DOMRect; label: string; float?: false }
interface FloatTarget { float: true; doc: DOMRect; label: string }
type AnyTarget = Target | FloatTarget;
interface Drag {
  id: string;
  start: { x: number; y: number };
  last: { x: number; y: number };
  lifted: boolean;
  samples: { x: number; y: number; t: number }[];
  shown: AnyTarget | null;
  pending?: AnyTarget | null;
  pendingSince?: number;
  anchor?: { x: number; y: number };
  stillSince?: number;
  grab?: { x: number; y: number };
  size?: { w: number; h: number };
  targets?: AnyTarget[];
  ghost?: HTMLElement;
  slot?: HTMLElement | null;
  /** Where the group came from (host, zone, index): home, never a target. Null for a floating group. */
  home?: { h: Host; z: Zone; i: number } | null;
  /** The lifted group's top-left: held 1:1 under the pointer, or settling into a slot (Snap to slot) and back. */
  pos?: Settle<Point>;
  glide?: (() => void) | null;
  /** Snap to slot: the slot the group is gliding into, and whether it is gliding back to the pointer. */
  snapTo?: HTMLElement | null;
  returning?: boolean;
}

/** Draw the lifted group at its settled top-left. */
function drawGhost(d: Drag): void {
  const v = d.pos!.value;
  d.ghost!.style.left = v.x + "px";
  d.ghost!.style.top = v.y + "px";
}
/** The lifted group follows the pointer: 1:1, or by settle while it comes back from a slot. */
function followPointer(d: Drag, p: { x: number; y: number }): void {
  if (d.snapTo) return;
  const at = { x: p.x - d.grab!.x, y: p.y - d.grab!.y };
  if (d.returning) {
    const v = d.pos!.value;
    if (Math.abs(v.x - at.x) >= 1 || Math.abs(v.y - at.y) >= 1) {
      glideGhost(d, at);
      return;
    }
    d.returning = false;
  }
  d.glide?.();
  d.glide = null;
  d.pos!.hold(at);
  drawGhost(d);
}
function glideGhost(d: Drag, to: Point): void {
  d.glide?.();
  d.pos!.setTarget(to);
  d.glide = drive(d.pos!, () => drawGhost(d), () => (d.glide = null));
}

const indlabel = $("indlabel");
function groupTargets(dragged: string): AnyTarget[] {
  const out: AnyTarget[] = [];
  // The dragged group's footprint in a row; in a column its sides swap.
  const home = win.querySelector(`[data-g="${dragged}"]`)!.getBoundingClientRect();
  const homeV = !!win.querySelector(`.bar.v [data-g="${dragged}"]`);
  const rowSize = homeV ? { w: home.height, h: home.width } : { w: home.width, h: home.height };
  win.querySelectorAll<HTMLElement>(".bar .zone").forEach((zEl) => {
    const h = zEl.dataset.host as Host, z = zEl.dataset.zone as Zone, v = h === "left" || h === "right";
    const items = [...zEl.querySelectorAll<HTMLElement>(":scope > .group")].filter((e) => e.dataset.g !== dragged);
    const zr = zEl.getBoundingClientRect(), br = zEl.closest(".bar")!.getBoundingClientRect();
    const ids = items.map((e) => e.dataset.g!);
    for (let i = 0; i <= items.length; i++) {
      let p: R;
      // An empty zone: show the group's own outline where it will land (flush to the zone's edge, or centred),
      // not a line somewhere in the zone's middle.
      if (!items.length) {
        const fw = v ? br.width - 10 : Math.min(rowSize.w, br.width - 16), fh = v ? Math.min(rowSize.w, br.height - 16) : br.height - 10;
        if (v) p = { x: br.left + 5, y: z === "start" ? br.top + 8 : z === "end" ? br.bottom - 8 - fh : br.top + br.height / 2 - fh / 2, w: fw, h: fh, area: true };
        else p = { x: z === "start" ? br.left + 8 : z === "end" ? br.right - 8 - fw : br.left + br.width / 2 - fw / 2, y: br.top + 5, w: fw, h: fh, area: true };
      } else {
        const r = (i < items.length ? items[i]! : items[items.length - 1]!).getBoundingClientRect();
        p = v ? { x: br.left + 6, y: (i < items.length ? r.top - 6 : r.bottom + 6) - 1.5, w: br.width - 12, h: 3 } : { x: (i < items.length ? r.left - 6 : r.right + 6) - 1.5, y: br.top + 6, w: 3, h: br.height - 12 };
      }
      const where = !items.length ? "" : i === 0 ? "before all" : i === items.length ? "after all" : `between ${label(ids[i - 1]!)} and ${label(ids[i]!)}`;
      out.push({ h, z, i, rect: p, bar: br, zone: zr, label: `${HOSTNAME[h]} · ${ZONENAME(h, z)}${where ? " · " + where : ""}` });
    }
  });
  const d = win.querySelector(".docarea")!.getBoundingClientRect();
  out.push({ float: true, doc: d, label: "Float here" });
  return out;
}

let drag: Drag | null = null;
let lastPress: { id: string; t: number } | null = null;
win.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  const h = (e.target as HTMLElement).closest<HTMLElement>("[data-handle]");
  if (!h) return;
  // A second press on the same handle within 350 ms is a double-click: collapse or expand.
  const now = performance.now();
  if (lastPress && lastPress.id === h.dataset.handle && now - lastPress.t < 350) {
    lastPress = null;
    e.preventDefault();
    if (frozenNow(e)) setStatus("Frozen: hold Alt to collapse");
    else doAct(h.dataset.handle!, "toggle");
    return;
  }
  lastPress = { id: h.dataset.handle!, t: now };
  if (frozenNow(e)) {
    setStatus("Frozen: hold Alt to move");
    return;
  }
  e.preventDefault();
  drag = { id: h.dataset.handle!, start: { x: e.clientX, y: e.clientY }, lifted: false, samples: [], shown: null, last: { x: e.clientX, y: e.clientY } };
  win.setPointerCapture(e.pointerId);
});
win.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const p = { x: e.clientX, y: e.clientY }, t = performance.now();
  drag.last = p;
  if (!drag.lifted) {
    if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) < 5) return;
    drag.lifted = true;
    closeMenu();
    win.classList.add("dragging");
    render(false);
    // Held drag: the real group is lifted and follows the pointer; no copy. Its old place keeps its size,
    // empty, so nothing else moves until the drop.
    const home = win.querySelector<HTMLElement>(`[data-g="${drag.id}"]`)!;
    const r = home.getBoundingClientRect();
    drag.grab = { x: drag.start.x - r.left, y: drag.start.y - r.top };
    const homeV = !!home.closest(".bar.v");
    drag.size = homeV ? { w: r.height, h: r.width } : { w: r.width, h: r.height };
    // Where the group came from: dropping there changes nothing, so it is never offered as a target.
    const hp = placeOf(drag.id);
    drag.home = hp ? { h: hp.h, z: hp.z, i: model[hp.h][hp.z].indexOf(drag.id) } : null;
    // Targets are measured once, on the layout as it was at the lift (stable: slots opening never move them).
    drag.targets = groupTargets(drag.id);
    const hold = document.createElement("div");
    hold.style.cssText = `width:${r.width}px;height:${r.height}px;flex:none`;
    const frame = home.closest<HTMLElement>(".floating");
    home.replaceWith(hold);
    if (frame) frame.style.visibility = "hidden";
    drag.ghost = home;
    home.classList.add("lifted");
    home.style.transform = "";
    home.querySelector(".g")!.classList.add("drag");
    document.body.appendChild(home);
    const tick = (): void => {
      if (!drag || !drag.lifted) return;
      evaluate(drag.last, performance.now());
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  if (!drag.pos) drag.pos = createSettle<Point>({ x: p.x - drag.grab!.x, y: p.y - drag.grab!.y });
  followPointer(drag, p);
  evaluate(p, t);
});

/** The drag model, simplified: an indicator only once aiming (slower than 0.45 px/ms, or still for 90 ms). */
function evaluate(p: { x: number; y: number }, t: number): void {
  const d = drag!;
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
  // One picture for every slot: the group's own outline where it will sit; between groups the neighbours move
  // aside to make that space. It appears once aiming has held on one target for 160 ms; flying hides it at once.
  if (!aiming) {
    if (best !== d.shown) setShown(null, p);
    d.pending = undefined;
  } else if (best !== d.shown) {
    if (best !== d.pending) {
      d.pending = best;
      d.pendingSince = t;
    } else if (t - d.pendingSince! >= 160) setShown(best, p);
  }
  if (d.shown && d.shown.float) placeFloatSlot(p);
}
const slotSize = (h: Host): { w: number; h: number } => (h === "left" || h === "right" ? { w: drag!.size!.h, h: drag!.size!.w } : drag!.size!);
function setShown(tg: AnyTarget | null, p: { x: number; y: number }): void {
  const d = drag!;
  d.shown = tg;
  flip(win.querySelectorAll<HTMLElement>(".group"), () => {
    if (d.slot) {
      d.slot.remove();
      d.slot = null;
    }
    if (!tg) return;
    const s = document.createElement("div");
    s.className = "slot";
    // Floating: the outline of the floating toolbar, frame included (the group plus 6/4 px padding and a 1 px border).
    if (tg.float) {
      s.classList.add("float");
      s.style.width = d.size!.w + 14 + "px";
      s.style.height = d.size!.h + 10 + "px";
      document.body.appendChild(s);
    } else {
      const sz = slotSize(tg.h);
      s.style.width = sz.w + "px";
      s.style.height = sz.h + "px";
      const zone = win.querySelector(`.zone[data-host="${tg.h}"][data-zone="${tg.z}"]`)!;
      const groups = [...zone.children].filter((c) => c.classList.contains("group"));
      if (tg.i < groups.length) zone.insertBefore(s, groups[tg.i]!);
      else zone.appendChild(s);
    }
    d.slot = s;
  });
  if (tg && tg.float) placeFloatSlot(p);
  // Snap to slot: the slot still makes room, but draws nothing; the group itself glides into it. Leaving it glides
  // the group back to the pointer. Float here has no slot, so it keeps its outline.
  const snap = dropMode() === "snap" && !!tg && !tg.float;
  if (d.slot) d.slot.classList.toggle("snap", snap);
  if (snap && d.slot && d.pos) {
    const r = d.slot.getBoundingClientRect();
    d.snapTo = d.slot;
    d.returning = false;
    glideGhost(d, { x: r.left, y: r.top });
  } else if (d.snapTo) {
    d.snapTo = null;
    d.returning = true;
    followPointer(d, p);
  }
  labelSlot();
}
function placeFloatSlot(p: { x: number; y: number }): void {
  const d = drag!;
  if (!d.slot) return;
  d.slot.style.left = p.x - d.grab!.x + "px";
  d.slot.style.top = p.y - d.grab!.y + "px";
  labelSlot();
}
function labelSlot(): void {
  const d = drag;
  if (!d || !d.slot || !d.shown || d.snapTo) {
    indlabel.classList.remove("on");
    return;
  }
  const r = d.slot.getBoundingClientRect();
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
  const released = d.ghost ? d.ghost.getBoundingClientRect() : null;
  if (d.ghost) d.ghost.remove();
  if (d.slot) d.slot.remove();
  indlabel.classList.remove("on");
  win.classList.remove("dragging");
  if (!d.lifted) return;
  landFrom = released && { id: d.id, rect: released };
  const tg = cancel ? null : d.shown;
  if (tg && tg.float) {
    const wr = win.querySelector(".mid")!.getBoundingClientRect();
    removeEverywhere(d.id);
    model.float.push({ id: d.id, x: Math.max(4, d.last.x - d.grab!.x - wr.left), y: Math.max(4, d.last.y - d.grab!.y - wr.top) });
    setStatus(`${label(d.id)} floats: the same group, plus a frame and shadow`);
  } else if (tg) {
    removeEverywhere(d.id);
    model[tg.h][tg.z].splice(tg.i, 0, d.id);
    setStatus(`${label(d.id)} → ${tg.label}`);
  } else setStatus(cancel ? "Cancelled: back where it was" : "Released with no target: back where it was");
  autoCollapsed = new Set();
  active = -1;
  syncCases(active);
  render();
}
win.addEventListener("pointerup", () => endDrag(false));
win.addEventListener("pointercancel", () => endDrag(true));
// Never leave a drag half-done: a release anywhere, a lost capture or a move with no button down ends it.
window.addEventListener("pointerup", () => endDrag(false));
win.addEventListener("lostpointercapture", () => { if (drag && drag.lifted) endDrag(false); });
window.addEventListener("pointermove", (e) => { if (drag && drag.lifted && e.buttons === 0) endDrag(false); });
window.addEventListener("blur", () => endDrag(true));
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    endDrag(true);
    closeMenu();
  }
});

render(false);
syncCases(0);
syncFreeze();
setStatus(CASES[0]!.note);
(window as unknown as Record<string, unknown>).__toolbarSketch = {
  cases: CASES.length,
  apply: (i: number) => (casesEl.children[i] as HTMLElement).click(),
  model: () => clone(model),
  drag: () => (drag ? { shown: drag.shown ? drag.shown.label : null, snapped: !!drag.snapTo, ghost: drag.pos ? { ...drag.pos.value } : null } : null),
};
const figure = $("figure");
watchActions(figure);
bindDropMode(figure);
