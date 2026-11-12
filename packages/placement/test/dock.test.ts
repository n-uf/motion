/**
 * The desk constructions' promises, as pure layouts: every construction at every size and mode keeps its items on
 * the stage, at their minimums, apart; and each gives way the way it says (sections fold least recently used first,
 * the bottom dock folds to its header, docks fold to their rails right first, the newest tile floats, palettes shade).
 */
import { describe, expect, it } from "vitest";
import { overlap, type Rect, type Size } from "../index";
import { DEFAULT_OPTIONS, LAYER, PILL_MIN, TITLE, idOf, liftOut, panelKey, toggleClosed, toggleFold, touch, type Construction, type ConstructionId, type Layout, type Options, type Side } from "../src/dock";
import { deskDrop, deskTargets } from "../src/targets";
import { BOTTOM_MODES, TOOLBAR_MODES, desk, docs, fmt, seeded } from "./fixture";

const C = (id: ConstructionId): Construction => desk.constructionOf(id);
const EDGE_DOCKS: readonly ConstructionId[] = ["docks", "docksFull", "dockTear"];
const SIDED: readonly ConstructionId[] = [...EDGE_DOCKS, "navigator", "drawers"];
/** The most a section that isn't its column's last open one grows past its natural height. */
const AIR = 24;

/**
 * A layout's promises: every shown item inside the stage (unless it may scroll off), at least its minimum, a real
 * rect; items on the documents' and docks' layers never overlap; a reserved toolbar covers no document; a pill
 * covers nothing but documents.
 */
function layoutFailures(l: Layout, size: Size, opt: Options, what: string): string[] {
  const out: string[] = [];
  const shown = [...l.items].filter(([, p]) => !p.hidden);
  for (const [key, p] of shown) {
    const r = p.rect;
    if (![r.x, r.y, r.width, r.height].every(Number.isFinite) || r.width <= 0 || r.height <= 0) out.push(`${what}: ${key} at ${fmt(r)}`);
    else if (!p.offStage && (r.x < -0.5 || r.y < -0.5 || r.x + r.width > size.width + 0.5 || r.y + r.height > size.height + 0.5)) out.push(`${what}: ${key} at ${fmt(r)} leaves the stage`);
    const min = p.min;
    if (min && ((min.width !== undefined && r.width < min.width - 0.5) || (min.height !== undefined && r.height < min.height - 0.5))) out.push(`${what}: ${key} ${Math.round(r.width)} × ${Math.round(r.height)} is below its minimum`);
  }
  const flat = shown.filter(([, p]) => p.layer <= LAYER.dock && p.look !== "rail");
  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      const [ka, a] = flat[i]!;
      const [kb, b] = flat[j]!;
      if (overlap(a.rect, b.rect) > 1) out.push(`${what}: ${ka} overlaps ${kb}`);
    }
  }
  const tb = l.items.get("toolbar");
  if (tb && tb.look === "pill" && opt.toolbarSpace === "reserved") {
    for (const [key, p] of shown) if (key.startsWith("doc:") && overlap(p.rect, tb.rect) > 1) out.push(`${what}: the reserved toolbar covers ${key}`);
  }
  if (tb && tb.look === "pill" && !tb.hidden) {
    for (const [key, p] of shown) if (key !== "toolbar" && !key.startsWith("doc:") && overlap(p.rect, tb.rect) > 1) out.push(`${what}: the pill covers ${key}`);
  }
  return out;
}

const modesOf = (c: Construction): Options[] => {
  const out: Options[] = [];
  for (const t of c.pill ? TOOLBAR_MODES : [TOOLBAR_MODES[0]!]) for (const b of c.bottom ? BOTTOM_MODES : (["reserved"] as const)) out.push({ ...t, bottom: b });
  return out;
};

describe("layouts", () => {
  it("has the nine constructions", () => {
    expect(desk.constructions.map((c) => c.id)).toEqual(["docks", "docksFull", "tree", "navigator", "strip", "drawers", "floatOver", "floatAround", "dockTear"]);
  });

  for (const c of desk.constructions) {
    it(`${c.title}: every size, mode and document count keeps its promises`, () => {
      const fails: string[] = [];
      for (const W of [480, 520, 640, 760, 960, 1040, 1440]) {
        for (const H of [320, 420, 480, 560, 800]) {
          for (let n = 1; n <= 4; n++) {
            const s = c.initial(docs(n));
            for (const opt of modesOf(c)) fails.push(...layoutFailures(c.layout(s, { width: W, height: H }, opt), { width: W, height: H }, opt, `${W} × ${H}, ${n} docs, ${opt.toolbar}/${opt.toolbarSpace}/${opt.bottom}`));
          }
        }
      }
      expect(fails.slice(0, 3)).toEqual([]);
    });
  }
});

