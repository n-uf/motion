/**
 * Desk constructions: nine ways to build a desk from a toolbar, five tool panels and open documents (see
 * desk/layouts.ts for each one's rules). The "Construction" switch picks one; every item glides to its place by the
 * lab's motion rules: a move settles, a size change is revealed rather than stretched, a panel that folds away fades
 * out with a uniform scale, and what the pointer holds is glued to it.
 *
 * `window.__motionLab.runAll()` runs the scripted scenarios and returns which rules failed.
 */
import { createFrameLoop, createSettle, SETTLE_TEMPO, type FrameInfo, type Rect, type Settle } from "@n-uf/motion";
import { createBrowserClock } from "@n-uf/motion/browser";
import type { CheckResult, HeldSample, ScaleSample, TargetSample } from "@n-uf/motion/testing";
import { CONSTRUCTIONS, DEFAULT_CONSTRUCTION, constructionOf, type ConstructionId } from "./desk/layouts";
import {
  DEFAULT_OPTIONS,
  DOC_TITLES,
  MAX_DOCS,
  PANELS,
  docKey,
  idOf,
  isDocKey,
  isPanelKey,
  panelKey,
  titleOf,
  toggleClosed,
  toggleFold,
  touch,
  withActive,
  withDocs,
  type DeskState,
  type Layout,
  type Options,
  type Placed,
  type Side,
  type Size,
} from "./desk/model";
import { makeScenarios, type DeskLab, type Scenario } from "./desk/scenarios";
import { framesResult, merge, motionRows, renderChecks, renderTrace, verdict, type Row, type Segment } from "./shared/checks";
import { drawRevealed, layOut, measureFrame, onTopAt } from "./shared/frame";
import { nextFrame, same } from "./shared/geometry";
import type { LabRun } from "./shared/hooks";

type Tempo = keyof typeof SETTLE_TEMPO;

const TOOL_ICONS = ["✎", "⌫", "↶", "↷", "⎘", "⌕", "☰", "⚙"];

const stage = document.getElementById("stage") as HTMLDivElement;
const checksBody = document.querySelector("#checks tbody") as HTMLTableSectionElement;
const runsBody = document.querySelector("#runs tbody") as HTMLTableSectionElement;
const trace = document.getElementById("trace") as HTMLCanvasElement;
const readout = document.getElementById("readout") as HTMLParagraphElement;
const ideaEl = document.getElementById("idea") as HTMLParagraphElement;
const wInput = document.getElementById("w") as HTMLInputElement;
const hInput = document.getElementById("h") as HTMLInputElement;
const wOut = document.getElementById("wo") as HTMLOutputElement;
const hOut = document.getElementById("ho") as HTMLOutputElement;

/** Anything on the desk that moves: the toolbar, a panel, a document, or chrome (a rail, a tab row, the strip's scroll bar). */
interface Item {
  readonly uid: number;
  readonly key: string;
  readonly kind: "toolbar" | "panel" | "doc" | "chrome";
  readonly name: string;
  readonly el: HTMLDivElement;
  readonly frame: HTMLDivElement;
  readonly content: HTMLDivElement;
  readonly rect: Settle<Rect>;
  /** Where the element is laid out (its content's size); the drawn rect glides toward it. */
  target: Rect;
  /** Shown (1) or folded away / closing (0): a uniform scale and a fade. */
  readonly pop: Settle<number>;
  /** How the current layout places it. */
  placed: Placed | null;
  /** What its content was last built from (rails and tab rows rebuild when it changes). */
  built: string;
  closing: boolean;
  segment: Segment | null;
  runs: TargetSample[][];
}

let tempo: Tempo = "default";
let cid: ConstructionId = DEFAULT_CONSTRUCTION;
const states = new Map<ConstructionId, DeskState>();
const optionsOf = new Map<ConstructionId, Options>();
let size: Size = { width: 960, height: 560 };
let items: Item[] = [];
const names = new Map<number, string>();
let nextDoc = 1;
let nextChrome = 300;
let layout: Layout = { items: new Map(), notes: [] };

