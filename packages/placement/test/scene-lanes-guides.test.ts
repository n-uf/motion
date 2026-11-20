/**
 * `lanes()` for a landing model's guides and gates: which spots move another item, the guide marks in the layout as
 * drawn (never over an item), refused stretches at least the item's length, and pitched spots on a toolbar rail.
 */
import { createLandingModel } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import type { Point, Rect } from "../src/geometry";
import { HATCH_EDGE, HATCH_END, lanes, solve, SPOT_PITCH, type Scene, type SceneItem } from "../src/scene";
import { WINDOW_A, winScene } from "../src/scene/cases/windows";
import { modelScene } from "./model-scene";
import { bar, byId, column, controls, group, panel, title } from "./scene-fixture";

const scenes = (): [string, Scene][] => [
  ["window A", winScene(WINDOW_A, { size: 300 })],
  ...[1, 2, 3, 4, 5, 6].map((seed): [string, Scene] => [`model ${seed}`, modelScene(seed, seed % 2 === 0, seed % 3 === 0, false)]),
];
const movable = (s: Scene): string[] => Object.keys(s.items).filter((k) => !s.items[k]!.fixed && !s.items[k]!.closed).slice(0, 4);
const overlaps = (a: Rect, b: Rect): boolean => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1e-6 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1e-6;
const len = (r: Rect, axis: "x" | "y"): number => (axis === "x" ? r.width : r.height);

/** A 1200 px top bar with a start item a; g held from the bottom bar. */
const barWin = (): Scene => ({
  stage: { x: 0, y: 0, width: 1200, height: 700 },
  edges: [bar("top", "top", 0, ["a"]), bar("bottom", "bottom", 0, ["g"])],
  items: byId([group("a", 1), group("g", 2)]),
  floats: [],
  floatKinds: ["group"],
});

describe("lanes(): where a spot's drop draws the other items", () => {
  it("before the bar's first item moves it; after it, at the end, or at a pitch past it, the others stay alike", () => {
    const s = barWin();
    const top = lanes(s, "g", { previous: solve(s) }).lanes.find((l) => l.id === "top")!;
    const after = top.spots.filter((sp) => sp.id.startsWith("top/start/a|") || sp.id.startsWith("top/end/"));
    expect(after.length).toBeGreaterThan(3);
    expect(new Set(after.map((sp) => sp.others)).size).toBe(1);
    expect(top.spots.find((sp) => sp.id === "top/start/^|a")!.others).not.toBe(after[0]!.others);
  });

  it("the bar's only item moved along it: every pitched spot draws the others alike", () => {
    const s = barWin();
    const top = lanes(s, "a", { previous: solve(s) }).lanes.find((l) => l.id === "top")!;
    const pitched = top.spots.filter((sp) => sp.pitched);
    expect(pitched.length).toBeGreaterThan(5);
    expect(new Set(pitched.map((sp) => sp.others)).size).toBe(1);
  });

  it("two spots with one key draw every other item alike", () => {
    for (const [name, s] of scenes().slice(0, 3))
      for (const id of movable(s)) {
        const spots = lanes(s, id, { previous: solve(s) }).lanes.flatMap((l) => l.spots.filter((sp) => !sp.home));
        const first = new Map<string, (typeof spots)[number]>();
        for (const sp of spots) {
          const a = first.get(sp.others);
          if (!a) {
            first.set(sp.others, sp);
            continue;
          }
          const la = a.target.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout;
          const lb = sp.target.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout;
          for (const [k, it] of Object.entries(la.items)) {
            const other = lb.items[k];
            if (k === id || !other || it.inMenu || other.inMenu) continue;
            const d = Math.max(Math.abs(it.rect.x - other.rect.x), Math.abs(it.rect.y - other.rect.y), Math.abs(it.rect.width - other.rect.width), Math.abs(it.rect.height - other.rect.height));
            expect(d, `${name} ${id} ${sp.id} ${k}`).toBeLessThan(1);
          }
        }
      }
  });
});

