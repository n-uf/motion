/**
 * One sliding range: a place over free room on a bar or a toolbar rail has one range of landings, whichever path reads
 * it. The tiles cut such a place from its range's first and last landings (`targets()`), and `lanes()` slides a spot
 * over the same range; both read it from `slideRange`. Per place (an edge and the neighbors either side), the tile
 * range's first landing starts at the lane slide's `from` and its last at its `to`, the item at its length there, and
 * both ends commit the place (the item between the same neighbors, the same items in the »).
 *
 * The other way round, every lane slide is a tile range but on an empty edge: there `targets()` offers the edge as its
 * drop strips by zone (no slots, so no landing cuts and no range), while `lanes()` slides a spot along its whole length
 * (decision 0010).
 */
import { describe, expect, it } from "vitest";
import { lanes, solve, type DockItem, type DockLaneOptions, type DockLayout, type DockState } from "../src";
import { tileSlides } from "../src/targets";
import { byId, form, panel } from "./fixture";
import { windows } from "./lift-windows";

const PITCHES = [undefined, 0, 120] as const;

/** A toolbar: `len` px along a bar or a rail; growing, it takes the free span after its zone. */
const tb = (id: string, len: number, more: Partial<DockItem> = {}, grows = false): DockItem => ({
  id,
  kind: "group",
  used: 1,
  forms: { row: [form("row", grows ? len - 20 : len, len, 32, grows ? { grows: true } : {}), form("menu", 0, 0, 0)], column: [form("icons", grows ? len - 20 : len, len, 28, grows ? { grows: true } : {}), form("menu", 0, 0, 0)] },
  ...more,
});
const STAGE = { x: 0, y: 0, width: 1080, height: 640 };
const one = (side: "left" | "top" | "bottom", items: string[], list: DockItem[]): DockState => ({
  stage: STAGE,
  edges: [side === "left" ? { id: "edge", side, ring: 0, accepts: ["group"], items, cross: { min: 30, max: 30, rail: 30 }, compact: true, gap: 4, pad: { start: 4, end: 4 } } : { id: "edge", side, ring: 0, accepts: ["group", "panel"], items, cross: { min: 36, max: 36, rail: 36 }, gap: 4, pad: { start: 8, end: 8 } }],
  items: byId(list),
  floats: [],
  floatKinds: ["group", "panel"],
});
/** Bars and rails of toolbars, panels and growers, each item dragged. */
const SCENES: readonly [string, DockState][] = [
  ["a rail of three toolbars", one("left", ["a", "b", "c"], [tb("a", 158), tb("b", 102), tb("c", 102)])],
  ["a top bar of three toolbars, one at the end", one("top", ["a", "b", "c"], [tb("a", 120), tb("b", 160), tb("c", 120, { align: "end" })])],
  ["a bottom bar of two panels and a toolbar", one("bottom", ["p", "q", "g"], [panel("p", 1), panel("q", 2), tb("g", 120)])],
  ["a top bar with a growing toolbar between two", one("top", ["a", "t", "c"], [tb("a", 120), tb("t", 200, {}, true), tb("c", 120, { align: "end" })])],
];

/** The cases: every scene with each of its items dragged, and every captured window. */
function cases(): { name: string; state: DockState; dragged: string; options: DockLaneOptions }[] {
  const out: { name: string; state: DockState; dragged: string; options: DockLaneOptions }[] = [];
  for (const [name, s] of SCENES) for (const id of s.edges[0]!.items) out.push({ name: `${name}, ${id}`, state: s, dragged: id, options: {} });
  for (const w of windows()) out.push({ name: w.name, state: w.state, dragged: w.dragged, options: w.options });
  return out;
}

