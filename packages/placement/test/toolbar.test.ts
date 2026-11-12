/** Toolbar hosts: zones along the length, trailing-first overflow, insertion points, and the arrangement's changes. */
import { describe, expect, it } from "vitest";
import { overlap } from "../index";
import {
  GAP,
  arrangement,
  dockGroup,
  floatGroup,
  hostNeed,
  hostOf,
  insertGroup,
  insertions,
  isEmptyHost,
  isOwnPlace,
  layoutHost,
  moveBar,
  moveToHost,
  resetGroup,
  sameArrangement,
  readArrangement,
  storeArrangement,
  toggleCollapsed,
  withoutGroup,
  type Arrangement,
  type GroupSize,
  type HostSpec,
} from "../src/toolbar";
import * as toolbarModule from "../src/toolbar";

type Gr = "doc" | "edit" | "history" | "view" | "zoom" | "panel" | "share";
const WIDTH: Record<Gr, number> = { doc: 160, edit: 90, history: 70, view: 110, zoom: 100, panel: 80, share: 70 };
const size: GroupSize<Gr> = (g, v, collapsed) => (collapsed ? { along: 30, across: 28 } : v ? { along: WIDTH[g] * 0.6, across: 30 } : { along: WIDTH[g], across: 28 });
const HOME = arrangement<Gr>({ title: { start: ["doc"], end: ["zoom"] }, top: { center: ["edit", "history", "view"] }, bottom: { start: ["panel"], end: ["share"] } });
const spec = (length: number): HostSpec => ({ length, thickness: 34, lead: 20, tail: 20 });

