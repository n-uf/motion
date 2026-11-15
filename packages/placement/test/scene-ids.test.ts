/** The one id scheme: every id `targets` and `refusals` give is `targetId` of what `parseTargetId` reads from it. */
import { describe, expect, it } from "vitest";
import { parseTargetId, placeTargetId, refusals, targets, targetId, virtualEdgeId, type Scene, type TargetIdParts } from "../src/scene";
import { modelScene } from "./model-scene";

/** Every id the generated windows give, for every item that lifts, with the place each target names. */
function idsOf(s: Scene): { id: string; place?: TargetIdParts | null; edge?: string; item: string }[] {
  const out: { id: string; place?: TargetIdParts | null; edge?: string; item: string }[] = [];
  for (const id of Object.keys(s.items)) {
    if (s.items[id]!.fixed || s.items[id]!.closed) continue;
    for (const t of targets(s, id)) out.push({ id: t.id, item: id, place: t.place.kind === "home" || t.place.kind === "none" ? undefined : parseTargetId(placeTargetId(t.place, id) ?? "") });
    for (const r of refusals(s, id)) out.push({ id: r.id, edge: r.edge, item: id });
  }
  return out;
}

describe("target ids", () => {
  it("builds every kind and reads each back", () => {
    const all: TargetIdParts[] = [
      { kind: "gap", edge: "toolbar", zone: "center", at: 2 },
      { kind: "gap", edge: "x:left:end", zone: "end", at: 0 },
      { kind: "strip", edge: "rail-right", zone: "start" },
      { kind: "column", side: "left", ring: 1 },
      { kind: "rail", side: "right", ring: 0 },
      { kind: "home", item: "pages" },
      { kind: "float", item: "a:b" },
      { kind: "none", index: 3 },
      { kind: "refuse", edge: "column:left", zone: "start", n: 0 },
      { kind: "refuse", edge: "e:start", zone: "center", n: 2 },
    ];
    expect(all.map(targetId)).toEqual([
      "gap:toolbar:center:2",
      "gap:x:left:end:end:0",
      "strip:rail-right:start",
      "column:left:1",
      "rail:right:0",
      "home:pages",
      "float:a:b",
      "none:3",
      "refuse:column:left:start",
      "refuse:e:start:center:2",
    ]);
    for (const p of all) expect(parseTargetId(targetId(p))).toEqual(p);
    expect(parseTargetId("rail:left")).toBeNull();
    expect(parseTargetId("gap:toolbar:middle:0")).toBeNull();
    expect(virtualEdgeId("column", "right")).toBe("column:right");
    expect(placeTargetId({ kind: "gap", edge: "status", zone: "start", at: 0 }, "x")).toBe("gap:status:start:0");
    expect(placeTargetId({ kind: "none" }, "x")).toBeNull();
  });

  it("every id targets() and refusals() give round-trips, names its own place, and a refusal names its edge", () => {
    let n = 0;
    for (const flush of [false, true]) {
      for (let seed = 1; seed <= 40; seed++) {
        const s = modelScene(seed, flush);
        for (const x of idsOf(s)) {
          const p = parseTargetId(x.id);
          expect(p, x.id).not.toBeNull();
          expect(targetId(p!), x.id).toBe(x.id);
          if (p!.kind === "refuse") expect(p!.edge, x.id).toBe(x.edge);
          if (p!.kind === "home" || p!.kind === "float") expect(p!.item).toBe(x.item);
          // A slot's id is its place's (a gap on an edge with no members is its strip).
          if (x.place && p!.kind !== "strip") expect(p, x.id).toEqual(x.place);
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(2000);
  });
});
