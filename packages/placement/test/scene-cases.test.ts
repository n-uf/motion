/**
 * The conformance rows (`@n-uf/placement/scene/cases`) run on the in-memory host: every row passes, the runner fails a
 * wrong expectation, DOM checks are skipped and listed without a root, a host with a root runs them, and the pure aiming
 * helpers work. The rows' source carries no host addresses.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { targetAt } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import { lift, refusalTargets, refusals, solve, targets, type SceneTarget } from "../src/scene";
import {
  CASES,
  CASE_GROUPS,
  caseById,
  createSceneHost,
  defaultItemSelector,
  g,
  pickTarget,
  resolvePlace,
  runCase,
  runCases,
  winScene,
  WINDOW_A,
  type CaseHost,
  type CaseRow,
  type DomRoot,
} from "../src/scene/cases";
import { modelScene } from "./model-scene";

const dir = join(fileURLToPath(new URL("..", import.meta.url)), "src", "scene", "cases");

describe("the rows", () => {
  it("have unique ids, titles, expectations and a listed group", () => {
    const ids = CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const groups = new Set(CASE_GROUPS.map((x) => x.id));
    for (const c of CASES) {
      expect(c.title.length, c.id).toBeGreaterThan(0);
      expect(c.expect.length, c.id).toBeGreaterThan(10);
      expect(groups.has(c.group), c.id).toBe(true);
    }
  });

  it("cover every lab case and every kit gesture", () => {
    const want = [..."123456789"].flatMap((n) => [`C${n}`]).concat(["C10", "C11", "C12", "C13", "C14", "C15", "C16", "C17", "C18", "C19", "C20", "C21", "C22", "C23", "C24", "C25", "C25b", "C26a", "C26b", "C27", "C28", "C29", "C23b", "C14b", "T1", "T2-T4", "T3", "T5", "T6", "N1", "N2", "G1", "G2"]);
    for (const id of want) expect(caseById(id), id).toBeDefined();
    const gestures = CASES.filter((c) => c.group === "gestures").map((c) => c.id.split("-")[0]);
    for (let n = 1; n <= 15; n++) expect(gestures, `P${n}`).toContain(`P${n}`);
  });

  it("pin something: every row has an expectation, and no row is a bare load", () => {
    for (const c of CASES) {
      const e = c.expectLayout;
      expect(Object.keys(e).length + (c.checkpoints?.length ?? 0) + (c.expectDom?.length ?? 0), c.id).toBeGreaterThan(0);
    }
  });

  it("all pass on the in-memory host (the DOM checks are skipped), except the rows that name a rule the library lacks", () => {
    const failures: string[] = [];
    let skipped = 0;
    for (const { id, result } of runCases(CASES, () => createSceneHost({ pick: targetAt }))) {
      const row = caseById(id)!;
      skipped += result.skipped.length;
      if (row.requires?.intent) {
        // The in-memory host picks at the point, with no drag intent: such a row is skipped there, and goes red on it.
        expect(result.ok, `${id} passes on a host without a drag intent: it doesn't need \`requires.intent\``).toBe(false);
        continue;
      }
      if (row.lacks) {
        // Expected red until the rule lands; when it does, this says to take `lacks` off the row.
        expect(result.ok, `${id} passes now: remove its \`lacks\` (${row.lacks})`).toBe(false);
        continue;
      }
      failures.push(...result.failures);
      expect(result.ok, `${id}: ${result.failures.join("; ")}`).toBe(true);
    }
    expect(failures).toEqual([]);
    expect(skipped).toBeGreaterThan(20);
  });

  it("give the same results on the default pick as on motion's targetAt", () => {
    expect(runCases(CASES, () => createSceneHost())).toEqual(runCases(CASES, () => createSceneHost({ pick: targetAt })));
    expect(createSceneHost({ pick: targetAt }).pick).toBe(targetAt);
    expect(createSceneHost().pick).toBe(pickTarget);
  });

  it("don't depend on where a press holds the item: every row gives its own grab when it matters", () => {
    for (const grab of [{ x: 2, y: 3 }, { x: 15, y: 6 }]) {
      for (const row of CASES.filter((c) => !c.lacks && !c.requires?.intent)) {
        const r = runCase(row, createSceneHost({ grab }));
        expect(r.ok, `${row.id} with a grab of ${grab.x},${grab.y}: ${r.failures.join("; ")}`).toBe(true);
      }
    }
  });

  it("read the page only after a hold, never right after a move", () => {
    for (const c of CASES) {
      const at = [...(c.checkpoints ?? []).map((x) => x.at), ...(c.expectDom ?? []).flatMap((d) => (d.at === undefined ? [] : [d.at]))];
      for (const i of at) expect(c.gestures[i]?.type, `${c.id}: a check after gesture ${i} (a move)`).not.toBe("move");
    }
  });

  it("go red on the bugs they target: a press that counts as a use, a no-target preview that reflows, a refused kind that docks", () => {
    // A host whose press is a use: the stored ages and the fresh solve after a reload change.
    const pressIsUse = (): CaseHost => {
      const h = createSceneHost();
      return { ...h, perform: (x) => { h.perform(x); if (x.type === "press" && x.item) h.perform({ type: "click", item: x.item, key: "use" }); } };
    };
    for (const id of ["C23b", "P12b-a-press-is-no-use-by-the-stored-ages"]) {
      expect(runCase(caseById(id)!, createSceneHost()).ok, id).toBe(true);
      expect(runCase(caseById(id)!, pressIsUse()).ok, `${id} must go red when a press is a use`).toBe(false);
    }
    // A host whose no-target preview solves the scene with the item lifted out (others reflow).
    const reflows = (): CaseHost => {
      const h = createSceneHost();
      return { ...h, layout: () => { const l = h.layout(); const d = h.drag(); return d?.lifted && d.target === null ? solve(lift(h.scene(), d.item), { previous: l }) : l; } };
    };
    expect(runCase(caseById("P13-a-group-never-gets-panel-targets")!, reflows()).ok).toBe(false);
    // A host that docks a panel into a groups-only bar: the refusal row sees the panel in the toolbar.
    const row = caseById("C25")!;
    const docks: CaseRow = { ...row, expectLayout: { items: { pages: { edge: "toolbar" } } } };
    expect(runCase(docks, createSceneHost()).ok).toBe(false);
  });

  it("carry no host addresses", () => {
    const FORBIDDEN = /localhost|127\.0\.0\.1/i;
    for (const name of readdirSync(dir)) expect(readFileSync(join(dir, name), "utf8").match(FORBIDDEN)?.[0] ?? null, name).toBeNull();
  });
});

describe("the runner", () => {
  const row = caseById("C1")!;

  it("fails a wrong layout, a wrong checkpoint, and a gesture the host can't do", () => {
    const wrong: CaseRow = { ...row, expectLayout: { items: { annotations: { rect: { x: 5 }, formKind: "rail", edge: "bar" } }, order: { column: ["pages"] } } };
    const r = runCase(wrong, createSceneHost());
    expect(r.ok).toBe(false);
    expect(r.failures.join("\n")).toMatch(/annotations x is 0, expected 5/);
    expect(r.failures.join("\n")).toMatch(/annotations is open, expected rail/);
    expect(r.failures.join("\n")).toMatch(/column holds \[annotations, pages\], expected \[pages\]/);
    const early: CaseRow = { ...row, checkpoints: [{ at: 1, layout: { items: { pages: { rect: { y: 0 } } } } }] };
    expect(runCase(early, createSceneHost()).failures.join()).toMatch(/after gesture 2/);
    const bad: CaseRow = { ...row, checkpoints: [], expectDom: [], gestures: [g.press("annotations"), g.to(g.gap("nowhere", 0))] };
    expect(runCase(bad, createSceneHost()).failures.join()).toMatch(/gesture 2 \(move .*failed: no point reaches the target/);
  });

  it("honours the tolerance", () => {
    const near: CaseRow = { ...row, gestures: [], checkpoints: [], expectDom: [], expectLayout: { items: { pages: { rect: { height: 246.9 } } }, tolerance: 0.5 } };
    expect(runCase(near, createSceneHost()).ok).toBe(true);
    expect(runCase({ ...near, expectLayout: { items: { pages: { rect: { height: 248 } } } } }, createSceneHost()).ok).toBe(false);
    expect(runCase({ ...near, expectLayout: { items: { pages: { rect: { height: 248 } } }, tolerance: 2 } }, createSceneHost()).ok).toBe(true);
  });

  it("rejects a check at a gesture the row doesn't have, and a host that can't give its layout", () => {
    const early: CaseRow = { ...row, checkpoints: [{ at: 9, layout: {} }] };
    const r = runCase(early, createSceneHost());
    expect(r.ok).toBe(false);
    expect(r.failures.join()).toMatch(/a checkpoint is at gesture 9, but the row has 4 gestures/);
    const dom: CaseRow = { ...row, expectDom: [{ at: -1, attr: { a: null } }] };
    expect(runCase(dom, createSceneHost()).ok).toBe(false);
    const stops: CaseRow = { ...row, expectStops: { item: "pages", at: 7, places: [] } };
    expect(runCase(stops, createSceneHost()).ok).toBe(false);
    const broken: CaseHost = { ...createSceneHost(), layout: () => { throw new Error("no layout yet"); } };
    expect(runCase({ ...row, gestures: [], checkpoints: [], expectDom: [] }, broken).failures.join()).toMatch(/couldn't give its layout: no layout yet/);
  });

  it("checks the stored form and the stops through the host, and skips them without", () => {
    const stored: CaseRow = { ...row, gestures: [], checkpoints: [], expectDom: [], expectLayout: {}, expectStored: { items: { pages: { used: 1, kept: null } }, absent: ["pinned"] } };
    expect(runCase(stored, createSceneHost()).ok).toBe(true);
    const r = runCase({ ...stored, expectStored: { items: { pages: { used: 9 } }, absent: ["used"] } }, createSceneHost());
    expect(r.failures.join("\n")).toMatch(/stored pages.used is 1, expected 9/);
    expect(r.failures.join("\n")).toMatch(/contains "used"/);
    const h = createSceneHost();
    const noStored: CaseHost = { load: (s, st) => h.load(s, st), perform: (x) => h.perform(x), layout: () => h.layout() };
    expect(runCase(stored, noStored).skipped).toEqual(["the stored form"]);
    const stops = caseById("P15-stops-for-the-keyboard")!;
    expect(runCase(stops, noStored).skipped).toEqual(["the stops of annotations"]);
    const wrong: CaseRow = { ...stops, expectStops: { item: "annotations", places: [{ kind: "float" }] } };
    expect(runCase(wrong, createSceneHost()).failures.join("\n")).toMatch(/annotations's stops are/);
  });

  it("reads a DOM rect relative to the root, within a tolerance", () => {
    const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });
    const el = (b: ReturnType<typeof box>): DomRoot => ({ getAttribute: () => null, querySelectorAll: () => [], getBoundingClientRect: () => b });
    const root = (b: ReturnType<typeof box>, kids: DomRoot[]): DomRoot => ({ getAttribute: () => null, querySelectorAll: () => kids, getBoundingClientRect: () => b });
    const scroll = caseById("C5")!;
    const mk = (y: number): CaseHost => {
      const h = createSceneHost();
      return { ...h, root: () => root(box(100, 50, 840, 500), [el(box(540, 180 + y, 220, 190))]) };
    };
    expect(runCase(scroll, mk(0)).ok).toBe(true);
    expect(runCase(scroll, mk(0.4)).ok).toBe(true);
    // The float moved 300 px with the pages: a host whose layout says nothing moved still fails.
    expect(runCase(scroll, mk(-300)).failures.join()).toMatch(/\[data-dock-item="findings"\] y is -170, expected 130/);
  });

  it("aims a check at an item with the host's itemSelector, `[data-dock-item]` by default", () => {
    const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });
    const asked: string[] = [];
    // A root whose one element answers only the selector `answers`; every selector asked is recorded.
    const rootFor = (answers: string): DomRoot => ({
      getAttribute: () => null,
      getBoundingClientRect: () => box(100, 50, 840, 500),
      querySelectorAll: (sel) => {
        asked.push(sel);
        return sel === answers ? [{ getAttribute: () => null, querySelectorAll: () => [], getBoundingClientRect: () => box(540, 180, 220, 190) }] : [];
      },
    });
    const scroll = caseById("C5")!;
    // A kit that marks items another way names its selector, and the row passes through it.
    const custom: CaseHost = { ...createSceneHost(), root: () => rootFor('.card[data-id="findings"]'), itemSelector: (id) => `.card[data-id="${id}"]` };
    expect(runCase(scroll, custom).ok).toBe(true);
    expect(asked).toEqual(['.card[data-id="findings"]']);
    // The same root under the default selector finds nothing, and the failure names the selector it tried.
    asked.length = 0;
    const plain: CaseHost = { ...createSceneHost(), root: () => rootFor('.card[data-id="findings"]') };
    expect(runCase(scroll, plain).failures.join("\n")).toMatch(/0 elements match \[data-dock-item="findings"\], expected 1/);
    expect(asked).toEqual(['[data-dock-item="findings"]']);
    expect(defaultItemSelector("a\"b")).toBe('[data-dock-item="a\\"b"]');
    // P10's float check goes through it too, and a check with both `item` and `select` is a bad row.
    const p10 = caseById("P10-float-keeps-its-place-and-last-size")!;
    expect(p10.expectDom?.[0]?.item).toBe("annotations");
    const both: CaseRow = { ...scroll, expectDom: [{ item: "findings", select: ".x", count: 1 }] };
    expect(runCase(both, createSceneHost()).failures.join()).toMatch(/has both item and select/);
  });

  it("skips DOM checks without a root, and runs them with one", () => {
    const dom = caseById("C1")!;
    const bare = runCase(dom, createSceneHost());
    expect(bare.skipped.length).toBe(dom.expectDom!.length);
    // A host with a root that answers the session's marks.
    const mk = (attrs: Record<string, string>, kids: Record<string, DomRoot[]> = {}): DomRoot => ({
      getAttribute: (n) => attrs[n] ?? null,
      querySelectorAll: (sel) => kids[sel] ?? [],
    });
    const inner = createSceneHost();
    let dragging = false;
    const host: CaseHost = {
      load: (s, st) => inner.load(s, st),
      perform: (x) => {
        inner.perform(x);
        dragging = inner.drag()?.lifted === true;
      },
      layout: () => inner.layout(),
      root: () => (dragging ? mk({ "data-drag-session": "panel" }, { "[data-drag-slot][data-drag-target]": [mk({ "data-drag-target": "gap:column:start:0" })], "[data-drag-marker]": [mk({})], "[data-drag-held]": [mk({})] }) : mk({}, {})),
    };
    const r = runCase(dom, host);
    expect(r.skipped).toEqual([]);
    expect(r.failures).toEqual([]);
    // The same root fails when the slot names another target.
    const wrongHost: CaseHost = { ...host, root: () => mk({ "data-drag-session": "panel" }, { "[data-drag-slot][data-drag-target]": [mk({ "data-drag-target": "gap:column:start:1" })], "[data-drag-marker]": [mk({})], "[data-drag-held]": [mk({})] }) };
    expect(runCase(dom, wrongHost).failures.join()).toMatch(/data-drag-target="gap:column:start:1", expected "gap:column:start:0"/);
  });
});

describe("the in-memory host", () => {
  const start = winScene(WINDOW_A, { size: 300 });

  it("aims at a place through targets, and a drop commits the shown after", () => {
    const h = createSceneHost();
    h.load(start);
    h.perform(g.press("annotations"));
    expect(h.drag()).toMatchObject({ item: "annotations", lifted: false });
    h.perform(g.to(g.gap("right-0", 1)));
    expect(h.drag()).toMatchObject({ lifted: true, target: "gap:right-0:start:1" });
    const shown = h.layout();
    h.perform(g.release());
    expect(h.drag()).toBeNull();
    expect(h.layout()).toEqual(shown);
    expect(h.layout()).toEqual(solve(h.scene(), { previous: solve(start) }));
  });

  it("lifts only past the threshold, and a press and release commits nothing", () => {
    const h = createSceneHost();
    h.load(start);
    h.perform(g.press("pages"));
    h.perform(g.at(22, 9));
    expect(h.drag()?.lifted).toBe(false);
    h.perform(g.at(80, 90));
    expect(h.drag()?.lifted).toBe(true);
    h.perform(g.escape());
    expect(h.scene()).toBe(start);
  });

  it("stores and reads back on Reload, and freezes until Alt", () => {
    const h = createSceneHost();
    h.load(start, { frozen: true });
    h.perform(g.press("pages"));
    h.perform(g.to(g.float));
    expect(h.drag()).toBeNull();
    h.perform(g.key("Alt"));
    h.perform(g.press("pages"));
    h.perform(g.to(g.float));
    h.perform(g.release());
    const before = h.layout();
    h.perform(g.key("Reload"));
    expect(h.layout().items.pages!.rect).toEqual(before.items.pages!.rect);
    expect(JSON.stringify(h.stored())).not.toMatch(/pinned/);
  });

  it("refuses what it can't do", () => {
    const h = createSceneHost();
    h.load(start);
    expect(() => h.perform(g.press("nobody"))).toThrow(/no item/);
    expect(() => h.perform({ type: "click", item: "pages", key: "levitate" })).toThrow(/no control/);
    expect(() => h.perform(g.moveTo("pages", g.gap("nowhere", 0)))).toThrow(/not one of/);
    expect(() => h.perform({ type: "resize" })).toThrow(/needs/);
  });
});

describe("the pick rule and resolvePlace", () => {
  const s = winScene(WINDOW_A, { size: 300 });
  const list = targets(s, "annotations", { endReach: 24 });

  it("motion's targetAt picks the most precise target: the lowest priority number, then the smallest zone", () => {
    expect(targetAt(list, { x: 160, y: 600 })?.id).toBe("home:annotations");
    expect(targetAt(list, { x: 900, y: 10 })?.id).toBe("gap:right-0:start:0");
    expect(targetAt(list, { x: 560, y: 400 })?.id).toBe("float:annotations");
    expect(targetAt(list, { x: 1e12, y: 1e12 })).toBeNull();
  });

  it("the default (pickTarget) is the same rule as motion's targetAt, edges and tolerances included", () => {
    // One fixture for both: every target of generated windows, at grid points, on every hit's edges and corners, a
    // hair inside and outside them; plus pieces (`hits`), negative sizes and equal zones (the first wins).
    const lists = [list, ...[1, 2, 3, 4, 5, 6].flatMap((seed) => [false, true].map((flush) => {
      const m = modelScene(seed, flush);
      const id = Object.keys(m.items).find((k) => !m.items[k]!.fixed && !m.items[k]!.closed)!;
      // The refusals in the pick too: a refusal ranks after every target of priority 1 and 2.
      return [...targets(m, id), ...refusalTargets(refusals(m, id))] as unknown as SceneTarget[];
    }))];
    const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
    lists.push([
      { id: "a", priority: 2, hit: r(0, 0, 10, 10), hits: [r(0, 0, 10, 10), r(20, 0, 5, -5)] },
      { id: "b", priority: 2, hit: r(0, 0, 10, 10) },
      { id: "c", priority: 2, hit: r(0, 0, 10, 10) },
      { id: "d", priority: 1, hit: r(10, 10, -4, 4) },
      { id: "e", priority: 3, hit: r(0, 0, 1 / 3, 2 / 3) },
    ] as unknown as SceneTarget[]);
    // A refusal sharing an edge with a larger gap, one given priority 1, and the float under both.
    lists.push([
      { id: "gap", priority: 2, hit: r(808, 400, 280, 400) },
      { id: "rim", priority: 2, hit: r(0, 800, 1120, 8), refuse: true },
      { id: "odd", priority: 1, hit: r(800, 390, 20, 20), refuse: true },
      { id: "float", priority: 3, hit: r(-1e9, -1e9, 2e9, 2e9), free: true },
    ] as unknown as SceneTarget[]);
    let n = 0;
    for (const ts of lists) {
      const points: { x: number; y: number }[] = [];
      for (let x = -10; x <= 1300; x += 37) for (let y = -10; y <= 900; y += 41) points.push({ x, y });
      for (const t of ts) {
        for (const h of t.hits ?? [t.hit]) {
          if (h.width > 1e6) continue;
          for (const dx of [-1e-7, 0, 1e-7]) for (const dy of [-1e-7, 0, 1e-7]) {
            for (const fx of [0, 0.5, 1]) for (const fy of [0, 0.5, 1]) points.push({ x: h.x + h.width * fx + dx, y: h.y + h.height * fy + dy });
          }
        }
      }
      for (const p of points) {
        expect(pickTarget(ts, p)?.id ?? null, `${p.x},${p.y}`).toBe(targetAt(ts, p)?.id ?? null);
        n++;
      }
    }
    expect(n).toBeGreaterThan(10_000);
  });

  it("finds a point that reaches the target under the pick rule, and null when none does", () => {
    const area = { stage: s.stage, content: solve(s).content };
    for (const place of [g.gap("right-0", 0), g.column("left", 1), g.rail("right"), g.float, g.home]) {
      const p = resolvePlace(list, place, "annotations", area, targetAt);
      expect(p, JSON.stringify(place)).not.toBeNull();
      expect(targetAt(list, p!)?.place.kind).toBe(place.kind);
      expect(resolvePlace(list, place, "annotations", area)).toEqual(p);
    }
    expect(resolvePlace(list, g.gap("nowhere", 0), "annotations", area, targetAt)).toBeNull();
  });

  it("aims outside the dragged item's own rect whenever a point there reaches the target, as a person does", () => {
    const after = () => ({ scene: s, layout: solve(s) });
    const gap: SceneTarget = { id: "gap:e:start:0", priority: 1, hit: { x: 100, y: 0, width: 200, height: 40 }, item: "x", place: { kind: "gap", edge: "e", zone: "start", at: 0 }, after };
    const area = { stage: { x: 0, y: 0, width: 600, height: 400 } };
    // The held float covers the gap's middle (its center would be the first aim) from x 168 on.
    const own = { x: 168, y: 0, width: 300, height: 300 };
    const p = resolvePlace([gap], g.gap("e", 0), "x", { ...area, own }, targetAt)!;
    expect(p.x).toBeLessThan(168);
    expect(p.x).toBeGreaterThanOrEqual(100);
    // The default own rect: the list's home target.
    const home: SceneTarget = { id: "home:x", priority: 1, hit: own, item: "x", place: { kind: "home" }, after };
    expect(resolvePlace([gap, home], g.gap("e", 0), "x", area, targetAt)!.x).toBeLessThan(168);
    // Where every point of the hit lies inside it, the aim is still found.
    expect(resolvePlace([gap], g.gap("e", 0), "x", { ...area, own: { x: 0, y: 0, width: 600, height: 400 } }, targetAt)).not.toBeNull();
  });
});
