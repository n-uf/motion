/**
 * The document window's presets: each sets the window up for one real docking case, says what should happen, and
 * checks it on the live scene ("Now"). They are the Scene's acceptance cases: every check reads what `solve` and
 * `targets` give and what the page draws from them. A preset whose rule the Scene doesn't have yet names it in `lacks`
 * and is expected to be red until the rule lands: the page never fakes it.
 */
import type { Point, Rect } from "@n-uf/placement";
import { lift, moveTo, reservedRect, solve, type Scene, type SceneTarget } from "@n-uf/placement/scene";
import { wrapCross } from "@n-uf/placement/stack";
import { DEFAULT_SIZE, ages, defaultScene, edgeOf, floating, put, type EdgeId, type ItemId } from "./model";
import type { DocwinScene } from "./scene";
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

const overlap = (a: Rect, b: Rect): number => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
const inside = (r: Rect, p: Point): boolean => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
const sameRect = (a: Rect | null | undefined, b: Rect | null | undefined, eps = 0.5): boolean =>
  !!a && !!b && Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps && Math.abs(a.width - b.width) <= eps && Math.abs(a.height - b.height) <= eps;
const r0 = (n: number): number => Math.round(n);
const say = (r: Rect): string => `${r0(r.x)},${r0(r.y)} ${r0(r.width)}×${r0(r.height)}`;
const centre = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

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

const endDrag = (c: DocwinScene): void => {
  c.release(performance.now(), true);
  c.drive(false);
};

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
    expected: "In a short window the panel used longest ago (Pages) folds to its header first; in a narrow one the oldest group (Zoom) folds first in the bottom bar.",
    setup: (c) =>
      c.setScene(
        sceneWith(
          (s) => ages(put(put(s, "left", ["pages", "notes", "findings"]), "bottom", ["views", "zoom", "review"]), ["zoom", "pages", "notes", "findings", "views", "review"]),
          { width: 700, height: 464 },
        ),
      ),
    check(c) {
      const l = firstFold(c, "left");
      const b = firstFold(c, "bottom");
      return { pass: l === "pages" && b === "zoom", now: `First to fold: ${l} in the left column, ${b} in the bottom bar.` };
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
    setup: (c) => c.setScene(defaultScene()),
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
      "With the top bar empty, a group's drag shows the top bar's drop strip along the top of the content, and it never swallows a gap: the strip's hit overlaps no gap's hit, and every gap (the columns' trays, the bars' gaps) has a point of its own a drop can reach.",
    setup: (c) => c.setScene(defaultScene()),
    check(c) {
      const ts = c.targets("views");
      const strip = ts.find((t) => t.id === "strip:top");
      if (!strip) return { pass: false, now: `No strip for the empty top bar: ${ts.map((t) => t.id).join(", ")}.` };
      const bad: string[] = [];
      const gapTs = ts.filter((t) => t.id.startsWith("gap:"));
      for (const g of gapTs) if (overlap(strip.hit, g.hit) > 0) bad.push(`the strip covers ${g.id}`);
      for (const g of gapTs) if (!aim(c, "views", g)) bad.push(`${g.id} has no point of its own`);
      if (!gapTs.some((g) => g.id.startsWith("gap:left:")) || !gapTs.some((g) => g.id.startsWith("gap:right:"))) bad.push("no gap in a column's tray");
      return { pass: bad.length === 0, now: `strip:top ${say(strip.hit)}; ${gapTs.map((g) => `${g.id} ${say(g.hit)}`).join("; ")}.${bad.length ? ` Broken: ${bad.join("; ")}.` : ""}` };
    },
  },
  {
    id: "empty-side-choice",
    title: "An empty side: a group gets the rail, a panel the column",
    expected:
      "With every panel in the left column, the right side is empty. A group's drag there gets only the window-edge rail's strip (it becomes a 30 px icon rail, never a column with one toolbar); a panel's drag gets only the column's strip. One strip per drag kind, never two side by side.",
    setup: (c) => c.setScene(sceneWith((s) => put(s, "left", ["pages", "notes", "findings"]))),
    check(c) {
      const strips = (id: ItemId): string[] => c.targets(id).filter((t) => t.id.startsWith("strip:") && (t.place as { edge?: string }).edge?.includes("right")).map((t) => t.id);
      const group = strips("views");
      const panel = strips("notes");
      const ok = group.length === 1 && group[0] === "strip:rail-right" && panel.length === 1 && panel[0] === "strip:right";
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
        const spots: [string, Point, "start" | "center" | "end"][] = [
          ["top", { x, y: rail.y + 6 }, "start"],
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
        // The window as it is while the item is held (lifted out): that is what the pointer moves over.
        const held = solve(lift(c.scene, id), { previous: c.layout });
        for (const e of c.scene.edges) {
          if (!e.accepts.includes(kind)) continue;
          const l = held.edges[e.id];
          if (!l || l.rect.width <= 0 || l.rect.height <= 0) continue;
          const items = Object.entries(held.items).filter(([iid, p]) => p.edge === e.id && iid !== id);
          const solid = items.filter(([iid, p]) => p.fixed && iid !== "title").map(([, p]) => p.rect);
          const bodies = items.filter(([, p]) => p.formKind === "open").map(([, p]) => p.rect);
          // A toolbar's drag in a panel column: only the tray, below the panels.
          const panelsEnd = e.zoneAccepts && !e.zoneAccepts.start?.includes(kind) ? Math.max(-Infinity, ...items.filter(([, p]) => p.kind === "panel").map(([, p]) => p.rect.y + p.rect.height)) : -Infinity;
          // Its gaps, a gap at the item's own place (shown as home) included.
          const mine = ts.filter((t) => t.id.startsWith(`gap:${e.id}:`) || t.id === `strip:${e.id}`);
          const deadAt: string[] = [];
          let dead = 0;
          for (let x = l.rect.x + 4; x < l.rect.x + l.rect.width; x += 8)
            for (let y = l.rect.y + 4; y < l.rect.y + l.rect.height; y += 8) {
              const p = { x, y };
              // Past a fixed item that ends the edge (the controls, before the bar's end padding) nothing can go.
              const pastEnd = solid.some((s) => (l.side === "left" || l.side === "right" ? y >= s.y + s.height : x >= s.x + s.width) && !items.some(([, q]) => (l.side === "left" || l.side === "right" ? q.rect.y >= s.y + s.height : q.rect.x >= s.x + s.width)));
              if (pastEnd || solid.some((s) => inside(s, p)) || bodies.some((b) => inside(b, p)) || y <= panelsEnd) continue;
              n++;
              if (!mine.some((t) => inside(t.hit, p))) {
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
      const t = c.targets("views").find((x) => x.id === "strip:rail-left");
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
];
