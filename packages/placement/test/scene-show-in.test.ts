/**
 * `Edge.showIn`: a hidden edge that names another edge lends it its items. They lay out, target and stop as if they
 * sat at the end of that edge, after its own items; the stored scene keeps them in the hidden edge until a drop moves
 * one somewhere for real.
 */
import { describe, expect, it } from "vitest";
import { canFold, edgeTakes, fold, readScene, refusals, solve, stops, storeScene, targets, zoneTakes, type Edge, type Scene, type SceneItem } from "../src/scene";
import { isHandFolded } from "../src/scene/helpers";
import { FLUSH, INSET, kitScene } from "./kit-scene";
import { modelScene } from "./model-scene";
import { bar, byId, column, form, group, panel } from "./scene-fixture";

const J = (v: unknown): string => JSON.stringify(v, (_k, x) => (typeof x === "function" ? undefined : x));
const zoneOf = (item: SceneItem) => (item.align === "center" || item.align === "end" ? item.align : "start");
const P = { x: 300, y: 200 };
const G = { x: 10, y: 10 };

const scenes = (): Scene[] => [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].flatMap((seed) => [modelScene(seed), modelScene(seed, true), modelScene(seed, false, false, true)]),
  kitScene(INSET, { W: 1200 }),
  kitScene(FLUSH, { W: 1440, anchor: true }),
];

/**
 * For edge `h` lending to edge `to`: the scene with `h` hidden and showing in `to` (`lent`), and the same scene with
 * `h`'s first item already moved to the end of `to`'s own items (`placed`), `h` still hidden there.
 */
function pair(s: Scene, h: Edge, to: Edge): { lent: Scene; placed: Scene; id: string } {
  const id = h.items[0]!;
  const edit = (e: Edge, moved: boolean): Edge => {
    if (e.id === h.id) return { ...e, items: moved ? e.items.slice(1) : e.items, hidden: true, showIn: to.id };
    if (e.id === to.id && moved) return { ...e, items: [...e.items, id] };
    return e;
  };
  return { lent: { ...s, edges: s.edges.map((e) => edit(e, false)) }, placed: { ...s, edges: s.edges.map((e) => edit(e, true)) }, id };
}

/** Pairs of a shown edge (not fixed-holding) and another that takes its first item in its zone, a few per scene. */
function pairs(s: Scene, max = 3): { h: Edge; to: Edge }[] {
  const out: { h: Edge; to: Edge }[] = [];
  for (const h of s.edges) {
    if (h.hidden === true || h.items.length === 0 || h.items.some((id) => s.items[id]!.fixed)) continue;
    const item = s.items[h.items[0]!]!;
    for (const to of s.edges) {
      if (to === h || to.hidden === true || !zoneTakes(to, zoneOf(item), item.kind)) continue;
      out.push({ h, to });
      break;
    }
    if (out.length >= max) break;
  }
  return out;
}

