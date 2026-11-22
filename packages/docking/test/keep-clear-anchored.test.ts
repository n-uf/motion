/**
 * Keep-clear rects anchored to the layout's content (`AnchoredKeepClear`): an overlay strip at the content's right edge
 * moves with the content a drop opens or closes. The rule: no input of a solve comes from that solve's own output, so
 * every drop's `after` layout has the strip where that layout's content puts it, and a float fits against it there.
 */
import { describe, expect, it } from "vitest";
import { overlaps, type Rect } from "@n-uf/placement";
import { dockDrag, readDockState, solve, storeDockState, targets, type AnchoredKeepClear, type DockLayout, type DockState, type KeepClear } from "../src";
import { modelState } from "./model-window";
import { windowState } from "./fixture";

const STRIP = 24;
const strip = (f: "all" | "floats" = "floats", side: AnchoredKeepClear["side"] = "right"): AnchoredKeepClear => ({ region: "content", side, size: STRIP, for: f, id: "strip" });
const withKeepClear = (s: DockState, ...cs: (KeepClear | AnchoredKeepClear)[]): DockState => ({ ...s, keepClear: [...(s.keepClear ?? []), ...cs] });
const rightOf = (r: Rect): number => r.x + r.width;
const stripOf = (l: DockLayout): Rect => l.keepClear!.find((c) => c.id === "strip")!.rect;

/** The document window with column templates on both sides: a right column holding one panel, its last. */
function oneRightPanel(): DockState {
  const s = windowState();
  const tpl = { accepts: ["panel" as const, "group" as const], cross: { min: 160, max: 480, rail: 32 } };
  return {
    ...s,
    edges: s.edges.map((e) => (e.id === "right" ? { ...e, items: ["findings"], column: true } : e.id === "toolbar" ? { ...e, items: [...e.items, "marks"] } : e.side === "left" ? { ...e, column: true } : e)),
    columns: { left: tpl, right: tpl },
  };
}
/** The same window with nothing on the right: a drop there opens a column. */
function noRightColumn(): DockState {
  const s = oneRightPanel();
  return { ...s, edges: s.edges.filter((e) => e.id !== "right"), floats: [...s.floats, { id: "findings", rect: { x: 300, y: 300, width: 260, height: 300 } }] };
}
/** The rows: the last panel dragged out of its column, and a column opened by the drop. */
const ROWS: readonly { readonly name: string; readonly state: DockState; readonly dragged: string }[] = [
  { name: "the last panel dragged out of its column", state: withKeepClear(oneRightPanel(), strip()), dragged: "findings" },
  { name: "a column opened by the drop", state: withKeepClear(noRightColumn(), strip()), dragged: "notes" },
];

describe("the resolver", () => {
  it("lays the strip at the content's side, clamped to it, with its id; an empty region gives none", () => {
    const s = withKeepClear(windowState(), strip(), { region: "content", side: "bottom", size: 5000, for: "all" });
    const l = solve(s);
    expect(stripOf(l)).toEqual({ x: rightOf(l.content) - STRIP, y: l.content.y, width: STRIP, height: l.content.height });
    expect(l.keepClear![1]).toEqual({ rect: l.content, for: "all" });
    const flat = solve({ ...s, stage: { ...s.stage, height: 60 } });
    expect(flat.content.height <= 0 ? flat.keepClear : flat.keepClear!.length).toEqual(flat.content.height <= 0 ? [] : 2);
    expect(solve({ ...s, keepClear: [{ ...strip(), size: 0 }] }).keepClear).toEqual([]);
  });

  it("a state with fixed rects only has no keepClear on its layout", () => {
    const s = withKeepClear(windowState(), { x: 900, y: 0, width: 24, height: 800 });
    expect("keepClear" in solve(s)).toBe(false);
    expect("keepClear" in solve(windowState())).toBe(false);
  });

  it("is a declaration: never stored, read back from base", () => {
    const s = ROWS[0]!.state;
    const stored = storeDockState(s);
    expect(JSON.stringify(stored)).not.toContain("region");
    expect(readDockState(stored, s).state.keepClear).toEqual(s.keepClear);
  });
});

describe("pin: nothing that sizes the content reads keep-clear rects", () => {
  it("over the model windows: the content, edges, rails and docked items are those without any keep-clear rect", () => {
    const bad: string[] = [];
    for (const [flush, middle, railDrop] of [[false, false, false], [true, true, false], [false, false, true]] as const)
      for (let seed = 1; seed <= 40; seed++) {
        const s = modelState(seed, flush, middle, railDrop);
        const bare = solve({ ...s, keepClear: [] });
        const big = { x: s.stage.x, y: s.stage.y, width: s.stage.width / 2, height: s.stage.height };
        for (const cs of [[strip("all"), strip("all", "left"), { ...strip("all", "top"), size: 400 }], [big], [{ ...big, for: "floats" as const }, strip()]]) {
          const l = solve(withKeepClear({ ...s, keepClear: [] }, ...cs));
          const docked = (x: DockLayout): string => JSON.stringify([x.content, x.edges, x.rails, x.railPlaces, x.columnRoom ?? null, Object.entries(x.items).filter(([, it]) => !it.floating)]);
          if (docked(l) !== docked(bare)) bad.push(`seed ${seed} ${JSON.stringify(cs.map((c) => ("region" in c ? c.side : "fixed")))}`);
        }
      }
    expect(bad.slice(0, 10)).toEqual([]);
  });
});

