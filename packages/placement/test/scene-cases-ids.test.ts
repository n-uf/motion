/**
 * `CaseHost.ids`: a host that names a row's items and edges its own way. One mapping function renames every id position
 * both ways (the scene, a gesture, a layout, the stored form, a place), and the runner passes the host its own ids and
 * reads everything back in the row's.
 */
import { describe, expect, it } from "vitest";
import { solve, storeScene, type Scene } from "../src/scene";
import { CASES, createSceneHost, idRenames, mapGesture, mapLayout, mapPlace, mapScene, mapStored, runCase, runCaseAsync, WINDOW_A, WINDOW_B, winScene, type CaseHost, type Gesture } from "../src/scene/cases";
import { FLUSH, kitScene } from "./kit-scene";

const IDS = { pages: "P·1", notes: "N·2", findings: "F·3", "left-0": "L·0", "right-0": "R·0" };
const { to, from } = idRenames(IDS);

/** `json` with the layout's own `"notes":` key set aside, so what is left names no id by accident. */
const bare = (x: unknown): string => JSON.stringify(x).replaceAll('"notes":', "");
const ROW_IDS = ['"pages"', '"notes"', '"findings"', '"left-0"', '"right-0"'];

describe("the id map's one renaming function", () => {
  it("renames every id position of a scene, a layout and a stored form, and nothing else", () => {
    const s = kitScene(FLUSH, { W: 590, H: 757 });
    const sFloat: Scene = { ...s, floats: [{ id: "findings", rect: { x: 100, y: 100, width: 280, height: 300 } }], edges: s.edges.map((e) => (e.id === "right-0" ? { ...e, items: [] } : e)) };
    for (const scene of [s, sFloat]) {
      const out = mapScene(scene, to);
      for (const id of ROW_IDS) expect(bare(out), `scene still names ${id}`).not.toContain(id);
      expect(Object.keys(out.items).sort()).toEqual(["F·3", "N·2", "P·1"]);
      const layout = mapLayout(solve(scene), to);
      for (const id of ROW_IDS) expect(bare(layout), `layout still names ${id}`).not.toContain(id);
      // A layout's notes keep their codes and numbers; only their `id` and `edge` are renamed.
      const want = solve(scene).notes.map((n) => ({ ...n, ...("id" in n ? { id: to(n.id) } : {}), ...("edge" in n && n.edge !== undefined ? { edge: to(n.edge) } : {}) }));
      expect(layout.notes).toEqual(want);
      expect(layout.notes.length).toBeGreaterThan(0);
      const stored = mapStored(storeScene(scene), to);
      for (const id of ROW_IDS) expect(bare(stored), `stored form still names ${id}`).not.toContain(id);
    }
  });

  it("is its own inverse: every value comes back as it was", () => {
    const s = kitScene(FLUSH, { W: 590, H: 757 });
    expect(mapScene(mapScene(s, to), from)).toEqual(s);
    expect(mapLayout(mapLayout(solve(s), to), from)).toEqual(solve(s));
    expect(mapStored(mapStored(storeScene(s), to), from)).toEqual(storeScene(s));
    for (const g of [
      { type: "press", item: "notes", point: { x: 1, y: 2 } },
      { type: "resize", edge: "left-0", size: 4 },
      { type: "move", place: { kind: "gap", edge: "left-0", zone: "start", at: 1 } },
      { type: "move", place: { kind: "rail", side: "left", ring: 0 } },
      { type: "click", item: "findings", key: "fold" },
    ] as Gesture[])
      expect(mapGesture(mapGesture(g, to), from)).toEqual(g);
    expect(mapPlace({ kind: "side", edge: "right-0", side: "left" }, to)).toEqual({ kind: "side", edge: "R·0", side: "left" });
  });

  it("passes an id the map doesn't name, and is the identity with no map", () => {
    expect(to("unlisted")).toBe("unlisted");
    expect(from("unlisted")).toBe("unlisted");
    expect(idRenames(undefined).active).toBe(false);
    expect(idRenames({}).to("pages")).toBe("pages");
  });

  it("refuses a map that sends two row ids to one host id", () => {
    expect(() => idRenames({ a: "x", b: "x" })).toThrow(/both/);
  });
});

/** The row ids of every row's scene: its items and edges. */
const rowIds = (): Set<string> => {
  const out = new Set<string>();
  for (const row of CASES) {
    for (const id of Object.keys(row.scene.items)) out.add(id);
    for (const e of row.scene.edges) out.add(e.id);
    for (const f of row.scene.floats) out.add(f.id);
  }
  return out;
};

/**
 * A host that knows only its own names: it fails the run when it is handed a row id, and answers in its own names. It
 * is the reference host underneath, fed the row's words by the same renaming function.
 */
