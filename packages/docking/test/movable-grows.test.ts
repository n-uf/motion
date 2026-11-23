/**
 * A movable item that grows on a bar. On whichever bar it lies it takes that bar's free span after the other items; for
 * drop room it counts at its natural length (growth is spare room, not owned room, as for a growing title): every drop
 * room reading is that of the same state with the growth off. Dragged, it and its bar's neighbors are drawn at its
 * natural length (the held layout is the state solved with its growth off), and solving the state grows it.
 */
import { describe, expect, it } from "vitest";
import { formMain } from "@n-uf/placement/stack";
import { dockDrag, refusals, solve, stops, targets, type DockLayout, type DockState, type Zone } from "../src";
import { withoutBarGrowth } from "../src/helpers";
import { zoneExtents } from "../src/targets/edges";
import { doc, form } from "../src/testing/world";
import { contains } from "@n-uf/placement";
import { guided, modelOver } from "./landing-model";

const ORIGIN = { x: 0, y: 0 };
const NATURAL = 200;

/**
 * The toolbar's shapes: `plain` Views and Tools leading, Zoom trailing (the end zone); `lead` Views, Tools and Zoom all
 * leading (the lab's top bar: nothing in the center or end zone); `between` Views, Tools, Marks and Zoom all leading, so
 * Tools has same-zone neighbors on both sides; `alone` Tools alone, filling the bar (Views and Zoom off it).
 */
type Shape = "plain" | "lead" | "between" | "alone";
interface Scene {
  readonly shape?: Shape;
  /** Views grows too. */
  readonly two?: boolean;
  /** Asked lengths along the bar (`DockItem.lengths.row`) on the growers. */
  readonly asked?: boolean;
  /** `barZones: "nearest"`, as the lab has it. */
  readonly nearest?: boolean;
  /** Tools' zone (default start). */
  readonly zone?: Zone;
}

/** The document window at `width` with Tools (row: min 180, natural 200) growing or not, laid out as `sc` says. */
function world(grows: boolean, width = 1200, sc: Scene = {}): DockState {
  const s0 = doc({ width });
  const shape = sc.shape ?? "plain";
  const row = (id: string, natural: number) => [form("row", natural - 20, natural, 28, grows ? { grows: true } : {}), ...s0.items[id]!.forms.row!.slice(1)];
  const { align: _end, ...zoom } = s0.items.zoom!;
  const items = {
    ...s0.items,
    ...(shape === "plain" ? {} : { zoom }),
    tools: { ...s0.items.tools!, forms: { ...s0.items.tools!.forms, row: row("tools", NATURAL) }, ...(sc.zone && sc.zone !== "start" ? { align: sc.zone } : {}), ...(sc.asked ? { lengths: { row: 320 } } : {}) },
    ...(sc.two ? { views: { ...s0.items.views!, forms: { ...s0.items.views!.forms, row: row("views", 200) }, ...(sc.asked ? { lengths: { row: 160 } } : {}) } } : {}),
  };
  const bar = shape === "between" ? ["views", "tools", "marks", "zoom"] : shape === "alone" ? ["tools"] : ["views", "tools", "zoom"];
  const edges = s0.edges.map((e) =>
    e.id === "toolbar" ? { ...e, items: bar } : shape === "between" && e.id === "right" ? { ...e, items: e.items.filter((x) => x !== "marks") } : shape === "alone" && e.id === "status" ? { ...e, items: [...e.items, "views", "zoom"] } : e,
  );
  return { ...s0, edges, items, ...(sc.nearest ? { barZones: "nearest" as const } : {}) };
}
const rowForm = (s: DockState, id: string, k: number) => s.items[id]!.forms.row![k]!;

const SCENES: readonly Scene[] = [
  {},
  { shape: "lead" },
  { shape: "between" },
  { shape: "between", nearest: true },
  { shape: "lead", nearest: true },
  { shape: "between", two: true },
  { shape: "between", asked: true },
  { shape: "lead", two: true, asked: true, nearest: true },
];
const WIDTHS = Array.from({ length: 16 }, (_, k) => 250 + k * 75);
const name = (sc: Scene, w: number) => `${JSON.stringify(sc)} ${w}`;

