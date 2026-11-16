/**
 * The document window's presets: each sets the window up for one real docking case, says what should happen, and
 * checks it on the live scene ("Now"). They are the Scene's acceptance cases: every check reads what `solve` and
 * `targets` give and what the page draws from them. A preset whose rule the Scene doesn't have yet names it in `lacks`
 * and is expected to be red until the rule lands: the page never fakes it.
 */
import { centre, contains, overlap, type Point, type Rect } from "@n-uf/placement";
import { ZONES, floatOrientOf, lift, moveTo, parseTargetId, railModeOf, reservedRect, resize, targetId, type Place, type Scene, type SceneTarget } from "@n-uf/placement/scene";
import { wrapCross } from "@n-uf/placement/stack";
import { COL_MIN, DEFAULT_SIZE, MOVABLE, ages, defaultScene, edgeOf, floating, isGroup, isSideEdge, put, type EdgeId, type ItemId } from "./model";
import type { DragFeel, KindFeel } from "./feel";
import { KIT_PRESETS } from "./kit-presets";
import { FADE_DT_CAP, FADE_MS, type DocwinScene } from "./scene";
import { readDocwin, storeDocwin } from "./store";

export interface Verdict {
  readonly pass: boolean;
  readonly now: string;
}

export interface Preset {
  readonly id: string;
  readonly title: string;
  readonly expected: string;
  /** The Scene rule this case needs and doesn't have yet (so it shows red), or none. */
  readonly lacks?: string;
  /** Not built yet: while it fails it shows violet "not built", and `checkAll()` reports `pending`, not `pass: false`. */
  readonly pending?: boolean;
  /** Set the window up (the scene, size, freeze). */
  setup(c: DocwinScene): void;
  /** Check it on the live scene; the page sets the preset up again afterwards. */
  check(c: DocwinScene): Verdict;
}

// --- helpers ---------------------------------------------------------------------------------------------------------

/** `p` in `r`, its edges included, exactly. */
const inside = (r: Rect, p: Point): boolean => contains(r, p, 0);
/** The edge a gap, strip or refusal id names (read with the Scene's `parseTargetId`), or undefined. */
const idEdge = (id: string): string | undefined => {
  const p = parseTargetId(id);
  return p && "edge" in p ? p.edge : undefined;
};
/** Whether `id` is a gap or strip of edge `edge`. */
const isSlotOf = (id: string, edge: string): boolean => {
  const p = parseTargetId(id);
  return (p?.kind === "gap" || p?.kind === "strip") && p.edge === edge;
};
const sameRect = (a: Rect | null | undefined, b: Rect | null | undefined, eps = 0.5): boolean =>
  !!a && !!b && Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps && Math.abs(a.width - b.width) <= eps && Math.abs(a.height - b.height) <= eps;
const r0 = (n: number): number => Math.round(n);
const say = (r: Rect): string => `${r0(r.x)},${r0(r.y)} ${r0(r.width)}×${r0(r.height)}`;

/** The default window, changed by `edit`, at `size`. */
const sceneWith = (edit: (s: Scene) => Scene, size = DEFAULT_SIZE): Scene => edit(defaultScene(size));

/** The window px of the element's centre. */
function pointOf(c: DocwinScene, el: Element | null): Point | null {
  if (!el) return null;
  const w = c.win.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left - w.left + r.width / 2, y: r.top - w.top + r.height / 2 };
}
const gripOf = (c: DocwinScene, id: ItemId): Point | null => pointOf(c, c.win.querySelector(`.dw-items [data-id="${id}"] [data-grip], .dw-items [data-id="${id}"][data-grip]`));

/**
 * A drag driven by hand on the page's own session (the same intent, targets and commit a mouse uses): press the grip,
 * glide to `to` at an aiming pace, hold still, then release (or not, with `keep`).
 */
function dragTo(c: DocwinScene, id: ItemId, path: Point[], keep = false): { lifted: boolean; t: number } {
  const g = gripOf(c, id);
  if (!g) return { lifted: false, t: 0 };
  c.drive(true);
  let t = 10_000;
  let at = { ...g };
  if (!c.begin(id, g, { x: g.x + 6, y: g.y }, t)) {
    c.drive(false);
    return { lifted: false, t };
  }
  for (const to of path) {
    const n = Math.max(1, Math.ceil(Math.hypot(to.x - at.x, to.y - at.y) / 4));
    for (let i = 1; i <= n; i++) {
      c.move({ x: at.x + ((to.x - at.x) * i) / n, y: at.y + ((to.y - at.y) * i) / n });
      c.frame((t += 16));
    }
    at = { ...to };
    for (let k = 0; k < 30; k++) c.frame((t += 16));
  }
  if (!keep) {
    c.release((t += 16));
    c.drive(false);
  }
  return { lifted: true, t };
}
/**
 * A drag like a mouse, through the page's own pointer listeners: pointerdown on the item's grip, pointermoves about 4 px
 * apart on the window to `to` (window px), a short hold, pointerup. Frames are driven by hand.
 */
function mouseDrag(c: DocwinScene, id: ItemId, to: Point): { lifted: boolean } {
  const el = c.win.querySelector<HTMLElement>(`.dw-items [data-id="${id}"] [data-grip], .dw-items [data-id="${id}"][data-grip]`);
  if (!el) return { lifted: false };
  const w = c.win.getBoundingClientRect();
  const g = el.getBoundingClientRect();
  const from = { x: g.left + g.width / 2, y: g.top + g.height / 2 };
  const end = { x: w.left + to.x, y: w.top + to.y };
  const ev = (type: string, at: Point): PointerEvent => new PointerEvent(type, { clientX: at.x, clientY: at.y, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true });
  c.drive(true);
  let now = performance.now();
  el.dispatchEvent(ev("pointerdown", from));
  const steps = Math.max(8, Math.ceil(Math.hypot(end.x - from.x, end.y - from.y) / 4));
  let lifted = false;
  for (let i = 1; i <= steps; i++) {
    window.dispatchEvent(ev("pointermove", { x: from.x + ((end.x - from.x) * i) / steps, y: from.y + ((end.y - from.y) * i) / steps }));
    lifted ||= c.dragging;
    if (c.dragging) c.frame((now += 16));
  }
  for (let k = 0; k < 25; k++) if (c.dragging) c.frame((now += 16));
  window.dispatchEvent(ev("pointerup", end));
  c.drive(false);
  return { lifted };
}

/**
 * A mouse press on the item's grip held over window point `to` (pointermoves about 4 px apart, then a hold), still
 * down: `move(p)` glides on to another point and holds, `up()` lets go there.
 */
function mouseHold(c: DocwinScene, id: ItemId, to: Point): { lifted: boolean; move: (p: Point) => void; up: () => void } {
  const el = c.win.querySelector<HTMLElement>(`.dw-items [data-id="${id}"] [data-grip], .dw-items [data-id="${id}"][data-grip]`);
  const none = { lifted: false, move: () => undefined, up: () => undefined };
  if (!el) return none;
  const w = c.win.getBoundingClientRect();
  const g = el.getBoundingClientRect();
  let at = { x: g.left + g.width / 2, y: g.top + g.height / 2 };
  const ev = (type: string, p: Point): PointerEvent => new PointerEvent(type, { clientX: p.x, clientY: p.y, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true });
  c.drive(true);
  let now = performance.now();
  el.dispatchEvent(ev("pointerdown", at));
  let lifted = false;
  const glide = (p: Point): void => {
    const end = { x: w.left + p.x, y: w.top + p.y };
    const steps = Math.max(8, Math.ceil(Math.hypot(end.x - at.x, end.y - at.y) / 4));
    for (let i = 1; i <= steps; i++) {
      window.dispatchEvent(ev("pointermove", { x: at.x + ((end.x - at.x) * i) / steps, y: at.y + ((end.y - at.y) * i) / steps }));
      lifted ||= c.dragging;
      if (c.dragging) c.frame((now += 16));
    }
    for (let k = 0; k < 25; k++) if (c.dragging) c.frame((now += 16));
    at = end;
  };
  glide(to);
  return {
    lifted,
    move: glide,
    up: () => {
      window.dispatchEvent(ev("pointerup", at));
      c.drive(false);
    },
  };
}

const endDrag = (c: DocwinScene): void => {
  c.release(performance.now(), true);
  c.drive(false);
};

/** A floating panel's resize handle as drawn, or null (none drawn). */
const handleOf = (c: DocwinScene, id: ItemId, h: string): HTMLElement | null => c.win.querySelector<HTMLElement>(`.dw-items [data-id="${id}"] [data-fh="${h}"]`);

/**
 * A mouse drag on a float's resize handle, through the page's own listeners: pointerdown on the handle's centre,
 * pointermoves on the window about 4 px apart by (dx, dy), pointerup. `during` runs once halfway, the button still down.
 */
function mouseResize(c: DocwinScene, id: ItemId, h: string, dx: number, dy: number, during?: () => void): boolean {
  const el = handleOf(c, id, h);
  if (!el) return false;
  const g = el.getBoundingClientRect();
  const from = { x: g.left + g.width / 2, y: g.top + g.height / 2 };
  const ev = (type: string, p: Point): PointerEvent => new PointerEvent(type, { clientX: p.x, clientY: p.y, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true });
  el.dispatchEvent(ev("pointerdown", from));
  const steps = Math.max(4, Math.ceil(Math.hypot(dx, dy) / 4));
  for (let i = 1; i <= steps; i++) {
    window.dispatchEvent(ev("pointermove", { x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps }));
    if (i === Math.ceil(steps / 2)) during?.();
  }
  window.dispatchEvent(ev("pointerup", { x: from.x + dx, y: from.y + dy }));
  return true;
}

/**
 * A mouse double-click on the item's grip, through the page's own listeners: two pointerdown/pointerup pairs at the
 * grip's centre (the grip found again for the second, as the first click may redraw it). Whether a drag ever started.
 */
function mouseDouble(c: DocwinScene, id: ItemId): { pressed: boolean; dragged: boolean } {
  let dragged = false;
  for (let k = 0; k < 2; k++) {
    const el = c.win.querySelector<HTMLElement>(`.dw-items [data-id="${id}"] [data-grip], .dw-items [data-id="${id}"][data-grip]`);
    if (!el) return { pressed: false, dragged };
    const g = el.getBoundingClientRect();
    const at = { x: g.left + Math.min(6, g.width / 2), y: g.top + g.height / 2 };
    const ev = (type: string): PointerEvent => new PointerEvent(type, { clientX: at.x, clientY: at.y, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true });
    el.dispatchEvent(ev("pointerdown"));
    window.dispatchEvent(ev("pointermove"));
    dragged ||= c.dragging;
    window.dispatchEvent(ev("pointerup"));
    dragged ||= c.dragging;
  }
  return { pressed: true, dragged };
}
/** Every item's rect outside edge `edge`, as one string. */
const outsideOf = (c: DocwinScene, edge: string): string =>
  Object.entries(c.layout.items)
    .filter(([, p]) => p.edge !== edge)
    .map(([x, p]) => `${x}:${say(p.rect)}`)
    .sort()
    .join(" ");
const allOf = (c: DocwinScene): string => outsideOf(c, "\u0000");

/** A double-click on the grip of `id` (in `edge`) folds it, another unfolds it; nothing drags, nothing outside its edge moves. */
function doubleFold(c: DocwinScene, id: ItemId, edge: EdgeId, folded: (p: { form: number; formKind: string }) => boolean): string[] {
  const bad: string[] = [];
  const start = allOf(c);
  const outside = outsideOf(c, edge);
  const drop = c.lastDrop;
  const a = mouseDouble(c, id);
  const p1 = c.layout.items[id]!;
  if (!a.pressed || a.dragged || !folded(p1) || c.scene.items[id]!.from !== 1) bad.push(`first double-click: ${a.dragged ? "a drag started, " : ""}${p1.formKind} (form ${p1.form})`);
  if (outsideOf(c, edge) !== outside) bad.push("something outside its edge moved");
  const b = mouseDouble(c, id);
  const p2 = c.layout.items[id]!;
  if (!b.pressed || b.dragged || folded(p2) || c.scene.items[id]!.from !== undefined) bad.push(`second double-click: ${b.dragged ? "a drag started, " : ""}${p2.formKind} (form ${p2.form})`);
  if (allOf(c) !== start) bad.push("the window isn't back as it was");
  if (c.lastDrop !== drop) bad.push("a drop happened");
  return bad;
}

/** Findings floating over the pages: the float the resize presets work on. */
const RESIZE_AT: Rect = { x: 440, y: 160, width: 280, height: 320 };
const resizeScene = (): Scene => sceneWith((s) => floating(s, "findings", RESIZE_AT));
/** The least a floating panel resizes to: its `floatMin`, else its open form's minimums (across, along). */
function panelMin(c: DocwinScene, id: ItemId): { width: number; height: number } {
  const it = c.scene.items[id]!;
  const open = it.forms.column?.[0];
  return it.floatMin ?? { width: open?.cross.min ?? 0, height: open?.main.min ?? 0 };
}
/** Every item's rect but `id`'s, as one string (nothing else moved). */
const othersOf = (c: DocwinScene, id: ItemId): string =>
  Object.entries(c.layout.items)
    .filter(([x]) => x !== id)
    .map(([x, p]) => `${x}:${say(p.rect)}`)
    .sort()
    .join(" ");

/** The targets that dock the item into an edge (gaps and strips). */
const gaps = (c: DocwinScene, id: ItemId): (SceneTarget & { place: { kind: "gap"; edge: string; zone: string; at: number } })[] =>
  c.targets(id).filter((t): t is SceneTarget & { place: { kind: "gap"; edge: string; zone: string; at: number } } => t.place.kind === "gap");
const rectOf = (c: DocwinScene, id: ItemId): Rect | null => c.layout.items[id]?.rect ?? null;
/** A marker (a zero-thick line) lies inside `r`, not only on its border; an area overlap is always 0 for a line. */
const crosses = (m: Rect, r: Rect): boolean => {
  const along = (a: number, al: number, b: number, bl: number): boolean => (al === 0 ? a > b && a < b + bl : a < b + bl && a + al > b);
  return along(m.x, m.width, r.x, r.width) && along(m.y, m.height, r.y, r.height);
};
/** What a wrapped word group reports in its layout: the word indexes per row and its grip's rect (both optional). */
type Wrapped = { readonly rows?: readonly (readonly number[])[]; readonly grip?: Rect };
const wrapOf = (p: object | undefined): Wrapped => (p ?? {}) as Wrapped;
const WORDS = 3; // Views: Pages · Notes 2 · Findings 20
/** A point in `t`'s hit that no other docking target's hit covers, or null when another's hit covers all of it. */
function aim(c: DocwinScene, id: ItemId, t: SceneTarget): Point | null {
  const others = c.targets(id).filter((o) => o.id !== t.id && !o.free && o.place.kind !== "home");
  for (let fy = 0.5; fy < 1; fy += 0.1)
    for (const y of [fy, 1 - fy])
      for (const x of [0.5, 0.25, 0.75]) {
        const p = { x: t.hit.x + t.hit.width * x, y: t.hit.y + t.hit.height * y };
        if (!others.some((o) => inside(o.hit, p))) return p;
      }
  return null;
}

const firstFold = (c: DocwinScene, e: EdgeId): string => {
  const n = c.layout.notes.find((x) => "edge" in x && x.edge === e && x.code === "form-down");
  return n && "id" in n ? n.id : "none";
};

