/**
 * The Panels pages' scripted scenarios, on `window.__motionLab.runAll(filter?)`. Each drives the desk with real pointer
 * and key events (or its sliders), samples what the page drew frame by frame, and checks the rules from it: where
 * items settled, that no move overshot or turned back, what folded, where a drop landed against what showed.
 * The Options page runs the scenarios named "options: …", the Defaults page the rest.
 */
import type { Rect } from "@n-uf/motion";
import { checkMonotonic, checkNoOvershoot, type RectSample } from "@n-uf/motion/testing";
import { dock, storePanels, toggleFold, type Clock, type GiveWay } from "@n-uf/placement/panels";
import { verdict, type Row } from "../shared/checks";
import { nextFrame, type Point } from "../shared/geometry";
import { passes, type LabRun, type ScenarioFilter } from "../shared/hooks";
import { DEFAULT_W, page, startState, type PanelsPage } from "./panels";

type Page = PanelsPage;
interface Scenario {
  readonly name: string;
  readonly modes: readonly string[];
  run(p: Page, mode: string): Promise<Row[]>;
}

// --- driving the page ----------------------------------------------------------------------------------------------

let at: Point = { x: 0, y: 0 };
function pointer(p: Page, type: string, q: Point, target: EventTarget = window): void {
  const r = p.stage.getBoundingClientRect();
  at = q;
  target.dispatchEvent(
    new PointerEvent(type, { clientX: r.left + p.stage.clientLeft + q.x, clientY: r.top + p.stage.clientTop + q.y, bubbles: true, cancelable: true, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerId: 1, isPrimary: true, pointerType: "mouse" }),
  );
}
const frames = async (n: number): Promise<void> => {
  for (let i = 0; i < n; i++) await nextFrame();
};
async function glide(p: Page, to: Point, step: number): Promise<void> {
  const from = at;
  const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / step));
  for (let i = 1; i <= n; i++) {
    pointer(p, "pointermove", { x: from.x + ((to.x - from.x) * i) / n, y: from.y + ((to.y - from.y) * i) / n });
    await nextFrame();
  }
}
/** Fly most of the way, then aim: the last 24 px slowly. */
async function approach(p: Page, to: Point): Promise<void> {
  const d = Math.hypot(to.x - at.x, to.y - at.y);
  if (d > 24) await glide(p, { x: to.x - ((to.x - at.x) * 24) / d, y: to.y - ((to.y - at.y) * 24) / d }, 14);
  await glide(p, to, 2);
}
async function until(cond: () => boolean, max = 90): Promise<boolean> {
  for (let i = 0; i < max; i++) {
    if (cond()) return true;
    await nextFrame();
  }
  return cond();
}
/** An element's rect on the stage, as drawn (stage px). */
function drawnRect(p: Page, el: Element): Rect {
  const s = p.stage.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left - s.left - p.stage.clientLeft, y: r.top - s.top - p.stage.clientTop, width: r.width, height: r.height };
}
const itemEl = (p: Page, id: string): HTMLElement => p.items.get(id)!.el;
const centreOf = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const headOf = (p: Page, id: string): { el: Element; at: Point } => {
  const r = drawnRect(p, itemEl(p, id));
  return { el: itemEl(p, id).querySelector(".pn-head")!, at: { x: r.x + 40, y: r.y + 14 } };
};
async function pressAt(p: Page, h: { el: Element; at: Point }): Promise<void> {
  pointer(p, "pointerdown", h.at, h.el);
  await nextFrame();
}
async function release(p: Page): Promise<void> {
  pointer(p, "pointerup", at);
  await nextFrame();
}
const settled = async (p: Page): Promise<void> => {
  await nextFrame();
  await p.motion.idle();
  await nextFrame();
};
const near = (a: Rect, b: Rect, tol = 1.5): boolean => Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.width - b.width) <= tol && Math.abs(a.height - b.height) <= tol;
const fmt = (r: Rect | null | undefined): string => (r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)} × ${Math.round(r.height)}` : "none");
const row = (name: string, failures: string[], info?: string): Row => ({ name, result: verdict(failures), ...(info ? { info } : {}) });
const key = (target: EventTarget, k: string): void => {
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
};

/** Where the page showed the slot: the indicator's outline, or the held panel sitting in it (snap). */
async function shownSlot(p: Page, id: string): Promise<{ rect: Rect | null; how: string }> {
  const ok = await until(() => !p.ind.hidden || !!p.dragging?.snapped, 120);
  if (!ok) return { rect: null, how: "nothing showed" };
  if (!p.ind.hidden) {
    await frames(2);
    return { rect: drawnRect(p, p.ind), how: "indicator" };
  }
  const m = p.items.get(id)!.m;
  await until(() => near(m.drawn, m.target, 0.3), 90);
  return { rect: drawnRect(p, itemEl(p, id)), how: "the panel in its slot" };
}

/**
 * Run `act`, sampling every shown item's drawn rect each frame until everything rests; rows: each move never
 * overshoots and closes in from one side.
 */
async function sampled(p: Page, act: () => void | Promise<void>): Promise<Row[]> {
  const ids = [...p.items.keys()];
  const samples = new Map<string, RectSample[]>(ids.map((id) => [id, [{ t: performance.now(), rect: { ...p.items.get(id)!.m.drawn } }]]));
  const stop = p.motion.onFrame(() => {
    for (const id of ids) samples.get(id)!.push({ t: performance.now(), rect: { ...p.items.get(id)!.m.drawn } });
  });
  await act();
  await settled(p);
  stop();
  const over: string[] = [];
  const mono: string[] = [];
  let moved = 0;
  for (const id of ids) {
    const m = p.items.get(id)!.m;
    if (!m.showing) continue;
    const s = samples.get(id)!;
    const from = s[0]!.rect;
    const to = { ...m.target };
    if (near(from, to, 0.5)) continue;
    moved++;
    over.push(...checkNoOvershoot(s, from, to).failures.map((f) => `${id}: ${f}`));
    mono.push(...checkMonotonic(s, to).failures.map((f) => `${id}: ${f}`));
  }
  return [row("every move settles without overshoot (frame-sampled)", over, `${moved} items moved`), row("every move closes in from one side (frame-sampled)", mono)];
}

/** Known ages: Inspector is the oldest used and the newest opened; History the newest used and the oldest opened. */
const CLOCK: Record<string, Clock> = {
  files: { opened: 3, used: 6 },
  outline: { opened: 4, used: 5 },
  notes: { opened: 5, used: 4 },
  inspector: { opened: 9, used: 1 },
  history: { opened: 1, used: 10 },
  comments: { opened: 2, used: 2 },
  navigator: { opened: 2, used: 3 },
};
/** One column must fold here (the minimums and the pages need 1090 px; folding any one leaves enough). */
const ONE_FOLD = 1060;
const autoFolded = (p: Page): string[] =>
  p
    .lay()
    .columns.filter((c) => c.folded === "auto")
    .flatMap((c) => c.panels);
const railIds = (p: Page, side: "left" | "right"): string[] => [...itemEl(p, `rail:${side}`).querySelectorAll<HTMLElement>(".pn-seg")].map((b) => b.dataset.id!);

// --- the scenarios -------------------------------------------------------------------------------------------------

const COMBOS: Record<string, { giveWay: GiveWay; folds: string }> = {
  "oldest by use": { giveWay: { order: "oldest", by: "used" }, folds: "inspector" },
  "oldest by opening": { giveWay: { order: "oldest", by: "opened" }, folds: "history" },
  "newest by use": { giveWay: { order: "newest", by: "used" }, folds: "history" },
  "newest by opening": { giveWay: { order: "newest", by: "opened" }, folds: "inspector" },
};

const giveWayCombos: Scenario = {
  name: "options: give-way folds the right column the policy picks",
  modes: Object.keys(COMBOS),
  async run(p, mode) {
    const c = COMBOS[mode]!;
    p.setOptions({ order: c.giveWay.order, by: c.giveWay.by });
    p.setClock(CLOCK);
    await settled(p);
    const motion = await sampled(p, () => p.setWidth(ONE_FOLD));
    const folded = autoFolded(p);
    const pages = drawnRect(p, itemEl(p, "pages"));
    const shown = p.items.get(c.folds)!.m.showing;
    const out = [
      row(`${c.folds} (and only it) folds to the rail`, folded.length === 1 && folded[0] === c.folds ? [] : [`folded ${folded.join(", ") || "nothing"}`]),
      row("its rail segment shows, the panel doesn't", railIds(p, "right").includes(c.folds) && !shown ? [] : [`right rail [${railIds(p, "right").join(", ")}], panel shown ${shown}`]),
      row("the pages keep at least 320 px", pages.width >= 319.5 ? [] : [`pages ${fmt(pages)}`], `${Math.round(pages.width)} px`),
      ...motion,
    ];
    const back = await sampled(p, () => p.setWidth(DEFAULT_W));
    out.push(row("widening brings it back (folded was never written)", autoFolded(p).length === 0 && p.items.get(c.folds)!.m.showing && p.state.folded.length === 0 ? [] : [`still folded: ${autoFolded(p).join(", ")}`]));
    out.push(...back.map((r) => ({ ...r, name: `back: ${r.name}` })));
    return out;
  },
};

const keptOutlives: Scenario = {
  name: "keep open: a kept column outlives the unkept ones, until the pages need it",
  modes: ["oldest by use"],
  async run(p) {
    p.setClock(CLOCK);
    await settled(p);
    // Inspector is the oldest used: kept, it is skipped, and Notes (the oldest unkept) folds instead.
    (itemEl(p, "inspector").querySelector(".pn-keep") as HTMLButtonElement).click();
    await settled(p);
    const keptOn = p.state.kept.includes("inspector") && itemEl(p, "inspector").querySelector(".pn-keep")!.getAttribute("aria-pressed") === "true";
    const motion = await sampled(p, () => p.setWidth(ONE_FOLD));
    const first = autoFolded(p);
    const inspectorOpen = p.items.get("inspector")!.m.showing;
    await sampled(p, () => p.setWidth(560));
    const l = p.lay();
    const kf = l.notes.filter((n) => n.code === "kept-folded");
    return [
      row("the keep button marks Inspector kept open", keptOn ? [] : ["not kept"]),
      row("Notes folds, not the older Inspector", first.length === 1 && first[0] === "notes" && inspectorOpen ? [] : [`folded ${first.join(", ")}; Inspector shown ${inspectorOpen}`]),
      row("pagesMin still wins: the kept column folds last, with its own note", kf.length === 1 && l.pages.width >= 320 && !p.items.get("inspector")!.m.showing ? [] : [`kept-folded notes ${kf.length}, pages ${Math.round(l.pages.width)} px`]),
      ...motion,
    ];
  },
};

const clamp: Scenario = {
  name: "clamp: floats stay in view as the viewport shrinks, and return on regrow",
  modes: ["clamp"],
  async run(p) {
    const before = { comments: drawnRect(p, itemEl(p, "comments")), navigator: drawnRect(p, itemEl(p, "navigator")) };
    const motion = await sampled(p, () => p.setWidth(700));
    const small = { comments: drawnRect(p, itemEl(p, "comments")), navigator: drawnRect(p, itemEl(p, "navigator")) };
    const inside = (r: Rect): boolean => r.x >= -0.5 && r.y >= -0.5 && r.x + r.width <= 700.5 && r.y + r.height <= p.lay().pages.height + 0.5;
    await sampled(p, () => p.setWidth(DEFAULT_W));
    const after = { comments: drawnRect(p, itemEl(p, "comments")), navigator: drawnRect(p, itemEl(p, "navigator")) };
    return [
      row("both floats lie wholly inside the narrow view", inside(small.comments) && inside(small.navigator) ? [] : [`Comments ${fmt(small.comments)}, Navigator ${fmt(small.navigator)}`]),
      row("they moved (the clamp acted)", !near(small.comments, before.comments) && !near(small.navigator, before.navigator) ? [] : ["a float didn't move"]),
      row("the stored rects are untouched", p.state.floats.find((f) => f.id === "comments")!.rect.x === 580 ? [] : ["the state changed"]),
      row("regrown, they return where they were", near(after.comments, before.comments) && near(after.navigator, before.navigator) ? [] : [`Comments ${fmt(after.comments)} vs ${fmt(before.comments)}`]),
      ...motion,
    ];
  },
};

const free: Scenario = {
  name: "options: free floats stay where they are, off-screen",
  modes: ["free"],
  async run(p) {
    p.setOptions({ floats: "free" });
    await settled(p);
    const before = drawnRect(p, itemEl(p, "comments"));
    await sampled(p, () => p.setWidth(700));
    const after = drawnRect(p, itemEl(p, "comments"));
    return [
      row("Comments didn't move", near(before, after) ? [] : [`${fmt(before)} → ${fmt(after)}`]),
      row("it reaches past the view's edge", after.x + after.width > 700.5 ? [] : [`${fmt(after)} is inside 700 px`]),
    ];
  },
};

const pinned: Scenario = {
  name: "pinned: Navigator stays put while the page scrolls; Comments moves with it",
  modes: ["pan"],
  async run(p) {
    const nav = p.items.get("navigator")!.m;
    const com = p.items.get("comments")!.m;
    const nav0 = { ...nav.drawn };
    const com0 = { ...com.drawn };
    const moved: string[] = [];
    for (let y = 0; y >= -120; y -= 8) {
      p.setPan(y);
      await nextFrame();
      if (!near(nav.drawn, nav0, 0.01)) moved.push(`at ${y} px Navigator at ${fmt(nav.drawn)}`);
    }
    await settled(p);
    const com1 = drawnRect(p, itemEl(p, "comments"));
    return [
      row("the pinned float never moved, frame by frame", moved.slice(0, 3)),
      row("the unpinned float moved up with the page", Math.abs(com1.y - (com0.y - 120)) < 1.5 && Math.abs(com1.x - com0.x) < 1.5 ? [] : [`${fmt(com0)} → ${fmt(com1)}`]),
    ];
  },
};

const dropShown: Scenario = {
  name: "drag: a panel lands where its slot showed, with its own width",
  modes: ["snap"],
  async run(p) {
    const id = "outline";
    await pressAt(p, headOf(p, id));
    // The line inside History, on the right: a new innermost right column.
    const hist = drawnRect(p, itemEl(p, "history"));
    await approach(p, { x: hist.x, y: 260 });
    const shown = await shownSlot(p, id);
    const m = p.items.get(id)!.m;
    const samples: RectSample[] = [{ t: performance.now(), rect: { ...m.drawn } }];
    const stop = p.motion.onFrame(() => samples.push({ t: performance.now(), rect: { ...m.drawn } }));
    await release(p);
    await settled(p);
    stop();
    const landed = drawnRect(p, itemEl(p, id));
    const d = p.lastDrop;
    return [
      row("the page showed a slot", shown.rect ? [] : ["nothing showed while aiming"], shown.how),
      row("it landed where the slot showed", shown.rect && near(landed, shown.rect) ? [] : [`showed ${fmt(shown.rect)}, landed ${fmt(landed)}`], fmt(landed)),
      row("it landed on the target the page showed", d && d.landed === d.shownAtRelease && d.landed === "column:right:2" ? [] : [`landed ${d?.landed ?? "home"}, showed ${d?.shownAtRelease ?? "nothing"}`]),
      row("the new column has the panel's own width (200 px)", Math.abs(landed.width - 200) < 1 ? [] : [`${Math.round(landed.width)} px`]),
      row("the landing never overshoots (frame-sampled)", [...checkNoOvershoot(samples, samples[0]!.rect, { ...m.target }).failures]),
    ];
  },
};

const ownPlace: Scenario = {
  name: "drag: back on its own place, a release changes nothing",
  modes: ["snap"],
  async run(p) {
    const before = p.layoutNow().rects;
    const h = headOf(p, "notes");
    await pressAt(p, h);
    await glide(p, { x: h.at.x + 60, y: h.at.y + 40 }, 3);
    await glide(p, h.at, 3);
    await frames(12);
    await release(p);
    await settled(p);
    const d = p.lastDrop;
    const after = p.layoutNow().rects;
    const off = [...before].filter(([k, r]) => !near(r, after.get(k)!, 0.01)).map(([k]) => k);
    return [row("no drop (home)", d && d.landed === null && !d.changed ? [] : [`landed ${d?.landed}`]), row("every item is where it was", off.length ? [`moved: ${off.join(", ")}`] : [])];
  },
};

const escape: Scenario = {
  name: "drag: Escape restores the layout",
  modes: ["snap"],
  async run(p) {
    const ids = [...p.items.keys()];
    const before = new Map(ids.map((k) => [k, { ...p.items.get(k)!.m.drawn }]));
    const s0 = p.state;
    await pressAt(p, headOf(p, "files"));
    const hist = drawnRect(p, itemEl(p, "history"));
    await approach(p, { x: hist.x + hist.width / 2, y: 300 });
    const roomed = await until(() => !!p.dragging?.snapped, 120);
    key(window, "Escape");
    await release(p);
    await settled(p);
    const off = ids.filter((k) => p.items.get(k)!.m.showing && !near(before.get(k)!, p.items.get(k)!.m.drawn, 0.5));
    return [
      row("the room opened before Escape", roomed ? [] : ["no slot opened"]),
      row("Escape cancels: the state is the same", p.state === s0 && p.lastDrop?.cancelled ? [] : ["the state changed"]),
      row("every item is back where it was", off.length ? [`off: ${off.map((k) => `${k} ${fmt(p.items.get(k)!.m.drawn)}`).join("; ")}`] : []),
    ];
  },
};

const tearOff: Scenario = {
  name: "drag: tear off to float, then dock back",
  modes: ["snap"],
  async run(p) {
    await pressAt(p, headOf(p, "files"));
    await approach(p, { x: 640, y: 380 });
    const shown = await shownSlot(p, "files");
    await release(p);
    await settled(p);
    const floated = drawnRect(p, itemEl(p, "files"));
    const isFloat = p.where("files").kind === "float";
    await pressAt(p, headOf(p, "files"));
    await approach(p, { x: 26, y: 260 });
    await shownSlot(p, "files");
    await release(p);
    await settled(p);
    const w = p.where("files");
    const back = drawnRect(p, itemEl(p, "files"));
    return [
      row("over the pages it showed where it floats", shown.how === "indicator" && !!shown.rect ? [] : [`showed ${shown.how}`]),
      row("it floats where the outline was", isFloat && shown.rect && near(floated, shown.rect) ? [] : [`floating ${isFloat}, ${fmt(floated)} vs ${fmt(shown.rect)}`]),
      row("dropped on the left edge it docks as the outermost column", w.kind === "column" && w.side === "left" && w.index === 0 && Math.abs(back.x) < 1.5 ? [] : [`${JSON.stringify(w)} ${fmt(back)}`]),
    ];
  },
};

const keyboard: Scenario = {
  name: "keyboard: the arrows step through the places, Enter drops, Escape cancels",
  modes: ["keys"],
  async run(p) {
    const head = itemEl(p, "notes").querySelector<HTMLElement>(".pn-head")!;
    head.focus();
    key(head, " ");
    await nextFrame();
    const k0 = p.keys;
    const homeFirst = !!k0 && k0.stops[k0.i]!.home;
    key(head, "ArrowRight");
    await nextFrame();
    const showing = !p.ind.hidden;
    key(head, "ArrowRight");
    await nextFrame();
    const k1 = p.keys!;
    const want = k1.stops[k1.i]!;
    key(head, "Enter");
    await settled(p);
    const dropped = JSON.stringify(storePanels({ ...p.state, clock: {} })) === JSON.stringify(storePanels({ ...want.state, clock: {} }));
    const s1 = p.state;
    key(head, " ");
    key(head, "ArrowLeft");
    key(head, "Escape");
    await settled(p);
    return [
      row("Space picks it up at its own place", homeFirst ? [] : ["it didn't start at home"]),
      row("a step shows where it would go", showing ? [] : ["no indicator"]),
      row("Enter makes the stop's state", dropped && !!p.where("notes") ? [] : [`stop ${want.id} not made`], want.id),
      row("Escape changes nothing", p.state === s1 && !p.keys ? [] : ["the state changed"]),
      row("the stops come in reading order (left to right)", k1.stops.map((s) => s.id).join(",").startsWith("rail:left,column:left:0") ? [] : [k1.stops.map((s) => s.id).join(", ")]),
    ];
  },
};

const store: Scenario = {
  name: "store then read: round-trips; bad data is dropped, not thrown",
  modes: ["store"],
  async run(p) {
    p.setState(dock(toggleFold(p.state, "outline"), "notes", "right", 0, { into: true }));
    (itemEl(p, "files").querySelector(".pn-keep") as HTMLButtonElement).click();
    await settled(p);
    const s1 = p.state;
    const text = p.storeNow();
    p.setState(startState());
    p.json.value = text;
    const back = p.readNow();
    await settled(p);
    const same = JSON.stringify(storePanels(p.state)) === JSON.stringify(storePanels(s1));
    p.json.value = p.badData;
    let threw = "";
    let bad: ReturnType<Page["readNow"]> | null = null;
    try {
      bad = p.readNow();
      p.json.value = '{"v":1,"sides":';
      p.readNow();
      p.json.value = '{"v":2}';
      p.readNow();
    } catch (e) {
      threw = String(e);
    }
    await settled(p);
    return [
      row("the stored layout reads back the same (kept included)", back.ok && same && s1.kept.includes("files") ? [] : [`ok ${back.ok}, same ${same}`]),
      row("bad data reads without a throw, unknown ids dropped", !threw && bad?.ok && ["ghost", "nope"].every((x) => bad!.dropped.includes(x)) ? [] : [threw || `dropped ${bad?.dropped.join(", ")}`], bad?.dropped.join(", ")),
      row("the desk still lays out after it", p.lay().pages.width >= 320 ? [] : ["no pages"]),
    ];
  },
};

const resize: Scenario = {
  name: "resize: a column and a float stay within their limits",
  modes: ["handles"],
  async run(p) {
    const edge = p.edge("left", 0)!;
    const x0 = drawnRect(p, edge).x + 4;
    pointer(p, "pointerdown", { x: x0, y: 200 }, edge);
    await glide(p, { x: x0 + 300, y: 200 }, 20);
    const wide = p.lay().columns.find((c) => c.side === "left" && c.index === 0)!.rect.width;
    await glide(p, { x: x0 - 200, y: 200 }, 20);
    const narrow = p.lay().columns.find((c) => c.side === "left" && c.index === 0)!.rect.width;
    await release(p);
    const corner = itemEl(p, "comments").querySelector(".pn-corner")!;
    const c0 = centreOf(drawnRect(p, corner));
    pointer(p, "pointerdown", c0, corner);
    await glide(p, { x: c0.x - 300, y: c0.y - 300 }, 20);
    await release(p);
    await settled(p);
    const f = p.state.floats.find((x) => x.id === "comments")!.rect;
    return [
      row("the column stops at its max (300 px)", wide === 300 ? [] : [`${wide} px`]),
      row("and at its min (150 px)", narrow === 150 ? [] : [`${narrow} px`]),
      row("the float stops at its min size (200 × 140)", f.width === 200 && f.height === 140 ? [] : [fmt(f)]),
    ];
  },
};

const fold: Scenario = {
  name: "fold: to a bar in a stack, to the rail alone, back with a tap",
  modes: ["fold"],
  async run(p) {
    (itemEl(p, "outline").querySelector(".pn-fold") as HTMLButtonElement).click();
    await settled(p);
    const toRail = railIds(p, "left").includes("outline") && !p.items.get("outline")!.m.showing;
    const seg = itemEl(p, "rail:left").querySelector<HTMLElement>(".pn-seg[data-id=outline]")!;
    const sAt = centreOf(drawnRect(p, seg));
    pointer(p, "pointerdown", sAt, seg);
    pointer(p, "pointerup", sAt);
    await settled(p);
    const back = p.items.get("outline")!.m.showing && !p.state.folded.includes("outline");
    p.setState(dock(p.state, "notes", "left", 0, { into: true }));
    await settled(p);
    (itemEl(p, "notes").querySelector(".pn-fold") as HTMLButtonElement).click();
    await settled(p);
    const bar = drawnRect(p, itemEl(p, "notes"));
    return [
      row("alone in its column it folds to the rail", toRail ? [] : [`rail [${railIds(p, "left").join(", ")}]`]),
      row("a tap on its segment unfolds it", back ? [] : ["still folded"]),
      row("stacked, it folds to a 28 px title bar", Math.abs(bar.height - 28) < 1 && itemEl(p, "notes").dataset.kind === "bar" ? [] : [fmt(bar)]),
    ];
  },
};

const SCENARIOS: readonly Scenario[] = [giveWayCombos, free, keptOutlives, clamp, pinned, dropShown, ownPlace, escape, tearOff, keyboard, resize, fold, store];

// --- runAll --------------------------------------------------------------------------------------------------------

function installScenarios(p: Page, runButton: HTMLButtonElement, table: HTMLTableSectionElement): void {
  const runs: LabRun[] = [];
  let lastRows: Row[] = [];
  async function runAll(filter?: ScenarioFilter): Promise<LabRun[]> {
    runs.length = 0;
    for (const s of SCENARIOS) {
      if (!passes(s.name, filter)) continue;
      for (const mode of s.modes) {
        p.reset();
        await settled(p);
        let rows: Row[];
        try {
          rows = await s.run(p, mode);
        } catch (e) {
          rows = [row("the scenario ran", [String(e)])];
        }
        (document.activeElement as HTMLElement | null)?.blur?.();
        lastRows = rows;
        runs.push({ scenario: s.name, mode, failed: rows.filter((r) => r.result && !r.result.ok).map((r) => r.name), rows });
        render();
      }
    }
    p.reset();
    await settled(p);
    render();
    return [...runs];
  }
  function render(): void {
    table.innerHTML = runs
      .map((r) => {
        const why = r.rows.filter((x) => x.result && !x.result.ok).map((x) => `${x.name}: ${x.result!.failures.slice(0, 2).join("; ")}`);
        return `<tr><td>${r.scenario}</td><td>${r.mode}</td><td class="${r.failed.length ? "bad" : "ok"}">${r.failed.length ? "✗" : "✓"}</td><td>${why.join(" · ")}</td></tr>`;
      })
      .join("");
  }
  runButton.addEventListener("click", async () => {
    runButton.disabled = true;
    await runAll();
    runButton.disabled = false;
  });
  window.__motionLab = { runAll, runs, lastRows: () => lastRows };
}

installScenarios(page, document.getElementById("pn-run") as HTMLButtonElement, document.getElementById("pn-runs") as HTMLTableSectionElement);