const omega = (): number => SETTLE_TEMPO[tempo];
const construction = () => constructionOf(cid);
const stateOf = (id: ConstructionId): DeskState => states.get(id)!;
const state = (): DeskState => stateOf(cid);
const options = (): Options => optionsOf.get(cid) ?? DEFAULT_OPTIONS;
const itemOf = (key: string): Item | undefined => items.find((it) => it.key === key && !it.closing);

/** Change every construction's documents at once (they share them); each keeps its own arrangement. */
function setDocs(docs: readonly number[], focus: number | null): void {
  for (const c of CONSTRUCTIONS) states.set(c.id, withDocs(stateOf(c.id), docs, focus));
}

/** The current construction's state changes; everything glides to the new layout. */
function commit(s: DeskState): void {
  states.set(cid, s);
  relayout();
}

// --- items ---------------------------------------------------------------------------------------------------------

function makeItem(kind: Item["kind"], key: string, uid: number, name: string, html: string, at: Rect): Item {
  const el = document.createElement("div");
  el.className = `win ${kind}`;
  el.dataset.key = key;
  const frame = document.createElement("div");
  frame.className = "frame";
  const content = document.createElement("div");
  content.className = "content";
  content.innerHTML = html;
  el.append(frame, content);
  stage.append(el);
  names.set(uid, name);
  const it: Item = {
    uid,
    key,
    kind,
    name,
    el,
    frame,
    content,
    rect: createSettle(at, { omega: omega() }),
    target: { ...at },
    pop: createSettle(1, { omega: omega(), restDelta: 0.001 }),
    placed: null,
    built: "",
    closing: false,
    segment: null,
    runs: [[]],
  };
  layOut(it, at);
  items.push(it);
  draw(it);
  return it;
}

function makeToolbar(at: Rect): Item {
  const cells = TOOL_ICONS.map((c) => `<button type="button" class="tb-cell" tabindex="-1">${c}</button>`);
  return makeItem("toolbar", "toolbar", 100, "toolbar", `<div class="tb">${cells.join("")}</div>`, at);
}

function makePanel(p: (typeof PANELS)[number], at: Rect): Item {
  const html = `<div class="title"><span>${p.title}</span><button type="button" class="fold" title="Fold to the title bar">▾</button></div><div class="body">${p.body}</div>`;
  const it = makeItem("panel", panelKey(p.id), 200 + p.id, p.title, html, at);
  const fold = it.content.querySelector<HTMLButtonElement>(".fold")!;
  fold.addEventListener("pointerdown", (e) => e.stopPropagation());
  fold.addEventListener("click", (e) => {
    e.stopPropagation();
    doFold(p.id);
  });
  it.el.addEventListener("pointerdown", () => {
    if (!it.closing) states.set(cid, touch(state(), p.id));
  });
  return it;
}

function makeDoc(id: number, at: Rect): Item {
  const title = DOC_TITLES[(id - 1) % DOC_TITLES.length]!;
  const html = `<div class="title">${title}</div><div class="body">Last edited today · 3 pages<span class="line"></span><span class="line"></span><span class="line short"></span></div>`;
  const it = makeItem("doc", docKey(id), id, title, html, at);
  it.el.addEventListener("pointerdown", () => {
    if (!it.closing) doFocus(id);
  });
  return it;
}

function makeChrome(key: string, at: Rect): Item {
  return makeItem("chrome", key, nextChrome++, key.replace(":", " "), "", at);
}

function button(className: string, id: number, text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.textContent = text;
  b.title = titleOf(panelKey(id));
  b.dataset.id = String(id);
  b.addEventListener("click", onClick);
  return b;
}

/** A rail's icons and a tab row's tabs, rebuilt when what they show changes. */
function buildChrome(it: Item, p: Placed): void {
  const side = it.key.split(":")[1] as Side;
  if (p.look === "rail") {
    const sig = `rail|${(p.icons ?? []).join()}`;
    if (sig === it.built) return;
    it.built = sig;
    it.content.replaceChildren(...(p.icons ?? []).map((id) => button("icon", id, titleOf(panelKey(id))[0]!, () => doIcon(side, id))));
  } else if (p.look === "tabs") {
    const tw = p.rect.width / Math.max(1, (p.tabs ?? []).length);
    const sig = `tabs|${(p.tabs ?? []).join()}|${p.active}|${tw > 70}`;
    if (sig === it.built) return;
    it.built = sig;
    it.content.replaceChildren(
      ...(p.tabs ?? []).map((id) => {
        const b = button("tab", id, tw > 70 ? titleOf(panelKey(id)) : titleOf(panelKey(id))[0]!, () => doTab(side, id));
        b.setAttribute("aria-pressed", String(id === p.active));
        return b;
      }),
    );
  }
}

