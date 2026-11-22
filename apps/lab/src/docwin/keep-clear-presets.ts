/**
 * An overlay strip anchored to the content (`AnchoredKeepClear`: the content's right 24 px, kept clear by floats): the
 * reference window, and the two drops that move the content under it, checked on the DockState directly.
 * - the last panel dragged out of its column: the column closes, the content widens, the strip moves right;
 * - a column opened by the drop: the content narrows, the strip moves left.
 * Each drop's `after` layout has the strip where its own content puts it, and a float fits against it there.
 */
import { overlaps, type Rect } from "@n-uf/placement";
import { dockDrag, solve, targets, type AnchoredKeepClear, type DockLayout, type DockState } from "@n-uf/docking";
import { same as sameRect } from "../shared/geometry";
import type { Docwin } from "./dock-state";
import { DEFAULT_SIZE, defaultState, floating } from "./model";

interface Verdict {
  readonly pass: boolean;
  readonly now: string;
}
interface Preset {
  readonly id: string;
  readonly title: string;
  readonly expected: string;
  setup(c: Docwin): void;
  check(c: Docwin): Verdict;
}

const STRIP: AnchoredKeepClear = { region: "content", side: "right", size: 24, for: "floats", id: "strip" };
const withStrip = (s: DockState): DockState => ({ ...s, keepClear: [...(s.keepClear ?? []), STRIP] });
const stripOf = (l: DockLayout): Rect | undefined => l.keepClear?.find((c) => c.id === "strip")?.rect;
/** Where the content's right 24 px lie in `l`. */
const expectedStrip = (l: DockLayout): Rect => ({ x: l.content.x + l.content.width - 24, y: l.content.y, width: 24, height: l.content.height });
/** To the px (the window draws the strip at whole px offsets). */
const px = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });
const same = (a: Rect | undefined, b: Rect | undefined): boolean => !!a && !!b && sameRect(px(a), px(b));
const show = (r: Rect | undefined): string => (r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}` : "none");

/** The reference window: the default one with the strip. */
const reference = (): DockState => withStrip(defaultState(DEFAULT_SIZE));
/** The default window with Findings floated: the right column empty, so a drop there opens it. */
const rightOpen = (): DockState => withStrip(floating(defaultState(DEFAULT_SIZE), "findings", { x: 420, y: 180, width: 260, height: 300 }));

/** Every target of `id`: its `after` is `solve` of its own state, the strip where that layout's content puts it. */
function everyAfter(s: DockState, id: string, bad: string[]): number {
  const previous = solve(s);
  let n = 0;
  for (const t of targets(s, id, { previous })) {
    const a = t.after({ x: s.stage.width - 30, y: s.stage.height / 2 });
    n++;
    if (JSON.stringify(solve(a.state, { previous })) !== JSON.stringify(a.layout)) bad.push(`${t.id}: after is not solve(after.state)`);
    if (!same(stripOf(a.layout), expectedStrip(a.layout))) bad.push(`${t.id}: strip ${show(stripOf(a.layout))}, its content's ${show(expectedStrip(a.layout))}`);
  }
  return n;
}

function referenceWindow(): Preset {
  return {
    id: "keep-clear-anchored-strip",
    title: "An overlay strip anchored to the content's right edge",
    expected:
      "The default window with a 24 px overlay strip declared at the content's right edge for floats (`{ region: \"content\", side: \"right\", size: 24, for: \"floats\" }`). The layout gives it back in `keepClear` at the content's right 24 px, and the window draws it there (a tinted box over the pages, by the right column). Tools, anchored at the content's top-right corner, sits left of it, not on it. The panels and toolbars lie as without the strip.",
    setup: (c) => c.setState(reference()),
    check(c): Verdict {
      const bad: string[] = [];
      const l = c.layout;
      const r = stripOf(l);
      if (!same(r, expectedStrip(l))) bad.push(`strip at ${show(r)}, the content's right 24 px are ${show(expectedStrip(l))}`);
      const el = c.win.querySelector<HTMLElement>('[data-keep-clear="strip"]');
      const drawn = el ? { x: el.offsetLeft, y: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight } : undefined;
      if (!same(drawn, r)) bad.push(`drawn at ${show(drawn)}`);
      const tools = l.items.tools?.rect;
      if (tools && r && overlaps(tools, r)) bad.push(`Tools ${show(tools)} lies on the strip`);
      const bare = solve({ ...c.state, keepClear: [] });
      const docked = (x: DockLayout): string => JSON.stringify([x.content, x.edges, Object.entries(x.items).filter(([, it]) => !it.floating)]);
      if (docked(bare) !== docked(l)) bad.push("the docked items moved for the strip");
      return { pass: bad.length === 0, now: `Strip ${show(r)}, drawn ${show(drawn)}, Tools ${show(tools)}.${bad.length ? ` Broken: ${bad.join("; ")}.` : ""}` };
    },
  };
}

