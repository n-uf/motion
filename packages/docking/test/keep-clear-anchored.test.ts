/**
 * Keep-clear rects anchored to the layout's content (`AnchoredKeepClear`): an overlay strip at the content's right edge
 * moves with the content a drop opens or closes. The rule: no input of a solve comes from that solve's own output, so
 * every drop's `after` layout has the strip where that layout's content puts it, and a float fits against it there.
 */
import { describe, expect, it } from "vitest";
import { overlaps, subtract, type Rect } from "@n-uf/placement";
import { dockDrag, fitResize, isAnchoredKeepClear, readDockState, solve, storeDockState, targets, type AnchoredKeepClear, type DockDrop, type DockLayout, type DockState, type KeepClear } from "../src";
import { modelState } from "./model-window";
import { anchorState, windowState } from "./fixture";
import { trimmedBy } from "../src/drag";
import type { DockMark } from "../src/lanes";

describe("trimming a predicted mark by the strip on screen", () => {
  const clear = { x: 100, y: 0, width: 24, height: 400 };
  const mark = (rect: Rect): DockMark => ({ id: "m", kind: "line", rect }) as DockMark;
  it("a zero-thick line whose line lies inside a clear is trimmed along it, or dropped when nothing is left", () => {
    // Vertical, inside the clear over its whole length: dropped.
    expect(trimmedBy([mark({ x: 110, y: 50, width: 0, height: 200 })], [clear])).toEqual([]);
    // Horizontal, crossing the clear: the longer side kept.
    expect(trimmedBy([mark({ x: 0, y: 200, width: 300, height: 0 })], [clear]).map((m) => m.rect)).toEqual([{ x: 124, y: 200, width: 176, height: 0 }]);
    // On the clear's edge (it only touches it) or beside it: whole, the same object.
    const edge = mark({ x: 100, y: 50, width: 0, height: 200 });
    expect(trimmedBy([edge], [clear])[0]).toBe(edge);
    const beside = mark({ x: 0, y: 50, width: 0, height: 200 });
    expect(trimmedBy([beside], [clear])[0]).toBe(beside);
  });
  it("a short line or a point away from every clear stays whole, however short", () => {
    for (const r of [{ x: 300, y: 50, width: 0, height: 0.5 }, { x: 300, y: 50, width: 0.4, height: 0 }, { x: 300, y: 50, width: 0, height: 0 }]) {
      const m = mark(r);
      expect(trimmedBy([m], [clear]), JSON.stringify(r)).toEqual([m]);
      expect(trimmedBy([m], [clear])[0]).toBe(m);
    }
    // A point inside a clear is dropped.
    expect(trimmedBy([mark({ x: 110, y: 50, width: 0, height: 0 })], [clear])).toEqual([]);
  });
  it("a box keeps its largest piece clear of the rect", () => {
    expect(trimmedBy([{ ...mark({ x: 0, y: 0, width: 124, height: 300 }), kind: "box" } as DockMark], [clear]).map((m) => m.rect)).toEqual([{ x: 0, y: 0, width: 100, height: 300 }]);
  });
});

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
    // A host narrows an entry with the root's `isAnchoredKeepClear` (`"region" in c`).
    expect((s.keepClear ?? []).map(isAnchoredKeepClear)).toEqual([true]);
    expect(isAnchoredKeepClear({ x: 0, y: 0, width: 24, height: 24 })).toBe(false);
  });
});

