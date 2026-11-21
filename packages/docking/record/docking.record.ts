/**
 * The docking recorder (docs/old-vs-new.md): the public outputs of `@n-uf/docking` over a fixed corpus, written as
 * canonical JSON to `OVN_OUT`. Run through `pnpm old-vs-new <base>`, or alone:
 * `OVN_OUT=/tmp/docking.json pnpm --filter @n-uf/docking exec vitest run --config record/vitest.config.ts`.
 *
 * The corpus, all from the checkout's own fixture helpers (so an old commit is recorded with its own inputs):
 * - the windows of the one-layout sweep (`test/one-layout-windows.ts`), the rail-entry windows, the window fixture at
 *   three sizes and a seeded set of random windows;
 * - the conformance rows (`@n-uf/docking/testing`'s `CASES`), played on the reference host.
 *
 * Per window: `solve`, `targets` (and each target's `drops`), `refusals`, `stops`, `lanes`, the edges' `dividers`, and
 * what `resizeBetween` / `resetBetween` write. Per drag of a window's dragged item, along the paths of the sweep (each
 * lane spot's stretch, at a fast and a slow hand): the landing model's `frames`, and for sampled frames `after(held)`
 * and `guides(frame)`. The drags are capped (`DRAG_WINDOWS` windows spread over the corpus, `WINDOW_SAMPLES` paths each,
 * `PER_PATH` frames a path) so a run stays near two minutes.
 *
 * Old commits: every call goes through `attempt` and every module through `load`, so a helper or export the old code
 * lacks records `{ absent }` and a call that throws records `{ threw }`; nothing stops the run.
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { askedName, load, need, outFile, recorder, seeded, tick } from "../../../record/canon";

const pkg = fileURLToPath(new URL("..", import.meta.url));
const src = (f: string): string => join(pkg, "src", f);
const tst = (f: string): string => join(pkg, "test", f);

/** Sampled frames per drag path, and the most frames recorded in one run. */
const PER_PATH = 6;
const DRAG_WINDOWS = 48;
const WINDOW_SAMPLES = 4;

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- the code under record has whatever API its commit has

interface Win {
  readonly name: string;
  readonly state: Any;
  readonly dragged?: string;
  readonly options?: Any;
  readonly previous?: Any;
  /** Conformance rows and random windows record the verbs but play no drag frames. */
  readonly play: boolean;
}

/** What the commit under record calls an item's asked lengths (`lengths`, or `length` before the rename), found by a probe. */
let ASK: "lengths" | "length" = "lengths";
const asked = (n: number): Any => ({ [ASK]: { column: n } });
const lengthsOf = (it: Any): Any => it?.[ASK];

/** `layout` without each edge's `stack` (the fit's inner state): items, edges, rails, content, notes. */
const slim = (layout: Any): Any => (layout ? { ...layout, edges: Object.fromEntries(Object.entries(layout.edges ?? {}).map(([k, { stack: _s, ...e }]: Any) => [k, e])) } : layout);
/** What a release commits, in short: the order along each edge, the floats and the asked lengths. */
const digest = (s: Any): Any => ({ edges: Object.fromEntries((s?.edges ?? []).map((e: Any) => [e.id, e.items])), floats: s?.floats, lengths: Object.fromEntries(Object.entries(s?.items ?? {}).filter(([, it]: Any) => lengthsOf(it)).map(([k, it]: Any) => [k, lengthsOf(it)])) });
const result = (r: Any): Any => (r ? { state: digest(r.state), layout: slim(r.layout) } : r);
const mid = (r: Any): Any => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
/** At most `n` of `list`, spread evenly over it. */
const spread = <T>(list: readonly T[], n: number): T[] => (list.length <= n ? [...list] : Array.from({ length: n }, (_, i) => list[Math.round((i * (list.length - 1)) / (n - 1))]!));