/** Constructions where a panel's ▾ folds (or shades) it. */
const FOLDS: readonly ConstructionId[] = ["docks", "docksFull", "dockTear", "floatOver", "floatAround"];

/** Dress an item for how it is placed: its look, its layer, shown or folded away. */
function dress(it: Item, p: Placed): void {
  it.placed = p;
  it.el.dataset.look = p.look;
  it.el.classList.toggle("shadow", !!p.shadow);
  it.el.classList.toggle("accent", !!p.accent);
  it.el.classList.toggle("foldable", FOLDS.includes(cid));
  it.el.classList.toggle("hidden", !!p.hidden);
  it.el.style.zIndex = it === raised ? "10" : String(p.layer);
  if (it.kind === "chrome") buildChrome(it, p);
  if (it.kind === "panel") it.content.querySelector(".fold")!.textContent = p.look === "header" ? "▸" : "▾";
  const want = p.hidden ? 0 : 1;
  if (it.pop.target !== want) {
    ensureLoop();
    it.pop.configure({ omega: omega() });
    it.pop.setTarget(want);
    if (want === 1) it.el.style.visibility = "visible";
  }
}

// --- motion --------------------------------------------------------------------------------------------------------

function setTarget(it: Item, to: Rect): void {
  if (same(it.target, to) && same(it.rect.target, to)) return;
  ensureLoop();
  const drawn = it.rect.value;
  it.target = { ...to };
  layOut(it, to);
  it.segment = { id: it.uid, t0: time, from: { ...drawn }, to: { ...to }, samples: [{ t: time, rect: { ...drawn } }] };
  episode?.segments.push(it.segment);
  it.rect.configure({ omega: omega() });
  it.rect.setTarget(to);
}

/** Lay the desk out again and send every item gliding to its place. */
function relayout(): void {
  layout = construction().layout(state(), size, options());
  const seen = new Set<string>();
  for (const [key, p] of layout.items) {
    seen.add(key);
    let it = itemOf(key);
    if (!it) {
      // Chrome a construction has and the last one didn't: it pops in at its place.
      it = makeChrome(key, p.rect);
      it.pop.jumpTo(0);
      newRun(it);
    }
    setTarget(it, p.rect);
    dress(it, p);
  }
  for (const it of items) {
    if (seen.has(it.key) || it.closing) continue;
    if (it.kind === "chrome") close(it);
  }
  renderNotes();
}

/** Pop an item out; it is removed once the pop has settled. */
function close(it: Item): void {
  ensureLoop();
  it.closing = true;
  it.el.classList.add("hidden");
  it.pop.setTarget(0);
}

function draw(it: Item): void {
  drawRevealed(it, it.rect.value, it.target, it.pop.value);
  // Folded all the way away: out of sight and out of the way of the pointer.
  if (it.pop.settled && it.pop.value === 0) it.el.style.visibility = "hidden";
}

// --- actions -------------------------------------------------------------------------------------------------------

function doFold(id: number): void {
  commit(toggleFold(state(), id));
}

/**
 * A rail icon: in the edge docks it folds the dock to its rail or opens it again (showing that panel); in the
 * drawers it opens the drawer on that panel, or closes it when that panel is already showing; in the navigator it
 * picks the panel the side shows once it has room again.
 */
function doIcon(side: Side, id: number): void {
  const s = state();
  if (cid === "navigator") return commit(withActive(s, side, id));
  const shown = layout.items.get(panelKey(id));
  const open = !!shown && !shown.hidden;
  if (cid === "drawers") {
    const next = withActive(s, side, id);
    return commit(s.closed.includes(side) || (open && s.active[side] === id) ? toggleClosed(next, side) : next);
  }
  if (open) return commit(s.closed.includes(side) ? s : { ...s, closed: [...s.closed, side] });
  const opened = { ...s, closed: s.closed.filter((x) => x !== side), opened: side, folded: s.folded.filter((x) => x !== id) };
  commit(touch(opened, id));
}