function lastPanelOut(): Preset {
  return {
    id: "keep-clear-anchored-last-panel-out",
    title: "The last panel dragged out of its column: the strip moves with the content",
    expected:
      "With the strip, Findings (the right column's only panel) dropped as a float by the window's right edge: the column closes, the content widens to the window's right, and the drop's layout has the strip at that content's right 24 px, not where it lies now. The float's marker (its rect in the drop's layout) is exactly where the commit draws it, clear of the strip there. Every Findings target's layout is `solve` of its own state.",
    setup: (c) => c.setState(reference()),
    check(): Verdict {
      const bad: string[] = [];
      const s = reference();
      const previous = solve(s);
      const n = everyAfter(s, "findings", bad);
      const drag = dockDrag(s, "findings", { previous });
      const seen = stripOf(previous);
      const a = drag.after({ kind: "float", point: { x: s.stage.width - 40, y: 300 } });
      const moved = stripOf(a.layout);
      if (same(moved, seen)) bad.push(`the strip did not move (${show(moved)})`);
      if (!a.landing) bad.push("no float landing");
      else {
        if (!same(a.landing, solve(a.state, { previous }).items.findings?.rect)) bad.push(`the marker ${show(a.landing)} is not the committed rect`);
        if (moved && overlaps(a.landing, moved)) bad.push(`the marker ${show(a.landing)} lies on the strip`);
      }
      return { pass: bad.length === 0, now: `${n} targets; strip now ${show(seen)}, after the drop ${show(moved)}; marker ${show(a.landing ?? undefined)}.${bad.length ? ` Broken: ${bad.slice(0, 4).join("; ")}.` : ""}` };
    },
  };
}

function columnOpened(): Preset {
  return {
    id: "keep-clear-anchored-column-opened",
    title: "A column opened by the drop: the strip moves with the content",
    expected:
      "With the strip and Findings floated (the right column empty), Notes dropped into the right column opens it: the content narrows, and the drop's layout has the strip at that content's right 24 px, by the new column. Floats in that layout keep clear of it there. Every Notes target's layout is `solve` of its own state.",
    setup: (c) => c.setState(rightOpen()),
    check(): Verdict {
      const bad: string[] = [];
      const s = rightOpen();
      const previous = solve(s);
      const n = everyAfter(s, "notes", bad);
      const t = targets(s, "notes", { previous }).find((x) => x.place.kind === "gap" && x.place.edge === "right");
      let now = "no drop into the right column";
      if (!t) bad.push(now);
      else {
        const a = t.after({ x: s.stage.width - 100, y: 200 });
        const r = stripOf(a.layout);
        if (same(r, stripOf(previous))) bad.push("the strip did not move");
        for (const id of a.layout.floats) if (r && overlaps(a.layout.items[id]!.rect, r) && !a.layout.notes.some((x) => x.code === "float-covers" && x.id === id)) bad.push(`${id} lies on the strip`);
        now = `${t.id}: strip now ${show(stripOf(previous))}, after the drop ${show(r)}`;
      }
      return { pass: bad.length === 0, now: `${n} targets; ${now}.${bad.length ? ` Broken: ${bad.slice(0, 4).join("; ")}.` : ""}` };
    },
  };
}

/** `rightOpen()` with the strip active only while the content is at least 100 px narrower than it is now. */
function boundedStrip(): DockState {
  const s = floating(defaultState(DEFAULT_SIZE), "findings", { x: 420, y: 180, width: 260, height: 300 });
  const wide = solve(s).content.width;
  return { ...s, keepClear: [{ ...STRIP, minRegion: { width: wide - 100 } }] };
}

function minRegion(): Preset {
  return {
    id: "keep-clear-anchored-min-region",
    title: "A strip that applies only while the content is wide enough",
    expected:
      "With Findings floated (the right column empty), the strip declares `minRegion: { width }` at 100 px under the content's width now: it is drawn. Notes dropped into the right column opens it and takes the content under that width: in the drop's layout the strip is absent (not drawn, keeping nothing clear), and the landing a held frame shows is exactly where the commit draws Notes.",
    setup: (c) => c.setState(boundedStrip()),
    check(c): Verdict {
      const bad: string[] = [];
      const s = boundedStrip();
      const previous = solve(s);
      if (!stripOf(c.layout)) bad.push("the strip is not active at rest");
      if (!c.win.querySelector('[data-keep-clear="strip"]')) bad.push("the strip is not drawn at rest");
      const drag = dockDrag(s, "notes", { previous });
      const lane = drag.regions.lanes.find((l) => l.id === "right" || l.id.startsWith("column:right"));
      let now = "no right-column lane";
      if (!lane?.spots[0]) bad.push(now);
      else {
        const a = drag.after({ kind: "spot", spot: lane.spots[0].id, point: { x: s.stage.width - 100, y: 200 } });
        if (a.layout.keepClear?.length) bad.push(`the strip is still active at content width ${Math.round(a.layout.content.width)}`);
        if (!same(a.landing ?? undefined, solve(a.state, { previous }).items.notes?.rect)) bad.push(`the landing ${show(a.landing ?? undefined)} is not the committed rect`);
        now = `content ${Math.round(previous.content.width)} -> ${Math.round(a.layout.content.width)} px, strip after the drop ${a.layout.keepClear?.length ? "active" : "absent"}`;
      }
      return { pass: bad.length === 0, now: `${now}.${bad.length ? ` Broken: ${bad.join("; ")}.` : ""}` };
    },
  };
}

export function KEEP_CLEAR_PRESETS(): Preset[] {
  return [referenceWindow(), lastPanelOut(), columnOpened(), minRegion()];
}