function namingHost(prefix: string, ids: Readonly<Record<string, string>>): { host: CaseHost; seen: string[] } {
  const inner = createSceneHost();
  const r = idRenames(ids);
  const seen: string[] = [];
  const own = (id: string | undefined, what: string): void => {
    if (id !== undefined && !id.startsWith(prefix) && Object.hasOwn(ids, id)) seen.push(`${what} ${id}`);
  };
  const host: CaseHost = {
    pick: inner.pick,
    load(scene, settings) {
      for (const id of [...Object.keys(scene.items), ...scene.edges.map((e) => e.id), ...scene.edges.flatMap((e) => e.items), ...scene.floats.map((f) => f.id), ...Object.values(scene.items).map((i) => i.id)]) own(id, "load");
      inner.load(mapScene(scene, r.from), settings);
    },
    perform(g) {
      own(g.item, "perform item");
      own(g.edge, "perform edge");
      if (g.place && (g.place.kind === "gap" || g.place.kind === "side")) own(g.place.edge, "perform place");
      inner.perform(mapGesture(g, r.from));
    },
    layout: () => mapLayout(inner.layout(), r.to),
    stored: () => mapStored(inner.stored!(), r.to),
    stops: (item) => {
      own(item, "stops");
      return inner.stops!(r.from(item)).map((p) => mapPlace(p, r.to));
    },
  };
  return { host, seen };
}

describe("a row's `requires` is true of its own scene", () => {
  it("rows that name a precondition meet it themselves, and the ones that need a rail declare it", () => {
    const needing = CASES.filter((c) => c.requires);
    expect(needing.map((c) => c.id)).toEqual(["C7", "R4b-leaving-the-band", "P5-neighbour-half-facing-it", "P6-outer-line-at-11-px", "P9-to-the-other-rail", "P16-first-px-left", "P16-first-px-right", "P16-outer-reach-is-the-column-line"]);
    for (const row of needing) {
      if (row.requires?.hitBand === "default") for (const e of row.scene.edges) expect(e.hitBand, `${row.id} ${e.id}`).toBeUndefined();
      if (row.requires?.railDrop === "scene") expect(row.scene.railDrop, `${row.id}: no strip of its own`).toBeUndefined();
      for (const side of row.requires?.rails ?? []) {
        expect(row.scene.rails?.[side], `${row.id} ${side}`).toBeDefined();
        // The rail shows at the start: a folded column put panels in it.
        expect(solve(row.scene).rails[side]?.segments.length, `${row.id} ${side} rail shows`).toBeGreaterThan(0);
      }
    }
  });
});

describe("P9-to-the-other-rail shows both rails in either window", () => {
  it("at the row's width, window A's and window B's left columns both fold into the rail, and the drop docks on the other rail", () => {
    const row = CASES.find((c) => c.id === "P9-to-the-other-rail")!;
    const W = row.scene.stage.width;
    for (const [name, spec] of [["A", WINDOW_A], ["B", WINDOW_B]] as const) {
      const scene = winScene(spec, { width: W, size: 300, from: { findings: 1 } });
      const l = solve(scene);
      expect(l.rails.left?.segments.map((x) => x.id), `${name}: the left rail`).toEqual(["pages", "annotations"]);
      expect(l.rails.right?.segments.map((x) => x.id), `${name}: the right rail`).toEqual(["findings"]);
      const r = runCase({ ...row, scene, expectLayout: { rails: row.expectLayout.rails! } }, createSceneHost());
      expect(r.ok, `${name}: ${r.failures.join("; ")}`).toBe(true);
    }
  });
});

describe("rows that mean a new outermost column aim by place", () => {
  it("they hold with a 32 px rail drop strip for panels, as a UI kit lays it", () => {
    for (const id of ["P6-new-outer-column-from-outside", "P6-new-outer-column-from-inside", "P6-left-outer-edge"]) {
      const row = CASES.find((c) => c.id === id)!;
      expect(row.gestures.some((x) => x.type === "move" && x.place?.kind === "column"), `${id} aims at a column place`).toBe(true);
      const strip = { ...row, scene: { ...row.scene, railDrop: { panel: { railStripWidth: 32, railVisibility: "whileDragging" as const } } } };
      const r = runCase(strip, createSceneHost());
      expect(r.ok, `${id} with a strip: ${r.failures.join("; ")}`).toBe(true);
    }
  });
});

describe("running the rows on a host with its own ids", () => {
  const map = Object.fromEntries([...rowIds()].map((id) => [id, `h:${id}`]));

  it("every row gives the result it gives on a host that names things as the row does, and the host is never handed a row id", async () => {
    let n = 0;
    for (const row of CASES) {
      const want = runCase(row, createSceneHost());
      const named = namingHost("h:", map);
      const got = runCase(row, { ...named.host, ids: map });
      expect(got, row.id).toEqual(want);
      expect(named.seen, row.id).toEqual([]);
      const named2 = namingHost("h:", map);
      expect(await runCaseAsync(row, { ...named2.host, ids: map }), row.id).toEqual(want);
      n++;
    }
    expect(n).toBe(CASES.length);
  });

  it("without the map the same host fails the rows: the ids are the point", () => {
    const row = CASES.find((c) => c.id === "P1-lift-follows-and-nothing-reflows") ?? CASES.find((c) => c.group === "gestures")!;
    const named = namingHost("h:", map);
    expect(runCase(row, named.host).ok).toBe(false);
  });

  it("maps the item a DOM check names before the host's itemSelector sees it", () => {
    const row = CASES.find((c) => (c.expectDom ?? []).some((d) => d.item !== undefined))!;
    const asked: string[] = [];
    const inner = createSceneHost();
    const named = namingHost("h:", map);
    runCase(row, { ...named.host, ids: map, root: () => ({ getAttribute: () => null, querySelectorAll: () => [] }), itemSelector: (id) => (asked.push(id), `[x="${id}"]`) });
    expect(asked.length).toBeGreaterThan(0);
    for (const id of asked) expect(id.startsWith("h:")).toBe(true);
    expect(inner).toBeDefined();
  });
});