describe("a movable grower on a bar takes the free span", () => {
  // (These hold on the fit alone too: they show the drawn result, not the rule for drop room.)
  for (const zone of ["start", "center", "end"] as const) {
    it(`in the ${zone} zone it fills exactly the bar less the others' lengths and gaps`, () => {
      for (let w = 700; w <= 1600; w += 50) {
        const s = world(true, w, { zone });
        const l = solve(s);
        const bar = s.edges.find((e) => e.id === "toolbar")!;
        const shown = bar.items.filter((id) => l.items[id] && !l.items[id]!.inMenu);
        const others = shown.filter((id) => id !== "tools").reduce((sum, id) => sum + l.items[id]!.rect.width, 0);
        const free = l.edges.toolbar!.rect.width - bar.pad!.start! - bar.pad!.end! - others - (shown.length - 1) * bar.gap!;
        expect(l.items.tools!.form, `${w}`).toBe(0);
        expect(l.items.tools!.rect.width, `${zone} ${w}`).toBeCloseTo(free, 6);
        // Laid end to end, none overlapping, in the bar's order.
        const xs = shown.map((id) => l.items[id]!.rect).sort((a, b) => a.x - b.x);
        for (let k = 1; k < xs.length; k++) expect(xs[k]!.x, `${zone} ${w}`).toBeCloseTo(xs[k - 1]!.x + xs[k - 1]!.width + bar.gap!, 6);
      }
    });
  }

  it("its asked length on a bar gives way to the free span", () => {
    const l = solve(world(true, 1200, { asked: true }));
    expect(l.items.tools!.rect.x + l.items.tools!.rect.width + 4).toBeCloseTo(l.items.zoom!.rect.x, 6);
  });

  it("in the center zone it fills the stretches on both sides", () => {
    const l = solve(world(true, 1200, { zone: "center" }));
    expect(l.items.tools!.rect.x).toBeCloseTo(l.items.views!.rect.x + l.items.views!.rect.width + 4, 6);
    expect(l.items.tools!.rect.x + l.items.tools!.rect.width + 4).toBeCloseTo(l.items.zoom!.rect.x, 6);
  });

  it("on a bar with a centered fixed item, it takes the stretch beside its zone and the centered item stays put", () => {
    const s0 = world(true);
    const s: DockState = { ...s0, edges: s0.edges.map((e) => (e.id === "status" ? { ...e, items: ["tools", ...e.items] } : e.id === "toolbar" ? { ...e, items: e.items.filter((x) => x !== "tools") } : e)) };
    const l = solve(s);
    const plain = solve(world(false));
    expect(l.items.readout!.rect).toEqual(plain.items.readout!.rect);
    expect(l.items.tools!.rect.x + l.items.tools!.rect.width + 4).toBeCloseTo(l.items.readout!.rect.x, 6);
  });

  it("a growing title beside it keeps its natural length: the movable grower takes the span", () => {
    const s0 = world(true);
    const s: DockState = { ...s0, edges: s0.edges.map((e) => (e.id === "titlebar" ? { ...e, items: ["title", "tools", "controls"] } : e.id === "toolbar" ? { ...e, items: e.items.filter((x) => x !== "tools") } : e)) };
    const l = solve(s);
    expect(l.items.title!.rect.width).toBeCloseTo(formMain(rowForm(s, "title", 0), "natural", 32), 6);
    expect(l.items.tools!.rect.x + l.items.tools!.rect.width).toBeCloseTo(l.items.controls!.rect.x, 6);
  });
});