/** The aim-order sweep: three toolbars ordered on one edge of each kind. */
const SWEEP_GROUPS: readonly ItemId[] = ["tools", "views", "zoom"];
const SWEEP_EDGES: readonly (readonly [string, EdgeId])[] = [
  ["rail", "rail-left"],
  ["top bar", "top"],
  ["bottom bar", "bottom"],
  ["title bar", "title"],
  ["tray", "left"],
];
const permutations = <T,>(xs: readonly T[]): T[][] => (xs.length <= 1 ? [[...xs]] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
/**
 * The default window with `order` on `edge` (Review left alone in the bottom bar, or in the top bar when the bottom bar
 * is swept); in the tray, at the column's foot.
 */
function sweepScene(edge: EdgeId, order: readonly ItemId[]): Scene {
  return sceneWith((s) => {
    const out = put(put(s, edge === "bottom" ? "top" : "bottom", ["review"]), edge, edge === "left" ? ["pages", "notes", ...order] : [...order]);
    if (edge !== "left") return out;
    const items = { ...out.items };
    for (const id of order) items[id] = { ...items[id]!, align: "end" };
    return { ...out, items };
  });
}

// --- the presets -------------------------------------------------------------------------------------------------------

export const PRESETS: readonly Preset[] = [
  {
    id: "back-above",
    title: "Put Pages back above Notes",
    expected: "Drag Pages by its header to the top of the left column: the dashed slot is the top gap, and after the drop Pages sits exactly on the slot, above Notes.",
    setup: (c) => c.setScene(sceneWith((s) => put(s, "left", ["notes", "pages"]))),
    check(c) {
      const t = gaps(c, "pages").find((g) => g.place.edge === "left" && g.place.at === 0);
      if (!t) return { pass: false, now: "No top gap in the left column." };
      dragTo(c, "pages", [{ x: t.hit.x + t.hit.width / 2, y: t.hit.y + 12 }]);
      const d = c.lastDrop;
      const order = c.edge("left").items.join(", ");
      const ok = d?.target === t.id && d.committed && sameRect(d.preview, d.landed) && c.edge("left").items[0] === "pages";
      return { pass: ok, now: d ? `Dropped on ${d.target ?? "nothing"}; slot ${d.preview ? say(d.preview) : "none"}, landed ${d.landed ? say(d.landed) : "none"}; left column: ${order}.` : "The drag never lifted." };
    },
  },
  {
    id: "tools-own-size",
    title: "Tools into a column keeps its size",
    expected: "Tools dropped into the left column's tray (its foot) keeps its own size (its five tools in one row beside the grip, 153 px wide), at the column's start; it never stretches to the column's full width.",
    setup: (c) => c.setScene(defaultScene()),
    check(c) {
      const t = gaps(c, "tools").find((g) => g.place.edge === "left" && g.place.zone === "end" && g.place.at === 0);
      if (!t || !t.slot) return { pass: false, now: "No tray gap for Tools in the left column." };
      const p = t.after({ x: 0, y: 0 }).layout.items.tools!;
      const f = c.scene.items.tools!.forms.column![p.form]!;
      // Its own width: a wrap form's rows (one row here), else the form's own across size.
      const own = f.wrap ? wrapCross(f.wrap).natural : f.cross.natural;
      const col = t.after({ x: 0, y: 0 }).layout.edges.left!.rect;
      return { pass: Math.abs(t.slot.width - own) <= 0.5 && Math.abs(t.slot.x - col.x) <= 0.5, now: `Slot ${say(t.slot)} (${p.formKind}); Tools' own width there is ${own} px; the column starts at x ${r0(col.x)}.` };
    },
  },
  {
    id: "panel-no-bar-slot",
    title: "A panel gets no slot in the top bar",
    expected: "Dragging Notes offers no gap in the title, top or bottom bar: those edges take groups only. A drop there would put a panel into a toolbar.",
    setup: (c) => c.setScene(sceneWith((s) => put(s, "top", ["zoom"]))),
    check(c) {
      const bad = gaps(c, "notes").filter((g) => !c.edge(g.place.edge as EdgeId).accepts.includes("panel"));
      const by = (["title", "top", "bottom"] as const).map((e) => `${e} ${bad.filter((g) => g.place.edge === e).length}`).join(", ");
      const offered = gaps(c, "notes").length;
      return { pass: bad.length === 0 && offered > 0, now: bad.length ? `${bad.length} slots for a panel in group-only bars (${by}).` : `No slot for Notes in any bar; ${offered} in the columns.` };
    },
  },
  {
    id: "no-slot-over-chrome",
    title: "No slot over the title or controls",
    expected:
      "Dragging Views to the title bar offers slots only between the title and the window controls: none before the title or after the controls. No gap's hit, slot or marker lies over the controls. The title grows, so a hit may lie over its text (the pointer there picks the gap just after it), but no slot or marker lies over its reserved room, its natural text placed by its zone.",
    setup: (c) => c.setScene(defaultScene()),
    check(c) {
      const ts = gaps(c, "views").filter((g) => g.place.edge === "title");
      const ctl = rectOf(c, "controls")!;
      const title = reservedRect(c.scene, c.layout, "title");
      const why = (g: (typeof ts)[number]): string | null => {
        const after = g.after({ x: 0, y: 0 });
        const ids = edgeOf(after.scene, "title").items;
        const at = ids.indexOf("views");
        if (at <= ids.indexOf("title")) return "before the title";
        if (at > ids.indexOf("controls")) return "after the controls";
        if (overlap(g.hit, ctl) > 0) return `its hit ${say(g.hit)} covers the controls ${say(ctl)}`;
        const ctlA = after.layout.items.controls?.rect;
        const titleA = after.layout.items.title ? reservedRect(after.scene, after.layout, "title") : null;
        if (g.slot && ctlA && overlap(g.slot, ctlA) > 0) return `its slot ${say(g.slot)} covers the controls ${say(ctlA)}`;
        if (g.slot && titleA && overlap(g.slot, titleA) > 0) return `its slot ${say(g.slot)} covers the title's reserved ${say(titleA)}`;
        if (g.marker && ctlA && crosses(g.marker, ctlA)) return `its marker ${say(g.marker)} crosses the controls ${say(ctlA)}`;
        if (g.marker && titleA && crosses(g.marker, titleA)) return `its marker ${say(g.marker)} crosses the title's reserved ${say(titleA)}`;
        return null;
      };
      const bad = ts.map((g) => [g, why(g)] as const).filter(([, w]) => w !== null);
      return {
        pass: bad.length === 0 && ts.length > 0,
        now: bad.length
          ? `${bad.length} of ${ts.length} title-bar gaps break the reserved room: ${bad.map(([g, w]) => `${g.id}, ${w}`).join("; ")}.`
          : `${ts.length} gaps, all between the title and the controls, hits clear of the controls, slots and markers clear of the controls and the title's reserved ${say(title)} (${ts.map((g) => g.id).join(", ")}).`,
      };
    },
  },
  {
    id: "zoom-back-to-title",
    title: "Zoom out of the title bar and back",
    expected:
      "Zoom, moved into the top bar, can go back: the title bar offers it a gap in its spare room, clear of the title's natural text and the window controls, with the slot drawn there and never over the title. The drop puts Zoom back in the title bar; the title keeps its text at natural size or less and the controls stay as they were.",
    lacks: "a growing fixed item reserves only its natural rect; the spare room accepts groups",
    setup: (c) => c.setScene(moveTo(defaultScene(), "zoom", { edge: "top", at: 0 })),
    check(c) {
      const title = rectOf(c, "title");
      const ctl = rectOf(c, "controls");
      const bar = c.layout.edges.title?.rect;
      if (!title || !ctl || !bar) return { pass: false, now: "The title bar has no title, controls or rect." };
      const tf = c.scene.items.title!.forms.row![0]!.main;
      const text: Rect = { ...title, width: Math.min(title.width, tf.natural) };
      const ts = gaps(c, "zoom").filter((g) => g.place.edge === "title" && c.edge("title").accepts.includes("group"));
      const clear = ts.filter((g) => overlap(g.hit, text) === 0 && overlap(g.hit, ctl) === 0);
      const t = clear.find((g) => !!g.slot && overlap(g.slot, text) === 0 && overlap(g.slot, ctl) === 0 && overlap(g.slot, bar) > 0);
      if (!t) {
        const why = ts.length === 0 ? "no gap at all" : `${ts.length} gaps (${ts.map((g) => g.id).join(", ")}), ${clear.length} clear of the title text (${say(text)}) and controls (${say(ctl)}), none with its slot in the spare room`;
        return { pass: false, now: `The title bar offers Zoom ${why}; the title is drawn at ${say(title)}.` };
      }
      dragTo(c, "zoom", [centre(t.hit)]);
      const d = c.lastDrop;
      const inTitle = c.edge("title").items.includes("zoom");
      const t2 = rectOf(c, "title");
      const z2 = rectOf(c, "zoom");
      const c2 = rectOf(c, "controls");
      const titleOk = !!t2 && t2.width >= tf.min - 0.5 && (!z2 || overlap(t2, z2) === 0);
      const ok = !!d && d.target === t.id && d.committed && inTitle && titleOk && sameRect(c2, ctl);
      return {
        pass: ok,
        now: `Slot ${t.slot ? say(t.slot) : "none"}; dropped on ${d?.target ?? "nothing"}; Zoom ${inTitle ? "in" : "not in"} the title bar at ${z2 ? say(z2) : "none"}; title ${t2 ? say(t2) : "none"}; controls ${c2 && sameRect(c2, ctl) ? "untouched" : "moved"}.`,
      };
    },
  },
  {
    id: "float-clear-of-chrome",
    title: "A float stays clear of the title and bars",
    expected: "Pages, floated with the pointer over the title bar, lands below the bars: a float never covers the title, the controls or a bar.",
    setup: (c) => c.setScene(sceneWith((s) => floating(s, "pages", { x: 420, y: 160, width: 260, height: 360 }))),
    check(c) {
      const ft = c.targets("pages").find((t) => t.place.kind === "float");
      if (!ft) return { pass: false, now: "No float target." };
      const r = ft.after({ x: c.scene.stage.width / 2, y: 20 }, { x: 130, y: 16 }).layout.items.pages!.rect;
      const bars = (["title", "top", "bottom"] as const).filter((b) => {
        const e = c.layout.edges[b];
        return e && e.cross > 0 && overlap(r, e.rect) > 0;
      });
      return { pass: bars.length === 0, now: bars.length ? `The float lands at ${say(r)}, over the ${bars.join(" and ")} bar.` : `The float lands at ${say(r)}, clear of the bars.` };
    },
  },
  {
    id: "nothing-lights-up",
    title: "Nothing lights up during a drag",
    expected: "While Notes is held, only its targets react: the resize edge, headers and buttons take no hover, cursor or highlight, and nothing gets selected.",
    setup: (c) => c.setScene(defaultScene()),
    check(c) {
      const r = dragTo(c, "notes", [{ x: 260, y: 300 }], true);
      if (!r.lifted) return { pass: false, now: "The drag never lifted." };
      const edge = c.win.querySelector<HTMLElement>("[data-resize=left]")!;
      const head = c.win.querySelector<HTMLElement>('.dw-items [data-id="findings"] .dw-head');
      const pe = getComputedStyle(edge).pointerEvents;
      const he = head ? getComputedStyle(head).pointerEvents : "none";
      const sel = head ? getComputedStyle(head).userSelect : "none";
      const state = c.root.dataset.dragSession ?? "none";
      endDrag(c);
      const live = pe !== "none" || he !== "none" || sel !== "none";
      return { pass: !live && state === "panel", now: `Drag session: ${state}; the resize edge takes the pointer (${pe}), the Findings header too (${he}), selection ${sel}.` };
    },
  },
  {
    id: "slots-at-rest",
    title: "No slots at rest",
    expected: "With nothing held, no slot, marker or placeholder is drawn anywhere, in an empty bar or column either.",
    setup: (c) => c.setScene(defaultScene()),
    check(c) {
      const drawn = [...c.win.querySelectorAll<HTMLElement>(".dw-slot, .dw-marker")].filter((e) => !e.hidden).length;
      return { pass: drawn === 0 && !c.dragging, now: `${drawn} slots or markers drawn at rest${c.dragging ? ", and a drag is on" : ""}.` };
    },
  },
  {
    id: "group-slot-in-panel",
    title: "A group drag shows no slot inside a panel",
    expected: "Dragging Tools over the middle of the Pages panel offers no slot there: slots open at the gaps above, between and below the panels, never over a panel's content.",
    setup: (c) => c.setScene(defaultScene()),
    check(c) {
      const pages = rectOf(c, "pages");
      if (!pages) return { pass: false, now: "Pages isn't docked." };
      const p = centre(pages);
      const hit = c.targets("tools").filter((t) => (t.place.kind === "gap" || t.place.kind === "column" || t.place.kind === "rail") && inside(t.hit, p));
      return { pass: hit.length === 0, now: hit.length ? `The pointer over the Pages body hits ${hit.map((g) => g.id).join(", ")}; its slot is ${hit[0]!.slot ? say(hit[0]!.slot) : "none"}.` : "No gap under the Pages body." };
    },
  },
  {
    id: "panel-drag-state",
    title: "A panel drag sets the drag session",
    expected: 'While Pages is held, the scene root carries data-drag-session="panel"; it is gone after the release.',
    setup: (c) => c.setScene(defaultScene()),
    check(c) {
      const r = dragTo(c, "pages", [{ x: 400, y: 300 }], true);
      if (!r.lifted) return { pass: false, now: "The drag never lifted." };
      const during = c.root.dataset.dragSession ?? "none";
      endDrag(c);
      const after = c.root.dataset.dragSession ?? "none";
      return { pass: during === "panel" && after === "none", now: `During the drag: ${during}; after: ${after}.` };
    },
  },
  {
    id: "folds-oldest",
    title: "A narrow or short window folds the oldest first",
    expected:
      "In a short window the panel used longest ago (Pages) folds to its header first; in a narrow one the oldest group of the lowest priority (Tools, Review being kept out of the menu longest) folds first in the bottom bar.",
    setup: (c) =>
      c.setScene(
        sceneWith(
          (s) => ages(put(put(s, "left", ["pages", "notes", "findings"]), "bottom", ["views", "tools", "review"]), ["tools", "pages", "notes", "findings", "views", "review"]),
          // Narrow enough that the bottom bar's three toolbars (Views, Tools, Review and the gaps) don't fit in a row.
          { width: 600, height: 464 },
        ),
      ),
    check(c) {
      const l = firstFold(c, "left");
      const b = firstFold(c, "bottom");
      return { pass: l === "pages" && b === "tools", now: `First to fold: ${l} in the left column, ${b} in the bottom bar.` };
    },
  },
  {
    id: "rail-click-opens",
    title: "A rail icon click opens the panel",
    expected: "In a short window Notes is a rail icon; a click on it opens Notes, and Pages gives way to its header instead.",
    setup: (c) => c.setScene(sceneWith((s) => ages(put(s, "left", ["pages", "notes"]), ["notes", "pages"]), { width: 1080, height: 272 })),
    check(c) {
      const before = c.layout.items.notes?.formKind ?? "none";
      const el = c.win.querySelector<HTMLElement>('.dw-items [data-id="notes"] [data-open]');
      if (!el) return { pass: false, now: `Notes is ${before}, with no rail icon to click.` };
      c.open("notes");
      const after = c.layout.items.notes?.formKind ?? "none";
      const pages = c.layout.items.pages?.formKind ?? "none";
      return { pass: before === "rail" && after === "open", now: `Notes was ${before}; after the click Notes is ${after}, Pages is ${pages}.` };
    },
  },
  {
    id: "click-moves-nothing",
    title: "A click or badge change moves nothing",
    expected: "A press on a header, or a count changing (Notes 2 → 3, Findings 20 → 121), moves no item by more than 0.5 px.",
    setup: (c) => c.setScene(defaultScene()),
    check(c) {
      const snap = (): Map<string, DOMRect> => new Map([...c.win.querySelectorAll<HTMLElement>(".dw-items [data-id]")].map((e) => [e.dataset.id!, e.getBoundingClientRect()]));
      const a = snap();
      const n = c.counts.notes;
      const f = c.counts.findings;
      c.press("notes");
      c.press("findings");
      c.setCount("notes", n + 1);
      c.setCount("findings", f + 101);
      const b = snap();
      c.setCount("notes", n);
      c.setCount("findings", f);
      let worst = 0;
      let who = "";
      for (const [id, r] of a) {
        const s = b.get(id);
        const d = s ? Math.max(Math.abs(r.x - s.x), Math.abs(r.y - s.y), Math.abs(r.width - s.width), Math.abs(r.height - s.height)) : Infinity;
        if (d > worst) {
          worst = d;
          who = id;
        }
      }
      return { pass: worst <= 0.5, now: worst <= 0.5 ? `The largest move was ${worst.toFixed(2)} px.` : `${who} moved ${worst === Infinity ? "away" : `${worst.toFixed(1)} px`}.` };
    },
  },
  {
    id: "back-to-place",
    title: "Back to its place",
    expected: 'Lift Notes, move away, come back over its place: the slot is its old rect ("Back to its place"), and a release there changes nothing.',
    setup: (c) => c.setScene(defaultScene()),
    check(c) {
      const home = rectOf(c, "notes");
      const g = gripOf(c, "notes");
      if (!home || !g) return { pass: false, now: "Notes isn't docked." };
      const before = JSON.stringify(c.stored());
      dragTo(c, "notes", [{ x: 420, y: g.y + 80 }, { x: g.x, y: g.y }]);
      const d = c.lastDrop;
      const same = JSON.stringify(c.stored()) === before;
      return { pass: !!d && !d.committed && !d.cancelled && sameRect(d.preview, home) && same, now: d ? `Released on ${d.target ?? "its place"}; slot ${d.preview ? say(d.preview) : "none"} (its place ${say(home)}); layout ${same ? "unchanged" : "changed"}.` : "The drag never lifted." };
    },
  },
  {
    id: "scroll-under-float",
    title: "Scroll under a float",
    expected: "Scroll the pages: Tools, floating at their right edge, stays put while the pages move under it.",
    setup: (c) => c.setScene(defaultScene()),
    check(c) {
      const el = c.win.querySelector<HTMLElement>('.dw-items [data-id="tools"]');
      const sheet = c.win.querySelector<HTMLElement>(".dw-sheet");
      if (!el || !sheet) return { pass: false, now: "Tools isn't floating." };
      const a = el.getBoundingClientRect();
      const s0 = sheet.getBoundingClientRect().top;
      const top = c.scroll.scrollTop;
      c.scroll.scrollTop = top + 400;
      const b = el.getBoundingClientRect();
      const s1 = sheet.getBoundingClientRect().top;
      c.scroll.scrollTop = top;
      const moved = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      return { pass: moved <= 0.5 && Math.abs(s0 - s1) > 100, now: `The pages moved ${Math.round(s0 - s1)} px; Tools moved ${moved.toFixed(1)} px.` };
    },
  },
  {
    id: "freeze-alt",
    title: "Freeze with Alt",
    expected: "Frozen: the grips are hidden and nothing lifts. Holding Alt shows the grips and every drag works; letting Alt go freezes again.",
    setup: (c) => {
      c.setScene(defaultScene());
      c.setFrozen(true);
    },
    check(c) {
      const grip = (): string => getComputedStyle(c.win.querySelector('.dw-items [data-id="notes"] .dw-dots')!).visibility;
      const g0 = grip();
      const lift0 = dragTo(c, "notes", [{ x: 420, y: 300 }], true).lifted;
      if (lift0) endDrag(c);
      c.altOn(true);
      const g1 = grip();
      const lift1 = dragTo(c, "notes", [{ x: 420, y: 300 }], true).lifted;
      if (lift1) endDrag(c);
      c.altOn(false);
      const ok = g0 === "hidden" && !lift0 && g1 === "visible" && lift1;
      return { pass: ok, now: `Frozen: grips ${g0}, a drag ${lift0 ? "lifts" : "doesn't lift"}. With Alt: grips ${g1}, a drag ${lift1 ? "lifts" : "doesn't lift"}.` };
    },
  },
  {
    id: "reload-restores",
    title: "Reload restores the layout",
    expected: "Move things (Findings under Notes, Pages floating, Views in the top bar), then reload: every item comes back in its place and form.",
    setup: (c) => c.setScene(sceneWith((s) => floating(put(put(s, "left", ["notes", "findings"]), "top", ["views"]), "pages", { x: 360, y: 140, width: 260, height: 360 }))),
    check(c) {
      const stored = c.stored();
      const placed = (): string[] =>
        Object.entries(c.layout.items)
          .map(([id, p]) => `${id}@${p.floating ? "float" : (p.edge ?? "-")}:${p.formKind}:${say(p.rect)}`)
          .sort();
      const before = placed();
      const r = readDocwin(JSON.parse(JSON.stringify(stored)));
      c.setScene(r.scene);
      const after = placed();
      const diff = before.filter((x) => !after.includes(x));
      const same = JSON.stringify(storeDocwin(r.scene)) === JSON.stringify(stored);
      return {
        pass: diff.length === 0 && same && r.dropped.length === 0,
        now: diff.length ? `Changed after the reload: ${diff.join("; ")}.` : `All ${after.length} items back in place${same ? "" : "; the stored form differs"}${r.dropped.length ? `; dropped: ${r.dropped.join(", ")}` : ""}.`,
      };
    },
  },
  {
    id: "room-comes-back",
    title: "Room comes back in the right order",
    expected: "Shrink the window (Pages, then Notes fold), then grow it back: they open again in the reverse order, Notes first, then Pages.",
    setup: (c) => c.setScene(sceneWith((s) => ages(put(s, "left", ["pages", "notes", "findings"]), ["pages", "notes", "findings"]), { width: 1080, height: 640 })),
    check(c) {
      // The column's forms as one state ("pages header, notes open, …"); shrinking and growing each pass through a list
      // of states, and growing must pass through the same states as shrinking, in reverse.
      const state = (): string =>
        c
          .edge("left")
          .items.map((id) => `${id} ${c.layout.items[id]?.formKind ?? "-"}`)
          .join(", ");
      const w = c.scene.stage.width;
      const down = [state()];
      for (let h = 620; h >= 340; h -= 20) {
        c.setSize(w, h);
        if (state() !== down[down.length - 1]) down.push(state());
      }
      const up = [state()];
      for (let h = 360; h <= 640; h += 20) {
        c.setSize(w, h);
        if (state() !== up[up.length - 1]) up.push(state());
      }
      const ok = down.length > 1 && up.join(" | ") === [...down].reverse().join(" | ");
      return { pass: ok, now: `Shrinking: ${down.join(" → ")}. Growing: ${up.join(" → ")}.` };
    },
  },
  {
    id: "word-toolbar-shapes",
    title: "A word toolbar keeps its shape",
    expected:
      "Views (Pages · Notes 2 · Findings 20, with a grip), dropped into a column narrower than its one row, stays horizontal as a wrap form: the grip is a cell at the start of row one, the words wrap in their own box beside it (a hanging indent, no grip row of its own, never one word alone on a row that isn't the last: a column too narrow for two words per row shows icons), its rect is rows × the row height tall and no wider than the column. Dropped onto a vertical place (an empty column's strip, a column drawn as a rail), it shows icons only, one per item, stacked (the host draws their grip on top). The slot a target shows is the rect after the real drop.",
    // The left column at its least width (the panels' 180 px), narrower than Views' measured one row.
    setup: (c) => c.setScene(resize(defaultScene(), "left", COL_MIN)),
    check(c) {
      const forms = c.scene.items.views!.forms.column!;
      const wrapSpec = forms.find((f) => f.kind === "wrap")?.wrap;
      const rowH = wrapSpec?.row ?? NaN;
      const lead = wrapSpec?.lead ?? 0;
      // The one-row width: the row form's across size.
      const rowW = forms[0]!.cross.natural;
      const iconsLen = forms.find((f) => f.kind === "icons")?.main.natural ?? NaN;
      const bad: string[] = [];
      const gripTop = (p: { rect: Rect }, w: Wrapped, rowLen: number): string | null => {
        if (!w.grip) return "no grip rect";
        const g = w.grip;
        if (Math.abs(g.y - p.rect.y) > 0.5 || g.y + g.height > p.rect.y + rowLen + 0.5) return `grip ${say(g)} not in the first row`;
        if (Math.abs(g.x - p.rect.x) > 0.5 || Math.abs(g.width - lead) > 0.5) return `grip ${say(g)} is not the ${lead} px lead at the row's start`;
        return null;
      };
      // 1. Into a column narrower than its one row.
      const col = c.layout.edges.left!.cross;
      const narrow = gaps(c, "views").filter((g) => g.place.edge === "left");
      if (!narrow.length || col >= rowW) return { pass: false, now: `No narrow column for Views: ${narrow.length} left-column gaps, the column ${r0(col)} px for a ${rowW} px row.` };
      const one = narrow.map((g) => {
        const a = g.after({ x: 0, y: 0 });
        const p = a.layout.items.views!;
        const w = wrapOf(p);
        const colA = a.layout.edges.left!.cross;
        const why: string[] = [];
        const n = w.rows?.length;
        if (p.formKind !== "wrap") why.push(`${p.formKind}, not the wrap form`);
        if (n === undefined) why.push("no rows in the layout");
        else {
          if (n < 2) why.push(`${n} row, not wrapped`);
          if (n >= WORDS) why.push(`${n} rows for ${WORDS} words`);
          if (w.rows!.slice(0, -1).some((row) => row.length < 2)) why.push(`a single word alone on a row that isn't the last: ${JSON.stringify(w.rows)}`);
          if (Math.abs(p.rect.height - n * rowH) > 0.5) why.push(`${r0(p.rect.height)} px tall, not ${n} × ${rowH}`);
        }
        if (p.rect.width > colA + 0.5) why.push(`${r0(p.rect.width)} px wide in a ${r0(colA)} px column`);
        const gt = gripTop(p, w, rowH);
        if (gt) why.push(gt);
        if (why.length) bad.push(`${g.id}: ${why.join(", ")}`);
        return `${g.id} ${p.formKind} ${say(p.rect)}${n === undefined ? "" : `, rows ${JSON.stringify(w.rows)}`}`;
      });
      // 3. The preview is the landing: a drag onto the first target with a point of its own (a hit covered whole by
      // another's, such as a column's first gap under an empty bar's strip, can't be reached by a drop).
      const land = (ts: SceneTarget[]): string => {
        const at = ts.map((t) => [t, aim(c, "views", t)] as const).find(([, p]) => p !== null);
        if (!at) {
          bad.push(`no point of its own in ${ts.map((t) => t.id).join(", ")}`);
          return `${ts.map((t) => t.id).join(", ")}: no point of its own`;
        }
        const [t, p] = at;
        const want = t.after({ x: 0, y: 0 }).layout.items.views?.rect ?? null;
        dragTo(c, "views", [p!]);
        const d = c.lastDrop;
        const ok = !!d && d.target === t.id && d.committed && sameRect(t.slot, want) && sameRect(d.preview, d.landed) && sameRect(d.landed, want);
        const said = d ? `${t.id}: slot ${t.slot ? say(t.slot) : "none"}, after() ${want ? say(want) : "none"}, dropped on ${d.target ?? "nothing"}, landed ${d.landed ? say(d.landed) : "none"}` : `${t.id}: the drag never lifted`;
        if (!ok) bad.push(`preview ≠ landing at ${said}`);
        return said;
      };
      const landNarrow = land(narrow);
      // 2. Onto a vertical place: an empty column's strip, and a column drawn as a rail.
      const vertical: string[] = [];
      const landVertical: string[] = [];
      // A group never opens a column on its own: at the empty right side it gets the window-edge rail's strip.
      const places: [string, Scene, EdgeId][] = [
        ["the empty right side (the rail's strip)", sceneWith((s) => put(s, "left", ["pages", "notes", "findings"])), "rail-right"],
        ["the right column as a rail (Review only)", sceneWith((s) => put(put(s, "left", ["pages", "notes"]), "right", ["review"])), "right"],
      ];
      for (const [name, s, edgeId] of places) {
        c.setScene(s);
        const ts = gaps(c, "views").filter((g) => g.place.edge === edgeId);
        if (!ts.length) {
          bad.push(`${name}: no target`);
          vertical.push(`${name}: no target`);
          continue;
        }
        const seen = ts.map((g) => {
          const a = g.after({ x: 0, y: 0 });
          const p = a.layout.items.views!;
          // Icons only; drawing their grip on top is the host's job, so no grip rect is asked for here.
          const why: string[] = [];
          if (p.formKind !== "icons") why.push(`${p.formKind}, not icons`);
          else if (Math.abs(p.rect.height - iconsLen) > 0.5) why.push(`${r0(p.rect.height)} px tall, not the icons' ${iconsLen}`);
          const placeCross = a.layout.edges[edgeId]!.cross;
          if (p.rect.width > placeCross + 0.5) why.push(`${r0(p.rect.width)} px wide in a ${r0(placeCross)} px place`);
          if (why.length) bad.push(`${g.id} (${name}): ${why.join(", ")}`);
          return `${g.id} ${p.formKind} ${say(p.rect)}`;
        });
        vertical.push(`${name}: ${seen.join("; ")}`);
        landVertical.push(land(ts));
      }
      return {
        pass: bad.length === 0,
        now:
          `Left column ${r0(col)} px, one row ${rowW} px: ${one.join("; ")}. Vertical: ${vertical.join(". ")}. Preview vs landing: ${[landNarrow, ...landVertical].join("; ")}.` +
          (bad.length ? ` Missing: ${bad.join("; ")}.` : ""),
      };
    },
  },
  {
    id: "strip-keeps-gaps",
    title: "An empty bar's strip keeps the columns' first gaps",
    expected:
      "With the top bar empty, a group's drag shows the top bar's three zone strips (leading, center, trailing) along the top of the content, and they never swallow a gap: no strip's hit overlaps a gap's hit, and every gap (the columns' trays, the bars' gaps) has a point of its own a drop can reach.",
    setup: (c) => c.setScene(defaultScene()),
    check(c) {
      const ts = c.targets("views");
      const strips = ZONES.map((zone) => ts.find((t) => t.id === targetId({ kind: "strip", edge: "top", zone })));
      if (strips.some((s) => !s)) return { pass: false, now: `No zone strips for the empty top bar: ${ts.map((t) => t.id).join(", ")}.` };
      const bad: string[] = [];
      const gapTs = ts.filter((t) => parseTargetId(t.id)?.kind === "gap");
      for (const strip of strips) for (const g of gapTs) if (overlap(strip!.hit, g.hit) > 0) bad.push(`${strip!.id} covers ${g.id}`);
      for (const g of gapTs) if (!aim(c, "views", g)) bad.push(`${g.id} has no point of its own`);
      if (!gapTs.some((g) => idEdge(g.id) === "left") || !gapTs.some((g) => idEdge(g.id) === "right")) bad.push("no gap in a column's tray");
      return { pass: bad.length === 0, now: `${strips.map((s) => `${s!.id} ${say(s!.hit)}`).join("; ")}; ${gapTs.map((g) => `${g.id} ${say(g.hit)}`).join("; ")}.${bad.length ? ` Broken: ${bad.join("; ")}.` : ""}` };
    },
  },
  {
    id: "empty-side-choice",
    title: "An empty side: a group gets the rail, a panel the column",
    expected:
      "With every panel in the left column, the right side is empty. A group's drag there gets only the window-edge rail's strips, one per third (it becomes a 30 px icon rail, never a column with one toolbar); a panel's drag gets only the column's top third (its start zone). One edge per drag kind, never two side by side.",
    setup: (c) => c.setScene(sceneWith((s) => put(s, "left", ["pages", "notes", "findings"]))),
    check(c) {
      const strips = (id: ItemId): string[] => c.targets(id).filter((t) => parseTargetId(t.id)?.kind === "strip" && !!idEdge(t.id)?.includes("right")).map((t) => t.id);
      const group = strips("views");
      const panel = strips("notes");
      const ok = group.join() === ZONES.map((zone) => targetId({ kind: "strip", edge: "rail-right", zone })).join() && panel.join() === targetId({ kind: "strip", edge: "right", zone: "start" });
      return { pass: ok, now: `A group's strips at the right: ${group.join(", ") || "none"}; a panel's: ${panel.join(", ") || "none"}.` };
    },
  },
  {
    id: "group-into-tray",
    title: "A group into a column's tray",
    expected:
      "Dragging Views into the left column's tray (its foot, below the panels) shows the slot there; the drop lands exactly on it, in the column's end zone, as words that wrap or icons, and the panels above give way upward. The preview is the landing.",
    setup: (c) => c.setScene(defaultScene()),
    check(c) {
      const t = gaps(c, "views").find((g) => g.place.edge === "left" && g.place.zone === "end");
      if (!t) return { pass: false, now: "No tray gap in the left column." };
      const p = aim(c, "views", t);
      if (!p) return { pass: false, now: `${t.id} has no point of its own.` };
      const want = t.after({ x: 0, y: 0 }).layout;
      dragTo(c, "views", [p]);
      const d = c.lastDrop;
      const l = c.layout.items.views;
      const col = c.layout.edges.left!.rect;
      const pages = c.layout.items.pages?.rect;
      const ok =
        !!d && d.target === t.id && d.committed && sameRect(d.preview, d.landed) && sameRect(d.landed, want.items.views!.rect) && l?.zone === "end" && (l.formKind === "wrap" || l.formKind === "icons") && !!pages && pages.y + pages.height <= l.rect.y + 0.5 && l.rect.y + l.rect.height <= col.y + col.height + 0.5;
      return { pass: ok, now: d ? `Dropped on ${d.target}; slot ${d.preview ? say(d.preview) : "none"}, landed ${d.landed ? say(d.landed) : "none"} (${l?.formKind}, zone ${l?.zone}); Pages ends at ${pages ? r0(pages.y + pages.height) : "?"}.` : "The drag never lifted." };
    },
  },
  {
    id: "slow-short-into-tray",
    title: "A slow, short drag from the bottom bar into the tray",
    expected:
      "Pressing Views' grip in the bottom bar and pulling it slowly (about 4 px per move, 16 ms apart) a short way up and to the right into the left column's tray just above lifts it after 5 px, shows the tray's slot, and the release lands exactly there. Driven through the page's own pointer listeners, like a mouse.",
    setup: (c) => c.setScene(defaultScene()),
    check(c) {
      const t = gaps(c, "views").find((g) => g.place.edge === "left" && g.place.zone === "end");
      const el = c.win.querySelector<HTMLElement>('.dw-items [data-id="views"] [data-grip]');
      if (!t || !el) return { pass: false, now: !t ? "No tray gap in the left column." : "No grip on Views." };
      const p = aim(c, "views", t);
      if (!p) return { pass: false, now: `${t.id} has no point of its own.` };
      const w = c.win.getBoundingClientRect();
      const g = el.getBoundingClientRect();
      const from = { x: g.left + g.width / 2, y: g.top + g.height / 2 };
      const to = { x: w.left + p.x, y: w.top + p.y };
      const want = t.after({ x: 0, y: 0 }).layout.items.views!.rect;
      const ev = (type: string, at: { x: number; y: number }): PointerEvent => new PointerEvent(type, { clientX: at.x, clientY: at.y, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true });
      c.drive(true);
      let now = performance.now();
      el.dispatchEvent(ev("pointerdown", from));
      const steps = Math.max(8, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 4));
      let lifted = false;
      for (let i = 1; i <= steps; i++) {
        window.dispatchEvent(ev("pointermove", { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }));
        lifted ||= !!c.dragging;
        if (c.dragging) c.frame((now += 16));
      }
      for (let k = 0; k < 25; k++) if (c.dragging) c.frame((now += 16));
      window.dispatchEvent(ev("pointerup", to));
      c.drive(false);
      const d = c.lastDrop;
      const ok = lifted && !!d && d.target === t.id && d.committed && sameRect(d.preview, d.landed) && sameRect(d.landed, want);
      return { pass: ok, now: `${steps} moves of about ${r0(Math.hypot(to.x - from.x, to.y - from.y) / steps)} px from ${r0(from.x)},${r0(from.y)} to ${r0(to.x)},${r0(to.y)}: ${lifted ? "lifted" : "never lifted"}; ${d ? `dropped on ${d.target ?? "nothing"}, slot ${d.preview ? say(d.preview) : "none"}, landed ${d.landed ? say(d.landed) : "none"}` : "no drop"}.` };
    },
  },
  {
    id: "toolbar-on-a-rail",
    title: "A second toolbar onto a rail: top, between, middle, bottom",
    expected:
      "With Zoom on a window-edge rail, Tools dropped by mouse anywhere on that rail lands there: at its top above Zoom (start), just below Zoom (start), in the middle (center) and at the bottom (end), each with the slot equal to the landing. No dead stretch along the rail. The same on the right rail.",
    setup: (c) => c.setScene(sceneWith((s) => put(s, "rail-left", ["zoom"]))),
    check(c) {
      const bad: string[] = [];
      const seen: string[] = [];
      for (const side of ["rail-left", "rail-right"] as const) {
        const base = sceneWith((s) => put(s, side, ["zoom"]));
        c.setScene(base);
        const rail = c.layout.edges[side]!.rect;
        const zoom = rectOf(c, "zoom")!;
        const x = rail.x + rail.width / 2;
        // The top spot lies past the empty top bar's own band (half the hit band, 12 px), which owns the rail's top.
        const spots: [string, Point, "start" | "center" | "end"][] = [
          ["top", { x, y: rail.y + 18 }, "start"],
          ["below Zoom", { x, y: zoom.y + zoom.height + 10 }, "start"],
          ["middle", { x, y: rail.y + rail.height / 2 }, "center"],
          ["bottom", { x, y: rail.y + rail.height - 6 }, "end"],
        ];
        for (const [name, p, zone] of spots) {
          c.setScene(base);
          const r = mouseDrag(c, "tools", p);
          const d = c.lastDrop;
          const l = c.layout.items.tools;
          const ok = r.lifted && !!d && d.committed && l?.edge === side && l.zone === zone && sameRect(d.preview, d.landed);
          seen.push(`${side} ${name}: ${d?.target ?? "nothing"} (${l?.edge ?? "-"} ${l?.zone ?? ""})`);
          if (!ok) bad.push(`${side} ${name}: dropped on ${d?.target ?? "nothing"}, landed in ${l?.edge ?? "none"} ${l?.zone ?? ""}, slot ${d?.preview ? say(d.preview) : "none"} vs ${d?.landed ? say(d.landed) : "none"}`);
        }
      }
      return { pass: bad.length === 0, now: `${seen.join("; ")}.${bad.length ? ` Broken: ${bad.join("; ")}.` : ""}` };
    },
  },
  {
    id: "rail-thirds",
    title: "An empty rail's thirds, then a second toolbar into each third",
    expected:
      "Review dropped by mouse in the top, middle and bottom third of the empty left rail lands at its start, center and end, the slot equal to the landing; the same on the empty right rail. Then, with Review in each of those places, Tools dropped by mouse in each third of that rail lands in that third's zone, the slot equal to the landing.",
    setup: (c) => c.setScene(defaultScene()),
    check(c) {
      const bad: string[] = [];
      const seen: string[] = [];
      const zones = ["start", "center", "end"] as const;
      for (const side of ["rail-left", "rail-right"] as const) {
        c.setScene(defaultScene());
        const rail = c.layout.edges[side]!.rect;
        // Inside the rail's strip while it is empty, inside the rail once it shows.
        const x = side === "rail-left" ? rail.x + 6 : rail.x + rail.width - 6;
        const third = (k: number): Point => ({ x, y: rail.y + ((k + 0.5) * rail.height) / 3 });
        const drop = (id: "review" | "tools", k: number, label: string): boolean => {
          const r = mouseDrag(c, id, third(k));
          const d = c.lastDrop;
          const l = c.layout.items[id];
          const ok = r.lifted && !!d && d.committed && l?.edge === side && l.zone === zones[k] && sameRect(d.preview, d.landed);
          seen.push(`${label}: ${l?.edge ?? "-"} ${l?.zone ?? ""}`);
          if (!ok) bad.push(`${label}: dropped on ${d?.target ?? "nothing"}, landed in ${l?.edge ?? "none"} ${l?.zone ?? ""}, slot ${d?.preview ? say(d.preview) : "none"} vs ${d?.landed ? say(d.landed) : "none"}`);
          return ok;
        };
        for (let k = 0; k < 3; k++) {
          c.setScene(defaultScene());
          if (!drop("review", k, `${side}, Review in third ${k + 1}`)) continue;
          const withReview = c.scene;
          for (let k2 = 0; k2 < 3; k2++) {
            c.setScene(withReview);
            drop("tools", k2, `${side}, Review ${zones[k]}, Tools in third ${k2 + 1}`);
          }
        }
      }
      return { pass: bad.length === 0, now: `${seen.join("; ")}.${bad.length ? ` Broken: ${bad.join("; ")}.` : ""}` };
    },
  },
  {
    id: "aim-order-sweep",
    title: "Aim at a toolbar's half: before or after it, on every edge, in every order",
    expected:
      "On the rail, the top bar, the bottom bar, the title bar and the left column's tray, with Tools, Views and Zoom in each of their 6 orders: each, dragged by mouse with its grip in the leading half of another (entering from outside the window, and gliding straight from its place), lands right before it, and in its trailing half right after it (the item taken out first). Where that order is the one seen, it is home (\"Back to its place\") and nothing moves. A drop's slot is where it lands, at its landed size.",
    setup: (c) => c.setScene(sweepScene("rail-left", SWEEP_GROUPS)),
    check(c) {
      const t0 = performance.now();
      const bad: string[] = [];
      const counts: string[] = [];
      for (const [kind, edge] of SWEEP_EDGES) {
        let n = 0;
        const ok = { outside: 0, direct: 0 };
        const vertical = isSideEdge(edge);
        const along = (r: Rect): number => (vertical ? r.y : r.x);
        // The groups shown on the edge, in their order along it.
        const shown = (): ItemId[] =>
          SWEEP_GROUPS.filter((g) => {
            const p = c.layout.items[g];
            return p?.edge === edge && !p.inMenu && p.rect.width >= 1 && p.rect.height >= 1;
          }).sort((a, b) => along(c.layout.items[a]!.rect) - along(c.layout.items[b]!.rect));
        for (const order of permutations(SWEEP_GROUPS)) {
          const base = sweepScene(edge, order);
          c.setScene(base);
          if (shown().join() !== order.join()) {
            bad.push(`${kind} ${order.join(" ")}: set up as ${shown().join(" ")}`);
            continue;
          }
          for (const id of order) {
            const others = order.filter((x) => x !== id);
            others.forEach((nb, k) => {
              for (const half of [0, 1]) {
                c.setScene(base);
                const own = rectOf(c, id)!;
                const r = rectOf(c, nb)!;
                const f = half ? 0.75 : 0.25;
                const to = vertical ? { x: r.x + r.width / 2, y: r.y + r.height * f } : { x: r.x + r.width * f, y: r.y + r.height / 2 };
                const aimed = [...others.slice(0, k + half), id, ...others.slice(k + half)];
                const home = aimed.join() === order.join();
                n++;
                // Two ways in. By way of a point just outside the window, level with the point, then straight in across
                // the edge's outer side: the tiles alone. And a direct glide from home: the intent's band about a held
                // zone scales with the zones (a fifth of a 28 px row's extent, not 10 px), so the aim still wins.
                for (const way of ["outside", "direct"] as const) {
                  c.setScene(base);
                  const side = edgeOf(c.scene, edge).side;
                  const via = side === "left" ? { x: -24, y: to.y } : side === "top" ? { x: to.x, y: -24 } : { x: to.x, y: c.scene.stage.height + 24 };
                  const m = mouseHold(c, id, way === "outside" ? via : to);
                  if (way === "outside") m.move(to);
                  m.up();
                  const d = c.lastDrop;
                  const got = shown();
                  const pass = home
                    ? m.lifted && !!d && !d.committed && d.place === "home" && sameRect(d.preview, own) && got.join() === order.join()
                    : m.lifted && !!d && d.committed && got.includes(id) && aimed.filter((x) => got.includes(x)).join() === got.join() && sameRect(d.preview, d.landed);
                  if (pass) ok[way]++;
                  else bad.push(`${kind} ${order.join(" ")} (${way}): ${id} ${half ? "after" : "before"} ${nb} → ${d?.target ?? "nothing"}, now ${got.join(" ")}, slot ${d?.preview ? say(d.preview) : "none"} vs landed ${d?.landed ? say(d.landed) : "none"}`);
                }
              }
            });
          }
        }
        counts.push(`${kind} ${ok.outside}/${n} from outside, ${ok.direct}/${n} direct`);
      }
      c.setScene(sweepScene("rail-left", SWEEP_GROUPS));
      return { pass: bad.length === 0, now: `${counts.join(", ")} in ${r0((performance.now() - t0) / 1000)} s.${bad.length ? ` Broken: ${bad.slice(0, 12).join("; ")}${bad.length > 12 ? `; and ${bad.length - 12} more` : ""}.` : ""}` };
    },
  },
  {
    id: "toolbar-into-title-bar",
    title: "A toolbar into the title bar: over the title, the middle, by the controls",
    expected:
      "Tools dropped by mouse with its grip over the title's text, over the empty middle of the title bar, and just left of the window controls lands in the title bar each time, the slot equal to the landing, never over the title's text or the controls; with Zoom in the title bar and with Zoom moved out to the rail.",
    setup: (c) => c.setScene(defaultScene()),
    check(c) {
      const bad: string[] = [];
      const seen: string[] = [];
      const worlds: [string, Scene][] = [
        ["Zoom in the title bar", defaultScene()],
        ["Zoom on the rail", sceneWith((s) => put(s, "rail-left", ["zoom"]))],
      ];
      for (const [world, base] of worlds) {
        c.setScene(base);
        const bar = c.layout.edges.title!.rect;
        const title = reservedRect(c.scene, c.layout, "title");
        const ctl = rectOf(c, "controls")!;
        const y = bar.y + bar.height / 2;
        const spots: [string, Point][] = [
          ["over the title", { x: title.x + title.width / 2, y }],
          ["the middle", { x: bar.x + bar.width / 2, y }],
          ["left of the controls", { x: ctl.x - 6, y }],
        ];
        for (const [name, p] of spots) {
          c.setScene(base);
          const r = mouseDrag(c, "tools", p);
          const d = c.lastDrop;
          const l = c.layout.items.tools;
          const titleA = reservedRect(c.scene, c.layout, "title");
          const ctlA = rectOf(c, "controls")!;
          const ok = r.lifted && !!d && d.committed && l?.edge === "title" && sameRect(d.preview, d.landed) && !!d.landed && overlap(d.landed, titleA) === 0 && overlap(d.landed, ctlA) === 0;
          seen.push(`${world}, ${name}: ${d?.target ?? "nothing"}`);
          if (!ok) bad.push(`${world}, ${name}: dropped on ${d?.target ?? "nothing"}, landed in ${l?.edge ?? "none"} ${d?.landed ? say(d.landed) : ""}`);
        }
      }
      return { pass: bad.length === 0, now: `${seen.join("; ")}.${bad.length ? ` Broken: ${bad.join("; ")}.` : ""}` };
    },
  },
  {
    id: "no-dead-stretch",
    title: "Every point of an edge that takes the item is a gap",
    expected:
      "For a panel and a toolbar, every point inside every edge that accepts it, swept at 8 px, hits a gap; except over a non-growing fixed item (the window controls) and over a panel's body (where a gap is a band), and, for a toolbar in a panel column, over the panels' own zone above the tray.",
    setup: (c) => c.setScene(sceneWith((s) => put(s, "rail-left", ["zoom"]))),
    check(c) {
      const bad: string[] = [];
      let n = 0;
      for (const id of ["notes", "tools"] as const) {
        const kind = c.scene.items[id]!.kind;
        const ts = c.targets(id);
        // The window as the user sees it while the item is held (the item in place): that is what the pointer moves over.
        const held = c.layout;
        const kept = lift(c.scene, id).edges;
        for (const e of c.scene.edges) {
          // An edge the lift deletes (the item's own column) offers no place: it is home's.
          if (!e.accepts.includes(kind) || !kept.some((k) => k.id === e.id)) continue;
          const l = held.edges[e.id];
          if (!l || l.rect.width <= 0 || l.rect.height <= 0) continue;
          const items = Object.entries(held.items).filter(([iid, p]) => p.edge === e.id && iid !== id);
          const solid = items.filter(([iid, p]) => p.fixed && iid !== "title").map(([, p]) => p.rect);
          const bodies = items.filter(([, p]) => p.formKind === "open").map(([, p]) => p.rect);
          // A toolbar's drag in a panel column: only the tray, below the panels.
          const panelsEnd = e.zoneAccepts && !e.zoneAccepts.start?.includes(kind) ? Math.max(-Infinity, ...items.filter(([, p]) => p.kind === "panel").map(([, p]) => p.rect.y + p.rect.height)) : -Infinity;
          // Its gaps and strips, a gap at the item's own place (shown as home) included, and its refusals ("No room
          // here" is a defined place, not a dead one).
          const mine = [...ts.filter((t) => isSlotOf(t.id, e.id) || t.id === targetId({ kind: "home", item: id })), ...c.refusals(id).filter((r) => r.edge === e.id)];
          // An empty edge laid before this one owns a thin band (half the hit band) at its boundary, which may lie over
          // this edge (the empty top bar over a rail's top, an empty rail over a column's outer edge): its places there
          // are defined, not dead.
          // A side rail's drop strip (a panel's) owns its rect over the column too: its places there are the rail's.
          const emptyBands = [...ts.filter((t) => (parseTargetId(t.id)?.kind === "strip" && idEdge(t.id) !== e.id) || !!t.strip), ...c.refusals(id).filter((r) => r.edge !== e.id && !!held.edges[r.edge] && (held.edges[r.edge]!.rect.width <= 0 || held.edges[r.edge]!.rect.height <= 0))];
          const deadAt: string[] = [];
          let dead = 0;
          for (let x = l.rect.x + 4; x < l.rect.x + l.rect.width; x += 8)
            for (let y = l.rect.y + 4; y < l.rect.y + l.rect.height; y += 8) {
              const p = { x, y };
              // Past a fixed item that ends the edge (the controls, before the bar's end padding) nothing can go.
              const pastEnd = solid.some((s) => (l.side === "left" || l.side === "right" ? y >= s.y + s.height : x >= s.x + s.width) && !items.some(([, q]) => (l.side === "left" || l.side === "right" ? q.rect.y >= s.y + s.height : q.rect.x >= s.x + s.width)));
              if (pastEnd || solid.some((s) => inside(s, p)) || bodies.some((b) => inside(b, p)) || y <= panelsEnd || emptyBands.some((t) => inside(t.hit, p))) continue;
              n++;
              if (!mine.some((t) => ("hits" in t && t.hits ? t.hits : [t.hit]).some((h) => inside(h, p)))) {
                dead++;
                if (deadAt.length < 4) deadAt.push(`${r0(x)},${r0(y)}`);
              }
            }
          if (dead) bad.push(`${id} over ${e.id}: ${dead} dead points (${deadAt.join(" ")})`);
        }
      }
      return { pass: bad.length === 0, now: `${n} points swept.${bad.length ? ` Broken: ${bad.join("; ")}.` : " No dead stretch."}` };
    },
  },
  {
    id: "group-into-rail",
    title: "A group into the window-edge rail",
    expected: "Dragging Views onto the left window edge's rail strip shows its slot; the drop lands exactly on it, as icons in the 30 px rail outside the left column. The preview is the landing.",
    setup: (c) => c.setScene(defaultScene()),
    check(c) {
      const t = c.targets("views").find((x) => x.id === targetId({ kind: "strip", edge: "rail-left", zone: "start" }));
      if (!t) return { pass: false, now: "No strip for the left rail." };
      const p = aim(c, "views", t);
      if (!p) return { pass: false, now: "The rail's strip has no point of its own." };
      const want = t.after({ x: 0, y: 0 }).layout.items.views!.rect;
      dragTo(c, "views", [p]);
      const d = c.lastDrop;
      const l = c.layout.items.views;
      const ok = !!d && d.target === t.id && d.committed && sameRect(d.preview, d.landed) && sameRect(d.landed, want) && l?.edge === "rail-left" && l.formKind === "icons";
      return { pass: ok, now: d ? `Dropped on ${d.target}; slot ${d.preview ? say(d.preview) : "none"}, landed ${d.landed ? say(d.landed) : "none"} (${l?.formKind} in ${l?.edge}).` : "The drag never lifted." };
    },
  },
  {
    id: "title-bar-zones",
    title: "The title bar's zones: leading, center, trailing",
    expected:
      "Tools dropped by mouse in the title bar's left third lands leading (right after the title's natural width, or after the toolbars there), in the middle third at the bar's true centre (or, where that isn't clear of the title and the trailing toolbars, centred in the free span between them), in the right third trailing, right before the window controls. The slot is the landing, never over the title's natural rect or the controls; with Zoom in the title bar, Zoom moved out, and Review leading.",
    setup: (c) => c.setScene(defaultScene()),
    check(c) {
      const bad: string[] = [];
      const seen: string[] = [];
      const worlds: [string, Scene][] = [
        ["Zoom in the title bar", defaultScene()],
        ["Zoom moved out", sceneWith((s) => put(s, "rail-left", ["zoom"]))],
        ["Review leading", sceneWith((s) => put(put(s, "rail-left", ["zoom"]), "title", ["review"]))],
      ];
      for (const [world, base] of worlds) {
        for (const zone of ["start", "center", "end"] as const) {
          c.setScene(base);
          const r = barZoneDrop(c, "tools", "title", zone);
          seen.push(`${world}, ${zone}: ${r.now}`);
          if (!r.ok) bad.push(`${world}, ${zone}: ${r.now}`);
        }
      }
      return { pass: bad.length === 0, now: `${seen.join("; ")}.${bad.length ? ` Broken: ${bad.join("; ")}.` : ""}` };
    },
  },
  {
    id: "zoom-after-title",
    title: "Zoom right after the title, with Review in the title bar's center or right",
    expected:
      "With Zoom moved out and Review in the title bar's center (or its right), Zoom dropped by mouse just right of the title's text gets a slot right after the title's natural width and lands there; the slot is the landing.",
    setup: (c) => c.setScene(sceneWith((s) => aligned(put(put(s, "rail-left", ["zoom"]), "title", ["review"]), "review", "center"))),
    check(c) {
      const bad: string[] = [];
      const seen: string[] = [];
      for (const align of ["center", "end"] as const) {
        c.setScene(sceneWith((s) => aligned(put(put(s, "rail-left", ["zoom"]), "title", ["review"]), "review", align)));
        const title = reservedRect(c.scene, c.layout, "title");
        const bar = c.layout.edges.title!.rect;
        const r = mouseDrag(c, "zoom", { x: title.x + title.width + 12, y: bar.y + bar.height / 2 });
        const d = c.lastDrop;
        const l = c.layout.items.zoom;
        const gap = c.edge("title").gap ?? 0;
        const ok = r.lifted && !!d && d.committed && l?.edge === "title" && l.zone === "start" && sameRect(d.preview, d.landed) && !!d.landed && Math.abs(d.landed.x - (title.x + title.width + gap)) <= 0.5;
        seen.push(`Review ${align}: ${d?.target ?? "nothing"} ${d?.landed ? say(d.landed) : ""}`);
        if (!ok) bad.push(`Review ${align}: dropped on ${d?.target ?? "nothing"}, landed in ${l?.edge ?? "none"} ${d?.landed ? say(d.landed) : ""}`);
      }
      return { pass: bad.length === 0, now: `${seen.join("; ")}.${bad.length ? ` Broken: ${bad.join("; ")}.` : ""}` };
    },
  },
  {
    id: "top-bar-zones",
    title: "The top bar's zones, empty and with Zoom at its start",
    expected:
      "Tools dropped by mouse in the top bar's left, middle and right thirds lands leading, centred and trailing; with the bar empty (its strip is three zone targets) and with Zoom at its start (a toolbar can go to its right, not only to its left). The slot is the landing; with Zoom in the title bar and moved out.",
    setup: (c) => c.setScene(defaultScene()),
    check(c) {
      return zonesOfBar(c, "top", [
        ["empty, Zoom in the title bar", defaultScene()],
        ["Zoom at its start", sceneWith((s) => put(s, "top", ["zoom"]))],
      ]);
    },
  },
  {
    id: "bottom-bar-zones",
    title: "The bottom bar's zones, empty and with Zoom at its start",
    expected:
      "With Views and Review moved to the top bar, Tools dropped by mouse in the bottom bar's left, middle and right thirds lands leading, centred and trailing; with the bar empty and with Zoom at its start. The slot is the landing.",
    setup: (c) => c.setScene(sceneWith((s) => put(s, "top", ["views", "review"]))),
    check(c) {
      return zonesOfBar(c, "bottom", [
        ["empty, Zoom in the title bar", sceneWith((s) => put(s, "top", ["views", "review"]))],
        ["Zoom at its start", sceneWith((s) => put(put(s, "top", ["views", "review"]), "bottom", ["zoom"]))],
      ]);
    },
  },
  {
    id: "title-bar-too-full",
    title: "A title bar too full takes no toolbar",
    expected:
      "With Review, Views and Zoom in the title bar, Tools has no room without pushing the title under its natural width: no zone of the title bar offers a target or a slot, a drop over any third lands elsewhere (or goes home), and nothing overlaps the title or the controls.",
    setup: (c) => c.setScene(sceneWith((s) => put(s, "title", ["review", "views", "zoom"]))),
    check(c) {
      const base = sceneWith((s) => put(s, "title", ["review", "views", "zoom"]));
      c.setScene(base);
      const bad: string[] = [];
      const titleGaps = c.targets("tools").filter((t) => (t.place as { edge?: string }).edge === "title");
      if (titleGaps.length) bad.push(`targets in the title bar: ${titleGaps.map((t) => t.id).join(", ")}`);
      const bar = c.layout.edges.title!.rect;
      for (const k of [0, 1, 2]) {
        c.setScene(base);
        mouseDrag(c, "tools", { x: bar.x + ((k + 0.5) * bar.width) / 3, y: bar.y + bar.height / 2 });
        const l = c.layout.items.tools;
        const title = reservedRect(c.scene, c.layout, "title");
        const ctl = rectOf(c, "controls")!;
        if (l?.edge === "title") bad.push(`third ${k + 1}: landed in the title bar`);
        if (l && !l.floating && l.edge === "title" && (overlap(l.rect, title) > 0 || overlap(l.rect, ctl) > 0)) bad.push(`third ${k + 1}: over the title or the controls`);
        if ((c.layout.items.title?.rect.width ?? 0) < title.width - 0.5) bad.push(`third ${k + 1}: the title under its natural width`);
      }
      return { pass: bad.length === 0, now: bad.length ? `Broken: ${bad.join("; ")}.` : "No title-bar target for Tools; drops over each third went elsewhere." };
    },
  },
  {
    id: "nothing-clipped",
    title: "Nothing is clipped, in any form, on any edge",
    expected:
      "Every movable item, in every form it can take (row, wrap, icons, fold; open, header, rail), on every kind of edge it can go to (a bar, a column, the tray, the rail, a float), draws its buttons and labels inside its own rect: their bounding box stays inside the item's box, and the box doesn't scroll (scrollWidth and scrollHeight within its size).",
    setup: (c) => c.setScene(defaultScene()),
    check(c) {
      const bad: string[] = [];
      let n = 0;
      // A float at the item's own float size (what a float drop gives it).
      const float = (id: ItemId): Place => {
        const size = defaultScene().items[id]!.floatSize!;
        return { kind: "float", rect: { x: 300, y: 120, width: size.width, height: size.height } };
      };
      const groupPlaces = (id: ItemId): [string, Place][] => [
        ["bar", { kind: "gap", edge: "top", zone: "start", at: 0 }],
        ["tray", { kind: "gap", edge: "left", zone: "end", at: 0 }],
        ["rail", { kind: "gap", edge: "rail-left", zone: "start", at: 0 }],
        ["float", float(id)],
      ];
      const panelPlaces = (id: ItemId): [string, Place][] => [
        ["column", { kind: "gap", edge: "left", zone: "start", at: 0 }],
        ["float", float(id)],
      ];
      for (const id of MOVABLE) {
        const group = isGroup(id);
        for (const [where, place] of group ? groupPlaces(id) : panelPlaces(id)) {
          const placed = moveTo(defaultScene(), id, place);
          // A float uses its item's float orient (a toolbar group floats as a row), an edge its own axis.
          const axis = where === "bar" || (where === "float" && floatOrientOf(placed.items[id]!) === "row") ? "row" : "column";
          const forms = placed.items[id]!.forms[axis] ?? [];
          for (let k = 0; k < forms.length; k++) {
            const kind = forms[k]!.kind;
            if (kind === "menu") continue;
            c.setScene({ ...placed, items: { ...placed.items, [id]: { ...placed.items[id]!, from: k } } });
            const p = c.layout.items[id];
            // The form it took (a vertical place skips a group's wrap forms); each form drawn is checked once.
            if (!p || p.inMenu) continue;
            const issue = clipped(c, id);
            n++;
            if (issue) bad.push(`${id} ${p.formKind} in the ${where}: ${issue}`);
          }
        }
      }
      // The panels' rail form: every panel of the left column folded by hand, in the left column's rail form.
      c.setScene(sceneWith((s) => ({ ...s, items: { ...s.items, pages: { ...s.items.pages!, from: 2 }, notes: { ...s.items.notes!, from: 2 } } })));
      for (const id of ["pages", "notes"] as const) {
        const p = c.layout.items[id];
        if (!p || p.inMenu) continue;
        n++;
        const issue = clipped(c, id);
        if (issue) bad.push(`${id} ${p.formKind} in the column: ${issue}`);
      }
      return { pass: bad.length === 0, now: `${n} item × form × edge cases drawn.${bad.length ? ` Clipped: ${bad.join("; ")}.` : " None clipped."}` };
    },
  },
  {
    id: "rail-of-two",
    title: "A rail of two toolbars, neither clipped",
    expected: "With Zoom in the left rail, Tools dropped by mouse on the rail below it stacks under Zoom: both show every icon inside their own box, and the preview is the landing.",
    setup: (c) => c.setScene(sceneWith((s) => put(s, "rail-left", ["zoom"]))),
    check(c) {
      c.setScene(sceneWith((s) => put(s, "rail-left", ["zoom"])));
      const z = rectOf(c, "zoom")!;
      const r = mouseDrag(c, "tools", { x: z.x + z.width / 2, y: z.y + z.height + 30 });
      const d = c.lastDrop;
      const t = c.layout.items.tools;
      const order = c.layout.items.zoom && t ? c.layout.items.zoom.rect.y < t.rect.y : false;
      const bad: string[] = [];
      if (!r.lifted || !d?.committed || t?.edge !== "rail-left") bad.push(`Tools dropped on ${d?.target ?? "nothing"}, in ${t?.edge ?? "none"}`);
      else {
        if (!sameRect(d.preview, d.landed)) bad.push("the preview isn't the landing");
        if (!order) bad.push("Tools isn't under Zoom");
        for (const id of ["zoom", "tools"] as const) {
          const issue = clipped(c, id);
          if (issue) bad.push(`${id}: ${issue}`);
        }
      }
      return { pass: bad.length === 0, now: `Zoom ${say(rectOf(c, "zoom")!)}, Tools ${t ? say(t.rect) : "none"}.${bad.length ? ` Broken: ${bad.join("; ")}.` : ""}` };
    },
  },
  {
    id: "views-over-title-thirds",
    title: "Views over the title bar's thirds: the slot is where the pointer is",
    expected:
      "The reported state (1200 px: the title, Tools and Zoom leading, Views trailing, Pages floating, Notes left, Findings right). Views held by mouse over the title bar's leading, center and trailing thirds shows a slot in that third (over its own place, home) or \"No room here\" there, never a slot far away; let go, it lands where the slot showed.",
    setup: (c) => c.setScene(reportedTitle()),
    check(c) {
      const bad: string[] = [];
      const seen: string[] = [];
      for (const k of [0, 1, 2]) {
        c.setScene(reportedTitle());
        const bar = c.layout.edges.title!.rect;
        const x0 = bar.x + (k * bar.width) / 3;
        const x1 = bar.x + ((k + 1) * bar.width) / 3;
        const h = mouseHold(c, "views", { x: (x0 + x1) / 2, y: bar.y + bar.height / 2 });
        const refused = c.refused;
        // Over its own place the session is homing (no target; "Back to its place", or nothing while the pointer never
        // left the item's own rect): that is home.
        const slotEl = c.win.querySelector<HTMLElement>(".dw-slot")!;
        const own = rectOf(c, "views");
        const p = { x: (x0 + x1) / 2, y: bar.y + bar.height / 2 };
        const overOwn = !!own && inside(own, p);
        const homing = !c.shown && ((!slotEl.hidden && slotEl.title === "Back to its place") || overOwn);
        const s = c.shown ?? (homing ? ({ id: "home", place: { kind: "home" } } as SceneTarget) : null);
        const slot = s?.place.kind === "home" ? rectOf(c, "views") : (s?.slot ?? null);
        h.up();
        const d = c.lastDrop;
        const near = !!slot && slot.x < x1 + 1 && slot.x + slot.width > x0 - 1;
        seen.push(`third ${k + 1}: ${refused ? `no room (${refused.id})` : `${s?.id ?? "nothing"}${slot ? ` ${say(slot)}` : ""}`}`);
        if (!h.lifted) bad.push(`third ${k + 1}: the drag never lifted`);
        else if (refused) {
          if (d?.committed) bad.push(`third ${k + 1}: a release over "no room" committed`);
        } else if (!s || (s.place.kind !== "gap" && s.place.kind !== "home") || !near) bad.push(`third ${k + 1}: ${s?.id ?? "no target"} with its slot ${slot ? say(slot) : "none"} away from the third ${r0(x0)}..${r0(x1)}`);
        else if (s.place.kind === "gap" && !(d?.committed && sameRect(d.preview, d.landed))) bad.push(`third ${k + 1}: the landing isn't the slot`);
      }
      return { pass: bad.length === 0, now: `${seen.join("; ")}.${bad.length ? ` Broken: ${bad.join("; ")}.` : ""}` };
    },
  },
  {
    id: "home-only-over-its-place",
    title: "Home shows only over the item's own place and the gaps beside it",
    expected: "In the reported state, Views held by mouse and moved along the title bar shows \"Back to its place\" only over its own place and the gaps beside it (a drop there is the same move), never past another toolbar of the bar; everywhere else along the bar the slot is beside the pointer.",
    setup: (c) => c.setScene(reportedTitle()),
    check(c) {
      c.setScene(reportedTitle());
      const bar = c.layout.edges.title!.rect;
      const own = rectOf(c, "views")!;
      const y = bar.y + bar.height / 2;
      const h = mouseHold(c, "views", { x: bar.x + 300, y });
      const bad: string[] = [];
      let homes = 0;
      for (let x = bar.x + 300; x < bar.x + bar.width; x += 40) {
        h.move({ x, y });
        const s = c.shown;
        // Home: its target, or the session homing ("Back to its place" with no target).
        const slotEl = c.win.querySelector<HTMLElement>(".dw-slot")!;
        const homing = !s && !slotEl.hidden && slotEl.title === "Back to its place";
        if (s?.place.kind !== "home" && !homing) continue;
        homes++;
        // Never past another toolbar of the bar: between the pointer and its own place lies no other item.
        const [a, b] = x < own.x ? [x, own.x] : [own.x + own.width, x];
        const across = Object.entries(c.layout.items).find(([iid, p]) => iid !== "views" && p.edge === "title" && !p.inMenu && p.rect.x >= a - 0.5 && p.rect.x + p.rect.width <= b + 0.5);
        if (across) bad.push(`home at x ${r0(x)}, past ${across[0]}; its place is ${r0(own.x)}..${r0(own.x + own.width)}`);
      }
      h.up();
      if (!homes) bad.push("home never showed, even over its own place");
      return { pass: bad.length === 0, now: `Home showed at ${homes} of the points along the bar.${bad.length ? ` Broken: ${bad.join("; ")}.` : ""}` };
    },
  },
  {
    id: "full-title-no-room",
    title: "A full title bar: \"No room here\", no distant slot",
    expected: "With Review, Views and Zoom in the title bar, Tools held over each third of it shows \"No room here\" at the pointer, the zone tinted, and no slot anywhere; let go there, Tools goes back home.",
    setup: (c) => c.setScene(sceneWith((s) => put(s, "title", ["review", "views", "zoom"]))),
    check(c) {
      const bad: string[] = [];
      for (const k of [0, 1, 2]) {
        c.setScene(sceneWith((s) => put(s, "title", ["review", "views", "zoom"])));
        const before = rectOf(c, "tools");
        const bar = c.layout.edges.title!.rect;
        const h = mouseHold(c, "tools", { x: bar.x + ((k + 0.5) * bar.width) / 3, y: bar.y + bar.height / 2 });
        const refused = c.refused;
        const tint = c.win.querySelector<HTMLElement>(".dw-refuse");
        const label = c.win.querySelector<HTMLElement>(".dw-refuse-label");
        const slotShown = !c.win.querySelector<HTMLElement>(".dw-slot")!.hidden;
        if (!refused || refused.reason !== "no-room") bad.push(`third ${k + 1}: ${refused ? refused.reason : "no refusal"} (shown ${c.shown?.id ?? "nothing"})`);
        if (tint?.hidden || label?.hidden || label?.textContent !== "No room here") bad.push(`third ${k + 1}: no tint or label`);
        if (slotShown) bad.push(`third ${k + 1}: a slot shows`);
        h.up();
        const d = c.lastDrop;
        if (d?.committed || !sameRect(rectOf(c, "tools"), before)) bad.push(`third ${k + 1}: the release moved Tools`);
      }
      return { pass: bad.length === 0, now: bad.length ? `Broken: ${bad.join("; ")}.` : "No room here over each third, no slot, Tools back home." };
    },
  },
  {
    id: "even-separators",
    title: "Even spacing around every separator",
    expected: "In every word group with a \"·\" between its words (Views: Pages · Notes 2 · Findings 20), in its row form in a bar and its wrap form in a tray, the room from the words' ink to the \"·\" is the same on both sides, within 1 px.",
    setup: (c) => c.setScene(defaultScene()),
    check(c) {
      const bad: string[] = [];
      let n = 0;
      const places: [string, Scene][] = [
        ["the bottom bar (row)", defaultScene()],
        ["the left column's tray (wrap)", resize(moveTo(defaultScene(), "views", { kind: "gap", edge: "left", zone: "end", at: 0 }), "left", COL_MIN)],
      ];
      for (const [where, s] of places) {
        c.setScene(s);
        const el = c.win.querySelector<HTMLElement>('.dw-items [data-id="views"]');
        if (!el) {
          bad.push(`Views not drawn in ${where}`);
          continue;
        }
        for (const sep of el.querySelectorAll<HTMLElement>(".dw-sep")) {
          const prev = sep.previousElementSibling as HTMLElement | null;
          const next = sep.nextElementSibling as HTMLElement | null;
          if (!prev || !next) continue;
          const left = sep.getBoundingClientRect().left + inkInset(sep).left - ink(prev).right;
          const right = ink(next).left - (sep.getBoundingClientRect().right - inkInset(sep).right);
          n++;
          if (Math.abs(left - right) > 1) bad.push(`${where}: ${r0(left)} px before a "·", ${r0(right)} px after it`);
        }
      }
      return { pass: bad.length === 0 && n > 0, now: `${n} separators measured.${bad.length ? ` Uneven: ${bad.join("; ")}.` : n ? " All even." : " None found."}` };
    },
  },
  {
    id: "fit-sweep",
    title: "Toolbars that don't fit: shrink and grow back",
    expected:
      "The window shrinks from 1440 to 600 px wide in 40 px steps, then from 900 to 500 px tall, and grows back. At every step: nothing is clipped, no docked items overlap, every item is in place or in its edge's » menu (which lists exactly what it holds), no item changes edges, and toolbars step down lowest priority first (Zoom and Review last), the oldest used first; growing back they only step up, and the window ends as it began.",
    setup: (c) => c.setScene(sceneWith((s) => put(s, "top", ["tools", "views"]), { width: 1440, height: 900 })),
    check(c) {
      c.setScene(sceneWith((s) => put(s, "top", ["tools", "views"]), { width: 1440, height: 900 }));
      const bad: string[] = [];
      const start = fitState(c);
      const sizes: [number, number][] = [];
      for (let w = 1440; w >= 600; w -= 40) sizes.push([w, 900]);
      for (let h = 900; h >= 500; h -= 40) sizes.push([600, h]);
      let last = start;
      const visit = (w: number, h: number, shrinking: boolean): void => {
        c.setSize(w, h);
        const now = fitState(c);
        for (const issue of fitIssues(c, start, now, last, shrinking)) bad.push(`${w}×${h}: ${issue}`);
        // Exactly the reverse: the toolbars' steps on the way back are those on the way down at the same size.
        const key = `${w}×${h}`;
        const groups = (st: FitState) => JSON.stringify(Object.keys(st.step).filter(isGroup).map((id) => [id, st.step[id]]));
        if (shrinking) down.set(key, groups(now));
        else if (down.get(key) !== groups(now)) bad.push(`${key}: growing back ${groups(now)}, on the way down ${down.get(key)}`);
        last = now;
      };
      const down = new Map<string, string>();
      for (const [w, h] of sizes) visit(w, h, true);
      for (const [w, h] of [...sizes].reverse()) visit(w, h, false);
      const end = fitState(c);
      for (const id of Object.keys(start.step)) if (end.step[id] !== start.step[id] || end.edge[id] !== start.edge[id]) bad.push(`back at 1440×900, ${id} is at step ${end.step[id]} in ${end.edge[id]}, it began at ${start.step[id]} in ${start.edge[id]}`);
      return { pass: bad.length === 0, now: `${2 * sizes.length} sizes.${bad.length ? ` Broken: ${bad.slice(0, 6).join("; ")}${bad.length > 6 ? ` (+${bad.length - 6})` : ""}.` : " Every step held."}` };
    },
  },
  {
    id: "crowded-title-bar",
    title: "A crowded title bar gives way before the top bar",
    expected: "With the title, Tools, Zoom and Views in the title bar and Review in the top bar, a narrowing window steps the title bar's toolbars down to icons and then into its » menu before the top bar's do.",
    setup: (c) => c.setScene(sceneWith((s) => put(put(s, "title", ["tools", "zoom", "views"]), "top", ["review"]), { width: 1440, height: 640 })),
    check(c) {
      c.setScene(sceneWith((s) => put(put(s, "title", ["tools", "zoom", "views"]), "top", ["review"]), { width: 1440, height: 640 }));
      const start = fitState(c);
      let titleAt = 0;
      let topAt = 0;
      for (let w = 1440; w >= 480; w -= 20) {
        c.setSize(w, 640);
        const s = fitState(c);
        const moved = (ids: string[]) => ids.some((id) => s.step[id] !== start.step[id]);
        if (!titleAt && moved(["tools", "zoom", "views"])) titleAt = w;
        if (!topAt && moved(["review"])) topAt = w;
      }
      const ok = titleAt > 0 && (topAt === 0 || titleAt > topAt);
      return { pass: ok, now: `The title bar's toolbars first step down at ${titleAt || "never"} px, the top bar's at ${topAt || "never"} px.` };
    },
  },
  {
    id: "menu-lists-held",
    title: "The » menu lists exactly what it holds",
    expected: "In a narrow window the title bar's » menu shows the count of the toolbars it holds; opened, it lists exactly them, in order; picking one acts as its control would (a stub here) and leaves the window as it was.",
    setup: (c) => c.setScene(sceneWith((s) => put(s, "title", ["tools", "zoom", "views"]), { width: MENU_WIDTH, height: 640 })),
    check(c) {
      c.setScene(sceneWith((s) => put(s, "title", ["tools", "zoom", "views"]), { width: MENU_WIDTH, height: 640 }));
      const m = c.layout.edges.title?.menu;
      if (!m || !m.items.length) return { pass: false, now: `The title bar has no » menu at ${MENU_WIDTH} px.` };
      const held = (Object.keys(c.layout.items) as ItemId[]).filter((id) => c.layout.items[id]!.edge === "title" && c.layout.items[id]!.inMenu);
      const bad: string[] = [];
      if (m.items.join() !== held.join()) bad.push(`the menu lists [${m.items.join(", ")}], the items in it are [${held.join(", ")}]`);
      const btn = c.win.querySelector<HTMLElement>('.dw-menu[data-edge="title"]');
      if (!btn || !btn.textContent?.includes(String(m.items.length))) bad.push(`the » button reads "${btn?.textContent ?? "nothing"}"`);
      // A drag earlier in the same run may still swallow the click that follows its pointer-up: spend it on the window.
      c.win.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      btn?.click();
      const list = c.win.querySelector<HTMLElement>(".dw-menu-list")!;
      const listed = [...list.querySelectorAll<HTMLElement>("[data-menu-item]")].map((b) => b.dataset.menuItem);
      if (list.hidden || listed.join() !== m.items.join()) bad.push(`opened, it lists [${listed.join(", ")}]${list.hidden ? " (hidden)" : ""}`);
      const before = JSON.stringify(c.layout.items);
      list.querySelector<HTMLElement>("[data-menu-item]")?.click();
      if (!list.hidden) bad.push("picking an item left the menu open");
      if (JSON.stringify(c.layout.items) !== before) bad.push("picking an item changed the window");
      return { pass: bad.length === 0, now: `The » holds [${m.items.join(", ")}].${bad.length ? ` Broken: ${bad.join("; ")}.` : ""}` };
    },
  },
  {
    id: "held-takes-target-form",
    title: "The held toolbar takes the target's form",
    expected:
      "Views held by mouse over a column gap shows its wrapped words, over the window-edge rail its icons down the rail, over the top bar a row; moved off every target it takes its own form back. Each change is a short settle with the grip under the pointer (within 2 px at every frame).",
    setup: (c) => c.setScene(defaultScene()),
    check(c) {
      c.setScene(defaultScene());
      const fs = formStops(c);
      if (typeof fs === "string") return { pass: false, now: fs };
      const { stops, off } = fs;
      const bad: string[] = [];
      const seen: string[] = [];
      let worst = 0;
      const r = heldSweep(c, "views", [...stops.map((s) => ({ to: s.p, step: 4, hold: 25 })), { to: off, step: 4, hold: 25 }], (_, drift) => (worst = Math.max(worst, drift)));
      if (!r.lifted) return { pass: false, now: "The drag never lifted." };
      for (const [i, s] of r.atStops.entries()) {
        const want = i < stops.length ? stops[i]! : { name: "off every target", formKind: r.home.formKind, axis: r.home.axis };
        seen.push(`${want.name}: ${s.formKind} ${s.axis}${s.settled ? "" : " (moving)"}`);
        if (s.formKind !== want.formKind || s.axis !== want.axis || !s.settled) bad.push(`${want.name} shows ${s.formKind} ${s.axis}, wanted ${want.formKind} ${want.axis}`);
      }
      if (worst > 2) bad.push(`the grip drifted ${worst.toFixed(2)} px from the pointer`);
      return { pass: bad.length === 0, now: `${seen.join("; ")}; grip drift at most ${worst.toFixed(2)} px.${bad.length ? ` Broken: ${bad.join("; ")}.` : ""}` };
    },
  },
  {
    id: "held-form-fast-sweep",
    title: "A fast sweep: the right form at the end, no thrash",
    expected:
      "Views swept fast by mouse across a column gap, the rail and the top bar (a few frames over each) ends as a row over the top bar; it switches form at most once per target change, the window's items are redrawn only when the shown target changes, the grip stays within 2 px of the pointer at the start, middle and end of every morph, and no form's opacity jumps (from one frame to the next at most the frame's time, capped at 32 ms, over the 120 ms fade, plus 0.01: each fades from where it is).",
    setup: (c) => c.setScene(defaultScene()),
    check(c) {
      c.setScene(defaultScene());
      const fs = formStops(c);
      if (typeof fs === "string") return { pass: false, now: fs };
      const { stops } = fs;
      let worst = 0;
      // 40 px a frame between stops, and just past the intent's dwell (90 ms) at each: the target shows, and the next
      // move retargets the morph mid-flight (it takes about 125 ms).
      const r = heldSweep(c, "views", stops.map((s, i) => ({ to: s.p, step: 40, hold: i === stops.length - 1 ? 25 : 7 })), (_, drift) => (worst = Math.max(worst, drift)));
      if (!r.lifted) return { pass: false, now: "The drag never lifted." };
      if (r.switches < 2) return { pass: false, now: `Only ${r.switches} form switches over ${r.targetChanges} target changes: the sweep never showed the targets (${r.atStops.map((s) => `${s.shown ?? "none"} → ${s.target ?? "own form"}`).join("; ")}).` };
      const end = r.atStops[r.atStops.length - 1]!;
      const last = stops[stops.length - 1]!;
      const bad: string[] = [];
      if (end.formKind !== last.formKind || end.axis !== last.axis || !end.settled) bad.push(`it ends as ${end.formKind} ${end.axis}${end.settled ? "" : " (moving)"}, wanted ${last.formKind} ${last.axis}`);
      if (r.switches > r.targetChanges) bad.push(`${r.switches} form switches for ${r.targetChanges} target changes`);
      if (r.redraws > r.targetChanges) bad.push(`the window's items redrawn on ${r.redraws} frames for ${r.targetChanges} target changes`);
      if (worst > 2) bad.push(`the grip drifted ${worst.toFixed(2)} px from the pointer`);
      // A step may be its frame's fade (the frame's time, capped, over the fade's) and 0.01 for rounding; more is a pop.
      if (r.fadeOver > 0) bad.push(`a form's opacity jumped ${r.maxFade.toFixed(2)} between frames, ${r.fadeOver.toFixed(3)} past its frame's fade`);
      return { pass: bad.length === 0, now: `${r.targetChanges} target changes, ${r.switches} form switches, ${r.redraws} redraw frames; ends ${end.formKind} ${end.axis}; grip drift at most ${worst.toFixed(2)} px; opacity steps at most ${r.maxFade.toFixed(3)}.${bad.length ? ` Broken: ${bad.join("; ")}.` : ""}` };
    },
  },
  {
    id: "zoom-variants-sweep",
    title: "Zoom's compact variants: full, compact, minimal, and back",
    expected:
      'Zoom alone in the title bar while the window narrows from 900 to 260 px in 2 px steps and widens back: it steps full "− 86% + FIT" → compact "− 86% +" with "»1" → minimal "86%" with "»3", in that order, each step drawn whole (nothing clipped); its overflow cell\'s badge reads the number its form hides and its name says "N more Zoom controls", and opened, its popover lists exactly the hidden controls; widening, the steps come back in the exact reverse. The readout gives the width band compact shows in.',
    setup: (c) => c.setScene(sceneWith((s) => s, { width: 900, height: 640 })),
    check(c) {
      c.setScene(sceneWith((s) => s, { width: 900, height: 640 }));
      const bad: string[] = [];
      const widths: number[] = [];
      for (let w = 900; w >= 260; w -= 2) widths.push(w);
      const down = new Map<number, number>();
      const seen = new Set<number>();
      /** The widths compact shows at on the way down. */
      const compact: number[] = [];
      let last = -1;
      const visit = (w: number, shrinking: boolean): void => {
        c.setSize(w, 640);
        const z = c.layout.items.zoom!;
        const form = z.inMenu ? 99 : z.form;
        if (shrinking) {
          if (form < last) bad.push(`${w}: Zoom stepped up to form ${form} from ${last} while narrowing`);
          down.set(w, form);
        } else if (down.get(w) !== form) bad.push(`${w}: Zoom is at form ${form} growing back, ${down.get(w)} on the way down`);
        last = form;
        if (z.inMenu) return;
        seen.add(form);
        const issue = clipped(c, "zoom");
        if (issue) bad.push(`${w}: ${issue}`);
        if (form === 1 && shrinking) compact.push(w);
        const more = moreCell(c);
        const count = more?.querySelector(".dw-cnt")?.textContent ?? null;
        if (count !== (z.hidden.length ? String(z.hidden.length) : null)) bad.push(`${w}: the cell's badge reads "${count ?? "nothing"}", its form hides [${z.hidden.join(", ")}]`);
        if (more && more.getAttribute("aria-label") !== `${z.hidden.length} more Zoom controls`) bad.push(`${w}: the cell is named "${more.getAttribute("aria-label")}"`);
        if (more) {
          const listed = openMore(c, more);
          if (listed.join() !== z.hidden.join()) bad.push(`${w}: the popover lists [${listed.join(", ")}], the form hides [${z.hidden.join(", ")}]`);
          closeByOutsideClick(c);
        }
      };
      for (const w of widths) visit(w, true);
      for (const w of [...widths].reverse()) visit(w, false);
      for (const f of [0, 1, 2]) if (!seen.has(f)) bad.push(`Zoom never showed form ${f}`);
      // Compact shows in a real band of window widths, not a pixel or two (the kits' compact saves about 33 px).
      const wide = compact.length ? Math.max(...compact) - Math.min(...compact) + 2 : 0;
      if (wide < COMPACT_BAND_MIN) bad.push(`compact shows for only ${wide} px of window width, under ${COMPACT_BAND_MIN}`);
      const band = compact.length ? `${Math.min(...compact)}–${Math.max(...compact)} px (${wide} px wide)` : "none";
      return { pass: bad.length === 0, now: `Forms seen: ${[...seen].sort().join(", ")}; compact at ${band}.${bad.length ? ` Broken: ${bad.slice(0, 6).join("; ")}${bad.length > 6 ? ` (+${bad.length - 6})` : ""}.` : " Every step held."}` };
    },
  },
  {
    id: "zoom-more-acts",
    title: "A hidden control acts from the overflow cell's popover",
    expected: 'With Zoom minimal ("86%" and "»3"), the popover lists −, + and FIT; clicking + steps the zoom up by 10 % as the real + does, and closes the popover; an outside click closes it too.',
    setup: minimalZoom,
    check(c) {
      const more = minimalZoom(c);
      const bad: string[] = [];
      const z = c.layout.items.zoom!;
      if (z.hidden.join() !== "-,+,fit") bad.push(`at ${MINIMAL_WIDTH} px Zoom hides [${z.hidden.join(", ")}]`);
      if (!more) return { pass: false, now: `No "+N" cell at ${MINIMAL_WIDTH} px.` };
      const listed = openMore(c, more);
      if (listed.join() !== "-,+,fit") bad.push(`the popover lists [${listed.join(", ")}]`);
      const before = c.counts.zoom;
      menuList(c).querySelector<HTMLElement>('[data-hidden-control="+"]')?.click();
      if (c.counts.zoom !== before + 10) bad.push(`the zoom went ${before} → ${c.counts.zoom}, wanted ${before + 10}`);
      if (!menuList(c).hidden) bad.push("the popover stayed open after a pick");
      c.setCount("zoom", before);
      const again = moreCell(c);
      if (again) {
        openMore(c, again);
        closeByOutsideClick(c);
        if (!menuList(c).hidden) bad.push("an outside click left the popover open");
      }
      return { pass: bad.length === 0, now: `Listed [${listed.join(", ")}].${bad.length ? ` Broken: ${bad.join("; ")}.` : " + acted and closed it."}` };
    },
  },
  {
    id: "zoom-more-keyboard",
    title: "The overflow cell's popover by keyboard",
    expected: 'Enter or Space on "»3" opens the popover with the focus on its first control; the arrow keys move the focus through −, + and FIT (wrapping); Escape closes it and puts the focus back on "»3".',
    setup: minimalZoom,
    check(c) {
      const more = minimalZoom(c);
      const bad: string[] = [];
      if (!more) return { pass: false, now: `No "+N" cell at ${MINIMAL_WIDTH} px.` };
      // Enter and Space on a button click it with no pointer (detail 0), as `click()` does.
      more.focus();
      more.click();
      const list = menuList(c);
      const focused = (): string => (document.activeElement as HTMLElement | null)?.dataset.hiddenControl ?? "(not in the popover)";
      if (list.hidden) bad.push("Enter left the popover closed");
      if (more.getAttribute("aria-expanded") !== "true") bad.push("the cell isn't marked expanded");
      const path = [focused()];
      const key = (k: string): void => void document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
      for (const k of ["ArrowDown", "ArrowDown", "ArrowDown", "ArrowUp"]) {
        key(k);
        path.push(focused());
      }
      if (path.join() !== "-,+,fit,-,fit") bad.push(`the focus went ${path.join(" → ")}`);
      key("Escape");
      if (!list.hidden) bad.push("Escape left the popover open");
      if (document.activeElement !== moreCell(c)) bad.push("the focus didn't go back to the cell");
      return { pass: bad.length === 0, now: `Focus: ${path.join(" → ")}.${bad.length ? ` Broken: ${bad.join("; ")}.` : " Escape closed it, back on »3."}` };
    },
  },
  {
    id: "float-resize-corner",
    title: "A floating panel resized by its corner",
    expected:
      "Findings floating: its bottom-right corner dragged by mouse 120 px right and 80 down grows it by exactly that, its top-left corner put; while the button is down the window is in the resize session (no hover elsewhere) and nothing else moves; Findings' list fills the new size. Dragged back far past it, it stops at the panel's least size (floatMin, else its open form's minimums).",
    setup: (c) => c.setScene(resizeScene()),
    check(c) {
      const bad: string[] = [];
      const r0 = rectOf(c, "findings")!;
      const others = othersOf(c, "findings");
      let session = "";
      let hover = "";
      const pressed = mouseResize(c, "findings", "bottom-right", 120, 80, () => {
        session = c.root.dataset.dragSession ?? "none";
        hover = getComputedStyle(c.win.querySelector('.dw-items [data-id="pages"] .dw-head')!).pointerEvents;
      });
      const r1 = rectOf(c, "findings")!;
      if (!pressed) bad.push("no bottom-right handle on the floating Findings");
      if (!sameRect(r1, { x: r0.x, y: r0.y, width: r0.width + 120, height: r0.height + 80 })) bad.push(`grown to ${say(r1)} from ${say(r0)}`);
      if (session !== "resize" || hover !== "none") bad.push(`mid-resize: session ${session}, a header's pointer-events ${hover}`);
      if (c.root.dataset.dragSession !== undefined) bad.push("the resize session outlived the pointer-up");
      if (othersOf(c, "findings") !== others) bad.push("something else moved");
      const sec = c.win.querySelector<HTMLElement>('.dw-items [data-id="findings"]')!;
      const body = sec.querySelector<HTMLElement>(".dw-body")!;
      const list = sec.querySelector<HTMLElement>(".dw-list")!;
      const sb = sec.getBoundingClientRect();
      const bb = body.getBoundingClientRect();
      const fills = Math.abs(bb.bottom - (sb.bottom - sec.clientTop)) <= 1.5 && Math.abs(bb.width - sec.clientWidth) <= 1.5 && list.getBoundingClientRect().width >= body.clientWidth - 12 - 1;
      if (!fills) bad.push(`the body is ${Math.round(bb.width)}×${Math.round(bb.height)} in a ${Math.round(sb.width)}×${Math.round(sb.height)} float`);
      mouseResize(c, "findings", "bottom-right", -900, -900);
      const r2 = rectOf(c, "findings")!;
      const min = panelMin(c, "findings");
      if (!sameRect(r2, { x: r0.x, y: r0.y, width: min.width, height: min.height })) bad.push(`shrunk to ${say(r2)}, its least is ${min.width}×${min.height}`);
      return { pass: bad.length === 0, now: `${say(r0)} → ${say(r1)} → ${say(r2)}.${bad.length ? ` Broken: ${bad.join("; ")}.` : " Its list fills it."}` };
    },
  },
  {
    id: "float-resize-left-edge",
    title: "A floating panel resized by its left edge keeps its right edge",
    expected: "Findings' left edge dragged by mouse 100 px left widens it by 100 with its right edge put; dragged 600 px right it stops at its least width, the right edge still put.",
    setup: (c) => c.setScene(resizeScene()),
    check(c) {
      const bad: string[] = [];
      const r0 = rectOf(c, "findings")!;
      const right = r0.x + r0.width;
      mouseResize(c, "findings", "left", -100, 0);
      const r1 = rectOf(c, "findings")!;
      if (!sameRect(r1, { x: r0.x - 100, y: r0.y, width: r0.width + 100, height: r0.height })) bad.push(`widened to ${say(r1)}`);
      mouseResize(c, "findings", "left", 600, 0);
      const r2 = rectOf(c, "findings")!;
      const min = panelMin(c, "findings");
      if (!sameRect(r2, { x: right - min.width, y: r0.y, width: min.width, height: r0.height })) bad.push(`narrowed to ${say(r2)}, the right edge at ${Math.round(right)}, least width ${min.width}`);
      return { pass: bad.length === 0, now: `${say(r0)} → ${say(r1)} → ${say(r2)}.${bad.length ? ` Broken: ${bad.join("; ")}.` : ` The right edge stayed at ${Math.round(right)}.`}` };
    },
  },
  {
    id: "float-resize-clamp",
    title: "A floating panel resized past the window's edge stops at it",
    expected:
      "With the right column empty: Findings' right edge dragged by mouse past the window's right side ends at it (less the inset). Its top edge dragged past the window's top ends under the title bar, and its left edge dragged past the window's left side ends at the left column (floats are kept clear of bars and docked panels); each time the edges not dragged stay put, and the float is drawn where the drag left it.",
    setup: (c) => c.setScene(resizeScene()),
    check(c) {
      const bad: string[] = [];
      const st = c.scene.stage;
      const hi = st.x + st.width - (c.scene.inset?.right ?? 0);
      const barsEnd = Math.max(st.y, ...Object.values(c.layout.edges).filter((e) => e.side === "top" && e.cross > 0).map((e) => e.rect.y + e.rect.height));
      const leftEnd = Math.max(st.x + (c.scene.inset?.left ?? 0), ...Object.values(c.layout.items).filter((p) => !p.floating && p.edge === "left").map((p) => p.rect.x + p.rect.width));
      const drawnAsStored = (): boolean => sameRect(c.scene.floats.find((f) => f.id === "findings")!.rect, rectOf(c, "findings"));
      const r0 = rectOf(c, "findings")!;
      mouseResize(c, "findings", "right", st.width, 0);
      const r1 = rectOf(c, "findings")!;
      if (!sameRect(r1, { x: r0.x, y: r0.y, width: hi - r0.x, height: r0.height }) || !drawnAsStored()) bad.push(`right: ${say(r1)}, the window ends at ${Math.round(hi)}`);
      mouseResize(c, "findings", "top", 0, -st.height);
      const r2 = rectOf(c, "findings")!;
      if (!sameRect(r2, { x: r1.x, y: barsEnd, width: r1.width, height: r0.y + r0.height - barsEnd }) || !drawnAsStored()) bad.push(`top: ${say(r2)}, the title bar ends at ${Math.round(barsEnd)}`);
      mouseResize(c, "findings", "left", -st.width, 0);
      const r3 = rectOf(c, "findings")!;
      if (!sameRect(r3, { x: leftEnd, y: r2.y, width: hi - leftEnd, height: r2.height }) || !drawnAsStored()) bad.push(`left: ${say(r3)}, the left column ends at ${Math.round(leftEnd)}`);
      return { pass: bad.length === 0, now: `${say(r0)} → ${say(r1)} → ${say(r2)} → ${say(r3)}.${bad.length ? ` Broken: ${bad.join("; ")}.` : ""}` };
    },
  },
  {
    id: "float-resize-reload",
    title: "A floating panel's size survives a reload",
    expected: "Findings resized by mouse (its top-left corner 60 px out each way), then the stored form read back: it comes back at that rect and size.",
    setup: (c) => c.setScene(resizeScene()),
    check(c) {
      mouseResize(c, "findings", "top-left", -60, -60);
      const r1 = rectOf(c, "findings")!;
      const r = readDocwin(JSON.parse(JSON.stringify(c.stored())));
      c.setScene(r.scene);
      const r2 = rectOf(c, "findings")!;
      const grown = sameRect(r1, { x: RESIZE_AT.x - 60, y: RESIZE_AT.y - 60, width: RESIZE_AT.width + 60, height: RESIZE_AT.height + 60 });
      const size = c.scene.items.findings!.floatSize;
      const ok = grown && sameRect(r1, r2) && size?.width === r1.width && size.height === r1.height && r.dropped.length === 0;
      return { pass: ok, now: `Resized to ${say(r1)}; after the reload ${say(r2)}, floatSize ${size ? `${size.width}×${size.height}` : "none"}${r.dropped.length ? `; dropped ${r.dropped.join(", ")}` : ""}.` };
    },
  },
  {
    id: "float-resize-frozen",
    title: "Frozen: no resize handles; Alt shows them",
    expected:
      "Frozen, the floating Findings shows no resize handles and a mouse drag on its corner changes nothing; holding Alt shows them and the drag resizes it. A floating toolbar (Tools) and a docked panel never have handles.",
    setup: (c) => {
      c.setScene(resizeScene());
      c.setFrozen(true);
    },
    check(c) {
      const bad: string[] = [];
      c.setFrozen(true);
      const vis = (): string => getComputedStyle(handleOf(c, "findings", "bottom-right")!).visibility;
      const r0 = rectOf(c, "findings")!;
      const v0 = vis();
      mouseResize(c, "findings", "bottom-right", 80, 60);
      const r1 = rectOf(c, "findings")!;
      if (v0 !== "hidden" || !sameRect(r0, r1)) bad.push(`frozen: handles ${v0}, ${say(r0)} → ${say(r1)}`);
      c.altOn(true);
      const v1 = vis();
      mouseResize(c, "findings", "bottom-right", 80, 60);
      const r2 = rectOf(c, "findings")!;
      c.altOn(false);
      c.setFrozen(false);
      if (v1 !== "visible" || !sameRect(r2, { x: r0.x, y: r0.y, width: r0.width + 80, height: r0.height + 60 })) bad.push(`with Alt: handles ${v1}, ${say(r0)} → ${say(r2)}`);
      const none = ["tools", "pages"].filter((id) => c.win.querySelectorAll(`.dw-items [data-id="${id}"] [data-fh]`).length > 0);
      if (!c.layout.items.tools?.floating) bad.push("Tools isn't floating");
      if (none.length) bad.push(`handles on ${none.join(", ")}`);
      return { pass: bad.length === 0, now: `Frozen: handles ${v0}, ${say(r1)}. With Alt: handles ${v1}, ${say(r2)}.${bad.length ? ` Broken: ${bad.join("; ")}.` : " No handles on Tools or a docked panel."}` };
    },
  },
  {
    id: "grip-double-panel",
    title: "A double-click on a panel's grip folds it, another unfolds it",
    expected:
      "Notes beside Pages in the left column: a mouse double-click on its header folds it to its header; another opens it again, the window as it was. No drag starts, no drop happens, and nothing outside the column moves.",
    setup: (c) => c.setScene(defaultScene()),
    check(c) {
      const bad = doubleFold(c, "notes", "left", (p) => p.formKind === "header");
      return { pass: bad.length === 0, now: bad.length ? `Broken: ${bad.join("; ")}.` : "Folded to its header, then open again; no drag, nothing else moved." };
    },
  },
  {
    id: "grip-double-group",
    title: "A double-click on a toolbar's grip folds it, another unfolds it",
    expected:
      "Views in the bottom bar: a mouse double-click on its grip folds it (its second form); another brings its first form back, the window as it was. No drag starts, no drop happens, and nothing outside the bar moves.",
    setup: (c) => c.setScene(defaultScene()),
    check(c) {
      const bad = doubleFold(c, "views", "bottom", (p) => p.form >= 1);
      return { pass: bad.length === 0, now: bad.length ? `Broken: ${bad.join("; ")}.` : "Folded to its second form, then its first again; no drag, nothing else moved." };
    },
  },
  {
    id: "grip-double-frozen",
    title: "Frozen: a grip's double-click does nothing; with Alt it folds",
    expected: "Frozen, a mouse double-click on Notes' header and on Views' grip changes nothing. Holding Alt, each folds and unfolds as it does unfrozen.",
    setup: (c) => {
      c.setScene(defaultScene());
      c.setFrozen(true);
    },
    check(c) {
      const bad: string[] = [];
      c.setFrozen(true);
      const before = allOf(c);
      for (const id of ["notes", "views"] as const) {
        const r = mouseDouble(c, id);
        if (!r.pressed || r.dragged || c.scene.items[id]!.from !== undefined) bad.push(`frozen: ${id} ${r.dragged ? "dragged" : `from ${c.scene.items[id]!.from}`}`);
      }
      if (allOf(c) !== before) bad.push("frozen: something moved");
      c.altOn(true);
      bad.push(...doubleFold(c, "notes", "left", (p) => p.formKind === "header").map((x) => `with Alt, Notes: ${x}`));
      bad.push(...doubleFold(c, "views", "bottom", (p) => p.form >= 1).map((x) => `with Alt, Views: ${x}`));
      c.altOn(false);
      c.setFrozen(false);
      return { pass: bad.length === 0, now: bad.length ? `Broken: ${bad.join("; ")}.` : "Frozen: nothing. With Alt: both fold and unfold." };
    },
  },
  ...RAIL_TITLE_PRESETS(),
  {
    id: "pointer-outside-window",
    title: "A pointer past the window's edge picks the nearest point of the window",
    expected:
      "Tools dragged by mouse to 20 px past the window's left edge, level with the middle of the window, lands on the left window-edge rail (the pointer is clamped into the window before a target is picked); the same 20 px past the right edge lands on the right rail. The slot is the landing.",
    setup: (c) => c.reset(),
    check(c) {
      const bad: string[] = [];
      const seen: string[] = [];
      for (const [side, x] of [["rail-left", -20], ["rail-right", c.scene.stage.width + 20]] as const) {
        c.reset();
        mouseDrag(c, "tools", { x, y: c.scene.stage.height / 2 });
        const d = c.lastDrop;
        const l = c.layout.items.tools;
        seen.push(`${side}: ${d?.target ?? "nothing"}`);
        if (!d?.committed || l?.edge !== side || !sameRect(d.preview, d.landed)) bad.push(side);
      }
      return { pass: bad.length === 0, now: `${seen.join("; ")}.${bad.length ? ` Broken: ${bad.join(", ")}.` : ""}` };
    },
  },
  ...RAIL_DOCK_PRESETS(),
  ...KIT_PRESETS(),
];