describe("lanes(): guide marks", () => {
  it("never lie over an item drawn on the lane, as seen or with a spot held, and a box fits the item", () => {
    for (const [name, s] of scenes())
      for (const id of movable(s)) {
        const prev = solve(s);
        const seen = lanes(s, id, { previous: prev });
        const check = (ls: typeof seen.lanes, drawn: ReturnType<typeof solve>, spot: string): void => {
          // As seen, the lifted item is drawn nowhere in a lane (its own place is free); with a spot held, at that spot.
          const lifted = spot === "seen";
          for (const l of ls) {
            // A growing item at its natural length: what it draws past that is free stretch (marked like one).
            const edge = s.edges.find((x) => x.id === l.id);
            const barLike = !!edge && (edge.side === "top" || edge.side === "bottom" || !!edge.compact);
            const natural = (iid: string, r: Rect): Rect => {
              const main = barLike ? s.items[iid]?.forms[l.axis === "x" ? "row" : "column"]?.[0]?.main : undefined;
              if (!main?.grows || main.natural >= len(r, l.axis)) return r;
              return l.axis === "x" ? { ...r, width: main.natural } : { ...r, height: main.natural };
            };
            const items = Object.entries(drawn.items)
              .filter(([iid, it]) => it.edge === l.id && !it.inMenu && !it.floating && it.rect.width > 0 && it.rect.height > 0 && !(lifted && iid === id))
              .map(([iid, it]) => ({ rect: iid === id ? it.rect : natural(iid, it.rect) }));
            const itemLen = Math.min(...l.spots.map((sp) => len(sp.landing, l.axis)));
            for (const m of l.marks) {
              // A hatch lies over the neighbor that gives way (never over the held item); a line or a box over none.
              if (m.kind !== "hatch") for (const it of items) expect(overlaps(m.rect, it.rect), `${name} ${id} ${spot} ${l.id} ${m.kind}`).toBe(false);
              // A box fits the item; beside the held item (`:before`, `:after`), on a bar or a toolbar rail, a pitch does;
              // short room drawn as it lands is a box with its hatch.
              const beside = /:(before|after)(#\d+)?(~2)?$/.test(m.id);
              const e = s.edges.find((x) => x.id === l.id);
              const compact = !!e && (e.side === "top" || e.side === "bottom" || !!e.compact);
              const hatched = l.marks.some((h) => h.kind === "hatch" && markPair(h.id) === markPair(m.id));
              if (m.kind === "box" && !hatched) expect(len(m.rect, l.axis) + 1e-6, `${name} ${id} ${l.id} ${m.id}`).toBeGreaterThanOrEqual(beside && compact ? Math.min(itemLen, SPOT_PITCH) : itemLen);
            }
          }
        };
        check(seen.lanes, prev, "seen");
        for (const l of seen.lanes.slice(0, 3)) {
          const sp = l.spots[Math.floor(l.spots.length / 2)]!;
          const held = lanes(s, id, { previous: prev, spot: sp.id });
          check(held.lanes.filter((x) => x.id === l.id), sp.target.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout, sp.id);
        }
      }
  });

  it("a bar with room shows a box over its free stretch, and lines between items that touch", () => {
    const s: Scene = { ...barWin(), edges: [bar("top", "top", 0, ["a", "b"]), bar("bottom", "bottom", 0, ["g"])], items: byId([group("a", 1), group("b", 3), group("g", 2)]) };
    const top = lanes(s, "g", { previous: solve(s) }).lanes.find((l) => l.id === "top")!;
    expect(top.marks.filter((m) => m.kind === "box").length).toBeGreaterThan(0);
    expect(top.marks.filter((m) => m.kind === "line").map((m) => m.id)).toContain("top/line/a|b");
  });

  it("have ids unique per lane, and lines keep theirs while the window grows", () => {
    for (const [name, s] of scenes())
      for (const id of movable(s)) {
        const ids = (sc: Scene): Map<string, string[]> => new Map(lanes(sc, id).lanes.map((l) => [l.id, l.marks.map((m) => m.id)]));
        const before = ids(s);
        for (const [lane, list] of before) expect(new Set(list).size, `${name} ${id} ${lane}`).toBe(list.length);
        const after = ids({ ...s, stage: { ...s.stage, width: s.stage.width + 120 } });
        // An edge's lines (a virtual lane's line is its box while the held item is drawn over it).
        for (const [lane, list] of before) if (!lane.includes(":")) for (const m of list.filter((x) => x.includes("/line/"))) expect(after.get(lane) ?? [], `${name} ${id} ${m}`).toContain(m);
      }
  });

  it("lie inside their lane's rect", () => {
    for (const [name, s] of [...scenes(), ...[9, 10, 11, 12, 13, 14].map((seed): [string, Scene] => [`model ${seed}`, modelScene(seed, seed % 2 === 0, seed % 3 === 0, false)])])
      for (const id of movable(s))
        for (const l of lanes(s, id, { previous: solve(s) }).lanes) {
          if (l.id.includes(":")) continue;
          for (const m of l.marks) {
            const r = m.rect;
            const inside = r.x >= l.rect.x - 0.5 && r.y >= l.rect.y - 0.5 && r.x + r.width <= l.rect.x + l.rect.width + 0.5 && r.y + r.height <= l.rect.y + l.rect.height + 0.5;
            expect(inside, `${name} ${id} ${m.id}`).toBe(true);
          }
        }
  });

  it("a column with one panel gets lines at its ends, so its lane shows guides", () => {
    const s = winScene(WINDOW_A, { size: 300 });
    const right = lanes(s, "pages", { previous: solve(s) }).lanes.find((l) => l.id === "right-0")!;
    expect(right.marks.length).toBeGreaterThan(0);
  });

  it("every refused stretch in a lane is at least the item's length", () => {
    for (const [name, s] of scenes())
      for (const id of movable(s))
        for (const l of lanes(s, id).lanes) {
          const itemLen = Math.min(...l.spots.map((sp) => len(sp.landing, l.axis)));
          for (const f of l.refused) expect(f.along[1] - f.along[0] + 1e-6, `${name} ${id} ${l.id}`).toBeGreaterThanOrEqual(itemLen);
        }
  });
});

/**
 * A document window: a title bar (a fixed title, two toolbars, fixed controls), a top bar (empty, or holding views),
 * a bottom bar of toolbars, toolbar rails at both sides (tools and zoom at the left) with a 4 px gap, panel columns.
 */
function docWindow(top: string[] = []): Scene {
  const sized = (id: string, used: number, w: number): SceneItem => {
    const g0 = group(id, used);
    return { ...g0, forms: { ...g0.forms, row: [{ ...g0.forms.row![0]!, main: { min: w, natural: w } }, ...g0.forms.row!.slice(1)] } };
  };
  const COL = { accepts: ["panel"], cross: { min: 180, max: 480, rail: 30 } };
  const rail = (id: string, side: "left" | "right", items: string[]): Scene["edges"][number] => ({ id, side, ring: 0, accepts: ["group"], items, cross: { min: 30, max: 30, rail: 30 }, compact: true, gap: 4, pad: { start: 4, end: 4 } });
  return {
    stage: { x: 0, y: 0, width: 1080, height: 640 },
    edges: [
      bar("title", "top", 0, ["title", "tz", "rd", "controls"]),
      bar("top", "top", 1, top),
      bar("bottom", "bottom", 0, ["views", "review"].filter((x) => !top.includes(x))),
      rail("rail-left", "left", ["tools", "zoom"]),
      rail("rail-right", "right", []),
      column("left", "left", 1, ["pages", "notes"], { column: true, accepts: ["panel"] }),
      column("right", "right", 1, ["findings"], { column: true, accepts: ["panel"] }),
    ],
    items: byId([title(), sized("tz", 1, 161), sized("rd", 9, 200), controls(), sized("tools", 2, 158), sized("zoom", 3, 161), sized("views", 4, 227), sized("review", 5, 230), panel("pages", 6), panel("notes", 7), panel("findings", 8)]),
    floats: [],
    floatKinds: ["panel", "group"],
    columns: { left: COL, right: COL },
    sideColumns: "one",
  };
}
const TOOLBARS = ["tz", "rd", "tools", "zoom", "views", "review"];
/** A spot's place in its lane: the items either side (`<before>|<after>`), its pitch and zone left out. */
const pairOf = (spotId: string): string => spotId.split("/")[2]?.split("@")[0] ?? "";
/** The items a mark lies between (`<before>|<after>`), its side of the held item and piece left out. */
const markPair = (markId: string): string => markId.split("/")[2]!.split(":")[0]!.split("#")[0]!.split("~")[0]!;
const sameLanding = (a: Rect, b: Rect): boolean => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;

describe("lanes(): a guide at every spot but the held one's", () => {
  it("with each spot of each bar and rail held, every other spot's place has a mark: the head, the tail, the gaps between items and the room beside the held item", () => {
    const misses: string[] = [];
    for (const [name, s] of [
      ["empty top bar", docWindow()],
      ["views in the top bar", docWindow(["views"])],
    ] as const) {
      const previous = solve(s);
      for (const id of TOOLBARS)
        for (const l of lanes(s, id, { previous }).lanes.filter((x) => !x.id.includes(":")))
          for (const sp of l.spots) {
            const held = lanes(s, id, { previous, spot: sp.id }).lanes.find((x) => x.id === l.id)!;
            const mid = (r: Rect): number => (l.axis === "x" ? r.x + r.width / 2 : r.y + r.height / 2);
            for (const o of held.spots) {
              const p = pairOf(o.id);
              if (!p || o.id === sp.id || sameLanding(o.landing, sp.landing)) continue;
              // The held item splits the stretch it lies in: a spot before it needs a mark before it, one after it after.
              const side = mid(o.landing) < mid(sp.landing) ? "before" : "after";
              // A room box beside the held item names its side of the item; any other mark of that place counts.
              const ok = held.marks.some((m) => markPair(m.id) === p && (m.kind !== "box" || !/:(before|after)/.test(m.id) || m.id.includes(`:${side}`)));
              if (!ok) misses.push(`${name}: ${id} held at ${sp.id}, nothing marks ${l.id} ${p} ${side} it (${o.id})`);
            }
          }
    }
    expect(misses).toEqual([]);
  });

  it("on a bar and a toolbar rail, the room beside the held item is a box from a pitch wide, named by its side of the item", () => {
    const s = docWindow();
    const previous = solve(s);
    // Zoom held on the title bar's pitched spots between tz and rd, and tools in its own rail below zoom.
    for (const [id, laneId] of [
      ["zoom", "title"],
      ["tools", "rail-left"],
      ["views", "bottom"],
    ] as const) {
      const l0 = lanes(s, id, { previous }).lanes.find((x) => x.id === laneId)!;
      let besides = 0;
      for (const sp of l0.spots) {
        const held = lanes(s, id, { previous, spot: sp.id }).lanes.find((x) => x.id === laneId)!;
        const room = held.marks.filter((m) => m.kind === "box" && /:(before|after)/.test(m.id));
        besides += room.length;
        for (const m of room) {
          expect(m.kind, m.id).toBe("box");
          expect(len(m.rect, held.axis) + 1e-6, m.id).toBeGreaterThanOrEqual(SPOT_PITCH);
          // It touches the held item's landing (the room up to it) and lies on its named side.
          const at = (r: Rect, a: "x" | "y"): [number, number] => (a === "x" ? [r.x, r.x + r.width] : [r.y, r.y + r.height]);
          const [m0, m1] = at(m.rect, held.axis);
          const [h0, h1] = at(sp.landing, held.axis);
          if (m.id.includes(":before")) expect(Math.abs(m1 - h0), m.id).toBeLessThan(0.5);
          else expect(Math.abs(m0 - h1), m.id).toBeLessThan(0.5);
        }
      }
      expect(besides, `${id} in ${laneId}`).toBeGreaterThan(0);
    }
  });

  it("gliding the held item along a free stretch, its room boxes keep their ids: each comes once and goes once", () => {
    const s = docWindow();
    const previous = solve(s);
    for (const [id, laneId] of [
      ["zoom", "title"],
      ["tz", "bottom"],
      ["tools", "rail-right"],
    ] as const) {
      const l0 = lanes(s, id, { previous }).lanes.find((x) => x.id === laneId)!;
      // Along the lane in order: every spot held in turn, the ids of the boxes beside it on each.
      const seq = l0.spots.map((sp) => new Set(lanes(s, id, { previous, spot: sp.id }).lanes.find((x) => x.id === laneId)!.marks.filter((m) => m.kind === "box" && /:(before|after)/.test(m.id)).map((m) => m.id)));
      const all = new Set(seq.flatMap((x) => [...x]));
      for (const mid of all) {
        // Present on one run of consecutive spots: never goes and comes back while the item glides one way.
        const on = seq.map((x) => x.has(mid));
        const runs = on.filter((v, i) => v && !on[i - 1]).length;
        expect(runs, `${id} in ${laneId}: ${mid}`).toBe(1);
      }
    }
  });

  it("the head of a title bar, past its growing title's natural length, is marked: a box before the held toolbar, beside the title's text", () => {
    // A title bar of the title and the controls only (its toolbars in the top bar): zoom held a few pitches past the
    // title, the room between the title's text and zoom is a box.
    const base = docWindow(["tz", "rd"]);
    const s: Scene = { ...base, edges: base.edges.map((e) => (e.id === "title" ? { ...e, items: ["title", "controls"] } : e)) };
    const previous = solve(s);
    const l0 = lanes(s, "zoom", { previous }).lanes.find((x) => x.id === "title")!;
    const natural = s.items.title!.forms.row![0]!.main.natural;
    const t0 = previous.items.title!.rect;
    const sp = l0.spots.find((x) => x.landing.x >= t0.x + natural + 2 * SPOT_PITCH && x.landing.x <= t0.x + natural + 4 * SPOT_PITCH)!;
    expect(sp, l0.spots.map((x) => `${x.id}@${Math.round(x.landing.x)}`).join(" ")).toBeDefined();
    const held = lanes(s, "zoom", { previous, spot: sp.id }).lanes.find((x) => x.id === "title")!;
    const t = sp.target.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout.items.title!.rect;
    const head = held.marks.find((m) => m.kind === "box" && m.id.endsWith(":before"))!;
    expect(head, held.marks.map((m) => m.id).join()).toBeDefined();
    // From the end of the title's text (its natural length, however far it grows) to the held toolbar.
    expect(head.rect.x).toBeCloseTo(t.x + Math.min(natural, t.width), 3);
    expect(head.rect.x + head.rect.width).toBeCloseTo(sp.landing.x, 3);
  });

  it("lifted from its bar and held elsewhere (a float), the item's own place is free room: its bar's stretch is one box, unsplit", () => {
    // Zoom docked alone in the title bar, between the title and the controls, then lifted: as seen (its lane not held),
    // the title bar's stretch from the title's text to the controls is one box.
    const base = docWindow(["tz", "rd"]);
    const s: Scene = { ...base, edges: base.edges.map((e) => (e.id === "title" ? { ...e, items: ["title", "zoom", "controls"] } : e.id === "rail-left" ? { ...e, items: ["tools"] } : e)) };
    const previous = solve(s);
    const title = lanes(s, "zoom", { previous }).lanes.find((x) => x.id === "title")!;
    const boxes = title.marks.filter((m) => m.kind === "box");
    expect(boxes.map((m) => m.id)).toEqual(["title/box/title|controls"]);
    const t = previous.items.title!.rect;
    const natural = s.items.title!.forms.row![0]!.main.natural;
    expect(boxes[0]!.rect.x).toBeCloseTo(t.x + Math.min(natural, t.width), 3);
    expect(boxes[0]!.rect.x + boxes[0]!.rect.width).toBeCloseTo(previous.items.controls!.rect.x, 3);
    // With its own place held (the room open there), it is drawn there again and splits the stretch.
    const home = title.spots.find((x) => x.home)!;
    const held = lanes(s, "zoom", { previous, spot: home.id }).lanes.find((x) => x.id === "title")!;
    expect(held.marks.filter((m) => m.kind === "box").every((m) => /:(before|after)/.test(m.id))).toBe(true);
  });

  it("the cues: room that fits a box; room that partly fits a box with a fixed striped end inside it at the side that gives way; under a pitch, or none, a line; never a mark on an item", () => {
    const at = (r: Rect, a: "x" | "y"): [number, number] => (a === "x" ? [r.x, r.x + r.width] : [r.y, r.y + r.height]);
    /** In `l` as drawn: no box, line or hatch over an item drawn (but the held one's own lane edge), and each hatch a fixed end inside a box of its place. */
    const cues = (where: string, l: ReturnType<typeof lanes>["lanes"][number], drawn: ReturnType<typeof solve>, held: string | null): void => {
      const items = Object.entries(drawn.items).filter(([iid, it]) => it.edge === l.id && !it.inMenu && !it.floating && it.rect.width > 0 && iid !== held);
      for (const m of l.marks) for (const [iid, it] of items) expect(overlaps(m.rect, it.rect), `${where} ${m.id} over ${iid}`).toBe(false);
      for (const h of l.marks.filter((m) => m.kind === "hatch")) {
        expect(len(h.rect, l.axis), `${where} ${h.id} is a fixed end`).toBeLessThanOrEqual(HATCH_END + 1e-6);
        const box = l.marks.find((m) => m.kind === "box" && markPair(m.id) === markPair(h.id) && at(m.rect, l.axis)[0] <= at(h.rect, l.axis)[0] + 1e-6 && at(m.rect, l.axis)[1] >= at(h.rect, l.axis)[1] - 1e-6);
        expect(box, `${where} ${h.id} inside its box`).toBeDefined();
      }
    };
    // No free room at a rail's head (its toolbars start at its padding): a line at the end, no stripes.
    const s = docWindow();
    const previous = solve(s);
    const rail = lanes(s, "views", { previous }).lanes.find((x) => x.id === "rail-left")!;
    expect(rail.marks.filter((m) => markPair(m.id) === "^|tools").map((m) => m.kind)).toEqual(["line"]);
    // B1: touching neighbors keep their line.
    expect(rail.marks.find((m) => markPair(m.id) === "tools|zoom")?.kind).toBe("line");
    cues("rail", rail, previous, "views");
    // A bar with a start toolbar and an end toolbar, swept narrower: the room between them fits (a box alone), then
    // partly fits (a box with a striped end), then is under a pitch (a line); held at every spot too.
    const kinds = new Set<string>();
    for (let w = 520; w <= 900; w += 10) {
      const b: Scene = {
        ...barWin(),
        stage: { x: 0, y: 0, width: w, height: 700 },
        edges: [bar("top", "top", 0, ["a", "z"]), bar("bottom", "bottom", 0, ["g"])],
        items: byId([group("a", 1), { ...group("z", 3), align: "end" }, group("g", 2)]),
      };
      const prev = solve(b);
      const top = lanes(b, "g", { previous: prev }).lanes.find((x) => x.id === "top")!;
      cues(`width ${w}`, top, prev, "g");
      const here = top.marks.filter((m) => markPair(m.id) === "a|z");
      const room = at(prev.items.z!.rect, "x")[0] - at(prev.items.a!.rect, "x")[1];
      kinds.add(here.map((m) => m.kind).sort().join("+"));
      // Under a pitch: a line, never a sliver box.
      if (room < SPOT_PITCH - 0.5) expect(here.map((m) => m.kind), `width ${w}`).toEqual(here.length ? ["line"] : []);
      for (const sp of top.spots) {
        const held = lanes(b, "g", { previous: prev, spot: sp.id }).lanes.find((x) => x.id === "top")!;
        cues(`width ${w} held at ${sp.id}`, held, sp.target.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout, "g");
      }
    }
    expect([...kinds]).toEqual(expect.arrayContaining(["box", "box+hatch"]));
  });

  it("no two lanes' guides overlap: at all four corners, with both top bars, the bars empty or holding toolbars, as seen and with every spot held", () => {
    const windows: [string, Scene][] = [
      ["empty top bar", docWindow()],
      ["views in the top bar", docWindow(["views"])],
      ["views and review in the top bar", docWindow(["views", "review"])],
    ];
    const bad: string[] = [];
    for (const [name, s] of windows) {
      const previous = solve(s);
      for (const id of TOOLBARS) {
        const sets: [string, ReturnType<typeof lanes>["lanes"]][] = [["seen", lanes(s, id, { previous }).lanes]];
        for (const l of lanes(s, id, { previous }).lanes) for (const sp of l.spots) sets.push([sp.id, lanes(s, id, { previous, spot: sp.id }).lanes]);
        for (const [at, ls] of sets) {
          const all = ls.flatMap((l) => l.marks.map((m) => ({ lane: l.id, m })));
          for (let i = 0; i < all.length; i++)
            for (let j = i + 1; j < all.length; j++)
              if (all[i]!.lane !== all[j]!.lane && overlaps(all[i]!.m.rect, all[j]!.m.rect)) bad.push(`${name}, ${id} at ${at}: ${all[i]!.m.id} over ${all[j]!.m.id}`);
        }
      }
    }
    expect(bad.slice(0, 6)).toEqual([]);
  });

  it("an empty side rail by a column is a lane one rail wide at the window's edge: drawn at its real size (a box over the column's outer strip, by default) or as a thin striped edge on the window side (`emptyLanes: \"edge\"`)", () => {
    const s = docWindow();
    const previous = solve(s);
    const column = previous.edges.right!.rect;
    for (const emptyLanes of [undefined, "real", "edge"] as const) {
      const rs = lanes(s, "views", { previous, ...(emptyLanes ? { emptyLanes } : {}) });
      const rail = rs.lanes.find((x) => x.id === "rail-right")!;
      // The hit strip is one rail wide either way.
      expect(rail.rect.x + rail.rect.width).toBeCloseTo(s.stage.x + s.stage.width, 3);
      expect(rail.rect.width).toBeCloseTo(30, 3);
      if (emptyLanes === "edge") {
        // No box at all; thin strips along the window's edge.
        expect(rail.marks.some((m) => m.kind === "box"), rail.marks.map((m) => m.id).join()).toBe(false);
        const hatches = rail.marks.filter((m) => m.kind === "hatch");
        expect(hatches.length).toBeGreaterThan(0);
        for (const h of hatches) {
          expect(h.rect.width, h.id).toBeLessThanOrEqual(HATCH_EDGE + 1e-6);
          expect(h.rect.x + h.rect.width).toBeCloseTo(s.stage.x + s.stage.width, 3);
        }
        expect(hatches.some((m) => overlaps(m.rect, column))).toBe(true);
      } else {
        // Its real size: boxes one rail wide (the hit strip), over the column's outer strip; no stripes.
        expect(rail.marks.some((m) => m.kind === "hatch")).toBe(false);
        const boxes = rail.marks.filter((m) => m.kind === "box");
        expect(boxes.length).toBeGreaterThan(0);
        for (const b of boxes) expect(b.rect.width, b.id).toBeCloseTo(30, 3);
        expect(boxes.some((m) => overlaps(m.rect, column))).toBe(true);
      }
    }
  });

  it("an empty top bar: a box along its band at its real size, or a thin striped strip on its window side with `emptyLanes: \"edge\"`", () => {
    const s = docWindow();
    const previous = solve(s);
    for (const emptyLanes of ["real", "edge"] as const) {
      const top = lanes(s, "views", { previous, emptyLanes }).lanes.find((x) => x.id === "top")!;
      const marks = top.marks;
      expect(marks.length).toBeGreaterThan(0);
      if (emptyLanes === "real") for (const m of marks) expect([m.kind, m.rect.height]).toEqual(["box", top.rect.height]);
      else
        for (const m of marks) {
          expect(m.kind).toBe("hatch");
          expect(m.rect.height).toBeLessThanOrEqual(HATCH_EDGE + 1e-6);
          // The window side of a top bar: its top.
          expect(m.rect.y).toBeCloseTo(top.rect.y, 3);
        }
    }
  });

  it("over a column that takes nothing, an empty side rail is entered at once: no \"Can't go here\" in its band, and a release there docks in it", () => {
    const s = docWindow();
    const previous = solve(s);
    const r = previous.items.views!.rect;
    const grab = { x: 10, y: 10 };
    const regions = lanes(s, "views", { previous, grab });
    const home = regions.lanes.flatMap((l) => l.spots.filter((sp) => sp.home).map((sp) => ({ lane: l.id, spot: sp.id })))[0]!;
    const m = createLandingModel({ regions, regionsFor: (spot) => lanes(s, "views", { previous, grab, spot }), floatLanding: (p) => regions.float?.after(p, grab).layout.items.views?.rect ?? null, home });
    const rail = regions.lanes.find((x) => x.id === "rail-right")!;
    // From the press, up into the page, then right across the right column into the rail's band, slowly.
    const pts: Point[] = [];
    const go = (a: Point, b: Point): void => {
      const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.3 / 8);
      for (let k = 1; k <= n; k++) pts.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    };
    const press = { x: r.x + grab.x, y: r.y + grab.y };
    const page = { x: 540, y: 300 };
    go(press, page);
    go(page, { x: rail.rect.x + rail.rect.width / 2, y: 300 });
    let t = 0;
    let inBand = 0;
    const wrong: string[] = [];
    m.update(press, t);
    for (const p of pts) {
      const f = m.update(p, (t += 8));
      if (p.x > rail.rect.x + 0.5) {
        inBand++;
        if (f.region !== "lane" || f.lane !== "rail-right") wrong.push(`${Math.round(p.x)}: ${f.region} ${f.lane ?? ""}`);
      }
    }
    expect(inBand).toBeGreaterThan(0);
    expect(wrong.slice(0, 4)).toEqual([]);
    expect(m.release()).toMatchObject({ kind: "spot", lane: "rail-right" });
  });

  it("with a held spot whose room moves the edge (a bar left empty lets the rail start higher), the marks lie on the edge as drawn there", () => {
    const s = docWindow(["views"]);
    const previous = solve(s);
    const sp = lanes(s, "views", { previous }).lanes.find((x) => x.id === "rail-left")!.spots.find((x) => x.id === "rail-left/start/zoom|$")!;
    const drawn = sp.target.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout;
    const held = lanes(s, "views", { previous, spot: sp.id }).lanes.find((x) => x.id === "rail-left")!;
    // The rail starts 36 px higher with the top bar empty: its head mark lies above the rail as first seen.
    expect(drawn.edges["rail-left"]!.rect.y).toBeLessThan(previous.edges["rail-left"]!.rect.y);
    expect(held.marks.map((m) => markPair(m.id))).toContain("^|tools");
    const r = drawn.edges["rail-left"]!.rect;
    for (const m of held.marks) expect(m.rect.y >= r.y - 0.5 && m.rect.y + m.rect.height <= r.y + r.height + 0.5, m.id).toBe(true);
  });
});

