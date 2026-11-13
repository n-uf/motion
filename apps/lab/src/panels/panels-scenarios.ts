/**
 * The Panels pages' scripted scenarios, on `window.__motionLab.runAll(filter?)`. Each drives the desk with real pointer
 * and key events (or its sliders), samples what the page drew frame by frame, and checks the rules from it: where
 * items settled, that no move overshot or turned back, what folded, where a drop landed against what showed.
 * The Options page runs the scenarios named "options: …", the Defaults page the rest.
 */
import type { Rect } from "@n-uf/motion";
import { checkMonotonic, checkNoOvershoot, type RectSample } from "@n-uf/motion/testing";
import { dock, dockBand, storePanels, toggleFold, type BandOption, type Clock, type GiveWay, type PanelsState } from "@n-uf/placement/panels";
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
    // Down: Comments stays in the view all the way (up, the clamp would stop it at the top).
    for (let y = 0; y <= 120; y += 8) {
      p.setPan(y);
      await nextFrame();
      if (!near(nav.drawn, nav0, 0.01)) moved.push(`at ${y} px Navigator at ${fmt(nav.drawn)}`);
    }
    await settled(p);
    const com1 = drawnRect(p, itemEl(p, "comments"));
    return [
      row("the pinned float never moved, frame by frame", moved.slice(0, 3)),
      row("the unpinned float moved down with the page", Math.abs(com1.y - (com0.y + 120)) < 1.5 && Math.abs(com1.x - com0.x) < 1.5 ? [] : [`${fmt(com0)} → ${fmt(com1)}`]),
    ];
  },
};