// --- rail titles -------------------------------------------------------------------------------------------------------

/** The default window with `ids` folded by hand (each at its header, so a column of them is drawn as a rail). */
const foldedScene = (ids: readonly ItemId[], edit: (s: Scene) => Scene = (s) => s, size = DEFAULT_SIZE): Scene =>
  sceneWith((s0) => {
    const s = edit(s0);
    return { ...s, items: { ...s.items, ...Object.fromEntries(ids.map((id) => [id, { ...s.items[id]!, from: 1 }])) } };
  }, size);
/** Pages and Notes folded in the left rail, Findings folded in the right one. */
const bothRails = (size = DEFAULT_SIZE): Scene => foldedScene(["pages", "notes", "findings"], (s) => s, size);
/** The item's form index, or 99 in a » menu. */
const stepOf = (c: DocwinScene, id: ItemId): number => (c.layout.items[id]?.inMenu ? 99 : (c.layout.items[id]?.form ?? -1));
/** Whether the item is drawn in its rail title form (the layout's `railTitle`, and the page's turned title). */
const isTitle = (c: DocwinScene, id: ItemId): boolean => !!c.layout.items[id]?.railTitle && !!c.win.querySelector(`.dw-items [data-id="${id}"] .dw-railtitle`);

/** A mouse click on the item's grip (its rail title or tile): pointerdown and pointerup at its centre, through the page's listeners. */
function mouseClick(c: DocwinScene, id: ItemId): boolean {
  const el = c.win.querySelector<HTMLElement>(`.dw-items [data-id="${id}"] [data-grip], .dw-items [data-id="${id}"][data-grip]`);
  if (!el) return false;
  const g = el.getBoundingClientRect();
  const at = { x: g.left + g.width / 2, y: g.top + g.height / 2 };
  const ev = (type: string): PointerEvent => new PointerEvent(type, { clientX: at.x, clientY: at.y, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true });
  el.dispatchEvent(ev("pointerdown"));
  window.dispatchEvent(ev("pointerup"));
  el.dispatchEvent(new MouseEvent("click", { clientX: at.x, clientY: at.y, bubbles: true, cancelable: true }));
  return true;
}

