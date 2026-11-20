/**
 * An edge whose zones take nothing for a kind (`zoneAccepts: {}`) takes that kind nowhere (`edgeTakes`), exactly as an
 * edge whose `accepts` lacks it: empty, no target and no refusal; drawn, the same whole-edge refusal.
 */
import { describe, expect, it } from "vitest";
import { refusals, solve, targets, type DockEdge, type DockState } from "../src";
import { edgeTakes } from "../src/helpers";
import { byId, group, windowState } from "./fixture";

/** The window with a 32 px side rail at the left edge holding `items`, the edge shaped by `patch`. */
function withSideRail(items: string[], patch: Partial<DockEdge>): DockState {
  const s = windowState();
  const side: DockEdge = { id: "side", side: "left", ring: 0, accepts: ["group"], items, cross: { min: 32, max: 32, rail: 32 }, ...patch };
  return { ...s, edges: [side, ...s.edges.map((e) => (e.side === "left" ? { ...e, ring: e.ring + 1 } : e))], items: { ...s.items, ...byId([group("g1", 9)]) } };
}
const onSide = (s: DockState, id: string): { targets: string[]; refusals: unknown[] } => ({
  targets: targets(s, id).filter((t) => t.id.includes(":side:") || t.id.endsWith(":side")).map((t) => `${t.id} ${JSON.stringify(t.hit)}`),
  refusals: refusals(s, id).filter((r) => r.edge === "side").map((r) => [r.id, r.hit, r.hits ?? null, r.reason]),
});

describe("an edge whose zones take nothing for a kind", () => {
  it("edgeTakes: listed in accepts and taken by a zone", () => {
    expect(edgeTakes({ accepts: ["group"], zoneAccepts: {} }, "group")).toBe(false);
    expect(edgeTakes({ accepts: ["group"] }, "group")).toBe(true);
    expect(edgeTakes({ accepts: ["group"], zoneAccepts: { end: ["group"] } }, "group")).toBe(true);
    expect(edgeTakes({ accepts: [] }, "group")).toBe(false);
  });

  it("empty: a group drag gets no target and no refusal along it, as with an edge that lacks the kind", () => {
    const none = withSideRail([], { zoneAccepts: {} });
    expect(solve(none).edges.side!.rect.width).toBe(0);
    expect(onSide(none, "views")).toEqual({ targets: [], refusals: [] });
    expect(onSide(none, "views")).toEqual(onSide(withSideRail([], { accepts: [] }), "views"));
  });

  it("drawn with its stored items: what a drawn non-accepting edge gets, its one refusal over the drawn rect", () => {
    const none = withSideRail(["g1"], { zoneAccepts: {} });
    const lacks = withSideRail(["g1"], { accepts: [] });
    expect(solve(none).edges.side!.rect.width).toBeGreaterThan(0);
    expect(onSide(none, "views")).toEqual(onSide(lacks, "views"));
    expect(onSide(none, "views").targets).toEqual([]);
    expect(onSide(none, "views").refusals).toEqual([["refuse:side:start", solve(none).edges.side!.rect, null, "not-accepted"]]);
    // And every other target of the window is the same as well.
    const all = (s: DockState): string => JSON.stringify(targets(s, "views").map((t) => [t.id, t.hit, t.hits ?? null]));
    expect(all(none)).toBe(all(lacks));
  });
});