describe("record docking", () => {
  it("writes the outputs", async () => {
    const out = recorder("docking");
    const lib: Any = await load(src("index.ts"));
    const testing: Any = await load(src("testing/index.ts"));
    const sweep: Any = await load(tst("one-layout-windows.ts"));
    const rails: Any = await load(tst("rail-entry-windows.ts"));
    const fixture: Any = await load(tst("fixture.ts"));
    const landing: Any = await load(tst("landing-model.ts"));
    const api = (name: string): Any => need(lib?.[name], `@n-uf/docking ${name}`);
    try {
      const { column, panel, byId } = fixture;
      ASK = askedName((name) => {
        const a = { ...panel("a", 1), ...(name === "none" ? {} : { [name]: { column: 500 } }) };
        return api("solve")({ stage: { x: 0, y: 0, width: 1200, height: 900 }, edges: [column("left", "left", 0, ["a", "b"])], items: byId([a, panel("b", 2)]), floats: [], floatKinds: [] });
      });
    } catch {
      // No fixture helpers or no solve: nothing below can run either, and says so.
    }

    // --- the corpus -----------------------------------------------------------------------------------------------
    const wins: Win[] = [];
    out.attempt("corpus", "sweep windows", () => {
      for (const w of need(sweep?.sweepWindows, "test/one-layout-windows sweepWindows")()) wins.push({ name: w.name, state: w.state, dragged: w.dragged, options: w.options, previous: w.previous, play: true });
      return { windows: wins.length };
    });
    out.attempt("corpus", "rail-entry windows", () => {
      const before = wins.length;
      for (const width of [21, 40]) wins.push({ name: `rail-entry library ${width}`, state: need(rails?.libraryState, "libraryState")(width), dragged: "tools", options: { emptyLanes: "real" }, play: true });
      for (const width of [21, 24, 30]) wins.push({ name: `rail-entry real ${width}`, state: need(rails?.realWith, "realWith")(width), dragged: "tools", options: { emptyLanes: "real" }, play: true });
      return { windows: wins.length - before };
    });
    out.attempt("corpus", "window fixture", () => {
      const before = wins.length;
      const solve = api("solve");
      for (const [w, h] of [[1200, 800], [900, 640], [640, 480]] as const) {
        const s = need(fixture?.windowState, "test/fixture windowState")(w, h);
        for (const dragged of ["tools", "views", "pages", "findings"]) wins.push({ name: `window ${w}x${h}, ${dragged}`, state: s, dragged, options: { endReach: 24 }, previous: solve(s), play: w === 1200 });
      }
      // The same window with asked lengths on its right column's panels: a divider has two items to trade between.
      const s = need(fixture?.windowState, "windowState")(1200, 800);
      const withAsks = { ...s, items: { ...s.items, findings: { ...s.items.findings, ...asked(300) }, marks: { ...s.items.marks, ...asked(120) } } };
      wins.push({ name: "window, asked lengths", state: withAsks, dragged: "tools", options: { endReach: 24 }, previous: solve(withAsks), play: false });
      return { windows: wins.length - before };
    });
    out.attempt("corpus", "random windows", () => {
      const before = wins.length;
      const { bar, byId, column, group, panel } = fixture ?? {};
      need(bar, "bar");
      const rnd = seeded(2026);
      const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
      for (let seed = 0; seed < 40; seed++) {
        let n = 0;
        const items: Any[] = [];
        const edges: Any[] = [];
        const g = (): string => (items.push(group(`g${n}`, Math.floor(rnd() * 50), rnd() < 0.2 ? { kept: true } : {})), `g${n++}`);
        const p = (): string => (items.push(panel(`p${n}`, Math.floor(rnd() * 50), { ...(rnd() < 0.2 ? { from: 1 } : {}), ...(rnd() < 0.5 ? asked(80 + Math.floor(rnd() * 300)) : {}) }, 200 + Math.floor(rnd() * 100))), `p${n++}`);
        const many = (f: () => string, max: number): string[] => Array.from({ length: Math.floor(rnd() * (max + 1)) }, f);
        for (let i = 0; i < Math.floor(rnd() * 3); i++) edges.push(bar(`top${i}`, "top", i, many(g, 4), { span: pick(["full", "between"]) }));
        if (rnd() < 0.7) edges.push(bar("bottom", "bottom", 0, many(g, 3)));
        for (const side of ["left", "right"] as const) for (let ring = 0; ring < Math.floor(rnd() * 3); ring++) edges.push(column(`${side}${ring}`, side, ring, [...many(p, 4), ...many(g, 1)]));
        const state = { stage: { x: 0, y: 0, width: 700 + Math.floor(rnd() * 800), height: 420 + Math.floor(rnd() * 500) }, edges, items: byId(items), floats: [], floatKinds: ["panel", "group"] };
        const dragged = items.length ? pick(items).id : undefined;
        // (A window with asked lengths says so in its name, so a change expected only there can be named.)
        wins.push({ name: `random ${seed}${items.some((it) => lengthsOf(it)) ? " +asks" : ""}`, state, ...(dragged ? { dragged } : {}), options: { endReach: 24 }, play: false });
      }
      return { windows: wins.length - before };
    });

    // --- per window: the verbs ------------------------------------------------------------------------------------
    tick(`corpus: ${wins.length} windows`);
    for (const w of wins) {
      const { name, state, dragged, options, previous } = w;
      tick(`verbs: ${name}`);
      out.attempt("solve", name, () => api("solve")(state, previous ? { previous } : {}));
      out.attempt("dividers", name, () =>
        api("dividers")(state).map((d: Any) => ({ id: `${d.edge}: ${d.before} | ${d.after}`, rect: d.rect, range: d.range })),
      );
      out.attempt("resize", name, () => {
        const solve = api("solve");
        const rows: Any[] = [];
        for (const d of api("dividers")(state).slice(0, 3))
          for (const delta of [-30, 30, 1e4]) {
            const next = api("resizeBetween")(state, d.before, d.after, delta);
            const l = solve(next);
            rows.push({ id: `${d.edge}: ${d.before} | ${d.after} by ${delta}`, same: next === state, lengths: digest(next).lengths, sizes: Object.fromEntries([d.before, d.after].map((i) => [i, l.items[i]?.rect])) });
          }
        for (const d of api("dividers")(state).slice(0, 3)) {
          const next = api("resetBetween")(state, d.before, d.after);
          rows.push({ id: `${d.edge}: ${d.before} | ${d.after} reset`, same: next === state, lengths: digest(next).lengths });
        }
        return rows;
      });
      if (!dragged || !state.items?.[dragged]) continue;
      const dropOptions = { ...(previous ? { previous } : {}), ...(options?.endReach !== undefined ? { endReach: options.endReach } : {}) };
      out.attempt("targets", name, () => api("targets")(state, dragged, dropOptions));
      out.attempt("drops", name, () => {
        const grab = { x: 8, y: 8 };
        return api("targets")(state, dragged, dropOptions)
          .slice(0, 60)
          .map((t: Any) => ({ id: t.id, ...result(t.after(mid(t.hit), grab)) }));
      });
      out.attempt("refusals", name, () => api("refusals")(state, dragged, dropOptions));
      out.attempt("stops", name, () => api("stops")(state, dragged, dropOptions).map((t: Any) => ({ id: t.id, place: t.place, ...result(t.after(mid(t.hit), { x: 8, y: 8 })) })));
      out.attempt("lanes", name, () => api("lanes")(state, dragged, { ...(options ?? {}), ...(previous ? { previous } : {}) }));
    }

    // --- the conformance rows -------------------------------------------------------------------------------------
    tick("conformance rows");
    out.attempt("corpus", "conformance rows", () => ({ rows: need(testing?.CASES, "testing CASES").length }));
    for (const row of testing?.CASES ?? []) {
      const play = (): Any => {
        const host = need(testing.createReferenceHost, "createReferenceHost")();
        host.load(row.state, row.settings);
        for (const g of row.gestures) host.perform(g);
        return host;
      };
      out.attempt("case-layout", row.id, () => slim(play().layout()));
      out.attempt("case-solve", row.id, () => slim(api("solve")(row.state)));
    }

    // --- the drags ------------------------------------------------------------------------------------------------
    let frames = 0;
    for (const w of spread(wins.filter((x) => x.play && x.dragged), DRAG_WINDOWS)) {
      if (!w.dragged) continue;
      const { name, state, dragged } = w;
      tick(`drag: ${name} (${frames} frames so far)`);
      out.attempt("drag", name, () => {
        const solve = api("solve");
        const previous = w.previous ?? solve(state);
        const own = previous.items[dragged];
        if (!own || own.inMenu || own.floating || own.rect.width <= 0 || own.rect.height <= 0) return { skipped: "no docked item to lift" };
        const given = w.options?.grab;
        const grab = given && given.x < own.rect.width && given.y < own.rect.height ? given : { x: own.rect.width / 2, y: own.rect.height / 2 };
        const drag = api("dockDrag")(state, dragged, { ...(w.options ?? {}), previous, grab });
        const model = need(landing?.modelOver, "test/landing-model modelOver");
        const regions = drag.regions;
        const home = regions.lanes.flatMap((l: Any) => l.spots.filter((x: Any) => x.home).map((x: Any) => ({ lane: l.id, spot: x.id })))[0];
        const press = { x: own.rect.x + grab.x, y: own.rect.y + grab.y };
        out.add("after-rest", name, result(drag.after(null)));
        const paths: { id: string; legs: [Any, number][] }[] = [];
        for (const l of regions.lanes) {
          const across = l.axis === "x" ? l.rect.y + l.rect.height / 2 : l.rect.x + l.rect.width / 2;
          const at = (a: number): Any => (l.axis === "x" ? { x: a, y: across } : { x: across, y: a });
          for (const sp of l.spots) {
            if (sp.home && !sp.slide) continue;
            const m = at((sp.along[0] + sp.along[1]) / 2);
            const legs: [Any, number][] = [[m, 0.6], [m, 0.1]];
            if (sp.slide && sp.along[1] - sp.along[0] > 8) legs.push([at(sp.along[0] + 2), 0.15], [at(sp.along[1] - 2), 0.15]);
            paths.push({ id: `${l.id} ${sp.id}`, legs });
          }
        }
        let recorded = 0;
        for (const path of spread(paths, WINDOW_SAMPLES))
          for (const mode of ["near", "all"] as const) {
            const host = model(drag, { ...(home ? { home } : {}), placeGuides: mode });
            const played: { p: Any; f: Any; r: Any }[] = [];
            let t = 0;
            let at = press;
            const push = (p: Any): void => {
              const f = host.update(p, (t += 8));
              played.push({ p, f, r: host.release(p, t) });
            };
            push(at);
            for (const [b, speed] of path.legs) {
              const a = at;
              const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / speed / 8));
              for (let k = 1; k <= n; k++) push((at = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }));
            }
            for (let r = 8; r <= 200; r += 8) push(at);
            const chosen = new Set([0, played.length - 1, ...spread(played.map((_, i) => i), PER_PATH)]);
            for (const i of [...chosen].sort((a, b) => a - b)) {
              const { p, f, r } = played[i]!;
              const id = `${name} | ${path.id} | ${mode} | #${i}/${played.length}`;
              const { guides: _drawn, named, ...shown } = f;
              out.add("landing-frames", id, { point: p, frame: { ...shown, guides: named }, release: r });
              out.attempt("guides", id, () => drag.guides(f).map((g: Any) => ({ id: g.id, lane: g.lane, kind: g.kind, rect: g.rect })));
              out.attempt("after", id, () => result(drag.after(f.state)));
              out.attempt("release-after", id, () => (r && !(r.kind === "spot" && r.home) ? result(drag.after(r)) : null));
              recorded++;
              frames++;
            }
          }
        return { paths: paths.length, frames: recorded };
      });
    }
    const written = out.write(outFile("docking"));
    console.log(`docking: ${written} outputs, ${frames} frames`);
  });
});