describe("a host's layout", () => {
  it("lays out start, centre and end apart, the centre centred on the host", () => {
    const zones = { start: ["doc"], center: ["view"], end: ["zoom"] } as const;
    const l = layoutHost<Gr>(zones, "top", spec(900), size);
    const r = (g: Gr) => l.slots.get(g)!;
    expect(r("doc").x).toBe(20);
    expect(r("zoom").x + r("zoom").width).toBe(880);
    expect(r("view").x + r("view").width / 2).toBe(450);
    expect(l.overflow).toEqual([]);
    expect(overlap(r("doc"), r("view")) + overlap(r("view"), r("zoom"))).toBe(0);
  });

  it("a centre that would hit a side zone centres between them instead", () => {
    const l = layoutHost<Gr>({ start: ["doc", "edit"], center: ["view"], end: [] }, "top", spec(560), size);
    const doc = l.slots.get("edit")!;
    expect(l.slots.get("view")!.x).toBeGreaterThan(doc.x + doc.width);
  });

  it("never wraps: groups collapse from the trailing end, and the ones collapsed by hand stay", () => {
    const zones = { start: ["doc", "edit"], center: [], end: ["view", "zoom"] } as const;
    const tight = layoutHost<Gr>(zones, "top", spec(400), size);
    expect(tight.overflow[0]).toBe("zoom");
    expect(tight.overflow).not.toContain("doc");
    expect(tight.need).toBeLessThanOrEqual(400);
    const roomy = layoutHost<Gr>(zones, "top", spec(1200), size, ["edit"]);
    expect([roomy.overflow, roomy.collapsed]).toEqual([[], ["edit"]]);
  });

  it("a group with a higher keep stays open longer; equal keeps still fold from the trailing end", () => {
    type K = "doc" | "edit" | "view" | "zoom" | "redact";
    const len: Record<K, number> = { doc: 160, edit: 90, view: 110, zoom: 100, redact: 120 };
    const sz: GroupSize<K> = (g, _v, collapsed) => ({ along: collapsed ? 30 : len[g], across: 28 });
    const zones = { start: ["doc", "edit"], center: [], end: ["view", "zoom", "redact"] } as const;
    const s: HostSpec<K> = { length: 590, thickness: 34, lead: 20, tail: 20 };
    // Trailing-first alone, Redact (last at the end) folds first and is enough.
    expect(layoutHost<K>(zones, "top", s, sz).overflow).toEqual(["redact"]);
    // With a keep of 1 it stays open; the others fold, zoom before view (trailing first among equals).
    const kept = layoutHost<K>(zones, "top", { ...s, keep: { redact: 1 } }, sz);
    expect(kept.overflow).toEqual(["zoom", "view"]);
    expect(kept.collapsed).not.toContain("redact");
    expect(kept.need).toBeLessThanOrEqual(590);
    // A lower keep folds before everything with the default.
    expect(layoutHost<K>(zones, "top", { ...s, keep: { doc: -1 } }, sz).overflow).toEqual(["doc"]);
  });

  it("a keep is read from the spec's own keys and only as a finite number", () => {
    const sz: GroupSize<string> = (_g, _v, collapsed) => ({ along: collapsed ? 30 : 100, across: 28 });
    // Three 100 px groups in 190 px: two have to fold.
    const s = (keep: Record<string, number>): HostSpec<string> => ({ length: 190, thickness: 34, lead: 0, tail: 0, keep });
    // Groups named like Object.prototype's members get keep 0, not a function (which would make the sort NaN).
    expect(layoutHost({ start: ["toString", "b", "c"], center: [], end: [] }, "top", s({ b: 1 }), sz).overflow).toEqual(["c", "toString"]);
    expect(layoutHost({ start: ["constructor", "b", "c"], center: [], end: [] }, "top", s({ b: 1 }), sz).overflow).toEqual(["c", "constructor"]);
    // A keep that isn't a finite number counts as 0.
    expect(layoutHost({ start: ["a", "b", "c"], center: [], end: [] }, "top", s({ b: Number.NaN, c: 1 }), sz).overflow).toEqual(["b", "a"]);
    expect(layoutHost({ start: ["a", "b", "c"], center: [], end: [] }, "top", s({ b: Number.POSITIVE_INFINITY, c: 1 }), sz).overflow).toEqual(["b", "a"]);
  });

  it("a side edge lays its groups out top to bottom, centred across it", () => {
    const l = layoutHost<Gr>({ start: ["edit", "history"], center: [], end: [] }, "left", spec(600), size);
    const e = l.slots.get("edit")!;
    const h = l.slots.get("history")!;
    expect(h.y).toBeCloseTo(e.y + e.height + GAP);
    expect(e.x).toBe((34 - 30) / 2);
  });

  it("the need counts an empty centre at its drop size, with its margins, when asked", () => {
    const zones = { start: ["doc"], center: [], end: ["zoom"] } as const;
    const plain = hostNeed<Gr>(zones, [], spec(900), size, false);
    const counted = hostNeed<Gr>(zones, [], { ...spec(900), center: { min: 80, margin: 12 } }, size, false);
    expect(counted - plain).toBe(80 + 24 - 16);
    // Room for the groups but not the empty centre's drop size: the trailing group collapses only when it counts.
    expect(layoutHost<Gr>(zones, "top", { ...spec(counted - 50), center: { min: 80, margin: 12 } }, size).overflow).toEqual(["zoom"]);
    expect(layoutHost<Gr>(zones, "top", spec(counted - 50), size).overflow).toEqual([]);
  });
});

describe("insertion points", () => {
  it("before all, between and after all in a zone; their spans cover the host", () => {
    const zones = { start: ["edit", "history"], center: [], end: ["zoom"] } as const;
    const l = layoutHost<Gr>(zones, "top", spec(900), size);
    const pts = insertions<Gr>(zones, "top", spec(900), l, (g) => g.toUpperCase());
    expect(pts.filter((p) => !p.empty).map((p) => p.label)).toEqual(["Top bar · left · before all", "Top bar · left · between EDIT and HISTORY", "Top bar · left · after all", "Top bar · right · before all", "Top bar · right · after all"]);
    const lines = pts.filter((p) => !p.empty);
    expect(lines[0]!.span[0]).toBe(0);
    expect(lines.at(-1)!.span[1]).toBe(900);
    for (let i = 1; i < lines.length; i++) expect(lines[i]!.span[0]).toBeCloseTo(lines[i - 1]!.span[1]);
  });

  it("an empty zone owns its own third", () => {
    const zones = { start: ["edit"], center: [], end: [] } as const;
    const pts = insertions<Gr>(zones, "top", spec(900), layoutHost<Gr>(zones, "top", spec(900), size));
    const centre = pts.find((p) => p.empty && p.zone === "center")!;
    const end = pts.find((p) => p.empty && p.zone === "end")!;
    expect(centre.span).toEqual([300, 600]);
    expect(end.span).toEqual([600, 900]);
    const onlyEnd = { start: [], center: [], end: ["zoom"] } as const;
    const start = insertions<Gr>(onlyEnd, "top", spec(900), layoutHost<Gr>(onlyEnd, "top", spec(900), size)).find((p) => p.empty && p.zone === "start")!;
    expect(start.span).toEqual([0, 300]);
  });
});