function RAIL_TITLE_PRESETS(): Preset[] {
  return [
    {
      id: "rail-titles-fit",
      title: "Folded panels show their titles in the rails",
      expected:
        "Pages and Notes folded in the left column, Findings in the right: each column is a rail, and each panel shows its title with its count, turned along the rail, as long as the page measured it. The rails' default is titles.",
      setup: (c) => c.setScene(bothRails()),
      check(c) {
        c.setScene(bothRails());
        const bad: string[] = [];
        for (const id of ["pages", "notes", "findings"] as const) {
          const p = c.layout.items[id];
          const f = p ? c.scene.items[id]!.forms.column?.[p.form] : undefined;
          if (!p || !isTitle(c, id) || !f?.title) bad.push(`${id} is ${p?.formKind ?? "nowhere"} (form ${p?.form}), not its title`);
          else if (Math.abs(p.rect.height - f.main.natural) > 0.5) bad.push(`${id} is ${r0(p.rect.height)} long, measured ${f.main.natural}`);
          const el = c.win.querySelector<HTMLElement>(`.dw-items [data-id="${id}"] .dw-railtitle`);
          if (el && p && Math.abs(el.getBoundingClientRect().height - p.rect.height) > 1) bad.push(`${id}'s title is drawn ${r0(el.getBoundingClientRect().height)} long in a ${r0(p.rect.height)} slot`);
        }
        const lens = (["pages", "notes", "findings"] as const).map((id) => `${id} ${r0(c.layout.items[id]?.rect.height ?? 0)}`).join(", ");
        return { pass: bad.length === 0, now: bad.length ? `Broken: ${bad.join("; ")}.` : `Every folded panel shows its title: ${lens} px.` };
      },
    },
    {
      id: "rail-titles-overflow",
      title: "A short rail steps titles down to icons, and back in exact reverse",
      expected:
        "All three panels folded in the left rail. Shrinking the window's height, the titles become icons one at a time, the one used longest ago first (Findings, Notes, then Pages); growing it back brings them back in exactly the reverse order, the same forms at every height.",
      setup: (c) => c.setScene(foldedScene(["pages", "notes", "findings"], (s) => ages(put(s, "left", ["pages", "notes", "findings"]), ["findings", "notes", "pages"]))),
      check(c) {
        c.setScene(foldedScene(["pages", "notes", "findings"], (s) => ages(put(s, "left", ["pages", "notes", "findings"]), ["findings", "notes", "pages"])));
        const ids = ["findings", "notes", "pages"] as const;
        const heights: number[] = [];
        for (let h = 640; h >= 120; h -= 6) heights.push(h);
        const down = new Map<number, string>();
        const order: string[] = [];
        const bad: string[] = [];
        for (const h of heights) {
          c.setSize(DEFAULT_SIZE.width, h);
          for (const id of ids) if (!isTitle(c, id) && !order.includes(id)) order.push(id);
          // The ladder: a panel is a title only while every panel used before it still is.
          ids.forEach((id, i) => {
            if (isTitle(c, id) && ids.slice(0, i).some((x) => !isTitle(c, x))) return;
            if (!isTitle(c, id) && ids.slice(i + 1).some((x) => !isTitle(c, x)) && ids.slice(0, i).some((x) => isTitle(c, x))) bad.push(`at ${h}: ${id} is an icon before an older one`);
          });
          down.set(h, ids.map((id) => stepOf(c, id)).join(","));
        }
        for (const h of [...heights].reverse()) {
          c.setSize(DEFAULT_SIZE.width, h);
          const now = ids.map((id) => stepOf(c, id)).join(",");
          if (now !== down.get(h)) bad.push(`at ${h}: ${now} growing, ${down.get(h)} shrinking`);
        }
        const ok = order.join(",") === "findings,notes,pages";
        return { pass: ok && bad.length === 0, now: `Titles became icons in the order ${order.join(", ") || "none"}.${bad.length ? ` Broken: ${bad.slice(0, 4).join("; ")}.` : " Growing back: the same forms at every height."}` };
      },
    },
    {
      id: "rail-titles-read",
      title: "Both rails' titles read toward the pages",
      expected: "The left rail's titles read bottom to top (turned −90°), the right rail's top to bottom (+90°), the count at the end of each title.",
      setup: (c) => c.setScene(bothRails()),
      check(c) {
        c.setScene(bothRails());
        const bad: string[] = [];
        const seen: string[] = [];
        for (const [id, side] of [["pages", "left"], ["notes", "left"], ["findings", "right"]] as const) {
          const b = c.win.querySelector<HTMLElement>(`.dw-items [data-id="${id}"] .dw-railtitle`);
          const t = b?.querySelector<HTMLElement>(".dw-rt");
          const n = b?.querySelector<HTMLElement>(".dw-badge");
          if (!b || !t || !n) {
            bad.push(`${id}: no title drawn`);
            continue;
          }
          const vertical = getComputedStyle(t).writingMode.startsWith("vertical");
          const turned = getComputedStyle(t).transform !== "none";
          const tr = t.getBoundingClientRect();
          const nr = n.getBoundingClientRect();
          // Reading toward the pages: down the right rail (the count below the name), up the left one (above it).
          const countAtEnd = side === "right" ? nr.top + nr.height / 2 > tr.top + tr.height / 2 : nr.top + nr.height / 2 < tr.top + tr.height / 2;
          const reads = side === "right" ? vertical && !turned : vertical && turned;
          if (c.layout.items[id]?.railTitle !== side) bad.push(`${id}: the layout says ${c.layout.items[id]?.railTitle ?? "no"} side`);
          if (!reads || !countAtEnd) bad.push(`${id} (${side}): ${reads ? "" : "not turned to read toward the pages"}${countAtEnd ? "" : " the count isn't at the end"}`);
          seen.push(`${id} ${side === "left" ? "bottom to top" : "top to bottom"}`);
        }
        return { pass: bad.length === 0, now: bad.length ? `Broken: ${bad.join("; ")}.` : `${seen.join(", ")}, each count at its end.` };
      },
    },
    {
      id: "rail-title-click",
      title: "A click on a rail title opens its panel",
      expected: "Pages and Notes folded in the left rail: a mouse click on Notes' title opens Notes (the column opens with it, Pages at its header).",
      setup: (c) => c.setScene(bothRails()),
      check(c) {
        c.setScene(bothRails());
        const before = isTitle(c, "notes");
        const clicked = mouseClick(c, "notes");
        const after = c.layout.items.notes?.formKind ?? "none";
        return { pass: before && clicked && after === "open" && !c.dragging, now: `Notes was ${before ? "its title" : "not its title"}; after the click it is ${after}, Pages ${c.layout.items.pages?.formKind ?? "none"}.` };
      },
    },
    {
      id: "rail-title-drag",
      title: "A rail title drags like the tile",
      expected: "Pages and Notes folded in the left rail, Findings open on the right: Notes dragged by its title onto the right column's first gap lifts, shows the slot and lands on it (preview = landing).",
      setup: (c) => c.setScene(foldedScene(["pages", "notes"])),
      check(c) {
        c.setScene(foldedScene(["pages", "notes"]));
        if (!isTitle(c, "notes")) return { pass: false, now: "Notes isn't its title in the left rail." };
        const t = c.targets("notes").find((x) => x.place.kind === "gap" && x.place.edge === "right");
        if (!t) return { pass: false, now: "No gap for Notes in the right column." };
        const r = mouseDrag(c, "notes", centre(t.hit));
        const d = c.lastDrop;
        const ok = r.lifted && !!d && d.committed && d.target === t.id && sameRect(d.preview, d.landed) && c.layout.items.notes?.edge === "right";
        return { pass: ok, now: `Notes ${r.lifted ? "lifted" : "never lifted"}; dropped on ${d?.target ?? "nothing"}, slot ${d?.preview ? say(d.preview) : "none"}, landed ${d?.landed ? say(d.landed) : "nowhere"} in ${c.layout.items.notes?.edge ?? "no edge"}.` };
      },
    },
    {
      id: "rail-title-double",
      title: "A double-click on a rail title unfolds it, another folds it back",
      expected: "Pages and Notes folded in the left rail: a mouse double-click on Notes' title opens Notes (no drag); a double-click on its header folds it back, and the rail shows Notes' title again.",
      setup: (c) => c.setScene(bothRails()),
      check(c) {
        c.setScene(bothRails());
        const bad: string[] = [];
        const a = mouseDouble(c, "notes");
        if (!a.pressed || a.dragged || c.layout.items.notes?.formKind !== "open") bad.push(`first double-click: ${a.dragged ? "a drag started, " : ""}Notes is ${c.layout.items.notes?.formKind ?? "none"}`);
        c.pause();
        const b = mouseDouble(c, "notes");
        if (!b.pressed || b.dragged || !isTitle(c, "notes")) bad.push(`second double-click: ${b.dragged ? "a drag started, " : ""}Notes is ${c.layout.items.notes?.formKind ?? "none"}${isTitle(c, "notes") ? "" : ", not its title"}`);
        return { pass: bad.length === 0, now: bad.length ? `Broken: ${bad.join("; ")}.` : "Notes opened, then folded back to its title in the rail." };
      },
    },
    {
      id: "rail-mode-controls",
      title: "Rails: titles or icons, from the rail's menu and the Window drawer, kept on reload",
      expected:
        "Both rails show titles. The left rail's menu (a right-click on a rail title) → Show icons: the left rail shows tiles, the right keeps titles. The Window drawer's Rails: right → icons: the right rail shows tiles. The stored layout keeps both, and a reload reads them back; the menu's Show titles brings the left titles back.",
      setup: (c) => c.setScene(bothRails()),
      check(c) {
        c.setScene(bothRails());
        // The click a browser sends after an earlier check's last pointerup (synthetic pointers send none): a gesture's
        // drop or double swallows the next click, as it would that one.
        document.body.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        const bad: string[] = [];
        const t = c.win.querySelector<HTMLElement>('.dw-items [data-id="notes"] .dw-railtitle');
        if (!t) return { pass: false, now: "No rail title to open the menu on." };
        const r = t.getBoundingClientRect();
        t.dispatchEvent(new MouseEvent("contextmenu", { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true, button: 2 }));
        const icons = c.win.querySelector<HTMLElement>('[data-rail-mode="left:icons"]');
        if (!icons || icons.closest<HTMLElement>(".dw-menu-list")?.hidden) bad.push("the rail's menu didn't open");
        icons?.click();
        if (railModeOf(c.scene, "left") !== "icons" || isTitle(c, "notes") || isTitle(c, "pages")) bad.push("Show icons left the left rail's titles");
        if (!isTitle(c, "findings")) bad.push("the right rail lost its title");
        const sel = document.getElementById("dw-rail-right") as HTMLSelectElement | null;
        if (sel) {
          sel.value = "icons";
          sel.dispatchEvent(new Event("change", { bubbles: true }));
          if (railModeOf(c.scene, "right") !== "icons" || isTitle(c, "findings")) bad.push("the drawer's Rails: right → icons didn't switch it");
        } else if (!c.win.closest("[data-embed]")) bad.push("no Rails control in the Window drawer");
        else c.setRailMode("right", "icons");
        // A reload: the page reads its stored layout back.
        const stored = c.stored();
        if (stored.scene.railModes?.left !== "icons" || stored.scene.railModes?.right !== "icons") bad.push(`the store has ${JSON.stringify(stored.scene.railModes ?? {})}`);
        c.load();
        if (railModeOf(c.scene, "left") !== "icons" || railModeOf(c.scene, "right") !== "icons" || isTitle(c, "findings")) bad.push("a reload lost the modes");
        const back = readDocwin(JSON.parse(JSON.stringify(storeDocwin(c.scene)))).scene;
        if (railModeOf(back, "left") !== "icons") bad.push("readDocwin lost the mode");
        // And back to titles from the menu.
        const n = c.win.querySelector<HTMLElement>('.dw-items [data-id="notes"] [data-open]');
        if (n) {
          const q = n.getBoundingClientRect();
          n.dispatchEvent(new MouseEvent("contextmenu", { clientX: q.left + 4, clientY: q.top + 4, bubbles: true, cancelable: true, button: 2 }));
        }
        c.win.querySelector<HTMLElement>('[data-rail-mode="left:titles"]')?.click();
        if (!isTitle(c, "notes")) bad.push("Show titles didn't bring the left titles back");
        c.setRailMode("right", "titles");
        if (sel) sel.value = railModeOf(c.scene, "right");
        return { pass: bad.length === 0, now: bad.length ? `Broken: ${bad.join("; ")}.` : "Menu and drawer switch each side; the stored layout and a reload keep it; Show titles brings them back." };
      },
    },
  ];
}