const clampScroll: Scenario = {
  name: "clamp and scroll: an unpinned float still scrolls with the page, past the view's edge",
  modes: ["clamp"],
  async run(p) {
    const com = p.items.get("comments")!.m;
    const nav = p.items.get("navigator")!.m;
    const com0 = { ...com.drawn };
    const nav0 = { ...nav.drawn };
    const stuck: string[] = [];
    // Up: Comments (70 px from the top) leaves the view by 50 px; the clamp works in page space, so it doesn't stop it.
    for (let y = 0; y >= -120; y -= 8) {
      p.setPan(y);
      await nextFrame();
      if (Math.abs(com.target.y - (com0.y + y)) > 0.5) stuck.push(`at ${y} px Comments heads for y ${Math.round(com.target.y)}`);
    }
    await settled(p);
    const com1 = drawnRect(p, itemEl(p, "comments"));
    return [
      row("the float's target follows the page on every frame", stuck.slice(0, 3)),
      row("it ends 120 px up, partly above the view", Math.abs(com1.y - (com0.y - 120)) < 1.5 && com1.y < 0 ? [] : [`${fmt(com0)} → ${fmt(com1)}`]),
      row("the pinned float stays put", near(nav.drawn, nav0, 0.01) ? [] : [`Navigator at ${fmt(nav.drawn)}`]),
      row("clamp is on (the default)", p.options.floats === "clamp" ? [] : [p.options.floats]),
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

/** A state's stored form with the clock's keys sorted (a read rebuilds the clock in placement order). */
const canon = (s: PanelsState): string => {
  const d = storePanels(s);
  return JSON.stringify({ ...d, clock: Object.fromEntries(Object.entries(d.clock).sort(([a], [b]) => a.localeCompare(b))) });
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
    const same = canon(p.state) === canon(s1);
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

const foldButton = (p: Page, id: string): HTMLButtonElement => itemEl(p, id).querySelector(".pn-fold") as HTMLButtonElement;

const foldFloats: Scenario = {
  name: "fold a float: a title bar where it is, pinned or not; unfolding brings it back",
  modes: ["floats"],
  async run(p) {
    const ids = ["comments", "navigator"] as const;
    const before = new Map(ids.map((id) => [id, drawnRect(p, itemEl(p, id))]));
    const stored = JSON.stringify(p.state.floats);
    const motion = await sampled(p, () => ids.forEach((id) => foldButton(p, id).click()));
    const bars = new Map(ids.map((id) => [id, drawnRect(p, itemEl(p, id))]));
    const asBar = ids.filter((id) => {
      const b = bars.get(id)!;
      const a = before.get(id)!;
      return !(Math.abs(b.height - 28) < 1 && Math.abs(b.x - a.x) < 1 && Math.abs(b.y - a.y) < 1 && Math.abs(b.width - a.width) < 1 && itemEl(p, id).dataset.kind === "bar");
    });
    const stillFloats = ids.every((id) => p.lay().items.get(id)!.floating && itemEl(p, id).classList.contains("float"));
    const kept = JSON.stringify(p.state.floats) === stored;
    await sampled(p, () => ids.forEach((id) => foldButton(p, id).click()));
    const back = ids.filter((id) => !near(drawnRect(p, itemEl(p, id)), before.get(id)!));
    return [
      row("both fold to 28 px bars at their own x, y and width", asBar.map((id) => `${id}: ${fmt(before.get(id))} → ${fmt(bars.get(id))}`)),
      row("folded, they are still floats", stillFloats ? [] : ["a folded float lost its float flag"]),
      row("the stored rects never change", kept ? [] : ["the state's floats changed"]),
      row("unfolded, they are back at full size", back.map((id) => `${id} at ${fmt(drawnRect(p, itemEl(p, id)))}`)),
      ...motion,
    ];
  },
};

const ride: Scenario = {
  name: "options: fold ride: folded columns ride on the first open column, the rail only when all are folded",
  modes: ["ride"],
  async run(p) {
    p.setOptions({ fold: "ride" });
    await settled(p);
    const files0 = drawnRect(p, itemEl(p, "files"));
    const outline0 = drawnRect(p, itemEl(p, "outline"));
    // One: Outline rides on Files; Notes takes Outline's place, the pages gain its room.
    const m1 = await sampled(p, () => foldButton(p, "outline").click());
    const o1 = drawnRect(p, itemEl(p, "outline"));
    const f1 = drawnRect(p, itemEl(p, "files"));
    const n1 = drawnRect(p, itemEl(p, "notes"));
    const one = near(o1, { x: files0.x, y: 0, width: files0.width, height: 28 }) && near(f1, { x: files0.x, y: 28, width: files0.width, height: files0.height - 28 }) && Math.abs(n1.x - outline0.x) < 1.5;
    const noRail1 = !p.items.get("rail:left")!.m.showing;
    // Two: Files and Outline ride on Notes, in column order.
    await sampled(p, () => foldButton(p, "files").click());
    const n2 = drawnRect(p, itemEl(p, "notes"));
    const two = [drawnRect(p, itemEl(p, "files")), drawnRect(p, itemEl(p, "outline"))];
    const stacked = near(two[0]!, { x: n2.x, y: 0, width: n2.width, height: 28 }) && near(two[1]!, { x: n2.x, y: 28, width: n2.width, height: 28 }) && Math.abs(n2.y - 56) < 1 && Math.abs(n2.x) < 1.5;
    // All three: the side shows its rail.
    await sampled(p, () => foldButton(p, "notes").click());
    const all = railIds(p, "left").join(",") === "files,outline,notes" && ["files", "outline", "notes"].every((id) => !p.items.get(id)!.m.showing);
    // Unfold Outline from the rail: it is its own column again, where it was stored, and Files and Notes ride on it.
    const seg = itemEl(p, "rail:left").querySelector<HTMLElement>(".pn-seg[data-id=outline]")!;
    const sAt = centreOf(drawnRect(p, seg));
    pointer(p, "pointerdown", sAt, seg);
    pointer(p, "pointerup", sAt);
    await settled(p);
    const o4 = p.lay().items.get("outline")!;
    const width = p.state.sides.left[1]!.width;
    return [
      row("one folded: it rides on Files; Notes moves into its place", one ? [] : [`Outline ${fmt(o1)}, Files ${fmt(f1)}, Notes ${fmt(n1)}`]),
      row("no rail while a column stays open", noRail1 ? [] : ["the left rail shows"]),
      row("two folded: their bars stack in column order on Notes", stacked ? [] : [`${two.map(fmt).join("; ")}; Notes ${fmt(n2)}`]),
      row("all folded: the side shows its rail", all ? [] : [`rail [${railIds(p, "left").join(", ")}]`]),
      row("unfolded, it is its own column again at its stored width", o4.kind === "column" && Math.abs(o4.rect.width - width) < 1 && !railIds(p, "left").includes("outline") ? [] : [`${o4.kind} ${fmt(o4.rect)}`]),
      ...m1,
    ];
  },
};

// --- presets (@n-uf/placement/desk) --------------------------------------------------------------------------------

/** What the page draws at rest that must not overlap: the shown docked panels, the strips, the rails and the pages. */
function restingOverlaps(p: Page): string[] {
  const els: [string, Element][] = [["pages", itemEl(p, "pages")]];
  for (const [id, it] of p.items) {
    if (id === "pages" || !it.m.showing || it.el.classList.contains("float")) continue;
    els.push([id, it.el]);
  }
  for (const c of p.lay().columns) {
    const s = p.strip(c.side, c.index);
    if (s && s.isConnected && !c.folded) els.push([`strip ${c.side}:${c.index}`, s]);
  }
  for (const k of ["top", "right", "bottom", "left"] as const) {
    const r = p.reserveEl(k);
    if (r) els.push([`reserve ${k}`, r]);
  }
  // An overlay band lies over the pages by design (and only over them).
  const l = p.lay();
  const overlay = (k: string): boolean => l.items.get(k)?.layer === 5;
  const rs = els.map(([k, e]) => [k, drawnRect(p, e)] as const);
  const out: string[] = [];
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      const [a, ra] = rs[i]!;
      const [b, rb] = rs[j]!;
      if ((overlay(a) && b === "pages") || (overlay(b) && a === "pages")) continue;
      const ox = Math.min(ra.x + ra.width, rb.x + rb.width) - Math.max(ra.x, rb.x);
      const oy = Math.min(ra.y + ra.height, rb.y + rb.height) - Math.max(ra.y, rb.y);
      if (ox > 1 && oy > 1) out.push(`${a} and ${b} overlap ${Math.round(ox)} × ${Math.round(oy)}`);
    }
  }
  return out;
}

const presetNoOverlaps: Scenario = {
  name: "presets: each preset lays out with no overlaps, wide and narrow, tall and short",
  modes: ["docks", "docksFull", "dockTear", "navigator"],
  async run(p, mode) {
    p.setPreset(mode as "docks");
    await settled(p);
    const wide = restingOverlaps(p);
    const motion = await sampled(p, () => {
      p.setWidth(900);
      p.setHeight(320);
    });
    const narrow = restingOverlaps(p);
    const pages = p.lay().pages.width;
    return [
      row("the preset is on", p.preset === mode ? [] : [`preset ${p.preset}`]),
      row("no overlaps at 1260 × 520", wide.slice(0, 3)),
      row("no overlaps at 900 × 320", narrow.slice(0, 3)),
      row("the pages keep 320 px", pages >= 319.5 ? [] : [`${Math.round(pages)} px`]),
      ...motion,
    ];
  },
};

const presetNavigator: Scenario = {
  name: "presets: navigator: a tab shows its panel; a panel dragged into the column becomes a tab",
  modes: ["navigator"],
  async run(p) {
    p.setPreset("navigator");
    await settled(p);
    const tab = p.strip("left", 0)!.querySelector<HTMLElement>(".pn-tab[data-id=outline]")!;
    const tAt = centreOf(drawnRect(p, tab));
    pointer(p, "pointerdown", tAt, tab);
    pointer(p, "pointerup", tAt);
    await settled(p);
    const switched = p.items.get("outline")!.m.showing && !p.items.get("files")!.m.showing && p.state.sides.left[0]!.active === "outline";
    // History (right column) into the left column: a new last tab, and the one showing.
    const col = p.lay().columns.find((c) => c.side === "left")!;
    await pressAt(p, headOf(p, "history"));
    await approach(p, { x: col.rect.x + col.rect.width / 2, y: 300 });
    const shown = await shownSlot(p, "history");
    await release(p);
    await settled(p);
    const d = p.lastDrop;
    const landed = drawnRect(p, itemEl(p, "history"));
    const tabs = [...p.strip("left", 0)!.querySelectorAll<HTMLElement>(".pn-tab")].map((t) => t.dataset.id);
    return [
      row("a tap on a tab shows its panel and hides the other", switched ? [] : [`active ${p.state.sides.left[0]!.active}`]),
      row("the drop showed into the column, and landed there", d && d.landed === "into:left:0" && d.shownAtRelease === d.landed ? [] : [`landed ${d?.landed}, showed ${d?.shownAtRelease}`]),
      row("it landed where the slot showed", shown.rect && near(landed, shown.rect) ? [] : [`showed ${fmt(shown.rect)}, landed ${fmt(landed)}`]),
      row("it is the last tab, and the one showing", tabs.join(",") === "files,outline,notes,history" && p.state.sides.left[0]!.active === "history" && !p.items.get("outline")!.m.showing ? [] : [`tabs ${tabs.join(", ")}`]),
    ];
  },
};

const presetHeights: Scenario = {
  name: "presets: height give-way folds sections in policy order on a short stage, and unfolds them on regrow",
  modes: ["docks"],
  async run(p) {
    p.setPreset("docks");
    p.setClock({ files: { opened: 1, used: 1 }, outline: { opened: 2, used: 2 }, notes: { opened: 3, used: 3 } });
    await settled(p);
    const autos = (): string[] => [...p.lay().items].filter(([id, x]) => x.folded === "auto" && x.side === "left" && ["files", "outline", "notes"].includes(id)).map(([id]) => id);
    const m1 = await sampled(p, () => p.setHeight(230));
    const one = autos();
    const bar = drawnRect(p, itemEl(p, "files"));
    await sampled(p, () => p.setHeight(180));
    const two = autos();
    const notesOpen = p.lay().items.get("notes")!.folded === null;
    const codes = p.lay().notes.filter((n) => n.code === "section-folded").map((n) => ("items" in n ? n.items[0] : ""));
    const m3 = await sampled(p, () => p.setHeight(520));
    const back = autos();
    return [
      row("230 px: Files (used longest ago) folds to a 28 px bar", one.join(",") === "files" && Math.abs(bar.height - 28) < 1 ? [] : [`folded ${one.join(", ")}; Files ${fmt(bar)}`]),
      row("180 px: Outline next; Notes, the last, stays open", two.join(",") === "files,outline" && notesOpen ? [] : [`folded ${two.join(", ")}`]),
      row("each fold has a section-folded note", codes.includes("files") && codes.includes("outline") ? [] : [`notes for ${codes.join(", ")}`]),
      row("520 px: all open again, and folded was never written", back.length === 0 && p.state.folded.length === 0 ? [] : [`still folded ${back.join(", ")}`]),
      ...m1,
      ...m3.map((r) => ({ ...r, name: `regrow: ${r.name}` })),
    ];
  },
};

const presetTear: Scenario = {
  name: "presets: dockTear: tear a panel off over the pages, and dock it back",
  modes: ["dockTear"],
  async run(p) {
    p.setPreset("dockTear");
    await settled(p);
    const startFloats = p.state.floats.map((f) => f.id);
    const pages = p.lay().pages;
    await pressAt(p, headOf(p, "files"));
    await approach(p, { x: pages.x + pages.width / 2, y: 420 });
    const shown = await shownSlot(p, "files");
    await release(p);
    await settled(p);
    const torn = p.where("files").kind === "float" && p.lastDrop?.landed === "float";
    const floated = drawnRect(p, itemEl(p, "files"));
    const col = p.lay().columns.find((c) => c.side === "left")!;
    await pressAt(p, headOf(p, "files"));
    await approach(p, { x: col.rect.x + col.rect.width / 2, y: 300 });
    await shownSlot(p, "files");
    await release(p);
    await settled(p);
    const w = p.where("files");
    return [
      row("the preset starts with one float", startFloats.length === 1 ? [] : [`floats ${startFloats.join(", ")}`]),
      row("over the pages it tears off where the outline showed", torn && shown.rect && near(floated, shown.rect) ? [] : [`${p.lastDrop?.landed}; ${fmt(floated)} vs ${fmt(shown.rect)}`]),
      row("dropped on the left column it docks there again", w.kind === "column" && w.side === "left" ? [] : [JSON.stringify(w)]),
    ];
  },
};

// --- bands and toolbar room (the Options page) ---------------------------------------------------------------------

const BAND_MODES: Record<string, BandOption> = {
  "reserved between": { mode: "reserved", span: "between" },
  "reserved full": { mode: "reserved", span: "full" },
  "overlay between": { mode: "overlay", span: "between" },
  "overlay full": { mode: "overlay", span: "full" },
};
const ROOM = { top: 24, bottom: 20, left: 12, right: 12 };

/** Each band panel is drawn where the layout puts it. */
function bandDrawn(p: Page): string[] {
  const out: string[] = [];
  for (const b of Object.values(p.lay().bands)) for (const id of b!.panels) if (!near(drawnRect(p, itemEl(p, id)), p.lay().items.get(id)!.rect)) out.push(`${id} drawn ${fmt(drawnRect(p, itemEl(p, id)))}`);
  return out;
}

const bandsNoOverlaps: Scenario = {
  name: "options: bands: no overlaps in each mode and span, at many stage sizes, with toolbar room",
  modes: Object.keys(BAND_MODES),
  async run(p, mode) {
    const o = BAND_MODES[mode]!;
    p.setBand("top", o);
    p.setBand("bottom", o);
    p.setReserve(ROOM);
    const motion = await sampled(p, () => p.setHeight(620));
    const out: Row[] = [];
    for (const [w, h] of [
      [1260, 620],
      [1000, 480],
      [760, 360],
      [1180, 300],
      [640, 240],
    ] as const) {
      p.setWidth(w);
      p.setHeight(h);
      await settled(p);
      const over = restingOverlaps(p);
      const l = p.lay();
      const outside = [...l.items].filter(([, x]) => !x.floating && !x.hidden && (x.rect.x < -0.5 || x.rect.y < -0.5 || x.rect.x + x.rect.width > w + 0.5 || x.rect.y + x.rect.height > h + 0.5)).map(([id]) => id);
      out.push(row(`${w} × ${h}: no overlaps, everything inside the stage`, [...over.slice(0, 3), ...outside.map((id) => `${id} outside`)], `${Object.values(l.bands).map((b) => `${b!.edge} ${b!.folded ?? Math.round(b!.rect.height)}`).join(", ")}`));
      out.push(row(`${w} × ${h}: the band panels are drawn where the layout puts them`, bandDrawn(p)));
    }
    return [row("both bands are on", Object.keys(p.lay().bands).length === 2 ? [] : [`bands ${Object.keys(p.lay().bands).join(", ")}`]), ...out, ...motion];
  },
};

const bandFolds: Scenario = {
  name: "options: bands: a short stage folds a band to a bar, a taller one brings it back",
  modes: ["reserved between"],
  async run(p) {
    p.setBand("bottom", BAND_MODES["reserved between"]!);
    await settled(p);
    const open0 = p.lay().bands.bottom!;
    const m1 = await sampled(p, () => p.setHeight(320));
    const l1 = p.lay();
    const bar = drawnRect(p, itemEl(p, "history"));
    const m2 = await sampled(p, () => p.setHeight(520));
    const l2 = p.lay();
    return [
      row("520 px: the band is open at its height", open0.folded === null && Math.abs(open0.rect.height - 150) < 1 ? [] : [`${open0.folded} ${fmt(open0.rect)}`]),
      row("320 px: it folds to a 28 px bar, with band-folded", l1.bands.bottom!.folded === "auto" && Math.abs(bar.height - 28) < 1 && l1.notes.some((n) => n.code === "band-folded") ? [] : [`${l1.bands.bottom!.folded}; History ${fmt(bar)}`]),
      row("the pages keep their min height", l1.pages.height >= 239.5 ? [] : [`${Math.round(l1.pages.height)} px`]),
      row("520 px again: it is back, and folded was never written", l2.bands.bottom!.folded === null && p.state.folded.length === 0 && near(drawnRect(p, itemEl(p, "history")), l2.items.get("history")!.rect) ? [] : [`${l2.bands.bottom!.folded}, folded [${p.state.folded.join(", ")}]`]),
      ...m1,
      ...m2.map((r) => ({ ...r, name: `back: ${r.name}` })),
    ];
  },
};

const bandKept: Scenario = {
  name: "options: bands: a kept band folds last",
  modes: ["reserved between"],
  async run(p) {
    p.setBand("top", BAND_MODES["reserved between"]!);
    p.setBand("bottom", BAND_MODES["reserved between"]!);
    // History (bottom) is the newer: unkept, the top band would go first anyway; keep the top one instead.
    p.setClock({ comments: { opened: 1, used: 1 }, history: { opened: 2, used: 2 } });
    (itemEl(p, "comments").querySelector(".pn-keep") as HTMLButtonElement).click();
    await settled(p);
    const kept = p.state.kept.includes("comments");
    const motion = await sampled(p, () => p.setHeight(380));
    const one = p.lay();
    await sampled(p, () => p.setHeight(270));
    const two = p.lay();
    const kf = two.notes.filter((n) => n.code === "kept-folded" && "edge" in n && n.edge === "top");
    return [
      row("the keep button keeps the top band's panel", kept ? [] : ["not kept"]),
      row("380 px: the unkept bottom band folds, the kept top one stays open", one.bands.bottom!.folded === "auto" && one.bands.top!.folded === null ? [] : [`top ${one.bands.top!.folded}, bottom ${one.bands.bottom!.folded}`]),
      row("270 px: the kept band folds last, with kept-folded on its edge", two.bands.top!.folded === "auto" && kf.length === 1 ? [] : [`top ${two.bands.top!.folded}, notes ${two.notes.map((n) => n.code).join(", ")}`]),
      ...motion,
    ];
  },
};

const bandOverlay: Scenario = {
  name: "options: bands: overlay keeps the pages' rect; reserved shortens it",
  modes: ["overlay", "reserved"],
  async run(p, mode) {
    const before = drawnRect(p, itemEl(p, "pages"));
    const motion = await sampled(p, () => p.setBand("bottom", { mode: mode as "overlay", span: "between" }));
    const after = drawnRect(p, itemEl(p, "pages"));
    const band = drawnRect(p, itemEl(p, "history"));
    const l = p.lay();
    const overlay = mode === "overlay";
    return [
      row(overlay ? "the pages keep their rect" : "the pages are shorter by the band's height", overlay ? (near(before, after) ? [] : [`${fmt(before)} → ${fmt(after)}`]) : Math.abs(after.height - (before.height - band.height)) < 1.5 ? [] : [`${fmt(before)} → ${fmt(after)}, band ${fmt(band)}`]),
      row(overlay ? "the band lies over the pages' lower part, above them" : "the band lies under the pages", overlay ? (band.y > after.y && Math.abs(band.y + band.height - (after.y + after.height)) < 1.5 && Number(itemEl(p, "history").style.zIndex) > 1 ? [] : [fmt(band)]) : Math.abs(band.y - (after.y + after.height)) < 1.5 ? [] : [fmt(band)]),
      row("its layer", l.items.get("history")!.layer === (overlay ? 5 : 0) ? [] : [String(l.items.get("history")!.layer)]),
      ...motion,
    ];
  },
};

const bandFull: Scenario = {
  name: "options: bands: full span shortens the columns; between runs between them",
  modes: ["full", "between"],
  async run(p, mode) {
    const motion = await sampled(p, () => p.setBand("bottom", { mode: "reserved", span: mode as "full" }));
    const band = drawnRect(p, itemEl(p, "history"));
    const files = drawnRect(p, itemEl(p, "files"));
    const inspector = drawnRect(p, itemEl(p, "inspector"));
    const full = mode === "full";
    return [
      row(full ? "the band spans the stage's width" : "the band runs from the innermost left column to the innermost right one", full ? (Math.abs(band.x) < 1 && Math.abs(band.width - p.width) < 1 ? [] : [fmt(band)]) : Math.abs(band.x - drawnRect(p, itemEl(p, "notes")).x - drawnRect(p, itemEl(p, "notes")).width) < 1.5 ? [] : [fmt(band)]),
      row(full ? "the columns stand on it" : "the columns keep the full height", full ? (Math.abs(files.y + files.height - band.y) < 1.5 && Math.abs(inspector.y + inspector.height - band.y) < 1.5 ? [] : [`Files ${fmt(files)}, band ${fmt(band)}`]) : Math.abs(files.height - p.height) < 1.5 ? [] : [`Files ${fmt(files)}`]),
      ...motion,
    ];
  },
};

const reserveClear: Scenario = {
  name: "options: toolbar room: the reserved rects never overlap anything",
  modes: ["no bands", "overlay bands", "reserved full bands"],
  async run(p, mode) {
    if (mode !== "no bands") {
      const o = mode === "overlay bands" ? BAND_MODES["overlay between"]! : BAND_MODES["reserved full"]!;
      p.setBand("top", o);
      p.setBand("bottom", o);
    }
    const motion = await sampled(p, () => p.setReserve({ top: 40, bottom: 32, left: 28, right: 28 }));
    const l = p.lay();
    const shown = Object.keys(l.reserved).filter((k) => p.reserveEl(k as "top")?.isConnected);
    const out: string[] = [];
    for (const k of shown) {
      const r = drawnRect(p, p.reserveEl(k as "top")!);
      for (const [id, it] of p.items) {
        if (!it.m.showing || it.el.classList.contains("float")) continue;
        const d = drawnRect(p, it.el);
        const ox = Math.min(r.x + r.width, d.x + d.width) - Math.max(r.x, d.x);
        const oy = Math.min(r.y + r.height, d.y + d.height) - Math.max(r.y, d.y);
        if (ox > 1 && oy > 1) out.push(`${k} and ${id} overlap ${Math.round(ox)} × ${Math.round(oy)}`);
      }
    }
    return [row("four placeholders are drawn", shown.length === 4 ? [] : [`${shown.join(", ")}`]), row("none overlaps a panel, a rail, a band or the pages", out.slice(0, 3)), ...motion];
  },
};

const bandDrag: Scenario = {
  name: "options: bands: drag a panel into a band and out to a side",
  modes: ["snap"],
  async run(p) {
    p.setBand("bottom", BAND_MODES["reserved between"]!);
    await settled(p);
    const band = p.lay().bands.bottom!.rect;
    await pressAt(p, headOf(p, "files"));
    // The band's right end: after History.
    await approach(p, { x: band.x + band.width - 30, y: band.y + band.height / 2 });
    const shown = await shownSlot(p, "files");
    await release(p);
    await settled(p);
    const d1 = p.lastDrop;
    const in1 = p.where("files");
    const landed = drawnRect(p, itemEl(p, "files"));
    // And out to the left edge: a column again.
    await pressAt(p, headOf(p, "files"));
    await approach(p, { x: 26, y: 200 });
    await shownSlot(p, "files");
    await release(p);
    await settled(p);
    const w = p.where("files");
    const back = drawnRect(p, itemEl(p, "files"));
    return [
      row("it landed in the band, on the slot the page showed", d1?.landed === "band:bottom:1" && d1.shownAtRelease === d1.landed && in1.kind === "band" ? [] : [`landed ${d1?.landed}, showed ${d1?.shownAtRelease}`]),
      row("where the slot showed: its share of the band", shown.rect && near(landed, shown.rect) ? [] : [`showed ${fmt(shown.rect)}, landed ${fmt(landed)}`], fmt(landed)),
      row("the band's panels share its width", Math.abs(landed.width - band.width / 2) < 1.5 ? [] : [`${Math.round(landed.width)} of ${Math.round(band.width)}`]),
      row("dragged out to the left edge, it is the outermost column again", w.kind === "column" && w.side === "left" && w.index === 0 && Math.abs(back.x) < 1.5 ? [] : [`${JSON.stringify(w)} ${fmt(back)}`]),
    ];
  },
};

const bandFromFloat: Scenario = {
  name: "options: bands: a float dropped on an empty edge starts a band there",
  modes: ["top"],
  async run(p) {
    p.setBand("top", BAND_MODES["reserved between"]!, false);
    await settled(p);
    const pages = p.lay().pages;
    const empty = !p.lay().bands.top;
    await pressAt(p, headOf(p, "comments"));
    await approach(p, { x: pages.x + pages.width / 2, y: pages.y + 20 });
    const shown = await shownSlot(p, "comments");
    await release(p);
    await settled(p);
    const d = p.lastDrop;
    const w = p.where("comments");
    const landed = drawnRect(p, itemEl(p, "comments"));
    return [
      row("the enabled top edge starts empty", empty ? [] : ["it has a band"]),
      row("it landed on the empty edge's strip, as shown", d?.landed === "band:top" && d.shownAtRelease === d.landed ? [] : [`landed ${d?.landed}, showed ${d?.shownAtRelease}`]),
      row("it is the band's only panel, no longer a float", w.kind === "band" && w.edge === "top" && !p.state.floats.some((f) => f.id === "comments") ? [] : [JSON.stringify(w)]),
      row("where the slot showed", shown.rect && near(landed, shown.rect) ? [] : [`showed ${fmt(shown.rect)}, landed ${fmt(landed)}`], fmt(landed)),
      row("the pages start under it", Math.abs(p.lay().pages.y - landed.height) < 1.5 ? [] : [fmt(p.lay().pages)]),
    ];
  },
};

const bandStore: Scenario = {
  name: "options: bands: store then read round-trips the bands; bad band data is dropped",
  modes: ["store"],
  async run(p) {
    p.setBand("top", BAND_MODES["overlay between"]!);
    p.setBand("bottom", BAND_MODES["reserved full"]!);
    p.setState(dockBand(p.state, "notes", "bottom", 0, p.defs));
    await settled(p);
    const s1 = p.state;
    const text = p.storeNow();
    p.setState(startState());
    p.json.value = text;
    const back = p.readNow();
    await settled(p);
    const same = canon(p.state) === canon(s1);
    p.json.value = p.badData;
    const bad = p.readNow();
    await settled(p);
    return [
      row("the stored layout carries the bands", JSON.parse(text).bands?.bottom?.panels?.join(",") === "notes,history" ? [] : [text.slice(0, 120)]),
      row("it reads back the same", back.ok && same ? [] : [`ok ${back.ok}, same ${same}`]),
      row("bad band data is dropped and listed", bad.ok && bad.dropped.includes("bands.bottom") && bad.dropped.includes("bands.middle") ? [] : [bad.dropped.join(", ")]),
    ];
  },
};

const SCENARIOS: readonly Scenario[] = [
  giveWayCombos,
  free,
  ride,
  keptOutlives,
  clamp,
  pinned,
  clampScroll,
  dropShown,
  ownPlace,
  escape,
  tearOff,
  keyboard,
  resize,
  fold,
  foldFloats,
  store,
  presetNoOverlaps,
  presetNavigator,
  presetHeights,
  presetTear,
  bandsNoOverlaps,
  bandFolds,
  bandKept,
  bandOverlay,
  bandFull,
  reserveClear,
  bandDrag,
  bandFromFloat,
  bandStore,
];

// --- runAll --------------------------------------------------------------------------------------------------------

function installScenarios(p: Page, runButton: HTMLButtonElement, table: HTMLTableSectionElement): void {
  const runs: LabRun[] = [];
  let lastRows: Row[] = [];
  let running = false;
  async function runAll(filter?: ScenarioFilter): Promise<LabRun[]> {
    // One run at a time: two would drive the same desk.
    if (running) return [];
    running = true;
    try {
      return await runEach(filter);
    } finally {
      running = false;
    }
  }
  async function runEach(filter?: ScenarioFilter): Promise<LabRun[]> {
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