describe("one sliding range", () => {
  it("per place, the tile range's first and last landings are the lane slide's from and to", () => {
    let matched = 0;
    let reverseEmpty = 0;
    for (const c of cases())
      for (const pitch of PITCHES) {
        const options: DockLaneOptions = { ...c.options, ...(pitch === undefined ? {} : { pitch }), stretchPositions: "free" };
        const at = `${c.name} pitch ${pitch ?? "default"}`;
        const slides = new Map(
          lanes(c.state, c.dragged, options)
            .lanes.flatMap((l) => l.spots)
            .filter((sp) => !!sp.slide)
            .map((sp) => [sp.target.id.replace(/^slide:/, ""), sp] as const),
        );
        const ranges = tileSlides(c.state, c.dragged, options);
        // Every lane slide is a tile range, but on an empty edge (its drop strips by zone): one that shows no item but the
        // held one.
        const seen = solve(c.state);
        const othersOn = (edge: string): number =>
          Object.entries(seen.items).filter(([id, it]) => id !== c.dragged && it.edge === edge && !it.inMenu && !it.floating && it.rect.width > 0.01 && it.rect.height > 0.01).length;
        for (const key of slides.keys()) {
          const empty = othersOn(key.slice(0, key.lastIndexOf(":"))) === 0;
          if (!empty) expect(ranges.some((r) => `${r.edge}:${r.before ?? "^"}|${r.after ?? "$"}` === key), `${at}: the lane slide ${key} is a tile range`).toBe(true);
          else reverseEmpty++;
        }
        for (const r of ranges) {
          const key = `${r.edge}:${r.before ?? "^"}|${r.after ?? "$"}`;
          const sp = slides.get(key);
          expect(sp, `${at}: the tiles' range ${key} is a lane slide`).toBeDefined();
          const side = c.state.edges.find((e) => e.id === r.edge)?.side;
          const vertical = side === "left" || side === "right";
          const lo = (x: { x: number; y: number }): number => (vertical ? x.y : x.x);
          expect(r.from, `${at} ${key} from`).toBeCloseTo(sp!.slide!.from, 6);
          expect(r.to, `${at} ${key} to`).toBeCloseTo(sp!.slide!.to, 6);
          expect(lo(r.first), `${at} ${key} first landing`).toBeCloseTo(sp!.slide!.from, 6);
          expect(lo(r.last), `${at} ${key} last landing`).toBeCloseTo(sp!.slide!.to, 6);
          // Both ends commit the place: the item between the same neighbors, the same items in the » as at rest.
          const shown = (l: DockLayout): string[] =>
            Object.entries(l.items)
              .filter(([, it]) => it.edge === r.edge && !it.inMenu && !it.floating && it.rect.width > 0.01 && it.rect.height > 0.01)
              .sort(([, p], [, q]) => lo(p.rect) - lo(q.rect))
              .map(([id]) => id);
          const menu = (l: DockLayout): string => Object.keys(l.items).filter((id) => l.items[id]!.inMenu).sort().join(" ");
          const rest = sp!.target.after({ x: sp!.landing.x + 1, y: sp!.landing.y + 1 }, { x: 1, y: 1 }).layout;
          for (const x0 of [r.from, r.to]) {
            const l = sp!.target.after(vertical ? { x: sp!.landing.x + 1, y: x0 + 1 } : { x: x0 + 1, y: sp!.landing.y + 1 }, { x: 1, y: 1 }).layout;
            const ids = shown(l);
            const k = ids.indexOf(c.dragged);
            expect(`${ids[k - 1] ?? "^"}|${ids[k + 1] ?? "$"} » ${menu(l)}`, `${at} ${key} commit at ${x0}`).toBe(`${r.before ?? "^"}|${r.after ?? "$"} » ${menu(rest)}`);
          }
          matched++;
        }
      }
    // Places over free room on both paths, every scene kind among them.
    expect(matched).toBeGreaterThan(20);
    // The empty edges' slides (the captured windows' empty side bars and rails) are the only ones with no tile range.
    expect(reverseEmpty).toBeGreaterThan(0);
  });
});