/** A width where Zoom, alone in the title bar, shows its minimal form ("86%" and "»3"). */
const MINIMAL_WIDTH = 350;
/** The least band of window widths compact Zoom must show in, px. */
const COMPACT_BAND_MIN = 15;
const menuList = (c: DocwinScene): HTMLElement => c.win.querySelector<HTMLElement>(".dw-menu-list")!;
const moreCell = (c: DocwinScene): HTMLElement | null => c.win.querySelector<HTMLElement>('.dw-items [data-id="zoom"] .dw-more');
/** The default window at `MINIMAL_WIDTH`: Zoom minimal in the title bar; returns its "+N" cell. */
function minimalZoom(c: DocwinScene): HTMLElement | null {
  c.setScene(sceneWith((s) => s, { width: MINIMAL_WIDTH, height: 640 }));
  return moreCell(c);
}
/** Opens a "+N" cell's popover with a pointer click; returns the controls it lists. */
function openMore(c: DocwinScene, more: HTMLElement): string[] {
  // A drag earlier in the same run may still swallow the click that follows its pointer-up: spend it on the window.
  c.win.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  more.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  return [...menuList(c).querySelectorAll<HTMLElement>("[data-hidden-control]")].map((b) => b.dataset.hiddenControl!);
}
const closeByOutsideClick = (c: DocwinScene): void => void c.win.querySelector(".dw-scroll")?.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));

