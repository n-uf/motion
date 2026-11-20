import { describe, expect, it } from "vitest";
import { HATCH_END, lanes, solve, type Scene } from "../src/scene";
import { LANDING_CASES } from "../src/scene/cases";
import { bar, byId, form, group } from "./scene-fixture";

/**
 * A 870 px bar: `wide` (362.3 as a row, steps down to a 140 icons form) at its start, `ends` (382.4, end zone) at its
 * end, `held` floating (130 as a row). As seen, `wide` ends at 370.3 and `ends` starts at 479.6: 109.3 px between
 * them, 93.3 px of room for an item less the 8 px gap each side, shorter than `held`; but a drop there makes room:
 * `wide` steps down.
 */
const row = (kind: "row" | "icons", w: number) => form(kind, w, w, 31);
const scene: Scene = {
  stage: { x: 0, y: 0, width: 870, height: 660 },
  edges: [bar("bar:bottom", "bottom", 0, ["wide", "ends"], { cross: { min: 31, max: 31, rail: 31 }, gap: 8, menu: { main: 24 } })],
  items: byId([
    group("wide", 1, { forms: { row: [row("row", 362.3), row("icons", 140), form("menu", 0, 0, 0)], column: [form("icons", 84, 84, 28), form("menu", 0, 0, 0)] } }),
    group("ends", 100, { align: "end", forms: { row: [row("row", 382.4)], column: [form("icons", 84, 84, 28)] } }),
    group("held", 2, { forms: { row: [row("row", 130), row("icons", 60), form("menu", 0, 0, 0)], column: [form("icons", 107, 107, 36), form("menu", 0, 0, 0)] } }),
  ]),
  floats: [{ id: "held", rect: { x: 529, y: 53, width: 36, height: 107 }, orient: "column" }],
  floatKinds: ["group"],
};

const lane = (stretchPositions: "free" | "pitched") => lanes(scene, "held", { previous: solve(scene), grab: { x: 5, y: 15 }, stretchPositions }).lanes.find((x) => x.id === "bar:bottom")!;

describe("a stretch is the room the drop makes (a neighbor steps down)", () => {
  it("is one sliding spot, from flush after the stepped-down neighbor to flush before the next", () => {
    const l = lane("free");
    const spot = l.spots.find((s) => s.id === "bar:bottom/start/wide|ends@slide");
    expect(spot, l.spots.map((s) => s.id).join(", ")).toBeDefined();
    // every start from 156 (8 + wide's 140 icons form + gap 8) to 341.6 (ends 479.6 - gap 8 - 130) lands as aimed
    expect(spot!.slide!.from).toBeCloseTo(156, 1);
    expect(spot!.slide!.to).toBeCloseTo(341.6, 1);
  });

  it("commits what it shows: every start in the range lands there, `wide` in its short form", () => {
    const spot = lane("free").spots.find((s) => s.id === "bar:bottom/start/wide|ends@slide")!;
    for (let x = 156; x <= 342; x += 17) {
      // held floats upright (36 × 107): along the bar, across its own length, the pointer holds its middle.
      const r = spot.target.after({ x: x + 65, y: 15 }, { x: 5, y: 15 });
      const held = r.layout.items["held"]!.rect;
      const at = Math.min(Math.max(Math.round(x), spot.slide!.from), spot.slide!.to);
      expect(Math.abs(held.x - at), `start ${x}`).toBeLessThanOrEqual(1);
      expect(r.layout.items["wide"]!.rect.width).toBeCloseTo(140, 1);
      expect(r.layout.items["ends"]!.rect.x).toBeCloseTo(479.6, 1);
    }
  });

  it("its guide is a box with a striped end facing the neighbor that steps down, the mark naming it", () => {
    for (const mode of ["free", "pitched"] as const) {
      const here = lane(mode).marks.filter((m) => m.id.includes("/wide|ends"));
      expect(here.map((m) => `${m.kind} ${m.id} ${m.givesWay ?? ""}`.trim()), mode).toEqual(["box bar:bottom/box/wide|ends", "hatch bar:bottom/hatch/wide|ends:before wide"]);
      const [box, hatch] = here;
      // The striped end lies inside the box, at its start (wide's side).
      expect(hatch!.rect.x).toBeCloseTo(box!.rect.x, 6);
      expect(hatch!.rect.width).toBeLessThanOrEqual(HATCH_END);
    }
  });

  it("with the sliding spot held, the guide still has its striped end facing wide, naming it (compared with the layout as seen, not the spot's)", () => {
    const id = "bar:bottom/start/wide|ends@slide";
    const l = lanes(scene, "held", { previous: solve(scene), grab: { x: 5, y: 15 }, spot: id }).lanes.find((x) => x.id === "bar:bottom")!;
    const all = l.marks.map((m) => `${m.kind} ${m.id} ${m.givesWay ?? ""}`.trim());
    const hatches = l.marks.filter((m) => m.kind === "hatch");
    expect(hatches.map((m) => m.givesWay), all.join("; ")).toEqual(["wide"]);
    // Inside the box of its room, at the side facing wide (wide is drawn in its short form there: the box starts at 156).
    const box = l.marks.find((m) => m.kind === "box" && m.rect.x <= hatches[0]!.rect.x + 1e-6 && m.rect.x + m.rect.width >= hatches[0]!.rect.x + hatches[0]!.rect.width - 1e-6);
    expect(box, all.join("; ")).toBeDefined();
    expect(hatches[0]!.rect.x).toBeCloseTo(box!.rect.x, 6);
    expect(hatches[0]!.rect.width).toBeLessThanOrEqual(HATCH_END);
  });

  it("a plain box where nothing moves, leaves or steps down: the same bar with room for the item beside wide as it is", () => {
    const roomy: Scene = { ...scene, stage: { ...scene.stage, width: 1100 } };
    const l = lanes(roomy, "held", { previous: solve(roomy), grab: { x: 5, y: 15 } }).lanes.find((x) => x.id === "bar:bottom")!;
    expect(l.marks.filter((m) => m.id.includes("/wide|ends")).map((m) => m.kind)).toEqual(["box"]);
    expect(l.marks.some((m) => m.givesWay)).toBe(false);
    // The stretch is the room as seen: flush after wide's row form.
    expect(l.spots.find((s) => s.id === "bar:bottom/start/wide|ends@slide")!.slide!.from).toBeCloseTo(8 + 362.3 + 8, 1);
  });

  it("the landing row's bar: the stretch before panels (no room) is its plain dock, not a sliding spot of one point", () => {
    const row = LANDING_CASES.find((r) => r.id === "landing-step-down-room")!;
    const l = lanes(row.scene, "tools", { previous: solve(row.scene) }).lanes.find((x) => x.id === "bottom")!;
    expect(l.spots.map((s) => s.id)).toContain("bottom/start/^|panels");
    expect(l.spots.filter((s) => s.slide).map((s) => s.id)).toEqual(["bottom/start/panels|status@slide"]);
  });

  it("pitched: the room is filled at the pitch, not only its two ends", () => {
    const l = lane("pitched");
    const xs = l.spots.filter((s) => s.id.startsWith("bar:bottom/") && /wide\|ends/.test(s.id)).map((s) => Math.round(s.landing.x));
    expect(xs).toContain(156);
    expect(xs.some((x) => x > 180 && x < 320), xs.join(", ")).toBe(true);
    expect(Math.max(...xs)).toBeCloseTo(342, -1);
  });
});