describe("drop room is that of the same state with the growth off", () => {
  // Which places exist and fit is read with the growth off (the gap beside a grown row stays); where the pointer meets
  // them is cut by their landings, each in the layout its own drop commits (the grower as that commit draws it). So the
  // places are the growth-off state's, and each has a target unless its landing is another place's. (A place is an
  // order of the bar's items: a drop that docks it in another zone is the same place, its zone not yet one rule.)
  it("places, refusals and zone extents on the bar equal the growth-off state's; a place lacks a target only at another's landing", () => {
    type Drop = { after: (p: typeof ORIGIN, g: typeof ORIGIN) => { layout: DockLayout } };
    const landing = (t: Drop, dragged: string) => t.after(ORIGIN, ORIGIN).layout.items[dragged]?.rect;
    const order = (t: Drop) => along(t.after(ORIGIN, ORIGIN).layout, "toolbar").map(([id]) => id).join(" ");
    const same = (p?: { x: number; y: number; width: number; height: number }, q?: { x: number; y: number; width: number; height: number }) =>
      !!p && !!q && Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y), Math.abs(p.width - q.width), Math.abs(p.height - q.height)) < 0.5;
    for (const sc of SCENES) {
      for (const w of WIDTHS) {
        const grown = world(true, w, sc);
        const off = withoutBarGrowth(grown);
        expect(off).not.toBe(grown);
        for (const dragged of ["search", "views", "zoom"]) {
          const at = `${name(sc, w)} ${dragged}`;
          const ids = (ts: readonly { id: string }[]) => ts.filter((t) => t.id.includes("toolbar")).map((t) => t.id).sort();
          expect(ids(stops(grown, dragged)), at).toEqual(ids(stops(off, dragged)));
          const a = targets(grown, dragged).filter((t) => t.id.includes("toolbar"));
          // (The `order` allowance rests on the zone deferral: a place is an order, and a drop over free room that docks in
          // another zone than the target's counts as that target's place. Once the free room's zone is one rule, a place
          // lacks a target only at another's landing, and the allowance goes.)
          for (const p of stops(grown, dragged).filter((x) => x.id.includes("toolbar") && !a.some((t) => t.id === x.id)))
            expect(a.some((t) => same(landing(t, dragged), landing(p, dragged)) || order(t) === order(p)), `${at} ${p.id} lands where a target does, or is its place`).toBe(true);
          // Each place's drop leaves every item in the form, the » and the edge the growth-off state's drop does.
          const b = stops(off, dragged);
          for (const t of stops(grown, dragged).filter((x) => x.id.includes("toolbar"))) {
            const la = t.after(ORIGIN, ORIGIN).layout;
            const lb = b.find((x) => x.id === t.id)!.after(ORIGIN, ORIGIN).layout;
            for (const id of Object.keys(lb.items)) expect([la.items[id]?.form, !!la.items[id]?.inMenu, la.items[id]?.edge], `${at} ${t.id} ${id}`).toEqual([lb.items[id]!.form, !!lb.items[id]!.inMenu, lb.items[id]!.edge]);
          }
          // (A refused sliver under a pixel along the bar, where the landing cuts meet a zone's edge, is no stretch.)
          const refused = (s: DockState) => refusals(s, dragged).filter((r) => r.id.includes("toolbar") && r.hit.width >= 1).map((r) => [r.id, r.reason]);
          const [ra, rb] = [refused(grown), refused(off)];
          expect(ra, at).toEqual(rb);
          expect(zoneExtents(grown, dragged, "toolbar"), at).toEqual(zoneExtents(off, dragged, "toolbar"));
        }
      }
    }
  });

  it("the same object back when nothing on a bar grows", () => {
    const s = world(false);
    expect(withoutBarGrowth(s)).toBe(s);
  });
});

/** The items drawn on `edge` in `l`, in order along it. */
const along = (l: DockLayout, edge: string) =>
  Object.entries(l.items)
    .filter(([, p]) => p.edge === edge && !p.inMenu && !p.floating)
    .sort(([, a], [, b]) => a.rect.x - b.rect.x);