/** The held copy at a stop: its form, whether it is at rest, the target its form follows and the target shown. */
type HeldAt = { readonly formKind: string; readonly axis: string; readonly settled: boolean; readonly target: string | null; readonly shown: string | null };
type FormStop = { readonly name: string; readonly p: Point; readonly formKind: string; readonly axis: "row" | "column" };

/**
 * Views' three form stops in the default window, each a point of its own over a target: a column gap (it lands
 * wrapped), the rail (icons down it), the top bar (a row); and a point off every target. A string when one is missing.
 */
function formStops(c: DocwinScene): { readonly stops: readonly FormStop[]; readonly off: Point } | string {
  const ts = c.targets("views").filter((t) => t.place.kind === "gap" || t.place.kind === "column" || t.place.kind === "rail");
  const own = c.layout.items.views?.edge;
  const find = (name: string, ok: (formKind: string, side: string) => boolean): FormStop | string => {
    for (const t of ts) {
      const a = t.after({ x: 0, y: 0 });
      const it = a.layout.items.views;
      const side = it?.edge ? a.layout.edges[it.edge]?.side : undefined;
      // Another edge than its own: a stop there is a change of edge (its own bar's gaps are home or nearby).
      if (!it || !side || it.inMenu || it.edge === own || !ok(it.formKind, side)) continue;
      const p = aim(c, "views", t);
      if (p) return { name, p, formKind: it.formKind, axis: side === "left" || side === "right" ? "column" : "row" };
    }
    return `No target gives Views its form for ${name}.`;
  };
  const col = find("a column gap", (k, s) => k === "wrap" && (s === "left" || s === "right"));
  const rail = find("the rail", (k, s) => k === "icons" && (s === "left" || s === "right"));
  const top = find("the top bar", (k, s) => k === "row" && s === "top");
  if (typeof col === "string") return col;
  if (typeof rail === "string") return rail;
  if (typeof top === "string") return top;
  // Off every target: the middle of the pages, where only the float target is.
  const content = c.layout.content;
  return { stops: [col, rail, top], off: { x: content.x + content.width / 2, y: content.y + content.height * 0.6 } };
}