describe("minRegion: an anchored entry applies only while its region is at least that size", () => {
  const base = windowState();
  const content = solve(base).content;
  const at = (minRegion: AnchoredKeepClear["minRegion"]): DockLayout => solve(withKeepClear(base, { ...strip("all"), minRegion }));

  it("just under the bound it is inactive (absent, keeps nothing clear); at the bound it is active", () => {
    for (const [under, bound] of [
      [{ width: content.width + 1 }, { width: content.width }],
      [{ height: content.height + 1 }, { height: content.height }],
      [{ width: content.width, height: content.height + 1 }, { width: content.width, height: content.height }],
    ] as const) {
      expect(at(under).keepClear, JSON.stringify(under)).toEqual([]);
      expect(at(bound).keepClear!.map((c) => c.rect), JSON.stringify(bound)).toEqual([{ x: rightOf(content) - STRIP, y: content.y, width: STRIP, height: content.height }]);
    }
    // Inactive, it keeps nothing clear: the targets and floats are the window's without it. Active, the float that lies
    // over it moves aside.
    const over: DockState = { ...base, floats: [{ id: "notes", rect: { x: rightOf(content) - 120, y: 200, width: 110, height: 320 } }] };
    const off = withKeepClear(over, { ...strip("all"), minRegion: { width: content.width + 1 } });
    const shape = (s: DockState): string => JSON.stringify([solve(s).items, targets(s, "findings").map((t) => [t.id, t.hit, t.hits ?? null])]);
    expect(shape(off)).toBe(shape(over));
    const on = withKeepClear(over, { ...strip("all"), minRegion: { width: content.width } });
    expect(overlaps(solve(over).items.notes!.rect, stripOf(solve(on)))).toBe(true);
    expect(overlaps(solve(on).items.notes!.rect, stripOf(solve(on)))).toBe(false);
  });

  it("a drop that opens a column and takes the content under the bound: its after() has no entry, and its landing is the commit's", () => {
    const s0 = noRightColumn();
    const wide = solve(s0).content.width;
    const s = withKeepClear(s0, { ...strip("all"), minRegion: { width: wide - 100 } });
    const previous = solve(s);
    expect(previous.keepClear).toHaveLength(1);
    const opening = targets(s, "notes", { previous }).filter((t) => t.place.kind === "column" && t.place.side === "right");
    expect(opening.length).toBeGreaterThan(0);
    for (const t of opening) {
      const a = t.after({ x: 1100, y: 300 });
      expect(a.layout.content.width, t.id).toBeLessThan(wide - 100);
      expect(a.layout.keepClear, t.id).toEqual([]);
      expect(solve(a.state, { previous }), t.id).toEqual(a.layout);
    }
    // The drag's marker for that drop is its landing, as the commit draws it.
    const drag = dockDrag(s, "notes", { previous });
    const lane = drag.regions.lanes.find((l) => l.id.startsWith("column:right"))!;
    const held = drag.after({ kind: "spot", spot: lane.spots[0]!.id, point: { x: 1100, y: 300 } });
    expect(held.layout.keepClear).toEqual([]);
    expect(held.landing).toEqual(solve(held.state, { previous }).items.notes!.rect);
    // A float dropped while the column stays closed keeps the strip: the region is still wide enough.
    const float = drag.after({ kind: "float", point: { x: 1150, y: 300 } });
    expect(float.layout.keepClear).toHaveLength(1);
    expect(float.landing).toEqual(solve(float.state, { previous }).items.notes!.rect);
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
    // Some drop really moves the content, so the strip checks below can't pass by the content standing still.
    expect(ts.some((t) => JSON.stringify(t.after({ x: 600, y: 400 }).layout.content) !== JSON.stringify(previous.content))).toBe(true);
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
        expect([...a.keys()].sort(), `${f} ${id}`).toEqual([...b.keys()].sort());
        for (const [k, v] of a) expect(v, `${f} ${id} ${k}`).toBe(b.get(k));
      }
    }
  });

  /** The window with an empty right edge: its drop strip and new-column hit lie inside the content, under the strip. */
  const emptyRightEdge = (): DockState => {
    const s = noRightColumn();
    return { ...s, edges: [...s.edges, { id: "right", side: "right", ring: 0, accepts: ["panel", "group"], items: [], cross: { min: 160, max: 480, rail: 32 } }] };
  };
  /** `base` with the strip anchored, and with a fixed rect where the strip lies on screen. */
  const pair = (base: DockState, f: "all" | "floats"): { anchored: DockState; fixed: DockState; r: Rect } => {
    const anchored = withKeepClear(base, strip(f));
    const r = stripOf(solve(anchored));
    return { anchored, fixed: withKeepClear(base, { ...r, for: f }), r };
  };
  const hitsOf = (s: DockState, id: string): string => JSON.stringify(targets(s, id).map((t) => [t.id, t.hit, t.hits ?? null]));

  it("targets whose hits grow into the strip (the edge's drop strip, a new column's least hit) are cut and kept from growing there, as by the fixed rect", () => {
    let extras = 0;
    const areaOf = (hs: readonly Rect[]): number => hs.reduce((s, h) => s + h.width * h.height, 0);
    for (const base of [emptyRightEdge(), noRightColumn()]) {
      const { anchored, fixed, r } = pair(base, "all");
      for (const id of ["notes", "zoom"]) {
        // A strip for floats only leaves every target as it is.
        expect(hitsOf(withKeepClear(base, strip("floats")), id), `floats ${id}`).toBe(hitsOf(base, id));
        const reaching = targets(base, id).filter((t) => !t.free && (t.hits ?? [t.hit]).some((h) => overlaps(h, r)));
        expect(reaching.length, id).toBeGreaterThan(0);
        for (const t of targets(anchored, id)) if (!t.free) for (const h of t.hits ?? [t.hit]) expect(overlaps(h, r), `${id} ${t.id}`).toBe(false);
        // On screen the hits are the fixed rect's. A drop that opens the right edge moves the content and the strip with
        // it, so its landing is clear of the strip in its own layout: the fixed rect, left where the strip was, refuses
        // it (the stale input this fixes). Those are the only targets the two differ by.
        const a = new Map(targets(anchored, id).map((t) => [t.id, t]));
        const b = new Map(targets(fixed, id).map((t) => [t.id, t]));
        const content = JSON.stringify(solve(anchored).content);
        const extra = [...a.keys()].filter((k) => !b.has(k));
        for (const k of extra) expect(JSON.stringify(a.get(k)!.after({ x: 1190, y: 300 }).layout.content), `${id} ${k}`).not.toBe(content);
        // Every other target has the fixed rect's hits, less what those extra targets own (a neighbor gives them its corner).
        const owned = extra.flatMap((k) => a.get(k)!.hits ?? [a.get(k)!.hit]);
        const less = (hs: readonly Rect[]): string => JSON.stringify(owned.reduce<Rect[]>((ps, o) => ps.flatMap((p) => subtract(p, o)), [...hs]).filter((p) => p.width > 0.5 && p.height > 0.5));
        for (const [k, t] of b) {
          expect(a.has(k), `${id} ${k}`).toBe(true);
          expect(less(a.get(k)!.hits ?? [a.get(k)!.hit]), `${id} ${k}`).toBe(less(t.hits ?? [t.hit]));
        }
        extras += extra.length;
        // The docked drops' hits never overlap one another (home, the item's own place, may lie under a gap beside it), so
        // what the shared targets lose is at most the extras' own area.
        const docked = [...a.values()].filter((t) => !t.free && t.place.kind !== "home" && t.place.kind !== "none").flatMap((t) => (t.hits ?? [t.hit]).map((h) => ({ id: t.id, h })));
        for (const p of docked) for (const q of docked) if (p !== q && p.id !== q.id) expect(overlaps(p.h, q.h), `${id} ${p.id} ${q.id}`).toBe(false);
        const shared = (m: ReadonlyMap<string, DockDrop>): number => areaOf([...b.keys()].filter((k) => !m.get(k)!.free).flatMap((k) => m.get(k)!.hits ?? [m.get(k)!.hit]));
        const lost = shared(b) - shared(a);
        expect(lost, id).toBeGreaterThanOrEqual(-0.5);
        expect(lost, id).toBeLessThanOrEqual(areaOf(owned) + 0.5);
      }
    }
    // The extras branch is never vacuous: some base offers a drop the fixed rect refuses.
    expect(extras).toBeGreaterThan(0);
  });

  it("an anchor's side target is cut by the strip on screen, as by the fixed rect", () => {
    const a = anchorState();
    const base: DockState = { ...a, edges: a.edges.filter((e) => e.id !== "right").map((e) => (e.id === "anchor:thumbs" ? { ...e, moves: "side" as const } : e)) };
    const { anchored, fixed, r } = pair(base, "all");
    const bare = targets(base, "thumbs").find((t) => t.id === "side:right")!;
    expect(overlaps(bare.hit, r)).toBe(true);
    const side = targets(anchored, "thumbs").find((t) => t.id === "side:right")!;
    expect(overlaps(side.hit, r)).toBe(false);
    expect(side.hit.width).toBeLessThan(bare.hit.width);
    expect(hitsOf(anchored, "thumbs")).toBe(hitsOf(fixed, "thumbs"));
  });

  it("a drag's blocked regions hold the strip as the fixed rect", () => {
    const { anchored, fixed, r } = pair(emptyRightEdge(), "all");
    const blocked = dockDrag(anchored, "notes", { previous: solve(anchored) }).regions.blocked;
    expect(blocked).toContainEqual(r);
    expect(blocked).toEqual(dockDrag(fixed, "notes", { previous: solve(fixed) }).regions.blocked);
  });

  it("a resize by hand that grows into the strip stops at it, as at the fixed rect", () => {
    const base: DockState = { ...windowState(), floats: [{ id: "notes", rect: { x: 600, y: 200, width: 240, height: 320 } }] };
    for (const f of ["all", "floats"] as const) {
      const { anchored, fixed, r } = pair(base, f);
      const at = solve(anchored).items.notes!.rect;
      const asked = { ...at, width: 500 };
      const bare = fitResize(base, "notes", asked, { right: true })!;
      expect(rightOf(bare.rect), f).toBeGreaterThan(r.x);
      const fit = fitResize(anchored, "notes", asked, { right: true })!;
      expect(rightOf(fit.rect), f).toBeLessThanOrEqual(r.x + 0.5);
      expect(fit, f).toEqual(fitResize(fixed, "notes", asked, { right: true }));
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

  it('emptyLanes: "edge": the hatch drawn on screen stays as drawn; the Near lane\'s predicted marks keep clear of the strip on screen', () => {
    const s = withKeepClear(emptyRight(), strip("all"));
    const drag = dockDrag(s, "notes", { previous: solve(s), emptyLanes: "edge" });
    const lane = drag.regions.lanes.find((l) => l.id === "right")!;
    const rest = { held: null, room: false, guides: drag.regions.lanes.map((l) => ({ lane: l.id, held: null })) };
    const onScreen = stripOf(drag.shown(rest));
    // At rest: the edge's hatch is the screen's own mark, not predicted, so no strip trims it (as no fixed rect does).
    const hatch = drag.guides(rest).find((g) => g.lane === "right" && g.kind === "hatch")!;
    expect(overlaps(hatch.rect, onScreen)).toBe(true);
    const bare = dockDrag(emptyRight(), "notes", { previous: solve(emptyRight()), emptyLanes: "edge" });
    expect(hatch.rect).toEqual(bare.guides({ ...rest, guides: bare.regions.lanes.map((l) => ({ lane: l.id, held: null })) }).find((g) => g.lane === "right" && g.kind === "hatch")!.rect);
    // The Near lane (named with its would-land spot, not drawn on screen): its predicted marks, of any kind, are trimmed.
    const near = { ...rest, guides: rest.guides.map((g) => (g.lane === "right" ? { ...g, held: { kind: "spot" as const, spot: lane.spots[0]!.id, point: { x: 1190, y: 300 } } } : g)) };
    for (const g of drag.guides(near).filter((x) => x.lane === "right")) expect(overlaps(g.rect, onScreen), g.id).toBe(false);
  });
});