describe("dragged, a movable grower and its bar's neighbors lie at its natural length", () => {
  it("in every drop layout of the grower its bar is contiguous by zone: no hole but the bar's spare between zones", () => {
    for (const sc of SCENES) {
      for (const w of WIDTHS) {
        const s = world(true, w, sc);
        for (const t of targets(s, "tools").filter((x) => /^gap:(toolbar|titlebar|status):/.test(x.id))) {
          const l = t.after(ORIGIN, ORIGIN).layout;
          const edge = l.items.tools?.edge;
          if (!edge) continue;
          const e = s.edges.find((x) => x.id === edge)!;
          const gap = e.gap ?? 0;
          const drawn = along(l, edge);
          const used = drawn.reduce((sum, [, p]) => sum + p.rect.width, 0) + Math.max(0, drawn.length - 1) * gap;
          const menu = l.edges[edge]!.menu ? l.edges[edge]!.menu!.rect.width + gap : 0;
          const spare = l.edges[edge]!.rect.width - (e.pad?.start ?? 0) - (e.pad?.end ?? 0) - menu - used;
          const at = `${name(sc, w)} ${t.id}`;
          for (let k = 1; k < drawn.length; k++) {
            const [, a] = drawn[k - 1]!;
            const [, b] = drawn[k]!;
            const hole = b.rect.x - (a.rect.x + a.rect.width) - gap;
            expect(hole, at).toBeGreaterThanOrEqual(-0.5);
            if (a.zone === b.zone) expect(hole, `${at} ${drawn[k - 1]![0]}|${drawn[k]![0]}`).toBeLessThanOrEqual(0.5);
            else expect(hole, at).toBeLessThanOrEqual(Math.max(0, spare) + 0.5);
          }
          // It is the drop's state with its growth off.
          expect(l, at).toEqual(solve(withoutBarGrowth(t.after(ORIGIN, ORIGIN).state, "tools")));
        }
      }
    }
  });

  it("its held layout is the drop's state solved with its growth off; solving the state grows it", () => {
    for (const sc of [{}, { shape: "lead" as const }, { shape: "between" as const, nearest: true }]) {
      for (const w of [900, 1200, 1500]) {
        const s = world(true, w, sc);
        const d = dockDrag(s, "tools");
        const bars = new Set(["toolbar", "titlebar", "status"]);
        let seen = 0;
        for (const lane of d.regions.lanes.filter((l) => bars.has(l.id))) {
          for (const sp of lane.spots) {
            const a = d.after({ kind: "spot", spot: sp.id, point: { x: sp.landing.x + sp.landing.width / 2, y: sp.landing.y + sp.landing.height / 2 } });
            const it = a.layout.items.tools;
            if (!a.landing || !it || it.form !== 0 || !bars.has(it.edge ?? "")) continue;
            seen++;
            const at = `${name(sc, w)} ${sp.id}`;
            expect(a.layout, at).toEqual(solve(withoutBarGrowth(a.state, "tools")));
            expect(sp.landing.width, at).toBeCloseTo(NATURAL, 6);
            expect(a.landing.width, at).toBeCloseTo(NATURAL, 6);
            expect(it.rect).toEqual(a.landing);
            // Solving the state grows it into the free stretch on its zone's open side in its held layout (after the
            // start zone's last item, before the end zone's first).
            const placed = solve(a.state);
            const e = s.edges.find((x) => x.id === it.edge)!;
            const gap = e.gap ?? 0;
            const drawn = along(a.layout, it.edge!);
            const el = a.layout.edges[it.edge!]!;
            const lo = el.rect.x + (e.pad?.start ?? 0);
            const hi = el.rect.x + el.rect.width - (e.pad?.end ?? 0) - (el.menu ? el.menu.rect.width + gap : 0);
            const mine = drawn.filter(([, p]) => p.zone === it.zone);
            const k0 = drawn.indexOf(mine[0]!);
            const k1 = drawn.indexOf(mine[mine.length - 1]!);
            const after = k1 + 1 < drawn.length ? drawn[k1 + 1]![1].rect.x - gap : hi;
            const before = k0 > 0 ? drawn[k0 - 1]![1].rect.x + drawn[k0 - 1]![1].rect.width + gap : lo;
            const lastEnd = mine[mine.length - 1]![1].rect.x + mine[mine.length - 1]![1].rect.width;
            const stretch = it.zone === "end" ? mine[0]![1].rect.x - before : after - lastEnd;
            expect(placed.items.tools!.rect.width, at).toBeGreaterThanOrEqual(Math.min(NATURAL, it.rect.width) - 0.5);
            if (stretch > 1 && it.zone !== "center") expect(placed.items.tools!.rect.width, at).toBeGreaterThan(it.rect.width + 0.5);
          }
        }
        expect(seen, name(sc, w)).toBeGreaterThan(2);
      }
    }
  });
});

describe("with no movable grower on a bar nothing changes", () => {
  it("a panel card growing in a column, and a plain toolbar, land in exactly the layout their drop solves", () => {
    const s = world(false);
    for (const dragged of ["pages", "findings", "tools", "views"]) {
      for (const t of targets(s, dragged).filter((x) => x.id.startsWith("gap:"))) {
        const a = t.after(ORIGIN, ORIGIN);
        expect(a.layout, `${dragged} ${t.id}`).toEqual(solve(a.state));
      }
    }
  });
});

