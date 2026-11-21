/**
 * The panel split: dividers between neighboring open panels of a column (`dividers`, `resizeBetween`, `resetBetween` and
 * `resetLengths` from `@n-uf/docking`). The window draws a grab zone over each divider from `dividers(state, layout)`
 * (`drawDividers` in ./dock-state, the wiring a kit mirrors); each case below plays the gesture on those elements with
 * real pointer, mouse and key events and reads what the layout draws.
 */
import { dividers, foldItem, type DockState } from "@n-uf/docking";
import { DEFAULT_SIZE, defaultState, put, type ItemId } from "./model";
import type { Docwin } from "./dock-state";

interface Verdict {
  readonly pass: boolean;
  readonly now: string;
}
interface SplitPreset {
  readonly id: string;
  readonly title: string;
  readonly expected: string;
  setup(c: Docwin): void;
  check(c: Docwin): Verdict;
}

/** Pages and Notes in the left column, Findings alone in the right one. */
const base = (): DockState => defaultState(DEFAULT_SIZE);
/** Pages, Notes (folded by hand to its header) and Findings, all in the left column. */
const collapsed = (height = DEFAULT_SIZE.height): DockState => foldItem(put(defaultState({ width: DEFAULT_SIZE.width, height }), "left", ["pages", "notes", "findings"]), "notes", true);
/** Tall enough that the three panels' natural lengths fit with room to spare. */
const TALL = 900;

const tall = (c: Docwin, id: ItemId): number => c.layout.items[id]!.rect.height;
const kind = (c: Docwin, id: ItemId): string => c.layout.items[id]!.formKind;
const near = (a: number, b: number, eps = 0.6): boolean => Math.abs(a - b) <= eps;
const r0 = (n: number): number => Math.round(n * 10) / 10;
/** Every drawn item's rect but `except`'s, as a string: equal strings, nothing else moved. */
const others = (c: Docwin, except: readonly ItemId[]): string =>
  JSON.stringify(Object.entries(c.layout.items).filter(([id]) => !except.includes(id as ItemId)).map(([id, l]) => [id, l.rect, l.formKind]));

const dividerOf = (c: Docwin, before: ItemId, after: ItemId): HTMLElement | null => c.win.querySelector<HTMLElement>(`.dw-divider[data-before="${before}"][data-after="${after}"]`);
const dividerCount = (c: Docwin): number => c.win.querySelectorAll(".dw-divider").length;
const middle = (el: HTMLElement): { x: number; y: number } => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};
/** A drag of the divider by `path` (each a distance from the press, px along the column), pointer events as a mouse makes them. */
type Ending = "pointerup" | "pointercancel" | "lostpointercapture";
/** One pointer event at the divider `dy` px along the column from where it was at `p`: the divider holds the pointer, so a browser dispatches them all at it. */
const pointer = (el: HTMLElement, p: { x: number; y: number }, type: string, dy: number, init: PointerEventInit = {}): void =>
  void el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: p.x, clientY: p.y + dy, ...init }));
function drag(c: Docwin, before: ItemId, after: ItemId, path: readonly number[], end: Ending | null = "pointerup"): boolean {
  const el = dividerOf(c, before, after);
  if (!el) return false;
  const p = middle(el);
  pointer(el, p, "pointerdown", 0, { button: 0 });
  for (const dy of path) pointer(el, p, "pointermove", dy);
  if (end) pointer(el, p, end, path[path.length - 1] ?? 0);
  return true;
}
const double = (c: Docwin, before: ItemId, after: ItemId, shift = false): boolean => {
  const el = dividerOf(c, before, after);
  el?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, shiftKey: shift }));
  return !!el;
};
const key = (c: Docwin, before: ItemId, after: ItemId, k: string): boolean => {
  const el = dividerOf(c, before, after);
  el?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: k }));
  return !!el;
};
/**
 * The untouched window set up, a list for what breaks, the left column's two lengths as drawn, and the divider between them
 * with the point its middle is at.
 */
function fresh(c: Docwin): { bad: string[]; was: { pages: number; notes: number }; el: HTMLElement | null; p: { x: number; y: number } } {
  c.setState(base());
  const el = dividerOf(c, "pages", "notes");
  return { bad: [], was: { pages: tall(c, "pages"), notes: tall(c, "notes") }, el, p: el ? middle(el) : { x: 0, y: 0 } };
}
const MISSING: Verdict = { pass: false, now: "no divider between Pages and Notes is drawn" };
const report = (bad: readonly string[]): string => (bad.length ? ` Broken: ${bad.join("; ")}.` : "");