/**
 * Hold `id` by mouse (pointerdown on its grip, then pointermoves `step` px apart, one frame each) through `stops`,
 * holding `hold` frames at each, then let go where it is. Every frame it reads the held copy: `onFrame` gets it and
 * the grip's drift from the pointer (px, against its offset at the lift). Counts the target changes, the form switches
 * and the frames on which the window's items were redrawn (DOM changes under `.dw-items`), and the most any form's
 * opacity changed from one frame to the next (`maxFade`; a hidden form counts as 0) and the most such a step went past
 * what its frame's time allows (`fadeOver`: above 0 is a pop).
 */
function heldSweep(
  c: DocwinScene,
  id: ItemId,
  stops: readonly { to: Point; step: number; hold: number }[],
  onFrame: (h: NonNullable<DocwinScene["held"]>, drift: number) => void,
): { lifted: boolean; atStops: HeldAt[]; home: { formKind: string; axis: string }; switches: number; targetChanges: number; redraws: number; maxFade: number; fadeOver: number } {
  const none = { lifted: false, atStops: [], home: { formKind: "", axis: "" }, switches: 0, targetChanges: 0, redraws: 0, maxFade: 0, fadeOver: 0 };
  const grip = c.win.querySelector<HTMLElement>(`.dw-items [data-id="${id}"] [data-grip], .dw-items [data-id="${id}"][data-grip]`);
  if (!grip) return none;
  const w = c.win.getBoundingClientRect();
  const g = grip.getBoundingClientRect();
  let at = { x: g.left + g.width / 2, y: g.top + g.height / 2 };
  const ev = (type: string, p: Point): PointerEvent => new PointerEvent(type, { clientX: p.x, clientY: p.y, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true });
  const items = c.win.querySelector(".dw-items") ?? c.win;
  const watch = new MutationObserver(() => undefined);
  watch.observe(items, { childList: true, subtree: true, attributes: true, characterData: true });
  c.drive(true);
  let now = performance.now();
  grip.dispatchEvent(ev("pointerdown", at));
  let base: Point | null = null;
  let target: string | null | undefined;
  let targetChanges = 0;
  let redraws = 0;
  let home = { formKind: "", axis: "" };
  /** Each form's opacity on the last frame (a form first seen counts as 0 before it: it starts hidden). */
  const shown = new Map<HTMLElement, number>();
  let maxFade = 0;
  /** The most a step went past what its frame allows: a fade's own step (its time, capped) and 0.01 for rounding. */
  let fadeOver = Number.NEGATIVE_INFINITY;
  const FRAME = 16;
  const allowed = Math.min(FRAME, FADE_DT_CAP) / FADE_MS + 0.01;
  const gripOff = (h: NonNullable<DocwinScene["held"]>, el: HTMLElement): Point | null => {
    const n = el.matches("[data-grip]") ? el : el.querySelector<HTMLElement>("[data-grip]");
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return { x: h.pointer.x - (r.left - w.left), y: h.pointer.y - (r.top - w.top) };
  };
  const tick = (): void => {
    if (!c.dragging) return;
    watch.takeRecords();
    c.frame((now += FRAME));
    if (watch.takeRecords().length > 0) redraws++;
    const h = c.held;
    if (!h) return;
    if (target === undefined) home = { formKind: h.formKind, axis: h.axis };
    else if (h.target !== target) targetChanges++;
    target = h.target;
    // Every form drawn now (heading in, fading out) keeps its grip where the pointer held it at the lift.
    let drift = 0;
    const first = shown.size === 0;
    for (const el of h.frame.querySelectorAll<HTMLElement>(":scope > .dw-item")) {
      // No form's opacity jumps: it fades from where it was (the first frame sets where each starts).
      const op = el.style.visibility === "hidden" ? 0 : Number(el.style.opacity || "1");
      if (!first) {
        const step = Math.abs(op - (shown.get(el) ?? 0));
        maxFade = Math.max(maxFade, step);
        fadeOver = Math.max(fadeOver, step - allowed);
      }
      shown.set(el, op);
      if (el.style.visibility === "hidden") continue;
      const off = gripOff(h, el);
      if (!off) continue;
      base ??= off;
      drift = Math.max(drift, Math.hypot(off.x - base.x, off.y - base.y));
    }
    onFrame(h, drift);
  };
  const atStops: HeldAt[] = [];
  for (const s of stops) {
    const end = { x: w.left + s.to.x, y: w.top + s.to.y };
    const n = Math.max(1, Math.ceil(Math.hypot(end.x - at.x, end.y - at.y) / s.step));
    for (let i = 1; i <= n; i++) {
      window.dispatchEvent(ev("pointermove", { x: at.x + ((end.x - at.x) * i) / n, y: at.y + ((end.y - at.y) * i) / n }));
      tick();
    }
    for (let k = 0; k < s.hold; k++) tick();
    at = end;
    const h = c.held;
    atStops.push(h ? { formKind: h.formKind, axis: h.axis, settled: h.settled, target: h.target, shown: c.shown?.id ?? null } : { formKind: "none", axis: "", settled: false, target: null, shown: null });
  }
  const switches = c.held?.switches ?? 0;
  const lifted = target !== undefined;
  // Let go off every target's form change: cancel, so the window is as it was.
  c.release(performance.now(), true);
  window.dispatchEvent(ev("pointerup", at));
  watch.disconnect();
  c.drive(false);
  return { lifted, atStops, home, switches, targetChanges, redraws, maxFade, fadeOver };
}

/** A window narrow enough that the title bar's toolbars, folded, still don't all fit: some go into its » menu. */
const MENU_WIDTH = 360;

/** Each item's step (its form index, past the last while in a menu) and edge, for the fit sweeps. */
interface FitState {
  readonly step: Record<string, number>;
  readonly edge: Record<string, string | null>;
}
function fitState(c: DocwinScene): FitState {
  const step: Record<string, number> = {};
  const edge: Record<string, string | null> = {};
  for (const [id, it] of Object.entries(c.layout.items)) {
    step[id] = it.inMenu ? 99 : it.form;
    edge[id] = it.floating ? "float" : (it.edge ?? null);
  }
  return { step, edge };
}
/** What a fit-sweep step breaks: clipping, overlap, unreachable items, a menu that isn't its items, edge jumps, the order. */
function fitIssues(c: DocwinScene, start: FitState, now: FitState, last: FitState, shrinking: boolean): string[] {
  const out: string[] = [];
  const l = c.layout;
  const ids = MOVABLE.filter((id) => !c.scene.items[id]!.closed);
  for (const id of ids) {
    const it = l.items[id];
    if (!it) {
      out.push(`${id} is nowhere`);
      continue;
    }
    if (now.edge[id] !== start.edge[id]) out.push(`${id} moved from ${start.edge[id]} to ${now.edge[id]}`);
    if (!it.inMenu && !it.rail) {
      const issue = clipped(c, id);
      if (issue) out.push(`${id} clipped: ${issue}`);
    }
    const grew = now.step[id]! < last.step[id]!;
    const shrank = now.step[id]! > last.step[id]!;
    if (shrinking && grew) out.push(`${id} stepped up while shrinking`);
    if (!shrinking && shrank && isGroup(id)) out.push(`${id} stepped down while growing`);
  }
  // No two docked items overlap.
  const docked = ids.filter((id) => l.items[id] && !l.items[id]!.floating && !l.items[id]!.inMenu);
  for (let i = 0; i < docked.length; i++)
    for (let j = i + 1; j < docked.length; j++) if (overlap(l.items[docked[i]!]!.rect, l.items[docked[j]!]!.rect) > 0.5) out.push(`${docked[i]} overlaps ${docked[j]}`);
  for (const [eid, e] of Object.entries(l.edges)) {
    const held = ids.filter((id) => l.items[id]?.edge === eid && l.items[id]!.inMenu);
    const listed = e.menu?.items ?? [];
    if ([...listed].sort().join() !== [...held].sort().join()) out.push(`${eid}'s menu lists [${listed.join(", ")}], holds [${held.join(", ")}]`);
    // Lowest priority first, the oldest first: a toolbar is down only while every toolbar of its edge with a lower
    // priority (or the same, used longer ago) has stepped down too, shrinking and, in the strict reverse, growing back.
    const bars = ids.filter((id) => isGroup(id) && l.items[id]?.edge === eid);
    const prio = (id: string): number => c.scene.items[id]!.priority ?? c.scene.edges.find((x) => x.id === eid)?.priority ?? 0;
    for (const id of bars) {
      if (now.step[id] === start.step[id]) continue;
      for (const other of bars) {
        const before = prio(other) < prio(id) || (prio(other) === prio(id) && c.scene.items[other]!.used < c.scene.items[id]!.used);
        if (before && now.step[other] !== 99 && now.step[other] === start.step[other]) out.push(`${id} stepped down before ${other}`);
      }
    }
  }
  return out;
}

/** The ink of an element's text: the union of its text nodes' rects (its padding and empty room left out). */
function ink(el: Element): { left: number; right: number } {
  const range = document.createRange();
  let left = Infinity;
  let right = -Infinity;
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let t = walk.nextNode(); t; t = walk.nextNode()) {
    if (!t.textContent?.trim()) continue;
    range.selectNodeContents(t);
    for (const r of range.getClientRects()) {
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
    }
  }
  if (!Number.isFinite(left)) {
    const b = el.getBoundingClientRect();
    return { left: b.left, right: b.right };
  }
  return { left, right };
}
/** How far an element's ink sits inside its box, each side. */
function inkInset(el: Element): { left: number; right: number } {
  const b = el.getBoundingClientRect();
  const i = ink(el);
  return { left: i.left - b.left, right: b.right - i.right };
}

/** The reported state: a 1200 px window, the title, Tools and Zoom leading and Views trailing in the title bar, Pages floating, Notes left, Findings right. */
function reportedTitle(): Scene {
  return sceneWith((s) => aligned(floating(put(s, "title", ["tools", "zoom", "views"]), "pages", { x: 420, y: 160, width: 260, height: 360 }), "views", "end"), { width: 1200, height: 640 });
}