function doTab(side: Side, id: number): void {
  commit(withActive(state(), side, id));
}

function doFocus(id: number): void {
  const s = state();
  if (s.focus === id) return;
  setDocs(s.docs, id);
  relayout();
  focusMarks();
}

function focusMarks(): void {
  const f = state().focus;
  for (const it of items) it.el.classList.toggle("focused", it.kind === "doc" && idOf(it.key) === f);
}

function doOpen(): void {
  const s = state();
  if (s.docs.length >= MAX_DOCS) return;
  const id = nextDoc++;
  setDocs([...s.docs, id], id);
  layout = construction().layout(state(), size, options());
  const it = makeDoc(id, layout.items.get(docKey(id))!.rect);
  it.pop.jumpTo(0);
  ensureLoop();
  newRun(it);
  relayout();
  focusMarks();
}

function doClose(): void {
  const s = state();
  const id = s.focus !== null && s.docs.includes(s.focus) ? s.focus : s.docs.at(-1);
  if (id === undefined) return;
  close(itemOf(docKey(id))!);
  setDocs(
    s.docs.filter((d) => d !== id),
    null,
  );
  relayout();
  focusMarks();
}

function useConstruction(id: ConstructionId): void {
  cid = id;
  (document.querySelector(`input[name=construction][value=${id}]`) as HTMLInputElement).checked = true;
  syncControls();
  relayout();
  focusMarks();
}

function setOptions(patch: Partial<Options>): void {
  optionsOf.set(cid, { ...options(), ...patch });
  syncControls();
  relayout();
}

const stageRect = createSettle<Rect>({ x: 0, y: 0, width: size.width, height: size.height }, { omega: omega() });

/** The stage glides to its new size with everything on it (the same settle, so nothing leaves it on the way). */
function setSize(width: number, height: number): void {
  size = { width, height };
  wInput.value = String(width);
  hInput.value = String(height);
  wOut.textContent = String(width);
  hOut.textContent = String(height);
  ensureLoop();
  stageRect.configure({ omega: omega() });
  stageRect.setTarget({ x: 0, y: 0, width, height });
  relayout();
}

function drawStage(): void {
  const r = stageRect.value;
  // The stage's border is 1 px: its content box (where items are placed) is the stage size.
  stage.style.width = `${r.width + 2}px`;
  stage.style.height = `${r.height + 2}px`;
}

function renderNotes(): void {
  readout.replaceChildren();
  const b = document.createElement("b");
  b.textContent = layout.notes.length ? "Gives way: " : "Everything fits";
  readout.append(b, layout.notes.length ? layout.notes.join("; ") + "." : " at its natural size.");
}

function syncControls(): void {
  const c = construction();
  ideaEl.textContent = c.idea;
  const o = options();
  (document.getElementById("toolbar-modes") as HTMLFieldSetElement).hidden = !c.pill;
  (document.getElementById("bottom-modes") as HTMLFieldSetElement).hidden = !c.bottom;
  const tb = document.querySelector<HTMLInputElement>(`input[name=toolbar][value=${o.toolbar}-${o.toolbarSpace}]`);
  if (tb) tb.checked = true;
  const b = document.querySelector<HTMLInputElement>(`input[name=bottom][value=${o.bottom}]`);
  if (b) b.checked = true;
}

/** A fresh desk: every construction back to its own arrangement, `docCount` documents open. */
function reset(id: ConstructionId = cid, at: Size = size, opts: Partial<Options> = {}, docCount = 2): void {
  for (const it of items) it.el.remove();
  items = [];
  raised = null;
  states.clear();
  optionsOf.clear();
  nextDoc = 1;
  const docs = Array.from({ length: docCount }, () => nextDoc++);
  for (const c of CONSTRUCTIONS) states.set(c.id, c.initial(docs));
  cid = id;
  optionsOf.set(cid, { ...DEFAULT_OPTIONS, ...opts });
  size = at;
  wInput.value = String(at.width);
  hInput.value = String(at.height);
  wOut.textContent = String(at.width);
  hOut.textContent = String(at.height);
  stageRect.jumpTo({ x: 0, y: 0, width: at.width, height: at.height });
  drawStage();
  (document.querySelector(`input[name=construction][value=${id}]`) as HTMLInputElement).checked = true;
  syncControls();
  layout = construction().layout(state(), size, options());
  for (const [key, p] of layout.items) {
    if (key === "toolbar") makeToolbar(p.rect);
    else if (isPanelKey(key)) makePanel(PANELS.find((x) => x.id === idOf(key))!, p.rect);
    else if (isDocKey(key)) makeDoc(idOf(key), p.rect);
    else makeChrome(key, p.rect);
  }
  for (const it of items) {
    const p = layout.items.get(it.key)!;
    dress(it, p);
    if (p.hidden) {
      it.pop.jumpTo(0);
      it.el.style.visibility = "hidden";
    }
    draw(it);
  }
  focusMarks();
  renderNotes();
  lastRows = [];
}

