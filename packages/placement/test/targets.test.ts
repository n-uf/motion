/** Drops land where their target says, in every construction; toolbar targets keep own place as home. */
import { describe, expect, expectTypeOf, it } from "vitest";
import { overlap } from "../index";
import { DEFAULT_OPTIONS, LAYER, draggable, liftOut, panelKey, type Construction, type ConstructionId, type Layout } from "../src/dock";
import { deskDrop, deskTargets, floatTarget, hostTargets, keyboardStops, type Allows, type ToolbarFloatTarget, type ToolbarTarget } from "../src/targets";
import { HOSTS, arrangement, hostOf, layoutHost, sameArrangement, type GroupSize, type HostId, type HostSpec, type Place } from "../src/toolbar";
import { desk, docs, fmt, inRect, mid, sameRect } from "./fixture";

const C = (id: ConstructionId): Construction => desk.constructionOf(id);

describe("desk targets", () => {
  it("tree · every tree drop lands under the pointer, and its label says where", () => {
    const c = C("tree");
    const fails: string[] = [];
    for (const [W, H] of [[960, 560], [1440, 820], [760, 420]] as const) {
      for (let n = 1; n <= 4; n++) {
        const s = c.initial(docs(n));
        const size = { width: W, height: H };
        for (const key of [...s.tree.L, ...s.tree.R, ...s.tree.C]) {
          const input = { c, s0: liftOut(s, key), key, size, opt: DEFAULT_OPTIONS };
          const ts = deskTargets(input);
          // A document is never offered a side column (it would only float there).
          if (key.startsWith("doc:")) for (const t of ts) if (/^(tile:[LR]|edge:)/.test(t.id)) fails.push(`${W} × ${H}, ${n} docs: ${key} is offered ${t.id}`);
          // No two targets share a zone and a label (the keyboard would stop twice at one place).
          const made = ts.map((t) => ({ t, label: deskDrop(input, t, mid(t.hit), { x: 0, y: 0 }).label }));
          for (let i = 0; i < made.length; i++) {
            for (let j = i + 1; j < made.length; j++) {
              if (made[i]!.label === made[j]!.label && sameRect(made[i]!.t.hit, made[j]!.t.hit)) fails.push(`${W} × ${H}, ${n} docs, ${key}: ${made[i]!.t.id} and ${made[j]!.t.id} are both "${made[i]!.label}"`);
            }
          }
          for (const t of ts) {
            if (t.id.startsWith("edge:")) continue;
            const p = mid(t.hit);
            const d = deskDrop(input, t, p, { x: 0, y: 0 });
            const floats = d.layout.items.get(key)!.layer > LAYER.doc;
            const what = `${W} × ${H}, ${n} docs, ${key} on ${t.id} ("${d.label}")`;
            const floating = (l: Layout): string[] => [...l.items].filter(([k, pl]) => k !== key && pl.layer > LAYER.doc && /^(doc|panel):/.test(k)).map(([k]) => k);
            const before = floating(c.layout(input.s0, size, DEFAULT_OPTIONS)).join();
            const after = floating(d.layout);
            if (floats !== d.label.includes("it floats")) fails.push(`${what}: it ${floats ? "floats" : "tiles"}`);
            else if (!floats && (after.length > 0) !== /; .* floats?$/.test(d.label)) fails.push(`${what}: ${after.length} other tiles float`);
            else if (!floats && after.join() === before && !inRect(d.slot, p)) fails.push(`${what}: dropped at ${Math.round(p.x)},${Math.round(p.y)}, lands at ${fmt(d.slot)}`);
          }
        }
      }
    }
    expect(fails.slice(0, 3)).toEqual([]);
  });

  it("docks, docksFull, dockTear, navigator, drawers · a slot drop lands in its slot; a rail drop folds into the rail", () => {
    const fails: string[] = [];
    for (const id of ["docks", "docksFull", "dockTear", "navigator", "drawers"] as const) {
      const c = C(id);
      for (const [W, H] of [[960, 560], [1440, 900], [760, 560]] as const) {
        const size = { width: W, height: H };
        const s = c.initial(docs(2));
        for (const key of [1, 2, 3, 4, 5].map(panelKey)) {
          if (!draggable(c, key)) continue;
          const input = { c, s0: liftOut(s, key), key, size, opt: DEFAULT_OPTIONS };
          for (const t of deskTargets(input)) {
            const d = deskDrop(input, t, mid(t.hit), { x: 0, y: 0 });
            const what = `${c.title} ${W} × ${H}, ${key} on ${t.id}`;
            if (t.id.startsWith("rail:") && /^(docks|docksFull|dockTear)$/.test(id)) {
              const rail = d.layout.items.get(t.id)!;
              if (!d.hidden && !rail.hidden && overlap(d.slot, rail.rect) === 0 && !d.layout.items.get(key)!.look.match(/section|header/)) fails.push(`${what}: neither in its rail nor its dock`);
            } else if (/^(dock|bottom|into):/.test(t.id) && !d.hidden && overlap(d.slot, t.hit) === 0) fails.push(`${what}: lands at ${fmt(d.slot)}, outside ${fmt(t.hit)}`);
            else if (/^(tabs|side|rail):/.test(t.id) && !/^(docks|docksFull|dockTear)$/.test(id) && d.state.active[t.id.endsWith("left") ? "left" : "right"] !== Number(key.slice(6))) fails.push(`${what}: not the showing panel`);
          }
        }
      }
    }
    expect(fails.slice(0, 3)).toEqual([]);
  });

  it("floatOver, floatAround, dockTear · a free drop lands where it is let go, snapped to a nearby edge", () => {
    const size = { width: 1200, height: 800 };
    for (const id of ["floatOver", "floatAround"] as const) {
      const c = C(id);
      const key = panelKey(2);
      const input = { c, s0: liftOut(c.initial(docs(2)), key), key, size, opt: DEFAULT_OPTIONS };
      const free = deskTargets(input).find((t) => t.id === "free")!;
      expect(free.free).toBe(true);
      const d = deskDrop(input, free, { x: 640, y: 420 }, { x: 30, y: 10 });
      expect([d.slot.x, d.slot.y]).toEqual([610, 410]);
      expect(d.free).toBe(true);
      const snapped = deskDrop(input, free, { x: 40, y: 420 }, { x: 30, y: 10 });
      expect(snapped.label).toContain("snapped to the left edge");
    }
  });

  it("strip · a drop between columns makes a new column there; inside one, it joins at that place", () => {
    const c = C("strip");
    const key = panelKey(3);
    const input = { c, s0: liftOut(c.initial(docs(1)), key), key, size: { width: 1440, height: 900 }, opt: DEFAULT_OPTIONS };
    const ts = deskTargets(input);
    const made = (id: string) => deskDrop(input, ts.find((t) => t.id === id)!, mid(ts.find((t) => t.id === id)!.hit), { x: 0, y: 0 }).state.cols;
    expect(made("between:0")[0]).toEqual([key]);
    expect(made("into:0:1")[0]).toEqual(["panel:1", key, "panel:2"]);
    // Short, a column splits in two on screen, but a new column goes only between the columns of the state.
    const short = { ...input, size: { width: 1440, height: 420 }, s0: liftOut(c.initial(docs(2)), key) };
    const between = deskTargets(short).filter((t) => t.id.startsWith("between:"));
    expect(between.map((t) => t.id)).toEqual(Array.from({ length: short.s0.cols.length + 1 }, (_, i) => `between:${i}`));
  });

  it("docks · drops into each dock slot give the dock that order", () => {
    const c = C("docks");
    const key = panelKey(3);
    const input = { c, s0: liftOut(c.initial(docs(2)), key), key, size: { width: 1440, height: 900 }, opt: DEFAULT_OPTIONS };
    const left = deskTargets(input).filter((t) => t.id.startsWith("dock:left"));
    expect(left.map((t) => deskDrop(input, t, mid(t.hit), { x: 0, y: 0 }).state.left)).toEqual([[3, 1, 2], [1, 3, 2], [1, 2, 3]]);
    // The slots stack top to bottom without gaps or overlaps.
    for (let i = 1; i < left.length; i++) expect(left[i]!.hit.y).toBeCloseTo(left[i - 1]!.hit.y + left[i - 1]!.hit.height);
  });
});