describe("a grower a hidden edge lends to a bar", () => {
  /**
   * The toolbar with Views and Zoom; Tools (growing) in a hidden side column that shows in the toolbar (`showIn`): it is
   * drawn in the toolbar though the state lists it on an edge that isn't a bar.
   */
  function lent(width = 1200): DockState {
    const s = world(true, width);
    const edges = s.edges.map((e) => (e.id === "toolbar" ? { ...e, items: e.items.filter((x) => x !== "tools") } : e));
    return { ...s, edges: [...edges, { id: "spare", side: "left" as const, ring: 1, accepts: ["panel", "group"], items: ["tools"], cross: { min: 160, max: 480, rail: 30 }, hidden: true, showIn: "toolbar" }] };
  }

  it("lies on the bar it shows in: its growth there is turned off for drop room and for its held layout", () => {
    for (const w of [900, 1200, 1500]) {
      const s = lent(w);
      expect(solve(s).items.tools!.edge).toBe("toolbar");
      expect(solve(s).items.tools!.rect.width, `${w}`).toBeGreaterThan(NATURAL + 0.5);
      const off = withoutBarGrowth(s);
      expect(off).not.toBe(s);
      expect(withoutBarGrowth(s, "tools")).not.toBe(s);
      expect(solve(off).items.tools!.rect.width, `${w}`).toBeCloseTo(NATURAL, 6);
      for (const dragged of ["search", "views"]) {
        const a = targets(s, dragged).filter((t) => t.id.includes("toolbar"));
        const b = targets(off, dragged).filter((t) => t.id.includes("toolbar"));
        expect(a.map((t) => t.id), `${w} ${dragged}`).toEqual(b.map((t) => t.id));
        expect(zoneExtents(s, dragged, "toolbar"), `${w} ${dragged}`).toEqual(zoneExtents(off, dragged, "toolbar"));
      }
    }
  });

  it("its home layout is the state solved with its growth off", () => {
    const s = lent();
    const home = targets(s, "tools").find((t) => t.place.kind === "home");
    expect(home).toBeDefined();
    const a = home!.after(ORIGIN, ORIGIN);
    expect(a.state).toBe(s);
    expect(a.layout).toEqual(solve(withoutBarGrowth(s, "tools")));
    expect(a.layout.items.tools!.rect.width).toBeCloseTo(NATURAL, 6);
  });
});

/** Whether two rects share more than a pixel each way. */
const over = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;

/** The scenes a held item meets a grower at home in: every shape, nearest zones, two growers, asked lengths, other zones. */
const BESIDE: readonly Scene[] = [
  { shape: "alone" },
  {},
  { shape: "lead" },
  { shape: "between" },
  { shape: "lead", nearest: true },
  { shape: "between", two: true },
  { shape: "between", asked: true },
  { zone: "center" },
  { zone: "end" },
];
/** A mark's place: its lane and the pair of neighbors it lies between (`<lane>/<kind>/<before>|<next>[:side]`). */
const placeOf = (lane: string, id: string): string => `${lane} ${(id.split("/")[2] ?? "").split(":")[0]}`;