// --- the frame -----------------------------------------------------------------------------------------------------

/** The item kept above all others: the dragged one, and after its drop until it has settled. */
let raised: Item | null = null;

let time = 0;
let episode: {
  t0: number;
  segments: Segment[];
  runs: TargetSample[][];
  scale: ScaleSample[];
  held: HeldSample[];
  onTop: (string | null)[];
  room: (string | null)[];
  minSize: (string | null)[];
  offStage: (string | null)[];
  pops: number;
} | null = null;
let idleWaiters: Array<() => void> = [];
const loop = createFrameLoop({ clock: createBrowserClock() });
let running = false;

function startEpisode(): void {
  if (episode) return;
  episode = { t0: time, segments: [], runs: [], scale: [], held: [], onTop: [], room: [], minSize: [], offStage: [], pops: 0 };
  for (const it of items) {
    it.runs = [[]];
    episode.runs.push(...it.runs);
  }
}

function newRun(it: Item): void {
  const run: TargetSample[] = [];
  it.runs.push(run);
  episode?.runs.push(run);
}

function ensureLoop(): void {
  startEpisode();
  if (running) return;
  running = true;
  loop.repeat("update", tick);
}

const measure = (it: Item): { scale: ScaleSample; frame: Rect } => measureFrame(stage, stageRect.value.width + 2, it, time);
const fmt = (r: Rect): string => `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)} × ${Math.round(r.height)}`;

/** Below its minimum (laid out, or drawn once settled), or null. */
function belowMin(it: Item): string | null {
  const min = it.placed?.min;
  if (!min) return null;
  const checks: [string, Rect][] = [["laid out", it.target]];
  if (it.rect.settled) checks.push(["drawn", it.rect.value]);
  for (const [what, r] of checks) {
    if ((min.width !== undefined && r.width < min.width - 0.5) || (min.height !== undefined && r.height < min.height - 0.5)) {
      return `t=${Math.round(time)} ${it.name} ${what} at ${Math.round(r.width)} × ${Math.round(r.height)} (min ${min.width ?? "any"} × ${min.height ?? "any"})`;
    }
  }
  return null;
}

/**
 * Outside the stage (laid out outside the stage's size, or drawn outside the stage as drawn), or null. A move that
 * starts off the stage (a strip column scrolled away) may be drawn outside it on its way in.
 */
function offStage(it: Item): string | null {
  if (it.placed?.offStage) return null;
  const s = stageRect.value;
  const out = (r: Rect, w: number, h: number): boolean => r.x < -0.5 || r.y < -0.5 || r.x + r.width > w + 0.5 || r.y + r.height > h + 0.5;
  if (out(it.target, size.width, size.height)) return `t=${Math.round(time)} ${it.name} laid out at ${fmt(it.target)}, outside the ${size.width} × ${size.height} stage`;
  const from = it.segment?.from;
  if (out(it.rect.value, s.width, s.height) && !(from && out(from, s.width, s.height))) return `t=${Math.round(time)} ${it.name} drawn at ${fmt(it.rect.value)}, outside the stage drawn ${Math.round(s.width)} × ${Math.round(s.height)}`;
  return null;
}