describe("proportions", () => {
  it("every construction opens fully docked; only floatOver and floatAround start with palettes floating", () => {
    const fails: string[] = [];
    for (const c of desk.constructions) {
      for (const [W, H] of [[520, 700], [960, 560], [1440, 900]] as const) {
        const size = { width: W, height: H };
        const s = c.initial(docs(2), size);
        if (s.torn.length || s.free.length) fails.push(`${c.title} ${W} × ${H}: starts with panels placed freely`);
        if (c.id === "floatOver" || c.id === "floatAround") continue;
        for (const [k, p] of c.layout(s, size, DEFAULT_OPTIONS).items) if (/^(panel|doc):/.test(k) && !p.hidden && p.layer > LAYER.dock && p.look !== "bare") fails.push(`${c.title} ${W} × ${H}: ${k} floats (${p.look})`);
      }
    }
    expect(fails).toEqual([]);
  });

  it("docks: sections take their natural height; only each dock's last open section takes the rest", () => {
    const fails: string[] = [];
    for (const id of EDGE_DOCKS) {
      const c = C(id);
      for (const [W, H] of [[960, 560], [1200, 700], [1440, 900]] as const) {
        for (const bottom of ["reserved", "off"] as const) {
          const s0 = c.initial(docs(2));
          for (const [what, s] of [["as it starts", s0], ["Files folded", { ...s0, folded: [1] }], ["three documents", c.initial(docs(3))]] as const) {
            const l = c.layout(s, { width: W, height: H }, { ...DEFAULT_OPTIONS, bottom });
            const columns = new Map<number, [string, Rect][]>();
            for (const [k, p] of l.items) {
              if (!k.startsWith("panel:") || p.hidden || p.look !== "section") continue;
              const x = Math.round(p.rect.x);
              columns.set(x, [...(columns.get(x) ?? []), [k, p.rect]]);
            }
            for (const list of columns.values()) {
              const last = list.reduce((a, b) => (b[1].y > a[1].y ? b : a))[0];
              for (const [k, r] of list) {
                const n = desk.natural(idOf(k));
                if (r.height < n - 0.5) fails.push(`${c.title} ${W} × ${H}, ${what}: ${k} is below its content`);
                if (k !== last && r.height > n + AIR + 0.5) fails.push(`${c.title} ${W} × ${H}, bottom ${bottom}, ${what}: ${k} is ${Math.round(r.height)} tall, its content ${n}`);
              }
              const lastRect = list.find(([k]) => k === last)![1];
              if (s === s0 && bottom === "off" && lastRect.y + lastRect.height < H - 6 - 0.5 && id !== "docksFull") fails.push(`${c.title} ${W} × ${H}: the last section ends at ${Math.round(lastRect.y + lastRect.height)}, not the dock's end`);
            }
          }
        }
      }
    }
    expect(fails).toEqual([]);
  });

  it("docks: the bottom dock is 180 to 200 px tall, never more than 36 % of the stage", () => {
    const fails: string[] = [];
    for (const c of desk.constructions.filter((x) => x.bottom)) {
      for (const W of [760, 960, 1440]) {
        for (const H of [480, 500, 560, 640, 800]) {
          for (const bottom of ["reserved", "overlay"] as const) {
            const b = c.layout(c.initial(docs(2)), { width: W, height: H }, { ...DEFAULT_OPTIONS, bottom }).items.get(panelKey(5))!;
            if (b.rect.height > 0.36 * H + 0.5) fails.push(`${c.title} ${W} × ${H}, ${bottom}: ${Math.round(b.rect.height)} px`);
          }
        }
      }
      const b = c.layout(c.initial(docs(2)), { width: 960, height: 560 }, DEFAULT_OPTIONS).items.get(panelKey(5))!.rect;
      if (b.height < 180 - 0.5 || b.height > 200 + 0.5) fails.push(`${c.title} 960 × 560: ${Math.round(b.height)} px tall`);
    }
    expect(fails).toEqual([]);
  });

  it("side docks are 240 px wide at the default stage", () => {
    const fails: string[] = [];
    for (const id of SIDED) {
      const c = C(id);
      const s = c.initial(docs(2));
      const l = c.layout(s, { width: 960, height: 560 }, DEFAULT_OPTIONS);
      for (const side of ["left", "right"] as const) {
        const shown = s[side].map((pid) => [panelKey(pid), l.items.get(panelKey(pid))!] as const).filter(([, p]) => !p.hidden);
        if (!shown.length) fails.push(`${c.title}: the ${side} side shows nothing`);
        for (const [k, p] of shown) if (Math.abs(p.rect.width - 240) > 8) fails.push(`${c.title}: ${k} on the ${side} is ${Math.round(p.rect.width)} wide`);
      }
    }
    expect(fails).toEqual([]);
  });

  it("drawers · narrow, the two drawers sliding over never overlap", () => {
    const fails: string[] = [];
    const c = C("drawers");
    const s = c.initial(docs(2));
    for (const W of [480, 520, 560, 640, 700, 760, 960]) {
      for (const H of [420, 700]) {
        const l = c.layout(s, { width: W, height: H }, DEFAULT_OPTIONS);
        const side = (sd: Side): Rect[] => [...l.items].filter(([k, p]) => !p.hidden && (k === `tabs:${sd}` || (k.startsWith("panel:") && s[sd].includes(idOf(k))))).map(([, p]) => p.rect);
        for (const a of side("left")) for (const b of side("right")) if (overlap(a, b) > 1) fails.push(`${W} × ${H}: ${fmt(a)} overlaps ${fmt(b)}`);
      }
    }
    expect(fails).toEqual([]);
  });

  it("tree, strip · panels in a column take their natural height; only the column's last one takes the rest", () => {
    const fails: string[] = [];
    for (const c of [C("tree"), C("strip")]) {
      for (const [W, H] of [[960, 560], [1200, 700], [1440, 900]] as const) {
        for (const n of [1, 2, 3]) {
          const s = c.initial(docs(n));
          const l = c.layout(s, { width: W, height: H }, DEFAULT_OPTIONS);
          const inColumn = (k: string): boolean => c.id !== "tree" || s.tree.L.includes(k) || s.tree.R.includes(k);
          const columns = new Map<number, [string, Rect][]>();
          for (const [k, p] of l.items) {
            if (!/^(panel|doc):/.test(k) || p.hidden || p.layer !== LAYER.doc || !inColumn(k)) continue;
            const x = Math.round(p.rect.x);
            columns.set(x, [...(columns.get(x) ?? []), [k, p.rect]]);
          }
          for (const list of columns.values()) {
            const last = list.reduce((a, b) => (b[1].y > a[1].y ? b : a))[0];
            for (const [k, r] of list) {
              if (!k.startsWith("panel:") || k === last) continue;
              if (r.height > desk.natural(idOf(k)) + AIR + 0.5) fails.push(`${c.title} ${W} × ${H}, ${n} docs: ${k} is ${Math.round(r.height)} tall`);
            }
          }
        }
      }
    }
    expect(fails).toEqual([]);
  });
});