describe("arrangement changes", () => {
  it("inserts, lifts and moves groups", () => {
    const a = insertGroup(HOME, "share", "title", "start", 0);
    expect(a.title.start).toEqual(["share", "doc"]);
    expect(a.bottom.end).toEqual([]);
    expect(hostOf(withoutGroup(a, "share"), "share")).toBeNull();
    expect(moveToHost(HOME, "edit", "title").title.end).toEqual(["zoom", "edit"]);
    const bar = moveBar(HOME, "bottom", "left");
    expect([bar.left.start, bar.left.end, isEmptyHost(bar, "bottom")]).toEqual([["panel"], ["share"], true]);
    // Onto a host with groups: after the groups there, zone by zone.
    const onto = moveBar(HOME, "bottom", "title");
    expect([onto.title.start, onto.title.end]).toEqual([["doc", "panel"], ["zoom", "share"]]);
  });

  it("docks back where it floated from, not where the default has it", () => {
    const moved = moveToHost(HOME, "history", "right");
    expect(hostOf(dockGroup(floatGroup(moved, "history", 0, 0), "history", HOME), "history")).toEqual({ host: "right", zone: "start", index: 0 });
  });

  it("floats and docks back where it floated from; resets to home, expanded", () => {
    const f = floatGroup(HOME, "history", 40, 50);
    expect(f.floating).toEqual([{ id: "history", x: 40, y: 50, from: { host: "top", zone: "center", index: 1 } }]);
    expect(dockGroup(f, "history", HOME)).toEqual(HOME);
    const moved = toggleCollapsed(moveToHost(HOME, "history", "left"), "history");
    const back = resetGroup(moved, "history", HOME);
    expect([hostOf(back, "history"), back.collapsed]).toEqual([{ host: "top", zone: "center", index: 1 }, []]);
  });

  it("own place is home: before or after itself changes nothing", () => {
    expect(isOwnPlace(HOME, "history", { host: "top", zone: "center", index: 1 })).toBe(true);
    expect(isOwnPlace(HOME, "history", { host: "top", zone: "center", index: 0 })).toBe(false);
    expect(isOwnPlace(HOME, "history", { host: "top", zone: "end", index: 0 })).toBe(false);
  });

  it("stores as versioned data and reads back the same arrangement", () => {
    const a = toggleCollapsed(floatGroup(HOME, "history", 40, 50), "zoom");
    const data = storeArrangement(a);
    expect(data.v).toBe(1);
    const back = readArrangement<Gr>(JSON.parse(JSON.stringify(data)), ["doc", "edit", "history", "view", "zoom", "panel", "share"]);
    expect(back.ok && sameArrangement(back.arrangement, a)).toBe(true);
    expect(back.ok && back.arrangement.floating).toEqual([{ id: "history", x: 40, y: 50, from: { host: "top", zone: "center", index: 1 } }]);
  });

  it("the module itself serialises: no export takes JSON.stringify's toJSON hook", () => {
    expect(() => JSON.stringify(toolbarModule)).not.toThrow();
    expect("toJSON" in toolbarModule).toBe(false);
  });

  it("reading bad data gives an error, never a throw", () => {
    const good = storeArrangement(HOME) as unknown as Record<string, unknown>;
    const bad = (data: unknown, groups?: readonly string[]): string => {
      const r = readArrangement(data, groups);
      return r.ok ? "read" : r.error;
    };
    expect(bad(null)).toBe("not an object");
    expect(bad({ ...good, v: 2 })).toBe("unknown version 2 (this reads version 1)");
    expect(bad({ ...good, v: undefined })).toBe("unknown version undefined (this reads version 1)");
    expect(bad({ ...good, v: "1" })).toBe("unknown version 1 (this reads version 1)");
    // Values JSON can't write don't throw either: a BigInt, a circular object.
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(bad({ ...good, v: 1n })).toBe("unknown version bigint (this reads version 1)");
    expect(bad({ ...good, v: circular })).toBe("unknown version object (this reads version 1)");
    expect(bad({ ...good, hosts: { ...(good.hosts as object), left: undefined } })).toBe("host left is missing");
    expect(bad({ ...good, hosts: { ...(good.hosts as object), left: { start: [], center: [] } } })).toBe("left.end is not a list of group ids");
    expect(bad({ ...good, hosts: { ...(good.hosts as object), left: { start: ["doc"], center: [], end: [] } } })).toBe('group "doc" is in two places');
    expect(bad({ ...good, collapsed: "zoom" })).toBe("collapsed is not a list of group ids");
    expect(bad({ ...good, floating: [{ id: "x", x: "1", y: 2, from: null }] })).toBe("a floating group is not { id, x, y, from }");
    expect(bad({ ...good, floating: [{ id: "x", x: 1, y: 2, from: { host: "side", zone: "start", index: 0 } }] })).toBe('floating group "x" has a bad home');
    // A home's index is a whole number from 0.
    for (const index of [-1, 1.5]) expect(bad({ ...good, floating: [{ id: "x", x: 1, y: 2, from: { host: "top", zone: "start", index } }] })).toBe('floating group "x" has a bad home');
    expect(bad({ ...good, floating: [{ id: "x", x: 1, y: 2, from: { host: "top", zone: "start", index: 2 } }] })).toBe("read");
    expect(bad({ ...good, floating: [{ id: "edit", x: 1, y: 2, from: null }] })).toBe('group "edit" is in two places');
    expect(bad(good, ["doc"])).toBe('title.end has an unknown group "zoom"');
    expect(bad(good)).toBe("read");
  });

  it("an arrangement written with its zones in another order is the same arrangement", () => {
    // Zones listed end, centre, start: the same places, so the group's own place is still its own place.
    const written: Arrangement<Gr> = { ...HOME, top: { end: [], center: ["edit", "history", "view"], start: [] } };
    expect(sameArrangement(written, HOME)).toBe(true);
    expect(isOwnPlace(written, "history", { host: "top", zone: "center", index: 1 })).toBe(true);
    expect(sameArrangement({ ...HOME, collapsed: ["zoom", "edit"] }, { ...HOME, collapsed: ["edit", "zoom"] })).toBe(true);
    // A repeated group on one side is not the same as two different groups, whichever side has it.
    expect(sameArrangement({ ...HOME, collapsed: ["edit", "edit"] }, { ...HOME, collapsed: ["edit", "zoom"] })).toBe(false);
    expect(sameArrangement({ ...HOME, collapsed: ["edit", "zoom"] }, { ...HOME, collapsed: ["edit", "edit"] })).toBe(false);
    const two = floatGroup(floatGroup(HOME, "edit", 0, 0), "zoom", 0, 0);
    const twice = { ...two, floating: [two.floating[0]!, two.floating[0]!] };
    expect([sameArrangement(twice, two), sameArrangement(two, twice)]).toEqual([false, false]);
    expect(sameArrangement(HOME, { ...HOME, collapsed: ["edit"] })).toBe(false);
    const floated = floatGroup(HOME, "history", 10, 20);
    expect(sameArrangement(floated, floatGroup(HOME, "history", 10, 21))).toBe(false);
    expect(sameArrangement(floated, { ...floated, floating: [{ ...floated.floating[0]!, from: null }] })).toBe(false);
  });
});