describe("toolbar targets", () => {
  type Gr = "a" | "b" | "c" | "d";
  const size: GroupSize<Gr> = (_g, _v, collapsed) => ({ along: collapsed ? 30 : 80, across: 28 });
  const spec: HostSpec = { length: 800, thickness: 34, lead: 20, tail: 20 };
  const a = arrangement<Gr>({ top: { start: ["a", "b"], end: ["c"] }, title: { start: ["d"] } });
  const input = { group: "b" as Gr, arrangement: a, host: "top" as const, origin: { x: 100, y: 50 }, spec, size };

  it("offers before all, between and after all in each zone, and an empty zone of its own", () => {
    const { targets } = hostTargets(input);
    const labels = targets.map((t) => t.label);
    expect(labels).toContain("Top bar · left · before all");
    expect(labels).toContain("Top bar · right · after all");
    expect(labels).toContain("Top bar · centre");
    expect(targets.find((t) => t.label === "Top bar · centre")!.priority).toBe(1);
    expect(targets.filter((t) => t.kind === "line").every((t) => t.priority === 2)).toBe(true);
  });

  it("own place is home: never a target, its stretch comes back as own", () => {
    const { targets, own } = hostTargets(input);
    for (const t of targets) expect(sameArrangement(t.arrangement, a)).toBe(false);
    expect(own.length).toBeGreaterThan(0);
    // "after all" in the start zone is b's own place: its stretch is own, and no target's hit centre lies in it.
    for (const t of targets) for (const o of own) expect(inRect(o, mid(t.hit)) && t.kind === "line").toBe(false);
  });

  it("own place stays home when the arrangement's zones are written in another order", () => {
    const written = { ...a, top: { end: a.top.end, center: a.top.center, start: a.top.start } };
    const { targets } = hostTargets({ ...input, arrangement: written });
    expect(targets.map((t) => t.id)).not.toContain("g:top:start:1");
    expect(targets.map((t) => t.id)).toEqual(hostTargets(input).targets.map((t) => t.id));
  });

  it("a drop makes the arrangement its label says", () => {
    const { targets } = hostTargets(input);
    const first = targets.find((t) => t.label === "Top bar · left · before all")!;
    expect(first.arrangement.top.start).toEqual(["b", "a"]);
    const end = targets.find((t) => t.label === "Top bar · right · before all")!;
    expect(end.arrangement.top.end).toEqual(["b", "c"]);
    expect(hostOf(end.arrangement, "b")).toEqual({ host: "top", zone: "end", index: 0 });
  });

  it("hits are in stage coordinates, across the host, and lines partition its length", () => {
    const { targets, own } = hostTargets(input);
    const lines = [...targets.filter((t) => t.kind === "line").map((t) => t.hit), ...own].sort((p, q) => p.x - q.x);
    expect(lines[0]!.x).toBeCloseTo(100);
    for (const h of lines) expect([h.y, h.height]).toEqual([50 - 12, 34 + 24]);
  });

  it("floating keeps the group on the stage", () => {
    const f = floatTarget({ group: "b" as Gr, arrangement: a, stage: { x: 10, y: 20, width: 500, height: 300 }, width: 80, height: 28 });
    expect(f.priority).toBe(3);
    const out = f.make({ x: 2000, y: -50 }, { x: 5, y: 5 });
    expect(out.floating).toEqual([{ id: "b", x: 420, y: 0, from: { host: "top", zone: "start", index: 1 } }]);
    // A group wider than the stage keeps its left edge on the stage's, never off it.
    const wide = floatTarget({ group: "b" as Gr, arrangement: a, stage: { x: 10, y: 20, width: 300, height: 300 }, width: 400, height: 28 });
    expect(wide.make({ x: 2000, y: 100 }, { x: 5, y: 5 }).floating[0]!.x).toBe(0);
  });

  it("types: floatTarget without allows is never null, with it may be, and its ReturnType is the non-null one", () => {
    // Type-level checks (the typecheck runs them); the calls also run.
    const stage = { x: 10, y: 20, width: 500, height: 300 };
    const plain = floatTarget({ group: "b" as Gr, arrangement: a, stage, width: 80, height: 28 });
    const guarded = floatTarget({ group: "b" as Gr, arrangement: a, stage, width: 80, height: 28, allows: () => true });
    const maybe: Allows<Gr> | undefined = undefined;
    const optional = floatTarget({ group: "b" as Gr, arrangement: a, stage, width: 80, height: 28, allows: maybe });
    expectTypeOf(plain).toEqualTypeOf<ToolbarFloatTarget<Gr>>();
    expectTypeOf(guarded).toEqualTypeOf<ToolbarFloatTarget<Gr> | null>();
    expectTypeOf(optional).toEqualTypeOf<ToolbarFloatTarget<Gr> | null>();
    expectTypeOf<ReturnType<typeof floatTarget>>().toEqualTypeOf<ToolbarFloatTarget<string>>();
    expect([plain.id, guarded?.id, optional?.id]).toEqual(["g:float", "g:float", "g:float"]);
  });

  it("each target's slot is the group's rect in the host once it lands there", () => {
    const { targets } = hostTargets(input);
    const first = targets.find((t) => t.label === "Top bar · left · before all")!;
    // Lead 20 from the host's origin (100, 50), 80 long, centred across the 34 px host.
    expect(first.slot).toEqual({ x: 120, y: 53, width: 80, height: 28 });
    for (const t of targets) {
      const r = layoutHost(t.arrangement.top, "top", spec, size, t.arrangement.collapsed).slots.get("b")!;
      expect(t.slot).toEqual({ x: 100 + r.x, y: 50 + r.y, width: r.width, height: r.height });
    }
    // Where the host will be once the group is in it (it moved 40 px down and got longer): the slot follows.
    const moved = hostTargets({ ...input, hostAfter: () => ({ origin: { x: 100, y: 90 }, spec: { ...spec, lead: 60 } }) });
    expect(moved.targets.find((t) => t.label === "Top bar · left · before all")!.slot).toEqual({ x: 160, y: 93, width: 80, height: 28 });
  });

  it("a place the group may not go is no target: one group keeps to its bar, one can't float", () => {
    // b may stay in the top bar only; d may not float.
    const allows = (g: Gr, place: Place | "float"): boolean => (g === "b" ? place !== "float" && place.host === "top" : g === "d" ? place !== "float" : true);
    expect(hostTargets({ ...input, allows }).targets.map((t) => t.id)).toEqual(hostTargets(input).targets.map((t) => t.id));
    expect(hostTargets({ ...input, host: "title", allows }).targets).toEqual([]);
    expect(hostTargets({ ...input, host: "title" }).targets.length).toBeGreaterThan(0);
    // Within a bar, a single place can be refused too.
    const notFirst = (_g: Gr, place: Place | "float"): boolean => place === "float" || place.index > 0;
    expect(hostTargets({ ...input, allows: notFirst }).targets.every((t) => t.place.index > 0)).toBe(true);
    const stage = { x: 10, y: 20, width: 500, height: 300 };
    expect(floatTarget({ group: "d" as Gr, arrangement: a, stage, width: 80, height: 28, allows })).toBeNull();
    expect(floatTarget({ group: "c" as Gr, arrangement: a, stage, width: 80, height: 28, allows })?.id).toBe("g:float");
  });
});