export function SPLIT_PRESETS(): SplitPreset[] {
  return [
    {
      id: "split-drag-clamps",
      title: "Panel split: drag the divider between two panels of a column, clamped at each one's least",
      expected:
        "Pages over Notes in the left column share a divider. Dragging it makes one longer and the other shorter by the pointer's distance, the column's total unchanged and nothing else in the window moving; dragging back to the press gives the state before the press. Dragged far down, Notes stops at its least (120 px) and Pages takes the rest; dragged far up, Pages stops at its least (160 px); neither folds and nothing else moves. Home and End on the focused divider go to the same two limits, an arrow key moves a step.",
      setup: (c) => c.setState(base()),
      check(c) {
        c.setState(base());
        const bad: string[] = [];
        const at = { pages: tall(c, "pages"), notes: tall(c, "notes") };
        const total = at.pages + at.notes;
        const rest = others(c, ["pages", "notes"]);
        const before = c.state;
        if (dividerCount(c) !== 1) bad.push(`${dividerCount(c)} dividers drawn, one expected`);
        // The separator says its value (the panel before it, as drawn) and its limits (where its range takes it).
        const aria = (): string => ["now", "min", "max"].map((k) => dividerOf(c, "pages", "notes")?.getAttribute(`aria-value${k}`)).join("/");
        const ariaWant = (pages: number, notes: number): string => [pages, 160, pages + notes - 120].map((n) => Math.round(n)).join("/");
        if (aria() !== ariaWant(at.pages, at.notes)) bad.push(`aria-valuenow/min/max are ${aria()}, ${ariaWant(at.pages, at.notes)} expected`);
        if (!drag(c, "pages", "notes", [10, 20, 30])) return { pass: false, now: "no divider between Pages and Notes is drawn" };
        if (!near(tall(c, "pages"), at.pages + 30) || !near(tall(c, "notes"), at.notes - 30)) bad.push(`+30 px gave Pages ${r0(tall(c, "pages"))} and Notes ${r0(tall(c, "notes"))}, not ${r0(at.pages + 30)} and ${r0(at.notes - 30)}`);
        if (others(c, ["pages", "notes"]) !== rest) bad.push("something besides the two moved");
        const moved = { pages: tall(c, "pages"), notes: tall(c, "notes") };
        // Each frame is the state at the press moved by the distance from it: back at 0, the state is the one before the press.
        const pressed = c.state;
        if (!drag(c, "pages", "notes", [60, 0])) bad.push("the divider went missing after the first drag");
        if (c.state !== pressed || !near(tall(c, "pages"), moved.pages)) bad.push("dragged out and back to the press, the state is not the one before the press");
        if (before.items.pages?.length !== undefined) bad.push("the untouched window already asked a length");
        drag(c, "pages", "notes", [200, 5000]);
        if (!near(tall(c, "notes"), 120) || !near(tall(c, "pages"), total - 120) || kind(c, "notes") !== "open") bad.push(`far down: Notes ${r0(tall(c, "notes"))} (${kind(c, "notes")}) and Pages ${r0(tall(c, "pages"))}, not 120 and ${r0(total - 120)}`);
        if (others(c, ["pages", "notes"]) !== rest) bad.push("far down, something besides the two moved");
        drag(c, "pages", "notes", [-200, -5000]);
        if (!near(tall(c, "pages"), 160) || !near(tall(c, "notes"), total - 160) || kind(c, "pages") !== "open") bad.push(`far up: Pages ${r0(tall(c, "pages"))} (${kind(c, "pages")}) and Notes ${r0(tall(c, "notes"))}, not 160 and ${r0(total - 160)}`);
        if (aria() !== ariaWant(160, total - 160)) bad.push(`dragged far up, aria-valuenow/min/max are ${aria()}, ${ariaWant(160, total - 160)} expected`);
        key(c, "pages", "notes", "End");
        if (!near(tall(c, "notes"), 120)) bad.push(`End: Notes ${r0(tall(c, "notes"))}, not its least 120`);
        key(c, "pages", "notes", "Home");
        if (!near(tall(c, "pages"), 160)) bad.push(`Home: Pages ${r0(tall(c, "pages"))}, not its least 160`);
        const home = tall(c, "pages");
        key(c, "pages", "notes", "ArrowDown");
        if (!near(tall(c, "pages"), home + 16)) bad.push(`ArrowDown: Pages ${r0(tall(c, "pages"))}, not ${r0(home + 16)}`);
        return { pass: bad.length === 0, now: `Pages ${r0(at.pages)}/Notes ${r0(at.notes)}; +30 gave ${r0(moved.pages)}/${r0(moved.notes)}; the limits 160 and 120 hold.${report(bad)}` };
      },
    },
    {
      id: "split-reset-pair",
      title: "Panel split: double-click a divider gives its two panels their natural split back",
      expected:
        "After the divider between Pages and Notes was dragged, a double-click on it puts the two back at the split they have untouched (in proportion to their natural lengths), their combined length kept and nothing else moving. On a pair nobody dragged, a double-click changes nothing, not even the state.",
      setup: (c) => c.setState(base()),
      check(c) {
        const { bad, was } = fresh(c);
        const rest = others(c, ["pages", "notes"]);
        const untouched = c.state;
        double(c, "pages", "notes");
        if (c.state !== untouched) bad.push("a double-click on an untouched pair changed the state");
        drag(c, "pages", "notes", [40, 80]);
        if (near(tall(c, "pages"), was.pages)) bad.push("the drag moved nothing");
        double(c, "pages", "notes");
        if (!near(tall(c, "pages"), was.pages) || !near(tall(c, "notes"), was.notes)) bad.push(`after the reset Pages is ${r0(tall(c, "pages"))} and Notes ${r0(tall(c, "notes"))}, not ${r0(was.pages)} and ${r0(was.notes)}`);
        if (others(c, ["pages", "notes"]) !== rest) bad.push("something besides the two moved");
        return { pass: bad.length === 0, now: `untouched ${r0(was.pages)}/${r0(was.notes)}, reset ${r0(tall(c, "pages"))}/${r0(tall(c, "notes"))}.${report(bad)}` };
      },
    },
    {
      id: "split-double-click-after-jitter",
      title: "Panel split: a 1 px jitter between the clicks of a double-click keeps the double-click",
      expected:
        "A real pointer sequence on the divider between Pages and Notes (press, a 1 px move, release, press, release) and the double-click that follows still reach the divider: it is the same element after the redraw (a redraw updates a divider in place, never replaces it), the 1 px move moved Pages by 1 px, and the double-click puts the pair back at its natural split.",
      setup: (c) => c.setState(base()),
      check(c) {
        const { bad, was, el, p } = fresh(c);
        if (!el) return MISSING;
        pointer(el, p, "pointerdown", 0, { button: 0 });
        pointer(el, p, "pointermove", 1);
        pointer(el, p, "pointerup", 1);
        if (!near(tall(c, "pages"), was.pages + 1)) bad.push(`the 1 px move gave Pages ${r0(tall(c, "pages"))}, not ${r0(was.pages + 1)}`);
        pointer(el, p, "pointerdown", 1, { button: 0 });
        pointer(el, p, "pointerup", 1);
        if (!el.isConnected || dividerOf(c, "pages", "notes") !== el) bad.push("the divider element was replaced by a redraw, so the double-click has lost its target");
        el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        if (!near(tall(c, "pages"), was.pages) || !near(tall(c, "notes"), was.notes)) bad.push(`after the double-click Pages is ${r0(tall(c, "pages"))} and Notes ${r0(tall(c, "notes"))}, not ${r0(was.pages)} and ${r0(was.notes)}`);
        return { pass: bad.length === 0, now: `press, +1 px, release, press, release, double-click: Pages ${r0(was.pages)} -> ${r0(was.pages + 1)} -> ${r0(tall(c, "pages"))}.${report(bad)}` };
      },
    },
    {
      id: "split-pointercancel-ends-drag",
      title: "Panel split: a cancelled pointer ends the drag",
      expected:
        "A drag of the divider between Pages and Notes whose pointer is cancelled (pointercancel), or whose capture is lost (lostpointercapture), ends there: the length of the last frame stays and later moves of that pointer change nothing; the next press drags again as usual.",
      setup: (c) => c.setState(base()),
      check(c) {
        const { bad, was, el, p } = fresh(c);
        if (!el) return MISSING;
        const pages = (): number => tall(c, "pages");
        drag(c, "pages", "notes", [30], null);
        pointer(el, p, "pointercancel", 30);
        pointer(el, p, "pointermove", 80);
        if (!near(pages(), was.pages + 30)) bad.push(`after pointercancel a move of 80 gave Pages ${r0(pages())}, not ${r0(was.pages + 30)}`);
        const first = pages();
        drag(c, "pages", "notes", [10], null);
        pointer(el, p, "lostpointercapture", 10);
        pointer(el, p, "pointermove", 50);
        if (!near(pages(), first + 10)) bad.push(`after lostpointercapture a move of 50 gave Pages ${r0(pages())}, not ${r0(first + 10)}`);
        const second = pages();
        drag(c, "pages", "notes", [5]);
        if (!near(pages(), second + 5)) bad.push(`a new drag gave Pages ${r0(pages())}, not ${r0(second + 5)}`);
        return { pass: bad.length === 0, now: `Pages ${r0(was.pages)} -> ${r0(first)} (cancel) -> ${r0(second)} (lost capture) -> ${r0(pages())} (a new drag).${report(bad)}` };
      },
    },
    {
      id: "split-reset-column",
      title: "Panel split: Shift+double-click a divider clears every length of its column, and only that column",
      expected:
        "With lengths asked in the left column (a dragged divider) and one in the right column, a Shift+double-click on the left divider deletes every asked length of the left column, back to the split it has untouched; the right column's length stays and its panel keeps drawing at it.",
      setup: (c) => c.setState(base()),
      check(c) {
        const { bad, was } = fresh(c);
        drag(c, "pages", "notes", [50]);
        const s = c.state;
        c.commit({ ...s, items: { ...s.items, findings: { ...s.items.findings!, length: { column: 300 } } } });
        const findings = tall(c, "findings");
        if (c.state.items.pages?.length === undefined || c.state.items.notes?.length === undefined) bad.push("the drag asked no lengths");
        double(c, "pages", "notes", true);
        if (c.state.items.pages?.length !== undefined || c.state.items.notes?.length !== undefined) bad.push("a left panel still asks a length");
        if (c.state.items.findings?.length?.column !== 300) bad.push("the right column's length was cleared");
        if (!near(tall(c, "pages"), was.pages) || !near(tall(c, "notes"), was.notes)) bad.push(`the left column is ${r0(tall(c, "pages"))}/${r0(tall(c, "notes"))}, not its untouched ${r0(was.pages)}/${r0(was.notes)}`);
        if (!near(tall(c, "findings"), findings)) bad.push("Findings moved");
        return { pass: bad.length === 0, now: `left back to ${r0(tall(c, "pages"))}/${r0(tall(c, "notes"))}, Findings still ${r0(tall(c, "findings"))}.${report(bad)}` };
      },
    },
    {
      id: "split-collapsed-between",
      title: "Panel split: a collapsed panel between two open ones gives one divider, on its lower edge",
      expected:
        "Pages, Notes folded to its header, and Findings in one column: a single divider is drawn, between Pages and Findings, centered on Notes' lower edge (no divider of Notes' own). Dragging it trades length between Pages and Findings, Notes' header unchanged, with both clamped at their least (160 and 140 px).",
      setup: (c) => c.setState(collapsed()),
      check(c) {
        c.setState(collapsed());
        const bad: string[] = [];
        const forms = ["pages", "notes", "findings"].map((id) => kind(c, id as ItemId)).join("/");
        if (forms !== "open/header/open") return { pass: false, now: `the forms are ${forms}, open/header/open expected` };
        const el = dividerOf(c, "pages", "findings");
        if (dividerCount(c) !== 1 || !el) return { pass: false, now: `${dividerCount(c)} dividers drawn; one between Pages and Findings expected` };
        const notes = c.layout.items.notes!.rect;
        const lower = notes.y + notes.height;
        // The library's strip starts on Notes' lower edge (as thick as the gap to Findings); the grab zone is centered on it.
        const strip = dividers(c.state, c.layout)[0]!.rect;
        const line = parseFloat(el.style.top) + parseFloat(el.style.height) / 2;
        if (!near(strip.y, lower)) bad.push(`the divider's strip starts at ${r0(strip.y)} px, Notes' lower edge is at ${r0(lower)}`);
        if (line < lower - 0.6 || line > lower + strip.height + 0.6) bad.push(`the grab zone is centered at ${r0(line)} px, not on the strip ${r0(lower)}..${r0(lower + strip.height)}`);
        const at = { pages: tall(c, "pages"), findings: tall(c, "findings"), notes: tall(c, "notes") };
        drag(c, "pages", "findings", [25]);
        if (!near(tall(c, "pages"), at.pages + 25) || !near(tall(c, "findings"), at.findings - 25)) bad.push(`+25 px gave Pages ${r0(tall(c, "pages"))} and Findings ${r0(tall(c, "findings"))}, not ${r0(at.pages + 25)} and ${r0(at.findings - 25)}`);
        if (!near(tall(c, "notes"), at.notes) || kind(c, "notes") !== "header") bad.push("Notes' header changed");
        drag(c, "pages", "findings", [100, 5000]);
        if (!near(tall(c, "findings"), 140)) bad.push(`far down: Findings ${r0(tall(c, "findings"))}, not its least 140`);
        drag(c, "pages", "findings", [-100, -5000]);
        if (!near(tall(c, "pages"), 160)) bad.push(`far up: Pages ${r0(tall(c, "pages"))}, not its least 160`);
        return { pass: bad.length === 0, now: `one divider at ${r0(line)} px on Notes' lower edge; Pages ${r0(at.pages)}/Findings ${r0(at.findings)}, +25 moved both.${report(bad)}` };
      },
    },
    {
      id: "split-reopen-keeps-proportion",
      title: "Panel split: a panel collapsed through a resize reopens in proportion",
      expected:
        "Pages, Notes folded and Findings in one column; the divider between Pages and Findings is dragged, which writes the lengths of those two panels only, in ask units; folded Notes, which asked for none, gets none. Unfolded again, the three share the column by the one rule: with room, in proportion to their asked lengths (Notes asking its natural); short of room, each at the same share of the way from its least to its length. The column's total is the same, none under its least, and Notes is open.",
      setup: (c) => c.setState(collapsed(TALL)),
      check(c) {
        c.setState(collapsed(TALL));
        const bad: string[] = [];
        const open = { pages: 320, notes: 200, findings: 260 };
        const least = { pages: 160, notes: 120, findings: 140 };
        const total = tall(c, "pages") + tall(c, "notes") + tall(c, "findings");
        drag(c, "pages", "findings", [40]);
        // A panel that asked for no length asks its natural.
        const len = (id: "pages" | "notes" | "findings"): number => c.state.items[id]?.length?.column ?? open[id];
        if (c.state.items.notes?.length?.column !== undefined) bad.push(`Notes was written a length (${r0(c.state.items.notes.length.column)}), a bystander of the drag gets none`);
        c.commit(foldItem(c.state, "notes", false));
        const ids = ["pages", "notes", "findings"] as const;
        if (ids.some((id) => kind(c, id) !== "open")) bad.push(`the forms are ${ids.map((id) => kind(c, id)).join("/")}, open all three expected`);
        const sum = ids.reduce((s, id) => s + tall(c, id), 0);
        if (!near(sum, total)) bad.push(`the three take ${r0(sum)}, the column had ${r0(total)}`);
        for (const id of ids) if (tall(c, id) < least[id] - 0.6) bad.push(`${id} is ${r0(tall(c, id))}, under its least ${least[id]}`);
        // Room is judged as the floor rule does: each asks at least its least, and the column holds all of that.
        const room = ids.reduce((s, id) => s + Math.max(len(id), least[id]), 0) <= total + 0.6;
        // With room each is drawn at its length times one factor, or at its least when that is more (an item held there has
        // a length times the factor under its least); short, each is the same share of the way from its least to its length
        // (an ask under the least reads as the least, and the item is at its least).
        const held = (id: (typeof ids)[number]): boolean => tall(c, id) <= least[id] + 0.6;
        const free = ids.filter((id) => !held(id));
        const share = (id: (typeof ids)[number]): number => (room ? tall(c, id) / len(id) : (tall(c, id) - least[id]) / (len(id) - least[id]));
        const shares = free.map(share);
        if (shares.length > 0 && Math.max(...shares) - Math.min(...shares) > 0.01) bad.push(`the shares differ: ${free.map((id, i) => `${id} ${r0(shares[i]! * 1000) / 1000}`).join(", ")} (${room ? "with room" : "short"})`);
        if (room && shares.length > 0) for (const id of ids) if (held(id) && len(id) * shares[0]! > least[id] + 0.6) bad.push(`${id} is held at its least ${least[id]}, but its length ${r0(len(id))} at the factor ${r0(shares[0]! * 1000) / 1000} is over it`);
        return { pass: bad.length === 0, now: `Notes asks ${r0(len("notes"))}; reopened: ${ids.map((id) => `${id} ${r0(tall(c, id))}`).join(", ")} of ${r0(total)}.${report(bad)}` };
      },
    },
  ];
}