describe("another item held beside a grower at home", () => {
  it("no guide of a frame lies over an item as that frame draws it, its room open or not", () => {
    for (const sc of BESIDE) {
      for (const w of [700, 1000, 1200, 1500]) {
        const s = world(true, w, sc);
        for (const dragged of ["search", ...(sc.shape === "alone" ? [] : ["views"])]) {
          const d = dockDrag(s, dragged);
          let frames = 0;
          for (const lane of d.regions.lanes.filter((l) => ["toolbar", "titlebar", "status"].includes(l.id))) {
            for (const sp of lane.spots) {
              for (const u of [0.1, 0.5, 0.9]) {
                for (const room of [true, false]) {
                  const held = { kind: "spot" as const, spot: sp.id, point: { x: sp.landing.x + sp.landing.width * u, y: sp.landing.y + sp.landing.height / 2 } };
                  const frame = { held, room, guides: d.regions.lanes.map((l) => ({ lane: l.id, held })) };
                  const shown = d.shown(frame);
                  const at = `${name(sc, w)} ${dragged} ${sp.id} ${u} room ${room}`;
                  if (room) expect(shown, at).toEqual(d.after(held).layout);
                  frames++;
                  for (const m of d.guides(frame)) {
                    if (m.kind === "line") continue;
                    for (const [id, it] of Object.entries(shown.items)) {
                      // (A growing fixed title's slack is free room for the marks by its own rule: not this one's.)
                      if (id === dragged || it.inMenu || !it.edge || it.floating || it.fixed) continue;
                      expect(over(m.rect, it.rect), `${at}: ${m.id} over ${id}`).toBe(false);
                    }
                  }
                }
              }
            }
          }
          expect(frames, `${name(sc, w)} ${dragged}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("every place marked at rest keeps a mark while another place is held, but the held place itself", () => {
    for (const sc of BESIDE) {
      for (const w of [700, 1000, 1200, 1500]) {
        const s = world(true, w, sc);
        const dragged = "search";
        const d = dockDrag(s, dragged);
        const lanes = d.regions.lanes.map((l) => l.id);
        const rest = new Set(d.guides({ held: null, room: false, guides: lanes.map((lane) => ({ lane, held: null })) }).map((m) => placeOf(m.lane, m.id)));
        expect([...rest].some((p) => p.startsWith("toolbar ")), name(sc, w)).toBe(true);
        for (const lane of d.regions.lanes.filter((l) => ["toolbar", "titlebar"].includes(l.id))) {
          for (const sp of lane.spots) {
            const held = { kind: "spot" as const, spot: sp.id, point: { x: sp.landing.x + sp.landing.width / 2, y: sp.landing.y + sp.landing.height / 2 } };
            for (const room of [true, false]) {
              const marked = new Set(d.guides({ held, room, guides: lanes.map((l) => ({ lane: l, held })) }).map((m) => placeOf(m.lane, m.id)));
              const heldPlace = placeOf(lane.id, sp.id.split("@")[0]!);
              for (const p of rest) {
                if (p === heldPlace || p.split(" ")[1]!.split("|").includes(dragged)) continue;
                expect(marked.has(p), `${name(sc, w)} ${sp.id} room ${room}: ${p} lost its mark`).toBe(true);
              }
            }
          }
        }
      }
    }
  });
});

describe("a grower floats at its natural size, under the hand", () => {
  it("a float of it is its natural size where it was pressed along its grown rect, and lies under the pointer", () => {
    const s = world(true, 1200, { shape: "alone" });
    const own = solve(s).items.tools!.rect;
    for (const gx of [12, 100, 400, 900]) {
      const drag = dockDrag(s, "tools", { grab: { x: gx, y: 18 } });
      for (const p of [{ x: 600, y: 400 }, { x: 1200 - 14, y: 300 }]) {
        const a = drag.after({ kind: "float", point: p });
        expect(a.landing, `${gx} ${p.x}`).not.toBeNull();
        expect([a.landing!.width, a.landing!.height], `${gx} ${p.x}`).toEqual([NATURAL, 28]);
        expect(contains(a.landing!, p), `${gx} ${p.x}`).toBe(true);
        expect(solve(a.state).items.tools!.rect, `${gx} ${p.x}`).toEqual(a.landing);
      }
    }
    expect(own.width).toBeGreaterThan(NATURAL);
  });

  it("flicked off its bar, every frame's landing is what a release there commits", () => {
    for (const sc of [{ shape: "alone" as const }, { shape: "lead" as const }]) {
      const s = world(true, 1200, sc);
      const seen = solve(s);
      const own = seen.items.tools!.rect;
      for (const gx of [12, 150, 400]) {
        if (gx > own.width - 4) continue;
        const press = { x: own.x + gx, y: own.y + 18 };
        const drag = dockDrag(s, "tools", { previous: seen, grab: { x: gx, y: 18 } });
        for (const end of [{ x: 1200 - 14, y: 120 }, { x: 1200 - 14, y: 300 }, { x: 1200 - 14, y: 700 }, { x: 600, y: 400 }]) {
          for (const steps of [1, 2, 4, 8]) {
            const m = modelOver(drag, { preview: guided("near") });
            let f: ReturnType<typeof m.update> | null = null;
            for (let k = 0; k <= steps; k++) f = m.update({ x: press.x + ((end.x - press.x) * k) / steps, y: press.y + ((end.y - press.y) * k) / steps }, k * 16);
            const at = `${JSON.stringify(sc)} ${gx} ${end.x},${end.y} ${steps}`;
            const rel = m.model.release(end, steps * 16 + 16);
            const committed = rel && !(rel.kind === "spot" && rel.home) ? drag.after(rel) : null;
            if (!f!.held || (rel?.kind === "spot" && rel.home)) continue;
            expect(committed, at).not.toBeNull();
            expect(committed!.landing, at).toEqual(f!.landing);
            expect(committed!.state, at).toEqual(drag.after(f!.held).state);
            if (rel!.kind === "float") expect(solve(committed!.state).items.tools!.rect, at).toEqual(f!.landing);
          }
        }
      }
    }
  });
});
