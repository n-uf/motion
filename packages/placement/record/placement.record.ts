/**
 * The placement recorder (docs/old-vs-new.md): the public outputs of `@n-uf/placement` over a fixed corpus, written as
 * canonical JSON to `OVN_OUT`. Run through `pnpm old-vs-new <base>`, or alone:
 * `OVN_OUT=/tmp/placement.json pnpm --filter @n-uf/placement exec vitest run --config record/vitest.config.ts`.
 *
 * The corpus: the stack tests' fixtures (`test/stack-fixture.ts`: panels, groups, bar groups) at a sweep of lengths on
 * both axes, a seeded set of random mixes (alone and refitted from their `previous`), stacks with asked lengths, and
 * for tiling a seeded set of split trees and pane lists. Per case: `fitStack`, the dividers and what `resizeBetween` /
 * `resetBetween` write, `stackGaps`, `cutEdges`, `fitFloat`, and for tiling `layoutSplit`, the split edits, the pane
 * regions, `paneTargets`, `orderTargets` and the order layouts.
 *
 * Old commits: every call goes through `attempt` and every module through `load`, so a helper or export the old code
 * lacks records `{ absent }` and a call that throws records `{ threw }`; nothing stops the run.
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { askedName, load, need, outFile, recorder, seeded } from "../../../record/canon";

const pkg = fileURLToPath(new URL("..", import.meta.url));
const src = (f: string): string => join(pkg, "src", f);
const tst = (f: string): string => join(pkg, "test", f);

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- the code under record has whatever API its commit has

/** What the commit under record calls an item's asked lengths (`lengths`, or `length` before the rename), found by a probe. */
let ASK: "lengths" | "length" = "lengths";
const asked = (n: number | undefined, axis: "column" | "row" = "column"): Any => (n === undefined ? {} : { [ASK]: { [axis]: n } });
const lengthsOf = (it: Any): Any => it?.[ASK];
const mainOf = (fit: Any, id: string): number | undefined => {
  const p = fit.items.find((i: Any) => i.id === id);
  return p ? (fit.axis === "column" ? p.rect.height : p.rect.width) : undefined;
};