/**
 * Whether item `id`'s drawn content leaves its box: the union of its buttons' and labels' rects (outside a panel's
 * scrolling body) against the box, and the box's scroll size against its size. Null when nothing is clipped.
 */
function clipped(c: DocwinScene, id: ItemId): string | null {
  const el = c.win.querySelector<HTMLElement>(`.dw-items [data-id="${id}"]`);
  if (!el) return "not drawn";
  const box = el.getBoundingClientRect();
  const parts = [...el.querySelectorAll<HTMLElement>("button, b, small, .dw-dots, .dw-badge, .dw-zv, .dw-n, .dw-w, .dw-cap, .dw-sep")].filter((x) => !x.closest(".dw-body"));
  const tol = 0.5;
  for (const p of parts) {
    const r = p.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.left < box.left - tol || r.top < box.top - tol || r.right > box.right + tol || r.bottom > box.bottom + tol)
      return `${p.className || p.tagName.toLowerCase()} at ${r0(r.left - box.left)},${r0(r.top - box.top)} ${r0(r.width)}×${r0(r.height)} outside the ${r0(box.width)}×${r0(box.height)} box`;
  }
  // The box's own scroll size (a panel's body scrolls inside it, which is fine).
  const body = el.querySelector(".dw-body");
  if (!body && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) return `its content is ${el.scrollWidth}×${el.scrollHeight}, its box ${el.clientWidth}×${el.clientHeight}`;
  return null;
}

/** The scene with `id` aligned to `align` (its zone). */
function aligned(s: Scene, id: ItemId, align: "start" | "center" | "end"): Scene {
  return { ...s, items: { ...s.items, [id]: { ...s.items[id]!, align } } };
}

/**
 * Drops `id` by mouse in the bar's third for `zone`, half way into the third, and checks it lands in that zone with the
 * slot equal to the landing, clear of the title's natural rect and the controls, at the zone's place: leading right
 * after the items before it, trailing right before the controls (or the bar's end), center at the bar's centre or the
 * free span's.
 */
function barZoneDrop(c: DocwinScene, id: ItemId, edge: EdgeId, zone: "start" | "center" | "end"): { ok: boolean; now: string } {
  const bar = c.layout.edges[edge]!.rect;
  const k = zone === "start" ? 0 : zone === "center" ? 1 : 2;
  // An empty bar: its zone strip (thirds of its strip along the content); else the bar's third.
  const strip = c.targets(id).find((t) => t.id === targetId({ kind: "strip", edge, zone }));
  const p = strip ? centre(strip.hit) : { x: bar.x + ((k + 0.5) * bar.width) / 3, y: bar.y + bar.height / 2 };
  const r = mouseDrag(c, id, p);
  const d = c.lastDrop;
  const l = c.layout.items[id];
  if (!r.lifted || !d || !d.committed || !d.landed || l?.edge !== edge) return { ok: false, now: `dropped on ${d?.target ?? "nothing"}, landed in ${l?.edge ?? "none"}` };
  const got = d.landed;
  const fixed = Object.keys(c.layout.items).filter((x) => c.layout.items[x]!.fixed && c.layout.items[x]!.edge === edge);
  const clear = fixed.every((f) => overlap(got, reservedRect(c.scene, c.layout, f)) === 0);
  const gap = c.edge(edge).gap ?? 0;
  const pad = c.edge(edge).pad ?? { start: 0, end: 0 };
  const others = Object.entries(c.layout.items).filter(([x, it]) => x !== id && it.edge === edge && !it.inMenu);
  const rectFor = (x: string, it: { fixed?: boolean; rect: Rect }): Rect => (it.fixed ? reservedRect(c.scene, c.layout, x) : it.rect);
  let placed = l.zone === zone && sameRect(d.preview, got);
  if (zone === "end") {
    const after = others.filter(([, it]) => it.rect.x >= got.x + got.width - 0.5).map(([x, it]) => rectFor(x, it).x);
    const limit = after.length ? Math.min(...after) - gap : bar.x + bar.width - (pad.end ?? 0);
    placed &&= Math.abs(got.x + got.width - limit) <= 0.5;
  } else if (zone === "start") {
    const before = others.filter(([, it]) => it.rect.x + it.rect.width <= got.x + 0.5).map(([x, it]) => { const q = rectFor(x, it); return q.x + q.width; });
    const limit = before.length ? Math.max(...before) + gap : bar.x + (pad.start ?? 0);
    placed &&= Math.abs(got.x - limit) <= 0.5;
  } else {
    const lo = Math.max(bar.x + (pad.start ?? 0), ...others.filter(([, it]) => it.zone === "start").map(([x, it]) => { const q = rectFor(x, it); return q.x + q.width + gap; }));
    const hi = Math.min(bar.x + bar.width - (pad.end ?? 0), ...others.filter(([, it]) => it.zone === "end").map(([x, it]) => rectFor(x, it).x - gap));
    const mid = bar.x + (bar.width - got.width) / 2;
    const want = mid >= lo - 0.5 && mid + got.width <= hi + 0.5 ? mid : (lo + hi - got.width) / 2;
    placed &&= Math.abs(got.x - want) <= 0.5;
  }
  return { ok: placed && clear, now: `${d.target} ${say(got)}${placed ? "" : " (off its zone's place)"}${clear ? "" : " (over a fixed item)"}` };
}

/** Each world: Tools into the bar's three zones by mouse. */
function zonesOfBar(c: DocwinScene, edge: EdgeId, worlds: [string, Scene][]): Verdict {
  const bad: string[] = [];
  const seen: string[] = [];
  for (const [world, base] of worlds) {
    for (const zone of ["start", "center", "end"] as const) {
      c.setScene(base);
      const r = barZoneDrop(c, "tools", edge, zone);
      seen.push(`${world}, ${zone}: ${r.now}`);
      if (!r.ok) bad.push(`${world}, ${zone}: ${r.now}`);
    }
  }
  return { pass: bad.length === 0, now: `${seen.join("; ")}.${bad.length ? ` Broken: ${bad.join("; ")}.` : ""}` };
}

// --- rail docking for panels ---------------------------------------------------------------------------------------------

/** One leg of a mouse gesture: glide to `to` (window px) `step` px per 16 ms frame, then rest `hold` ms. */
interface Leg {
  readonly to: Point;
  readonly step: number;
  readonly hold: number;
}
/** What the gesture saw on each frame: the target shown, and whether a rail strip was dwelt on or armed. */
interface Seen {
  readonly shown: string | null;
  readonly arming: boolean;
  readonly armed: boolean;
}

/**
 * A mouse gesture on the item's grip through the page's own pointer listeners, the modifier `keys` held on every event:
 * the legs in turn, frames driven by hand. Still down at the end: `up()` lets go where it is.
 */
function mouseGesture(c: DocwinScene, id: ItemId, legs: readonly Leg[], keys: { shiftKey?: boolean; altKey?: boolean } = {}): { lifted: boolean; seen: Seen[]; up: () => void } {
  const el = c.win.querySelector<HTMLElement>(`.dw-items [data-id="${id}"] [data-grip], .dw-items [data-id="${id}"][data-grip]`);
  if (!el) return { lifted: false, seen: [], up: () => undefined };
  const w = c.win.getBoundingClientRect();
  const g = el.getBoundingClientRect();
  let at = { x: g.left + g.width / 2, y: g.top + g.height / 2 };
  const ev = (type: string, p: Point): PointerEvent =>
    new PointerEvent(type, { clientX: p.x, clientY: p.y, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerType: "mouse", isPrimary: true, bubbles: true, cancelable: true, ...keys });
  const seen: Seen[] = [];
  let now = performance.now();
  const tick = (): void => {
    if (!c.dragging) return;
    c.frame((now += 16));
    const strips = [...c.stripLayer.querySelectorAll<HTMLElement>(".dw-railstrip")];
    seen.push({ shown: c.shown?.id ?? null, arming: strips.some((s) => s.hasAttribute("data-arming")), armed: strips.some((s) => s.hasAttribute("data-armed")) });
  };
  c.drive(true);
  el.dispatchEvent(ev("pointerdown", at));
  let lifted = false;
  for (const leg of legs) {
    const end = { x: w.left + leg.to.x, y: w.top + leg.to.y };
    const steps = Math.max(1, Math.ceil(Math.hypot(end.x - at.x, end.y - at.y) / leg.step));
    for (let i = 1; i <= steps; i++) {
      window.dispatchEvent(ev("pointermove", { x: at.x + ((end.x - at.x) * i) / steps, y: at.y + ((end.y - at.y) * i) / steps }));
      lifted ||= c.dragging;
      tick();
    }
    for (let k = 0; k < Math.round(leg.hold / 16); k++) tick();
    at = end;
  }
  return {
    lifted,
    seen,
    up: () => {
      window.dispatchEvent(ev("pointerup", at));
      c.drive(false);
    },
  };
}

/** The point at the middle of the right window edge's strip, and the content's middle. */
const rightStrip = (c: DocwinScene): Point => ({ x: c.scene.stage.width - 10, y: c.scene.stage.height / 2 });
const midContent = (c: DocwinScene): Point => centre(c.layout.content);
/** Whether Findings now lies collapsed in the right rail, the column closed down to the rail's width. */
const inRightRail = (c: DocwinScene): boolean => {
  const p = c.layout.items.findings;
  return !!p?.tab && p.edge === "right" && (c.layout.edges.right?.cross ?? 0) <= 30.5;
};
/** The last drop said in one line. */
const dropSaid = (c: DocwinScene): string => {
  const d = c.lastDrop;
  return d ? `${d.target ?? "nothing"}${d.committed ? "" : " (nothing committed)"}, slot ${d.preview ? say(d.preview) : "none"}, landed ${d.landed ? say(d.landed) : "none"}` : "no drop";
};
/** A drop that committed with its slot the landing (preview = landing). */
const landedOnSlot = (c: DocwinScene): boolean => !!c.lastDrop?.committed && sameRect(c.lastDrop.preview, c.lastDrop.landed);
/** The default feel with the panels' changed by `edit`. */
const panelFeel = (c: DocwinScene, edit: Partial<KindFeel>): DragFeel => ({ ...c.feel, panel: { ...c.feel.panel, ...edit } });

function RAIL_DOCK_PRESETS(): Preset[] {
  const fresh = (c: DocwinScene): void => c.reset();
  return [
    {
      id: "rail-dwell-pass-by",
      title: "A panel passing over the rail's strip stays a float",
      expected:
        "Findings dragged by mouse into the pages, then quickly to the right window edge and straight back (through the right rail's strip in about a tenth of a second) and dropped in the pages: the strip never arms (no rail shown), and the drop floats Findings where the preview showed it.",
      setup: fresh,
      check(c) {
        const m = mouseGesture(c, "findings", [
          { to: midContent(c), step: 6, hold: 120 },
          { to: { x: c.scene.stage.width - 6, y: c.scene.stage.height / 2 }, step: 12, hold: 0 },
          { to: midContent(c), step: 12, hold: 200 },
        ]);
        m.up();
        const railShown = m.seen.some((s) => s.shown?.startsWith("rail:") || s.armed);
        const ok = m.lifted && !railShown && c.lastDrop?.place === "float" && landedOnSlot(c);
        return { pass: ok, now: `${railShown ? "The rail armed on the way. " : "The rail never armed. "}Drop: ${dropSaid(c)}.` };
      },
    },
    {
      id: "rail-dwell-arms",
      title: "A panel held still on the rail's strip arms it; the drop collapses it there",
      expected:
        "Findings dragged by mouse onto the right rail's strip: the strip shows at the rail's width, highlights at once and, after a 200 ms dwell, arms (grows 6 px inward, the preview the folded tile in the rail, \"release to collapse it into the right rail\" said in the live region); the drop collapses Findings into the right rail, on its slot. A drop there before the dwell is over floats it instead.",
      setup: fresh,
      check(c) {
        const out: string[] = [];
        let ok = true;
        // Before the dwell: a quick glide in and a short rest, then the drop.
        const early = mouseGesture(c, "findings", [{ to: rightStrip(c), step: 14, hold: 48 }]);
        early.up();
        const floated = c.lastDrop?.place === "float" && !early.seen.some((s) => s.armed);
        ok &&= floated;
        out.push(`dropped before the dwell: ${dropSaid(c)}`);
        c.reset();
        const m = mouseGesture(c, "findings", [{ to: rightStrip(c), step: 6, hold: 360 }]);
        const strip = c.stripLayer.querySelector<HTMLElement>('.dw-railstrip[data-side="right"]');
        // The width it is drawn at (its transition may still run).
        const width = parseFloat(strip?.style.width ?? "0");
        const firstArming = m.seen.findIndex((s) => s.arming);
        const firstArmed = m.seen.findIndex((s) => s.armed);
        const said = c.win.ownerDocument.getElementById("dw-status")?.textContent ?? "";
        m.up();
        const armedOk = firstArming >= 0 && firstArmed > firstArming && Math.abs(width - 36) <= 1 && /release to collapse it into the right rail/.test(said);
        ok &&= armedOk && inRightRail(c) && landedOnSlot(c);
        out.push(`held: highlighted at frame ${firstArming}, armed at frame ${firstArmed}, armed strip ${r0(width)} px, said "${said}"; drop ${dropSaid(c)}`);
        return { pass: ok, now: `${out.join("; ")}.` };
      },
    },
    {
      id: "rail-shift-floats",
      title: "Shift floats a panel even on the rail's strip",
      expected: "Findings dragged by mouse with Shift held onto the right rail's strip and held there past the dwell: the strip never arms, the preview is the float, and the drop floats Findings where the preview showed it.",
      setup: fresh,
      check(c) {
        const m = mouseGesture(c, "findings", [{ to: rightStrip(c), step: 6, hold: 400 }], { shiftKey: true });
        m.up();
        const armed = m.seen.some((s) => s.armed || s.shown?.startsWith("rail:"));
        const ok = !armed && c.lastDrop?.place === "float" && landedOnSlot(c);
        return { pass: ok, now: `${armed ? "The rail armed. " : ""}Drop: ${dropSaid(c)}.` };
      },
    },
    {
      id: "rail-alt-from-content",
      title: "Alt collapses a panel into the nearest rail from mid-content",
      expected: "Findings dragged by mouse with Alt held into the pages, 300 px from the right window edge (nowhere near it, nearer the right than the left): the preview is its folded tile in the nearest rail (the right one), and the drop collapses it there, on its slot.",
      setup: fresh,
      check(c) {
        const m = mouseGesture(c, "findings", [{ to: { x: c.scene.stage.width - 300, y: c.scene.stage.height / 2 }, step: 6, hold: 120 }], { altKey: true });
        m.up();
        const ok = c.lastDrop?.place === "rail" && inRightRail(c) && landedOnSlot(c);
        return { pass: ok, now: `Drop: ${dropSaid(c)}.` };
      },
    },
    {
      id: "rail-off-cleanly",
      title: "Strip width 0, or never shown, turns rail docking off with no dead target",
      expected:
        "With the panels' strip width set to 0, and again with the strip never shown: Findings has no rail target, no strip is drawn while it is held at the right window edge past the dwell, and the drop there is a float or home, never the rail.",
      setup: fresh,
      check(c) {
        const out: string[] = [];
        let ok = true;
        for (const [name, edit] of [
          ["width 0", { railStripWidth: 0 }],
          ['"never"', { railVisibility: "never" as const }],
        ] as const) {
          c.reset();
          c.setFeel(panelFeel(c, edit));
          const rails = c.targets("findings").filter((t) => t.place.kind === "rail" || !!t.strip);
          const m = mouseGesture(c, "findings", [{ to: rightStrip(c), step: 6, hold: 400 }]);
          const drawn = c.stripLayer.childElementCount;
          m.up();
          const pass = rails.length === 0 && drawn === 0 && c.lastDrop?.place !== "rail" && !m.seen.some((s) => s.arming || s.armed);
          ok &&= pass;
          out.push(`${name}: ${rails.length} rail targets, ${drawn} strips drawn, drop ${dropSaid(c)}`);
        }
        return { pass: ok, now: `${out.join("; ")}.` };
      },
    },
    {
      id: "rail-reduced-motion",
      title: "Under reduced motion the armed strip grows with no animation",
      expected: "Findings held on the right rail's strip past the dwell: with reduced motion the armed strip is 6 px wider at once, with no transition; with motion it grows with a short transition.",
      setup: fresh,
      check(c) {
        const out: string[] = [];
        let ok = true;
        for (const reduced of [true, false]) {
          c.reset();
          c.setReducedMotion(reduced);
          const m = mouseGesture(c, "findings", [{ to: rightStrip(c), step: 6, hold: 360 }]);
          const strip = c.stripLayer.querySelector<HTMLElement>('.dw-railstrip[data-armed]');
          const durations = strip ? getComputedStyle(strip).transitionDuration.split(",").map((s) => parseFloat(s)) : [];
          const width = parseFloat(strip?.style.width ?? "0");
          endDrag(c);
          m.up();
          const still = durations.length > 0 && durations.every((d) => d === 0);
          ok &&= !!strip && Math.abs(width - 36) <= 1 && (reduced ? still : !still);
          out.push(`${reduced ? "reduced" : "with motion"}: ${strip ? `armed, ${r0(width)} px, transition ${durations.join("/")} s` : "never armed"}`);
        }
        c.setReducedMotion(false);
        return { pass: ok, now: `${out.join("; ")}.` };
      },
    },
    {
      id: "rail-findings-alone",
      title: "Findings alone on the right reaches the rail by a dwell or by Alt; the column closes",
      expected:
        "Findings alone in the right column, dragged by mouse to the right window edge: held still there, it arms and the drop collapses it into the right rail; with Alt held, the same from anywhere. Each time the right column closes down to the 30 px rail holding Findings' folded tile, on the slot the preview showed.",
      setup: fresh,
      check(c) {
        const out: string[] = [];
        let ok = true;
        for (const way of ["dwell", "Alt"] as const) {
          c.reset();
          const m = mouseGesture(c, "findings", [{ to: way === "dwell" ? rightStrip(c) : { x: c.scene.stage.width - 120, y: c.scene.stage.height / 2 }, step: 6, hold: way === "dwell" ? 360 : 120 }], way === "Alt" ? { altKey: true } : {});
          m.up();
          const pass = inRightRail(c) && landedOnSlot(c);
          ok &&= pass;
          out.push(`${way}: ${dropSaid(c)}, right column ${r0(c.layout.edges.right?.cross ?? 0)} px`);
        }
        return { pass: ok, now: `${out.join("; ")}.` };
      },
    },
    {
      id: "rail-keyboard-move",
      title: "The keyboard path: the panel menu's \"Move to › Rail\"",
      expected:
        "Findings' header has a ⋯ menu button; pressed from the keyboard it lists \"Move to › Rail (left)\" and \"Move to › Rail (right)\" (the left one collapses it in the left column, beside its open panels, as a header) and focuses the first; choosing the right one collapses Findings into the right rail, as the drop does.",
      setup: fresh,
      check(c) {
        const btn = c.win.querySelector<HTMLElement>('[data-pmenu="findings"]');
        if (!btn) return { pass: false, now: "Findings' header has no menu button." };
        // A drag's pointer-up swallows the click that follows it (until its timer runs, which a synchronous check never
        // lets happen): a click on the window's frame first takes it.
        c.win.click();
        btn.click();
        const items = [...c.win.querySelectorAll<HTMLElement>(".dw-menu-list [data-move-rail]")];
        const words = items.map((b) => `${b.textContent}${b.getAttribute("aria-disabled") === "true" ? " (unavailable)" : ""}`);
        const focused = (c.win.ownerDocument.activeElement as HTMLElement | null)?.dataset.moveRail ?? "none";
        items.find((b) => b.dataset.moveRail === "findings:right")?.click();
        const ok = words.join() === "Move to › Rail (left),Move to › Rail (right)" && focused === "findings:left" && inRightRail(c);
        return { pass: ok, now: `Menu: ${words.join(", ") || "none"}; focus on ${focused}; Findings ${inRightRail(c) ? "in the right rail" : "not in the right rail"}.` };
      },
    },
    {
      id: "rail-toolbars-untouched",
      title: "Changing every panel setting leaves the toolbars' aim order as it was",
      expected:
        "With every panel setting changed (strip 48 px, always shown, magnet 20, no float near the edge, no dwell, keys off), the toolbars' aim-order sweep still passes every drop on every edge kind (72 of 72 from outside and direct), as with the defaults.",
      setup: fresh,
      check(c) {
        const sweep = PRESETS.find((p) => p.id === "aim-order-sweep")!;
        c.setFeel(panelFeel(c, { railStripWidth: 48, railVisibility: "always", magnet: 20, floatNearEdge: false, railArmDwellMs: 0, modifiers: { on: false, floatKey: "Shift", railKey: "Alt" } }));
        sweep.setup(c);
        const v = sweep.check(c);
        return { pass: v.pass, now: v.now };
      },
    },
  ];
}