describe("keyboard stops", () => {
  type Gr = "doc" | "edit" | "zoom" | "panel" | "share";
  const size: GroupSize<Gr> = (_g, v, collapsed) => ({ along: collapsed ? 30 : v ? 60 : 80, across: v ? 30 : 28 });
  const a = arrangement<Gr>({ title: { start: ["doc"], end: ["zoom"] }, top: { center: ["edit"] }, bottom: { start: ["panel"], end: ["share"] } });
  const ORIGIN: Record<HostId, { x: number; y: number }> = { title: { x: 0, y: 0 }, top: { x: 0, y: 40 }, left: { x: 0, y: 80 }, right: { x: 760, y: 80 }, bottom: { x: 0, y: 500 } };
  const specOf = (h: HostId): HostSpec<Gr> => (h === "left" || h === "right" ? { length: 400, thickness: 40, lead: 8, tail: 8 } : { length: 800, thickness: 34, lead: 20, tail: 20 });
  // The targets come host by host in HOSTS order (title, top, bottom, left, right): the stops put them in reading order.
  const targetsFor = (g: Gr): ToolbarTarget<Gr>[] => HOSTS.flatMap((h) => hostTargets({ group: g, arrangement: a, host: h, origin: ORIGIN[h], spec: specOf(h), size }).targets);
  const float = floatTarget({ group: "edit" as Gr, arrangement: a, stage: { x: 40, y: 80, width: 720, height: 420 }, width: 80, height: 28 });

  it("lists every place in reading order: title, top, left, right, bottom; zones start, centre, end; then each insertion", () => {
    const stops = keyboardStops([...targetsFor("edit"), float], { home: { place: hostOf(a, "edit")!, arrangement: a } });
    expect(stops.map((s) => s.id)).toEqual([
      "g:title:start:0",
      "g:title:start:1",
      "g:title:center:0",
      "g:title:end:0",
      "g:title:end:1",
      "g:top:start:0",
      "home",
      "g:top:end:0",
      "g:left:start:0",
      "g:left:center:0",
      "g:left:end:0",
      "g:right:start:0",
      "g:right:center:0",
      "g:right:end:0",
      "g:bottom:start:0",
      "g:bottom:start:1",
      "g:bottom:center:0",
      "g:bottom:end:0",
      "g:bottom:end:1",
    ]);
    // Each stop carries its label and the arrangement a move there makes; home makes none.
    const home = stops.find((s) => s.home)!;
    expect([home.label, home.arrangement]).toEqual(["Top bar · centre · current place", a]);
    const first = stops[0]!;
    expect([first.label, first.arrangement.title.start]).toEqual(["Title bar · left · before all", ["edit", "doc"]]);
    expect(stops.filter((s) => s.home)).toHaveLength(1);
  });

  it("leaves floating out unless asked; asked, it comes last with the arrangement for where it would land", () => {
    expect(keyboardStops([float, ...targetsFor("edit")]).some((s) => s.place === null)).toBe(false);
    const withFloat = keyboardStops([float, ...targetsFor("edit")], { floats: { at: { x: 100, y: 200 }, grab: { x: 10, y: 5 } } });
    const last = withFloat.at(-1)!;
    expect([last.id, last.place]).toEqual(["g:float", null]);
    expect(last.arrangement.floating).toEqual([{ id: "edit", x: 50, y: 115, from: { host: "top", zone: "center", index: 0 } }]);
    // Asked plainly: dropped at the floating area's middle, the group's top-left corner there.
    expect(keyboardStops([float], { floats: true })[0]!.arrangement.floating[0]).toMatchObject({ x: 360, y: 210 });
  });

  it("without a home, the list is just the targets in order", () => {
    const stops = keyboardStops(targetsFor("zoom"));
    expect(stops.some((s) => s.home)).toBe(false);
    expect(stops.length).toBe(targetsFor("zoom").length);
  });
});