describe.each(ROWS)("$name", ({ state, dragged }) => {
  const previous = solve(state);
  const ts = targets(state, dragged, { previous });

  it("(1) solve(after().state) equals after().layout for every target", () => {
    expect(ts.length).toBeGreaterThan(3);
    for (const t of ts)
      for (const p of [{ x: 600, y: 400 }, { x: rightOf(stripOf(previous)) - 4, y: 300 }]) {
        const a = t.after(p);
        expect(solve(a.state, { previous }), t.id).toEqual(a.layout);
        // Its strip is the one its own content puts there.
        expect(stripOf(a.layout), t.id).toEqual({ x: rightOf(a.layout.content) - STRIP, y: a.layout.content.y, width: STRIP, height: a.layout.content.height });
      }
  });

  it("(2) a float marker is the dragged item's rect in after().layout, clear of the strip there", () => {
    const drag = dockDrag(state, dragged, { previous });
    let moved = 0;
    for (let y = 120; y <= 640; y += 130)
      for (const x of [rightOf(stripOf(previous)) - 12, rightOf(stripOf(previous)) + 40, 1150]) {
        const a = drag.after({ kind: "float", point: { x, y } });
        if (!a.landing) continue;
        expect(a.landing).toEqual(a.layout.items[dragged]!.rect);
        expect(solve(a.state, { previous }).items[dragged]!.rect).toEqual(a.landing);
        if (!a.layout.notes.some((n) => n.code === "float-covers" && n.id === dragged)) expect(overlaps(a.landing, stripOf(a.layout)), `${x},${y}`).toBe(false);
        if (JSON.stringify(stripOf(a.layout)) !== JSON.stringify(stripOf(previous))) moved++;
      }
    // The drop moves the strip: a strip taken from the layout seen would be stale here.
    if (state === ROWS[0]!.state) expect(moved).toBeGreaterThan(0);
  });

  it("a drop's fit reads its own layout: a drop that opens a column is refused only for its own strip", () => {
    const allStrip = withKeepClear({ ...state, keepClear: [] }, strip("all"));
    for (const t of targets(allStrip, dragged, { previous: solve(allStrip) })) {
      if (t.free || t.place.kind === "home" || t.place.kind === "none") continue;
      const a = t.after({ x: 600, y: 400 });
      const me = a.layout.items[dragged];
      if (me && !me.floating && !me.inMenu) expect(overlaps(me.rect, stripOf(a.layout)), t.id).toBe(false);
    }
  });
});

describe("(3) a strip anchored where a fixed rect lies acts as that rect on screen", () => {
  it("the hits and the floats of the layout seen are the fixed rect's", () => {
    for (const f of ["all", "floats"] as const) {
      const base = windowState();
      const anchored = withKeepClear(base, strip(f));
      const r = stripOf(solve(anchored));
      const fixed = withKeepClear(base, { ...r, for: f });
      expect(solve(anchored).items, f).toEqual(solve(fixed).items);
      for (const id of ["findings", "pages", "zoom", "tools"]) {
        const hits = (s: DockState): Map<string, string> => new Map(targets(s, id).map((t) => [t.id, JSON.stringify([t.hit, t.hits ?? null])]));
        const a = hits(anchored);
        const b = hits(fixed);
        for (const [k, v] of a) if (b.has(k)) expect(v, `${f} ${id} ${k}`).toBe(b.get(k));
      }
    }
  });
});

describe("guides: a lane predicted in another layout gives way to the strip on screen", () => {
  // An empty right edge (its lane drawn in the layout that creates it) and no right edge (a new column's lane).
  const emptyRight = (): DockState => {
    const s = noRightColumn();
    return { ...s, edges: [...s.edges, { id: "right", side: "right", ring: 0, accepts: ["panel", "group"], items: [], cross: { min: 160, max: 480, rail: 32 } }] };
  };
  it.each([
    ["an empty edge", emptyRight(), "right"],
    ["a new column", noRightColumn(), "column:right:$"],
  ] as const)("%s: its box is trimmed by the strip on screen, not dropped; without an anchored rect nothing is cut", (_, base, lane) => {
    const s = withKeepClear(base, strip("all"));
    const drag = dockDrag(s, "notes", { previous: solve(s) });
    const frame = { held: null, room: false, guides: drag.regions.lanes.map((l) => ({ lane: l.id, held: null })) };
    const onScreen = stripOf(drag.shown(frame));
    const gs = drag.guides(frame);
    for (const g of gs) expect(overlaps(g.rect, onScreen), g.id).toBe(false);
    const box = gs.find((g) => g.lane === lane && g.kind === "box")!;
    expect(rightOf(box.rect)).toBe(onScreen.x);
    const bare = dockDrag(base, "notes", { previous: solve(base) });
    const bareBox = bare.guides({ ...frame, guides: bare.regions.lanes.map((l) => ({ lane: l.id, held: null })) }).find((g) => g.lane === lane && g.kind === "box")!;
    expect(bareBox.rect.width).toBe(box.rect.width + STRIP);
  });
});