describe("give-way", () => {
  const look = (l: Layout, k: string): string | undefined => l.items.get(k)?.look;
  const hidden = (l: Layout, k: string): boolean => !!l.items.get(k)?.hidden;
  /** The notes' codes, with their side where they name one ("dock-folded:left"). */
  const codes = (l: Layout): string[] => l.notes.map((n) => (n.side ? `${n.code}:${n.side}` : n.code));

  it("docks · height: the least recently used section folds to its header first, and unfolds with room", () => {
    const c = C("docks");
    const s = touch(c.initial(docs(2)), 3);
    const opt: Options = { ...DEFAULT_OPTIONS, bottom: "off" };
    const short = c.layout(s, { width: 960, height: 420 }, opt);
    expect(look(short, panelKey(4))).toBe("header");
    expect([look(short, panelKey(3)), look(short, panelKey(5))]).toEqual(["section", "section"]);
    expect(codes(short)).toEqual(["sections-folded"]);
    expect(look(c.layout(s, { width: 960, height: 560 }, opt), panelKey(4))).toBe("section");
  });

  it("docks · a section folded by hand stays folded; unfolding it is a use", () => {
    const c = C("docks");
    const s = toggleFold(c.initial(docs(2)), 1);
    expect(look(c.layout(s, { width: 1440, height: 900 }, DEFAULT_OPTIONS), panelKey(1))).toBe("header");
    const back = toggleFold(s, 1);
    expect(back.folded).toEqual([]);
    expect(back.recent.at(-1)).toBe(1);
  });

  it("docks · height: the bottom dock folds to its header", () => {
    const l = C("docks").layout(C("docks").initial(docs(2)), { width: 960, height: 420 }, DEFAULT_OPTIONS);
    expect(look(l, panelKey(5))).toBe("header");
    expect(l.items.get(panelKey(5))!.rect.height).toBeCloseTo(TITLE);
    expect(codes(l)).toContain("bottom-folded");
  });

  it("docks · width: the right dock folds to its rail first, then the left", () => {
    const c = C("docks");
    const s = c.initial(docs(2));
    const mid = c.layout(s, { width: 760, height: 560 }, DEFAULT_OPTIONS);
    expect([hidden(mid, panelKey(3)), hidden(mid, panelKey(4)), hidden(mid, panelKey(1))]).toEqual([true, true, false]);
    expect(codes(mid)).toEqual(["dock-folded:right"]);
    const narrow = c.layout(s, { width: 520, height: 560 }, DEFAULT_OPTIONS);
    expect([hidden(narrow, panelKey(1)), hidden(narrow, panelKey(2))]).toEqual([true, true]);
    expect(codes(narrow)).toEqual(["dock-folded:right", "dock-folded:left"]);
    const wide = c.layout(s, { width: 960, height: 560 }, DEFAULT_OPTIONS);
    expect([hidden(wide, panelKey(1)), hidden(wide, panelKey(3))]).toEqual([false, false]);
  });

  it("docks · opening a dock from its rail folds the other one instead", () => {
    const c = C("docks");
    const s = toggleClosed({ ...c.initial(docs(2)), closed: ["right"] }, "right");
    expect(s.opened).toBe("right");
    const l = c.layout(s, { width: 760, height: 560 }, DEFAULT_OPTIONS);
    expect([hidden(l, panelKey(3)), hidden(l, panelKey(1))]).toEqual([false, true]);
    expect(hidden(c.layout(toggleClosed(s, "right"), { width: 760, height: 560 }, DEFAULT_OPTIONS), panelKey(3))).toBe(true);
  });

  it("docksFull · the bottom dock keeps the full width; the side docks end above it", () => {
    const c = C("docksFull");
    const l = c.layout(c.initial(docs(2)), { width: 520, height: 560 }, DEFAULT_OPTIONS);
    const b = l.items.get(panelKey(5))!.rect;
    expect([b.x, b.width]).toEqual([6, 520 - 12]);
    const rail = l.items.get("rail:left")!.rect;
    expect(rail.y + rail.height).toBeLessThanOrEqual(b.y + 0.5);
    const short = c.layout(c.initial(docs(2)), { width: 960, height: 420 }, DEFAULT_OPTIONS);
    expect(short.items.get("rail:left")!.rect.height).toBeGreaterThan(rail.height);
  });

  it("tree · width: the newest tile that breaks a minimum floats, newest first", () => {
    const c = C("tree");
    const s = c.initial(docs(3));
    const l = c.layout(s, { width: 760, height: 560 }, DEFAULT_OPTIONS);
    const floating = [...l.items].filter(([k, p]) => /^(panel|doc):/.test(k) && p.layer === LAYER.float).map(([k]) => k);
    expect(floating[0]).toBe("doc:3");
    const note = l.notes.find((n) => n.code === "tiles-float")!;
    expect(note.items?.[0]).toBe("doc:3");
    expect([...note.items!].sort()).toEqual([...floating].sort());
    expect([...c.layout(s, { width: 1440, height: 900 }, DEFAULT_OPTIONS).items].filter(([, p]) => p.layer === LAYER.float)).toEqual([]);
  });

  it("tree · opened narrow, the side columns start folded to rails so nothing floats", () => {
    const c = C("tree");
    const s = c.initial(docs(2), { width: 520, height: 700 });
    expect(s.closed.length).toBeGreaterThan(0);
    const l = c.layout(s, { width: 520, height: 700 }, DEFAULT_OPTIONS);
    expect([...l.items].filter(([k, p]) => /^(panel|doc):/.test(k) && !p.hidden && p.layer === LAYER.float)).toEqual([]);
  });

  it("navigator · narrow, the sides fold to icon tabs (the inspector first)", () => {
    const c = C("navigator");
    // No bottom dock here: its panels start on the right side.
    expect([c.initial(docs(2)).right, c.initial(docs(2)).bottom]).toEqual([[3, 4, 5], []]);
    const l = c.layout(c.initial(docs(2)), { width: 760, height: 560 }, DEFAULT_OPTIONS);
    expect(codes(l)).toEqual(["tabs-folded:right"]);
    expect(codes(c.layout(c.initial(docs(2)), { width: 520, height: 560 }, DEFAULT_OPTIONS))).toEqual(["tabs-folded:right", "tabs-folded:left"]);
  });

  it("strip · short on height, a column splits in two; the strip scrolls to the focus", () => {
    const c = C("strip");
    const l = c.layout(c.initial(docs(2)), { width: 960, height: 420 }, DEFAULT_OPTIONS);
    expect(l.notes.find((n) => n.code === "column-split")?.items).toEqual(["panel:1", "panel:2"]);
    const s = c.initial(docs(4));
    const focused = c.layout({ ...s, focus: 4 }, { width: 960, height: 560 }, DEFAULT_OPTIONS).items.get("doc:4")!.rect;
    expect(focused.x).toBeGreaterThanOrEqual(0);
    expect(focused.x + focused.width).toBeLessThanOrEqual(960);
  });

  it("drawers · below its width a drawer slides over the documents instead of pushing them", () => {
    const c = C("drawers");
    const wide = c.layout(c.initial(docs(2)), { width: 1200, height: 560 }, DEFAULT_OPTIONS);
    const narrow = c.layout(c.initial(docs(2)), { width: 900, height: 560 }, DEFAULT_OPTIONS);
    expect(wide.items.get("tabs:right")!.layer).toBe(LAYER.dock);
    expect(narrow.items.get("tabs:right")!.layer).toBe(LAYER.float);
    expect(codes(narrow)).toEqual(["drawer-over:right"]);
    // Pushed, the documents end at the docked drawer; slid over, they run to the rail.
    const end = (l: Layout): number => Math.max(...[1, 2].map((id) => l.items.get(`doc:${id}`)!.rect).map((r) => r.x + r.width));
    expect(end(wide)).toBe(1200 - 34 - 240 - 6);
    expect(end(narrow)).toBe(900 - 34 - 6);
  });

  it("floatOver · short on height, the least recently used palettes shade to their title bars", () => {
    const c = C("floatOver");
    const s = touch(c.initial(docs(2)), 3);
    const l = c.layout(s, { width: 960, height: 420 }, DEFAULT_OPTIONS);
    const shaded = [3, 4, 5].filter((id) => look(l, panelKey(id)) === "header");
    expect(shaded.length).toBeGreaterThan(0);
    expect(shaded).not.toContain(3);
    expect(codes(l)).toContain("palettes-shaded");
  });

  it("floatOver, floatAround · narrow, both stacks share the right corner", () => {
    for (const c of [C("floatOver"), C("floatAround")]) {
      const l = c.layout(c.initial(docs(2)), { width: 600, height: 900 }, DEFAULT_OPTIONS);
      expect(codes(l)).toContain("stacks-merged");
      const rects = [1, 2, 3, 4, 5].map((id) => l.items.get(panelKey(id))!.rect);
      expect(new Set(rects.map((r) => Math.round(r.x))).size).toBe(1);
      // One stack: no two palettes on top of each other.
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlap(rects[i]!, rects[j]!)).toBe(0);
    }
  });

  it("dockTear · a torn-off panel too tall for where it floats shades to its title bar", () => {
    const c = C("dockTear");
    const s = { ...c.initial(docs(2)), right: [4], torn: [{ id: 3, at: { x: 400, y: 500 } }] };
    const l = c.layout(s, { width: 1200, height: 560 }, DEFAULT_OPTIONS);
    expect([look(l, panelKey(3)), l.items.get(panelKey(3))!.rect.height]).toEqual(["header", TITLE]);
    expect(codes(l)).toEqual(["torn-floating", "torn-shaded"]);
    expect(look(c.layout({ ...s, torn: [{ id: 3, at: { x: 400, y: 100 } }] }, { width: 1200, height: 560 }, DEFAULT_OPTIONS), panelKey(3))).toBe("float");
  });

  it("floatOver, floatAround · with no stretch of its band free, the pill shrinks rather than cover a palette", () => {
    for (const c of [C("floatOver"), C("floatAround")]) {
      const tight = { ...c.initial(docs(2)), stacks: { left: [1, 2], right: [3] }, free: [{ id: 4, at: { x: 434, y: 220 } }, { id: 5, at: { x: 518, y: 160 } }] };
      for (const m of TOOLBAR_MODES) {
        const l = c.layout(tight, { width: 1212, height: 377 }, { ...DEFAULT_OPTIONS, ...m });
        const tb = l.items.get("toolbar")!.rect;
        for (const id of [1, 2, 3, 4, 5]) expect(overlap(l.items.get(panelKey(id))!.rect, tb)).toBeLessThanOrEqual(1);
      }
    }
    // Narrow, palettes across the whole band: every stretch is shorter than the shortest pill, which shrinks to one.
    const c = C("floatOver");
    const blocked = { ...c.initial(docs(2)), stacks: { left: [], right: [3, 4, 5] }, free: [{ id: 1, at: { x: 6, y: 0 } }, { id: 2, at: { x: 160, y: 0 } }] };
    const l = c.layout(blocked, { width: 480, height: 600 }, { ...DEFAULT_OPTIONS, toolbarSpace: "overlay" });
    const tb = l.items.get("toolbar")!.rect;
    expect(tb.width).toBeLessThan(PILL_MIN);
    for (const id of [1, 2, 3]) expect(overlap(l.items.get(panelKey(id))!.rect, tb)).toBeLessThanOrEqual(1);
  });

  it("floatOver · a palette dropped under a bottom pill moves clear, above it", () => {
    const c = C("floatOver");
    const size = { width: 960, height: 600 };
    const opt: Options = { ...DEFAULT_OPTIONS, toolbar: "bottom", toolbarSpace: "overlay" };
    const key = panelKey(3);
    const input = { c, s0: liftOut(c.initial(docs(2)), key), key, size, opt };
    const pill = c.layout(input.s0, size, opt).items.get("toolbar")!.rect;
    const free = deskTargets(input).find((t) => t.id === "free")!;
    const d = deskDrop(input, free, { x: pill.x + pill.width / 2, y: pill.y + 10 }, { x: 40, y: 10 });
    expect(d.label).toContain("clear of the toolbar");
    expect(d.slot.y + d.slot.height).toBeLessThanOrEqual(pill.y);
  });

  it("dockTear · a panel torn off floats where it is dropped and docks back on a rail", () => {
    const c = C("dockTear");
    const size = { width: 1200, height: 700 };
    const key = panelKey(3);
    const input = { c, s0: liftOut(c.initial(docs(2)), key), key, size, opt: DEFAULT_OPTIONS };
    const float = deskTargets(input).find((t) => t.id === "float")!;
    const torn = deskDrop(input, float, { x: 600, y: 300 }, { x: 20, y: 10 });
    expect(torn.state.torn).toEqual([{ id: 3, at: { x: 580, y: 290 } }]);
    expect(torn.layout.items.get(key)!.look).toBe("float");
    expect(torn.layout.notes.find((n) => n.code === "torn-floating")?.items).toEqual([key]);
    const back = { ...input, s0: liftOut(torn.state, key) };
    const rail = deskTargets(back).find((t) => t.id === "rail:left")!;
    const docked = deskDrop(back, rail, { x: 10, y: 10 }, { x: 0, y: 0 });
    expect(docked.state.torn).toEqual([]);
    expect(docked.state.left).toEqual([1, 2, 3]);
    expect(docked.layout.items.get(key)!.look).toBe("section");
  });

  it("floatOver, floatAround · palettes dropped anywhere are never under the pill, in any toolbar mode", () => {
    const fails: string[] = [];
    const rnd = seeded(11);
    for (const c of [C("floatOver"), C("floatAround")]) {
      for (let n = 0; n < 300; n++) {
        const size = { width: Math.round(480 + rnd() * 960), height: Math.round(320 + rnd() * 480) };
        const opt: Options = { ...DEFAULT_OPTIONS, toolbar: rnd() < 0.5 ? "top" : "bottom", toolbarSpace: "overlay" };
        let s = c.initial(docs(2));
        for (let k = 0; k < 4; k++) {
          const key = panelKey(1 + Math.floor(rnd() * 5));
          const input = { c, s0: liftOut(s, key), key, size, opt };
          const free = deskTargets(input).find((t) => t.id === "free")!;
          s = deskDrop(input, free, { x: rnd() * size.width, y: rnd() * size.height }, { x: 40, y: 11 }).state;
        }
        for (const m of TOOLBAR_MODES) {
          const l = c.layout(s, size, { ...opt, ...m });
          const tb = l.items.get("toolbar")!.rect;
          for (const [key, pl] of l.items) if (key.startsWith("panel:") && overlap(pl.rect, tb) > 1) fails.push(`${c.title} ${size.width} × ${size.height}: the pill covers ${key}`);
        }
      }
    }
    expect(fails.slice(0, 3)).toEqual([]);
  });
});