describe("Edge.showIn", () => {
  it("a lent item gets the targets, refusals, stops and release layouts it would get at the end of the edge it shows in", () => {
    let n = 0;
    for (const s of scenes()) {
      for (const { h, to } of pairs(s)) {
        const { lent, placed, id } = pair(s, h, to);
        const tag = `${h.id}→${to.id} ${id}`;
        expect(J(solve(lent)), tag).toBe(J(solve(placed)));
        const tl = targets(lent, id);
        const tp = targets(placed, id);
        expect(J(tl.map((t) => [t.id, t.priority, t.hit, t.hits, t.slot, t.marker, t.place])), tag).toBe(J(tp.map((t) => [t.id, t.priority, t.hit, t.hits, t.slot, t.marker, t.place])));
        expect(J(refusals(lent, id)), tag).toBe(J(refusals(placed, id)));
        expect(J(stops(lent, id).map((t) => t.id)), tag).toBe(J(stops(placed, id).map((t) => t.id)));
        tl.forEach((t, i) => {
          const a = t.after(P, G);
          const b = tp[i]!.after(P, G);
          expect(J(a.layout), `${tag} ${t.id}`).toBe(J(b.layout));
          if (b.scene === placed) {
            // Home (or nothing committed): the stored scene, the same object; the item still in its hidden edge.
            expect(a.scene, `${tag} ${t.id}`).toBe(lent);
          } else {
            // A real move: out of the hidden edge, to the drop's place; the same scene as from `placed`.
            expect(J(a.scene), `${tag} ${t.id}`).toBe(J(b.scene));
            // (A hidden dynamic column it leaves empty is deleted, as any.)
            expect(a.scene.edges.find((e) => e.id === h.id)?.items ?? []).not.toContain(id);
            expect(J(solve(a.scene)), `${tag} ${t.id}`).toBe(J(a.layout));
          }
        });
        n++;
      }
    }
    expect(n).toBeGreaterThan(30);
  });

  it("a drop of another item never moves the hidden edge's items out of it; its preview is the result", () => {
    let n = 0;
    for (const s of scenes().slice(0, 12)) {
      for (const { h, to } of pairs(s, 1)) {
        const { lent } = pair(s, h, to);
        const hid = lent.edges.find((e) => e.id === h.id)!;
        const other = Object.keys(lent.items).find((k) => !lent.items[k]!.fixed && !lent.items[k]!.closed && !hid.items.includes(k));
        if (!other) continue;
        for (const t of targets(lent, other)) {
          const a = t.after(P, G);
          // Its ring may be numbered again, around a column the drop made or removed (as in 26.11.37); nothing else.
          expect({ ...a.scene.edges.find((e) => e.id === h.id)!, ring: hid.ring }, `${h.id} drag ${other} ${t.id}`).toEqual(hid);
          for (const e of a.scene.edges) if (e.id !== h.id) for (const id of hid.items) expect(e.items).not.toContain(id);
          expect(J(solve(a.scene))).toBe(J(a.layout));
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(50);
  });

  const small = (more: Partial<Edge> = {}): Scene => ({
    stage: { x: 0, y: 0, width: 900, height: 500 },
    edges: [column("left", "left", 0, ["p"]), bar("top", "top", 0, ["a"]), { ...bar("hid", "bottom", 0, ["b", "q"]), accepts: ["group", "panel"], hidden: true, showIn: "top", ...more }],
    items: byId([panel("p", 1), group("a", 2), group("b", 3), panel("q", 4), group("c", 5)]),
    floats: [],
    floatKinds: ["group"],
  });

  it("shown, the hidden edge's items are back in it; unmoved ones never left", () => {
    const s = small();
    const l = solve(s);
    expect(l.items.b).toMatchObject({ edge: "top" });
    expect(l.edges.hid).toBeUndefined();
    const wide = { ...s, edges: s.edges.map((e) => (e.id === "hid" ? { ...e, hidden: false } : e)) };
    expect(solve(wide).items.b).toMatchObject({ edge: "hid" });
    // A drop of another item, then the window widens: b is in its own edge.
    const a = targets(s, "c").find((t) => t.place.kind === "gap")!.after(P);
    const after = { ...a.scene, edges: a.scene.edges.map((e) => (e.id === "hid" ? { ...e, hidden: false } : e)) };
    expect(solve(after).items.b).toMatchObject({ edge: "hid" });
  });

  it("an item whose kind the edge it shows in doesn't take stays as a hidden edge's item: drawn nowhere, no targets", () => {
    const s = small();
    expect(edgeTakes(s.edges.find((e) => e.id === "top")!, "panel")).toBe(false);
    expect(solve(s).items.q).toBeUndefined();
    expect([targets(s, "q"), refusals(s, "q"), stops(s, "q")]).toEqual([[], [], []]);
  });

  it("showIn naming the edge itself, no edge or another hidden edge is ignored and noted", () => {
    const plain = small({ showIn: undefined });
    for (const to of ["hid", "nowhere", "gone"]) {
      const s: Scene = { ...small({ showIn: to }), edges: [...small({ showIn: to }).edges, { ...bar("gone", "bottom", 1, []), hidden: true }] };
      const base: Scene = { ...plain, edges: [...plain.edges, { ...bar("gone", "bottom", 1, []), hidden: true }] };
      const l = solve(s);
      expect(l.notes).toContainEqual({ code: "show-in-ignored", edge: "hid" });
      expect(J({ ...l, notes: l.notes.filter((x) => x.code !== "show-in-ignored") })).toBe(J(solve(base)));
      expect(targets(s, "b")).toEqual([]);
    }
  });

  it("a lent item shown in another zone keeps its own zone when a drop moves it: to a float, or docked with no zone named", () => {
    const s: Scene = {
      stage: { x: 0, y: 0, width: 900, height: 500 },
      edges: [bar("top", "top", 0, ["a"], { zoneAccepts: { start: [], center: ["group"], end: [] } }), { ...bar("hid", "bottom", 0, ["g"]), hidden: true, showIn: "top" }],
      items: byId([group("a", 1, { align: "center" }), group("g", 2)]),
      floats: [],
      floatKinds: ["group"],
    };
    // Shown in the top bar's center (its start takes no group); stored with no align.
    expect(solve(s).items.g).toMatchObject({ edge: "top", zone: "center" });
    expect(s.items.g!.align).toBeUndefined();
    const ts = targets(s, "g");
    const float = ts.find((t) => t.place.kind === "float")!.after(P, G);
    expect(float.scene.floats.some((f) => f.id === "g")).toBe(true);
    expect(float.scene.items.g!.align).toBeUndefined();
    expect(float.scene.edges.find((e) => e.id === "hid")!.items).toEqual([]);
    expect(J(solve(float.scene))).toBe(J(float.layout));
    // A gap names its zone: the drop's zone applies.
    const gap = ts.find((t) => t.place.kind === "gap" && t.place.edge === "top" && t.place.at === 0)!.after(P, G);
    expect(gap.scene.items.g!.align).toBe("center");
    expect(gap.scene.edges.find((e) => e.id === "top")!.items[0]).toBe("g");
  });

  it("a dynamic column emptied when its lent items go back is deleted; the hidden edge's showIn then names no edge", () => {
    const tpl = { accepts: ["panel", "group"], cross: { min: 160, max: 400 } };
    const s: Scene = {
      stage: { x: 0, y: 0, width: 1200, height: 600 },
      edges: [
        { id: "rail", side: "left", ring: 0, accepts: ["group"], items: ["g"], cross: { min: 30, max: 30, rail: 30 }, compact: true, hidden: true, showIn: "left-1" },
        column("left-1", "left", 1, ["p"], { column: true }),
        bar("top", "top", 0, []),
      ],
      items: byId([panel("p", 1), group("g", 2)]),
      floats: [],
      floatKinds: ["panel"],
      columns: { left: tpl, right: tpl },
    };
    expect(solve(s).items.g).toMatchObject({ edge: "left-1" });
    const a = targets(s, "p").find((t) => t.place.kind === "float")!.after({ x: 600, y: 300 }, G);
    // left-1 held p and, shown, g: with p gone and g given back it is empty, so it goes, and the rings close up.
    expect(a.scene.edges.find((e) => e.id === "left-1")).toBeUndefined();
    expect(a.scene.edges.find((e) => e.id === "rail")).toMatchObject({ items: ["g"], ring: 0, hidden: true });
    // The preview is the result: g is drawn nowhere until the host shows the rail or names another edge.
    expect(J(solve(a.scene))).toBe(J(a.layout));
    expect(a.layout.items.g).toBeUndefined();
    expect(a.layout.notes).toContainEqual({ code: "show-in-ignored", edge: "rail" });
    // The store reads it back the same.
    expect(readScene(JSON.parse(JSON.stringify(storeScene(a.scene))), s).scene.edges.map((e) => e.id).sort()).toEqual(["rail", "top"]);
  });

  it("canFold, fold and isHandFolded read a lent item where it is drawn: a bar's group shown in a column folds as in the column", () => {
    const base = (hidItems: string[], colItems: string[]): Scene => ({
      stage: { x: 0, y: 0, width: 1000, height: 600 },
      edges: [column("left", "left", 0, colItems), { ...bar("hid", "bottom", 0, hidItems), hidden: true, showIn: "left" }],
      items: byId([panel("p", 1), group("b", 2, { forms: { row: [form("row", 180, 200, 28), form("fold", 40, 40, 28)], column: [form("icons", 84, 84, 28)] } })]),
      floats: [],
      floatKinds: ["group"],
    });
    const lent = base(["b"], ["p"]);
    const placed = base([], ["p", "b"]);
    const shownBar = { ...lent, edges: lent.edges.map((e) => (e.id === "hid" ? { ...e, hidden: false } : e)) };
    // Along the bar (a row) b has a fold; along the column it has none.
    expect(canFold(shownBar, "b")).toBe(true);
    expect(canFold(placed, "b")).toBe(false);
    expect(canFold(lent, "b")).toBe(false);
    expect(fold(lent, "b", true)).toBe(lent);
    expect(isHandFolded({ ...lent, items: { ...lent.items, b: { ...lent.items.b!, from: 1 } } }, "b")).toBe(false);
  });

  it("the store never writes showIn; a stored one is ignored and listed, the value comes from base", () => {
    const s = small();
    const stored = storeScene(s);
    expect(stored.edges.find((e) => e.id === "hid")).toEqual({ id: "hid", side: "bottom", ring: 0, items: ["b", "q"] });
    const withShowIn = { ...stored, edges: stored.edges.map((e) => (e.id === "hid" ? { ...e, showIn: "left" } : e)) };
    const read = readScene(withShowIn, s);
    expect(read.dropped).toContain("edge:hid:showIn");
    expect(read.scene.edges.find((e) => e.id === "hid")!.showIn).toBe("top");
  });
});