function tick(frame: FrameInfo): boolean {
  const dt = frame.delta;
  time += dt;
  let moving = false;
  if (stageRect.step(dt)) moving = true;
  drawStage();
  for (const it of [...items]) {
    if (it.rect.step(dt)) moving = true;
    if (it.pop.step(dt)) moving = true;
    draw(it);
    if (!episode) continue;
    const seen = measure(it);
    episode.scale.push(seen.scale);
    if (!it.pop.settled) episode.pops++;
    const drawn = it.rect.value;
    it.runs.at(-1)!.push({ t: time, rect: drawn, target: it.rect.target });
    it.segment?.samples.push({ t: time, rect: drawn });
    if (!it.closing && !it.placed?.hidden) {
      episode.minSize.push(belowMin(it));
      episode.offStage.push(offStage(it));
    }
    if (it.closing && it.pop.settled) {
      it.el.remove();
      items = items.filter((x) => x !== it);
    }
  }
  const r = raised;
  if (r && episode) {
    const fr = measure(r).frame;
    const v = onTopAt(stage, stageRect.value.width + 2, { el: r.el, name: r.name }, { x: fr.x + fr.width / 2, y: fr.y + fr.height / 2 }, fr, time, (top) => {
      const key = top.closest<HTMLElement>(".win")?.dataset.key;
      return key ? (items.find((x) => x.key === key)?.name ?? key) : null;
    });
    if (v !== undefined) episode.onTop.push(v);
    if (r.rect.settled) {
      raised = null;
      r.el.style.zIndex = String(r.placed?.layer ?? 1);
    }
  }
  if (moving) return true;
  running = false;
  endEpisode();
  return false;
}

// --- checks --------------------------------------------------------------------------------------------------------

let lastRows: Row[] = [];
/** While a scenario runs: the rows of each of its moves. */
let collecting: Row[][] | null = null;

function endEpisode(): void {
  const ep = episode;
  episode = null;
  if (!ep) return;
  const { rows, segments } = motionRows(ep, omega(), (uid) => names.get(uid) ?? `item ${uid}`);
  lastRows = [
    ...rows,
    { name: "Never below its minimum", result: ep.minSize.length > 0 ? framesResult(ep.minSize) : null },
    { name: "Nothing off the stage", result: ep.offStage.length > 0 ? framesResult(ep.offStage) : null },
  ];
  collecting?.push(lastRows);
  renderChecks(checksBody, lastRows);
  renderTrace(trace, ep.t0, segments);
  const waiters = idleWaiters;
  idleWaiters = [];
  for (const resolve of waiters) resolve();
}

/** The rows of several moves as one: a rule fails if it failed in any move, and is exercised if it was in any. */
function mergeRows(all: readonly Row[][]): Row[] {
  const first = all[0] ?? [];
  return first.map((row, i) => {
    const results = all.map((rows) => rows[i]!.result).filter((r): r is CheckResult => r !== null);
    const info = all.map((rows) => rows[i]!.info).filter(Boolean).at(-1);
    return { name: row.name, result: results.length ? merge(results) : null, ...(info ? { info } : {}) };
  });
}

// --- scenarios -----------------------------------------------------------------------------------------------------

const idle = (): Promise<void> => (running || episode ? new Promise((r) => idleWaiters.push(r)) : Promise.resolve());

const lab: DeskLab = {
  construction: () => cid,
  state,
  layout: () => layout,
  size: () => size,
  options,
  use: useConstruction,
  setOptions,
  setSize,
  open: doOpen,
  close: doClose,
  fold: doFold,
  touch: (id) => states.set(cid, touch(state(), id)),
  icon: doIcon,
  tab: doTab,
  focus: doFocus,
  drawn: (key) => itemOf(key)?.rect.value ?? null,
  shown: (key) => {
    const it = itemOf(key);
    return !!it && it.pop.value > 0.999;
  },
  idle,
};

const SCENARIOS: Record<string, Scenario> = makeScenarios(lab);
const runs: LabRun[] = [];