describe("lanes(): pitched spots on a toolbar rail", () => {
  it("a compact rail gets spots at the pitch over its free stretch, like a bar", () => {
    const s: Scene = {
      stage: { x: 0, y: 0, width: 1000, height: 700 },
      edges: [bar("bottom", "bottom", 0, ["g"]), { id: "rail-left", side: "left", ring: 0, accepts: ["group"], items: ["t"], cross: { min: 30, max: 30, rail: 30 }, compact: true }],
      items: byId([group("t", 1), group("g", 2)]),
      floats: [],
      floatKinds: ["group"],
    };
    const rail = lanes(s, "g", { previous: solve(s) }).lanes.find((l) => l.id === "rail-left")!;
    expect(rail.axis).toBe("y");
    const pitched = rail.spots.filter((sp) => sp.pitched);
    expect(pitched.length).toBeGreaterThan(3);
    for (let i = 1; i < pitched.length; i++) expect(pitched[i]!.landing.y - pitched[i - 1]!.landing.y).toBeGreaterThanOrEqual(SPOT_PITCH / 2);
  });
});

describe("lanes(): spots beside kept space and over a growing item", () => {
  /** A 1200 px top bar with `items`; g held from the bottom bar. */
  const win = (items: string[], more: Record<string, Partial<SceneItem>>): Scene => ({
    stage: { x: 0, y: 0, width: 1200, height: 700 },
    edges: [bar("top", "top", 0, items), bar("bottom", "bottom", 0, ["g"])],
    items: byId([...items.map((id, i) => ({ ...group(id, i + 1), ...more[id] }) as SceneItem), group("g", 9)]),
    floats: [],
    floatKinds: ["group"],
  });

  it("beside an end item keeping space after it, a dock keeping none lands at the bar's end", () => {
    // e at the end keeps 160 px after it; the dock after e takes that space, and one more keeps none, at the end.
    const s = win(["a", "e"], { e: { align: "end", space: 160 } });
    const top = lanes(s, "g", { previous: solve(s) }).lanes.find((l) => l.id === "top")!;
    const end = solve(s).edges.top!.rect;
    expect(top.spots.some((sp) => Math.abs(sp.landing.x + sp.landing.width - (end.x + end.width - 8)) < 1)).toBe(true);
  });

  it("a growing item's length past its natural one gets pitched spots, as a free stretch does", () => {
    // t (a start item after a) grows to fill the bar: docks after a can still land along t's grown part.
    const grows: Partial<SceneItem> = { fixed: true, forms: { row: [{ kind: "row", main: { min: 80, natural: 160, grows: true }, cross: { natural: 28 } }] } };
    const s = win(["a", "t"], { t: grows });
    const t = solve(s).items.t!.rect;
    const top = lanes(s, "g", { previous: solve(s) }).lanes.find((l) => l.id === "top")!;
    const inside = top.spots.filter((sp) => sp.pitched && sp.landing.x > t.x + 1 && sp.landing.x < t.x + t.width - 160);
    expect(inside.length).toBeGreaterThan(3);
  });

  it("before a growing item there are none: a dock there keeps no space (the growing item takes all that is spare)", () => {
    const grows: Partial<SceneItem> = { forms: { row: [{ kind: "row", main: { min: 80, natural: 160, grows: true }, cross: { natural: 28 } }] } };
    const s = win(["t", "a"], { t: grows });
    const top = lanes(s, "g", { previous: solve(s) }).lanes.find((l) => l.id === "top")!;
    expect(top.spots.filter((sp) => sp.pitched && sp.id.includes("^|t"))).toEqual([]);
  });
});