describe("record placement", () => {
  it("writes the outputs", async () => {
    const out = recorder("placement");
    const stackLib: Any = await load(src("stack/index.ts"));
    const tiling: Any = await load(src("tiling/index.ts"));
    const fx: Any = await load(tst("stack-fixture.ts"));
    const stack = (name: string): Any => need(stackLib?.[name], `@n-uf/placement/stack ${name}`);
    const tile = (name: string): Any => need(tiling?.[name], `@n-uf/placement/tiling ${name}`);
    const fixture = (name: string): Any => need(fx?.[name], `test/stack-fixture ${name}`);
    const rnd = seeded(2026);
    try {
      ASK = askedName((name) => stack("fitStack")(fixture("stack")([{ ...fixture("panel")("a", 1, 300), ...(name === "none" ? {} : { [name]: { column: 500 } }) }, fixture("panel")("b", 2, 300)], 900)));
    } catch {
      // No fixture helpers or no stack: nothing below can run either, and says so.
    }

    // --- stacks ---------------------------------------------------------------------------------------------------
    interface Case {
      readonly id: string;
      readonly input: Any;
    }
    const cases: Case[] = [];
    out.attempt("corpus", "stacks", () => {
      const { panel, group, barGroup, mix, stack: make } = { panel: fixture("panel"), group: fixture("group"), barGroup: fixture("barGroup"), mix: fixture("mix"), stack: fixture("stack") };
      const lengths = [40, 90, 140, 200, 260, 330, 420, 520, 640, 800, 1000, 1400];
      const sets: [string, Any[], "column" | "row"][] = [
        ["panels a b c", [panel("a", 1, 300), panel("b", 2, 300), panel("c", 3, 300)], "column"],
        ["panels natural", [panel("a", 1), panel("b", 2, 120), panel("c", 3, 220, true)], "column"],
        ["panel and groups", [panel("a", 1), group("g1", 2), group("g2", 3), panel("b", 4, 200)], "column"],
        ["groups", [group("g1", 1), group("g2", 2), group("g3", 3), group("g4", 4)], "column"],
        ["bar groups", [barGroup("g1", 1), barGroup("g2", 2), barGroup("g3", 3), barGroup("g4", 4, true)], "row"],
        ["bar panels", [panel("a", 1), panel("b", 2)], "row"],
      ];
      for (const [name, items, axis] of sets) for (const length of lengths) cases.push({ id: `${name} @ ${length}`, input: make(items, length, axis) });
      // Asked lengths: a spread of weights over three panels, with room and without.
      const weights = [[400, 150, 150], [100, 100, 100], [50, 200, 0], [900, 20, 20]];
      for (const w of weights) for (const length of [300, 600, 900, 1500]) cases.push({ id: `asked ${w.join("/")} @ ${length}`, input: make([panel("a", 1, 300, false), panel("b", 2, 300), panel("c", 3, 300)].map((p, i) => ({ ...p, ...asked(w[i]) })), length) });
      // Seeded random mixes: 3 to 9 items, any use age, some kept, some folded by hand; both axes.
      for (let k = 0; k < 80; k++) {
        const items = mix(rnd, 3 + Math.floor(rnd() * 7)).map((it: Any) => (it.id.startsWith("p") && rnd() < 0.4 ? { ...it, ...asked(60 + Math.floor(rnd() * 400)) } : it));
        // (A case with asked lengths says so in its id, so a change expected only there can be named.)
        cases.push({ id: `random ${k}${items.some((it: Any) => lengthsOf(it)) ? " +asks" : ""}`, input: make(items, 100 + Math.floor(rnd() * 1100), rnd() < 0.7 ? "column" : "row") });
      }
      return { stacks: cases.length };
    });

    for (const { id, input } of cases) {
      out.attempt("fit", id, () => stack("fitStack")(input));
      // The same stack refitted at a shorter and a longer length from its previous fit (the history that decides give-way).
      out.attempt("fit-previous", id, () => {
        const fit = stack("fitStack");
        let prev = fit(input);
        return [0.6, 0.35, 0.8, 1.3].map((k) => {
          prev = fit({ ...input, length: Math.round(input.length * k) }, { previous: prev });
          return { length: Math.round(input.length * k), items: prev.items.map((i: Any) => [i.id, i.form, i.rect]), notes: prev.notes };
        });
      });
      out.attempt("dividers", id, () => {
        const fit = stack("fitStack")(input);
        return stack("dividers")(input, fit).map((d: Any) => ({ id: `${d.before} | ${d.after}`, rect: d.rect, range: d.range }));
      });
      out.attempt("resize", id, () => {
        const fit = stack("fitStack")(input);
        const rows: Any[] = [];
        for (const d of stack("dividers")(input, fit).slice(0, 3)) {
          for (const delta of [-40, 25, 1e4, -1e4]) {
            const next = stack("resizeBetween")(input, d.before, d.after, delta, { previous: fit });
            const after = stack("fitStack")(next);
            rows.push({ id: `${d.before} | ${d.after} by ${delta}`, same: next === input, lengths: Object.fromEntries(next.items.filter((it: Any) => lengthsOf(it)).map((it: Any) => [it.id, lengthsOf(it)])), sizes: [mainOf(after, d.before), mainOf(after, d.after)] });
          }
          const reset = stack("resetBetween")(input, d.before, d.after, { previous: fit });
          rows.push({ id: `${d.before} | ${d.after} reset`, same: reset === input, lengths: Object.fromEntries(reset.items.filter((it: Any) => lengthsOf(it)).map((it: Any) => [it.id, lengthsOf(it)])) });
        }
        const all = stack("resetLengths")(input);
        rows.push({ id: "resetLengths", same: all === input, lengths: Object.fromEntries(all.items.filter((it: Any) => lengthsOf(it)).map((it: Any) => [it.id, lengthsOf(it)])) });
        return rows;
      });
      out.attempt("gaps", id, () => {
        const item = input.items[0];
        if (!item) return [];
        return stack("stackGaps")(input, item).map((g: Any) => ({ id: `at ${g.at}`, fits: g.fits, ...(g.fits ? { slot: g.slot, forms: g.fit.items.map((i: Any) => [i.id, i.form]) } : { reason: g.reason }) }));
      });
    }

    const stage = { x: 0, y: 0, width: 1000, height: 700 };
    const bandSets = [
      [{ id: "top", side: "top", size: 36 }, { id: "left", side: "left", size: 240 }, { id: "right", side: "right", size: 200, gap: 12 }],
      [{ id: "bottom", side: "bottom", size: 30 }, { id: "float", side: "left", size: 300, mode: "over" }, { id: "top", side: "top", size: 50, gap: 4 }],
      [{ id: "huge", side: "left", size: 5000 }],
    ];
    bandSets.forEach((bands, i) => out.attempt("cut", `bands ${i}`, () => stack("cutEdges")(stage, bands)));
    const avoid = [{ x: 0, y: 0, width: 900, height: 40 }, { x: 600, y: 40, width: 300, height: 560 }];
    [[10, 10, 200, 150], [700, 500, 300, 200], [-50, 300, 280, 320], [300, 100, 280, 320], [550, 50, 400, 500]].forEach(([x, y, width, height], i) => {
      const want = { x, y, width, height };
      const floor = { x: 0, y: 0, width: 900, height: 600 };
      out.attempt("float-fit", `want ${i}`, () => ({ free: stack("fitFloat")(want, floor), clear: stack("fitFloat")(want, floor, avoid) }));
    });

    // --- tiling ---------------------------------------------------------------------------------------------------
    const area = { x: 10, y: 20, width: 900, height: 600 };
    const randomTree = (n: number): Any => {
      const shuffled = Array.from({ length: n }, (_, i) => i);
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const grow = (panes: number[]): Any => {
        if (panes.length === 1) return { pane: panes[0] };
        const cut = 1 + Math.floor(rnd() * (panes.length - 1));
        const axis = (["x", "y", undefined] as const)[Math.floor(rnd() * 3)];
        const ratio = rnd() < 0.3 ? undefined : 0.1 + rnd() * 0.8;
        return { a: grow(panes.slice(0, cut)), b: grow(panes.slice(cut)), ...(axis ? { axis } : {}), ...(ratio === undefined ? {} : { ratio }) };
      };
      return n === 0 ? null : grow(shuffled);
    };
    const trees: { id: string; tree: Any }[] = [];
    out.attempt("corpus", "split trees", () => {
      for (let k = 0; k < 60; k++) trees.push({ id: `tree ${k}`, tree: randomTree(k % 9) });
      return { trees: trees.length };
    });
    const regions = ["center", "top", "right", "bottom", "left"];
    for (const { id, tree } of trees) {
      for (const gap of [0, 6]) {
        out.attempt("layout-split", `${id} gap ${gap}`, () => tile("layoutSplit")(tree, area, { gap }));
      }
      out.attempt("split-edits", id, () => {
        const panes: number[] = tile("panesOf")(tree);
        if (panes.length === 0) return { empty: tile("splitPane")(null, null, 0) };
        const at = panes[Math.floor(panes.length / 2)]!;
        const dragged = panes[0]!;
        return {
          split: tile("splitPane")(tree, at, 99, "right"),
          removed: tile("removePane")(tree, at),
          swapped: tile("swapPanes")(tree, dragged, at),
          drops: Object.fromEntries(regions.map((r) => [r, tile("dropOnPane")(tree, dragged, at, r)])),
          fromOrder: tile("splitFromOrder")(panes),
        };
      });
      out.attempt("pane-targets", id, () => {
        const layout = tile("layoutSplit")(tree, area, { gap: 4 });
        return tile("paneTargets")(layout, { except: tile("panesOf")(tree)[0] });
      });
    }
    const pane = { x: 100, y: 100, width: 300, height: 200 };
    let previousRegion: string | null = null;
    for (let y = 90; y <= 310; y += 20)
      for (let x = 90; x <= 410; x += 20)
        out.attempt("pane-region", `${x},${y}`, () => {
          previousRegion = tile("paneRegion")(pane, { x, y }, previousRegion);
          return { held: previousRegion, fresh: tile("paneRegion")(pane, { x, y }) };
        });
    for (const arrange of ["masterStack", "columns", "grid"]) {
      for (let n = 0; n <= 9; n++) {
        const panes = Array.from({ length: n }, (_, i) => i);
        for (const options of [{}, { gap: 8 }, { gap: 4, ratio: 0.6 }])
          out.attempt("order-layout", `${arrange} ${n} ${JSON.stringify(options)}`, () => tile(arrange)(panes, area, options));
        out.attempt("order-targets", `${arrange} ${n}`, () => tile("orderTargets")(tile(arrange), panes, 99, area, { gap: 4 }));
      }
    }
    const written = out.write(outFile("placement"));
    console.log(`placement: ${written} outputs`);
  });
});