async function runScenario(name: string): Promise<LabRun> {
  const sc = SCENARIOS[name]!;
  const c = sc.construction ?? DEFAULT_CONSTRUCTION;
  reset(c, sc.size ? { width: sc.size[0], height: sc.size[1] } : { width: 960, height: 560 }, sc.options ?? {}, sc.docs ?? 2);
  await nextFrame();
  await idle();
  const failures: string[] = [];
  collecting = [];
  try {
    await sc.play((ok, failure) => {
      if (!ok) failures.push(failure);
    });
    await idle();
  } finally {
    const moves = collecting ?? [];
    collecting = null;
    lastRows = [...mergeRows(moves), { name: "Scenario expectations", result: verdict(failures) }];
  }
  renderChecks(checksBody, lastRows);
  // A scenario that only checks pure layouts moves nothing: "Something moved" is not its rule.
  const failed = lastRows.filter((r) => r.result && !r.result.ok && !(sc.still && r.name === "Something moved")).map((r) => r.name);
  const run: LabRun = { scenario: name, mode: constructionOf(c).title, failed, rows: lastRows };
  runs.push(run);
  const tr = document.createElement("tr");
  tr.innerHTML = "<td></td><td></td><td></td>";
  tr.children[0]!.textContent = name;
  tr.children[1]!.textContent = constructionOf(c).title;
  tr.children[2]!.textContent = failed.length ? failed.join(", ") : "none";
  (tr.children[2] as HTMLElement).className = failed.length ? "bad" : "ok";
  runsBody.append(tr);
  return run;
}

let runningAll = false;
let stopAll = false;
const runAllButton = document.querySelector("button[data-act=runall]") as HTMLButtonElement;

/** Run every scenario (or those whose name contains `filter`). */
async function runAll(filter?: string): Promise<LabRun[]> {
  if (runningAll) return [];
  runningAll = true;
  stopAll = false;
  runAllButton.textContent = "Stop scenarios";
  const before = { cid, size };
  const out: LabRun[] = [];
  runsBody.replaceChildren();
  try {
    for (const name of Object.keys(SCENARIOS)) {
      if (stopAll) break;
      if (filter && !name.includes(filter)) continue;
      out.push(await runScenario(name));
    }
  } finally {
    reset(before.cid, before.size);
    runningAll = false;
    stopAll = false;
    runAllButton.textContent = "Run all scenarios";
  }
  return out;
}

// --- wiring --------------------------------------------------------------------------------------------------------

const switcher = document.getElementById("constructions") as HTMLFieldSetElement;
for (const c of CONSTRUCTIONS) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "radio";
  input.name = "construction";
  input.value = c.id;
  input.addEventListener("change", () => useConstruction(c.id));
  label.append(input, ` ${c.title}`);
  switcher.append(label);
}
document.querySelectorAll<HTMLInputElement>("input[name=toolbar]").forEach((input) =>
  input.addEventListener("change", () => {
    const [toolbar, toolbarSpace] = input.value.split("-") as [Options["toolbar"], Options["toolbarSpace"]];
    setOptions({ toolbar, toolbarSpace });
  }),
);
document.querySelectorAll<HTMLInputElement>("input[name=bottom]").forEach((input) => input.addEventListener("change", () => setOptions({ bottom: input.value as Options["bottom"] })));
document.querySelectorAll<HTMLInputElement>("input[name=tempo]").forEach((input) =>
  input.addEventListener("change", () => {
    tempo = input.value as Tempo;
    for (const it of items) {
      it.rect.configure({ omega: omega() });
      it.pop.configure({ omega: omega() });
    }
  }),
);
for (const input of [wInput, hInput]) input.addEventListener("input", () => setSize(Number(wInput.value), Number(hInput.value)));
document.querySelectorAll<HTMLButtonElement>("button[data-size]").forEach((b) =>
  b.addEventListener("click", () => {
    const [w, h] = b.dataset.size!.split(",").map(Number) as [number, number];
    setSize(w, h);
  }),
);
const actions: Record<string, () => void> = {
  open: doOpen,
  close: doClose,
  reset: () => reset(cid, size),
  runall: () => {
    if (runningAll) {
      stopAll = true;
      runAllButton.textContent = "Stopping…";
    } else void runAll();
  },
};
document.querySelectorAll<HTMLButtonElement>("button[data-act]").forEach((b) => b.addEventListener("click", () => actions[b.dataset.act!]?.()));

tempo = (document.querySelector<HTMLInputElement>("input[name=tempo]:checked")?.value as Tempo | undefined) ?? tempo;
reset(DEFAULT_CONSTRUCTION, { width: Number(wInput.value) || 960, height: Number(hInput.value) || 560 });

window.__motionLab = { runAll, runs, lastRows: () => lastRows };
