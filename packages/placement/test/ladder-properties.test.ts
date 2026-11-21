/**
 * `controlLadder`, the properties of a bar of generated groups: shrunk 1 px at a time it runs short control by control,
 * monotone, with no room wasted, in the order the ranks give, with no jitter, and growing back reverses every step.
 * A small seeded sweep (a few random specs per property) and a couple of hand cases.
 */
import { describe, expect, it } from "vitest";
import { controlLadder, type StackFit, type StackItem } from "../src/stack";
import { seeded } from "./stack-fixture";
import { TITLE, down, foldAt, formsOf, groupItem, levelAt, menuAt, needOf, randomSpec, rowStepLeft, shapeOf, tierStepLeft, title, up, walk, wide, type Group } from "./ladder-fixture";

const SEEDS = [11, 23, 37, 41, 59, 73];
/** Seeds whose groups are strict (every tier and every fold shortens); the others may have forms that don't shorten. */
const STRICT = new Set([11, 37, 59]);

interface Bar {
  readonly groups: Group[];
  readonly items: StackItem[];
  readonly hi: number;
}
/** 2 or 3 random groups, and a growing title among them when `withTitle`. */
function randomBar(seed: number, opts: { withTitle: boolean; strict?: boolean }): Bar {
  const rand = seeded(seed);
  const m = 2 + Math.floor(rand() * 2);
  const groups = Array.from({ length: m }, (_, i) => ({ id: `g${i}`, spec: randomSpec(rand, { strict: opts.strict ?? STRICT.has(seed) }) }));
  const items = groups.map((g, i) => groupItem(g, i));
  if (opts.withTitle) items.splice(Math.floor(rand() * (m + 1)), 0, title());
  return { groups, items, hi: wide(items) };
}

/** Down from `hi` to 0 and back up to `hi`, each length solved with the fit before it as `previous`. */
function round(bar: Bar): { downs: StackFit[]; ups: StackFit[]; lengths: number[] } {
  const lengths = down(bar.hi, 0);
  const downs = walk(bar.items, lengths);
  const ups = walk(bar.items, up(0, bar.hi), downs[downs.length - 1]);
  return { downs, ups, lengths };
}

const widthOfTitle = (fit: StackFit): number => fit.items.find((p) => p.id === "title")!.rect.width;

describe("1. monotone: shrinking never shows more, growing back reverses the steps exactly", () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: a bar of 2 or 3 groups and a growing title`, () => {
      const bar = randomBar(seed, { withTitle: true });
      const { downs, ups, lengths } = round(bar);
      bar.groups.forEach((g) => {
        const s = shapeOf(g.spec);
        let last = levelAt(s, 0);
        let lastForm = 0;
        downs.forEach((fit, k) => {
          const form = formsOf(fit)[g.id]!;
          const now = levelAt(s, form);
          const at = `${g.id} at ${lengths[k]} px`;
          expect(form, `${at}: the form index never goes back`).toBeGreaterThanOrEqual(lastForm);
          expect(now.hidden, `${at}: shown controls never grow`).toBeGreaterThanOrEqual(last.hidden);
          expect(now.steps, `${at}: the tier never goes back up`).toBeGreaterThanOrEqual(last.steps);
          now.tier.forEach((t, p) => expect(t, `${at}: control ${p}'s tier never goes back up`).toBeGreaterThanOrEqual(last.tier[p]!));
          last = now;
          lastForm = form;
        });
      });
      // (The title takes the room a group's step frees, so its own length is not monotone; it is checked in 3.)
      // Growing back: at every length the forms are the ones the way down had there.
      const back = [...ups].reverse();
      back.forEach((fit, k) => expect(formsOf(fit), `at ${lengths[k]} px growing back holds what shrinking held`).toEqual(formsOf(downs[k]!)));
      back.forEach((fit, k) => expect(fit.items.map((p) => p.rect), `rects at ${lengths[k]} px`).toEqual(downs[k]!.items.map((p) => p.rect)));
    });
  }

  it("hand case: three controls, shrinking 1 px at a time, the first to fold shortens first", () => {
    const g: Group = { id: "g", spec: { controls: [{ id: "a", tiers: [50, 30] }, { id: "b", tiers: [40, 24] }, { id: "c", tiers: [60, 20] }], gap: 4, grip: 10, more: 16, cross: 28 } };
    const items = [groupItem(g, 0)];
    const seen: number[] = [];
    for (const fit of walk(items, down(168, 0))) {
      const form = fit.items[0]!.form;
      if (seen[seen.length - 1] !== form) seen.push(form);
    }
    // Forms 0 to 7, in order (the last, the menu, comes with the » entry).
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(controlLadder(g.spec).row.map((f) => f.main.min)).toEqual([168, 128, 112, 92, 84, 56, 26, 0]);
  });
});

describe("2. no wasted room: the last step back doesn't fit", () => {
  // Growth undoes the last step first, so the room left over is always less than that step needs back (it need not be
  // the cheapest step of the bar). Without the title: its shrink isn't a step of any group.
  for (const seed of SEEDS) {
    it(`seed ${seed}: at every length, shrinking and growing`, () => {
      const bar = randomBar(seed, { withTitle: false });
      const { downs, ups, lengths } = round(bar);
      const lens = [...lengths, ...up(0, bar.hi)];
      [...downs, ...ups].forEach((fit, k) => {
        const length = lens[k]!;
        const at = formsOf(fit);
        const steps = fit.steps ?? [];
        if (steps.length === 0) {
          // Nothing hidden and no step taken: every group is in its first form.
          expect(Object.values(at).every((f) => f === 0), `${length} px: no step taken, so the first forms`).toBe(true);
          return;
        }
        const last = steps[steps.length - 1]!;
        const undone = { ...at };
        for (const s of steps) if (last.batch !== undefined ? s.batch === last.batch : s === last) undone[s.id] = s.from;
        expect(needOf(bar.items, undone), `${length} px: the last step back needs more than the room`).toBeGreaterThan(length);
      });
    });
  }

  it("a control is hidden only while the last step back doesn't fit, with the title's room off the table", () => {
    // The same check, restated on the control count: any hidden control, then the way back needs more than is spare.
    const bar = randomBar(5, { withTitle: false, strict: true });
    const lengths = down(bar.hi, 0);
    walk(bar.items, lengths).forEach((fit, k) => {
      const hidden = bar.groups.some((g) => levelAt(shapeOf(g.spec), formsOf(fit)[g.id]!).hidden > 0);
      if (!hidden) return;
      const last = fit.steps![fit.steps!.length - 1]!;
      const undone = { ...formsOf(fit), [last.id]: last.from };
      if (last.batch === undefined) expect(needOf(bar.items, undone)).toBeGreaterThan(lengths[k]!);
    });
  });
});

describe("3. order: tier steps, then partial folds, then folds, the title last of the row steps", () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: down and back up, with a growing title`, () => {
      const bar = randomBar(seed, { withTitle: true });
      const { downs, ups, lengths } = round(bar);
      const lens = [...lengths, ...up(0, bar.hi)];
      [...downs, ...ups].forEach((fit, k) => {
        const at = formsOf(fit);
        const state = bar.groups.map((g) => {
          const s = shapeOf(g.spec);
          const forms = groupItem(g, 0).forms;
          const i = at[g.id]!;
          return { s, i, tierLeft: tierStepLeft(forms, s, i), rowLeft: rowStepLeft(forms, s, i) };
        });
        const where = `at ${lens[k]} px, forms ${JSON.stringify(at)}`;
        if (state.some((g) => g.tierLeft)) {
          state.forEach((g, q) => {
            const level = levelAt(g.s, g.i);
            if (level.hidden > 0 && level.hidden < g.s.n) expect.fail(`${where}: group ${q} has a partial fold while a group still has a tier step`);
          });
        }
        if (state.some((g) => g.rowLeft)) {
          state.forEach((g, q) => expect(g.i, `${where}: group ${q} is folded while another still shows a control`).toBeLessThan(foldAt(g.s)));
        }
        // The title keeps at least its natural length while any group has a row step left.
        if (state.some((g) => g.rowLeft)) expect(widthOfTitle(fit), `${where}: the title gave way before a toolbar's step`).toBeGreaterThanOrEqual(TITLE.natural - 1e-6);
      });
    });
  }

  it("levelling: two like groups alternate by fewest hidden, so they are never more than one form apart", () => {
    for (const seed of SEEDS) {
      const spec = randomSpec(seeded(seed), { strict: true, n: 3, tiers: 3 });
      const a: Group = { id: "a", spec };
      const b: Group = { id: "b", spec };
      for (const withTitle of [false, true]) {
        const items = [groupItem(a, 0), groupItem(b, 1)];
        if (withTitle) items.push(title());
        const hi = wide(items);
        const downs = walk(items, down(hi, 0));
        const ups = walk(items, up(0, hi), downs[downs.length - 1]);
        [...downs, ...ups].forEach((fit, k) => {
          const f = formsOf(fit);
          expect(Math.abs(f.a! - f.b!), `seed ${seed} title ${withTitle} step ${k}: ${JSON.stringify(f)}`).toBeLessThanOrEqual(1);
        });
        // And every group goes through every form: none is jumped over.
        const seen = new Set(downs.map((fit) => formsOf(fit).a));
        const s = shapeOf(spec);
        for (let i = 0; i <= foldAt(s); i++) expect(seen.has(i), `seed ${seed}: form ${i} of a is visited`).toBe(true);
        expect(menuAt(s)).toBe(s.n * s.T + 1);
      }
    }
  });

  it("hand case: groups of different sizes (4 and 2 controls): none folds while another still shows a control at a partial fold", () => {
    const four = { controls: ["a", "b", "c", "d"].map((id) => ({ id, tiers: [40, 30] })), gap: 4, grip: 10, more: 14, cross: 28 };
    const two = { controls: ["e", "f"].map((id) => ({ id, tiers: [40, 30] })), gap: 4, grip: 10, more: 14, cross: 28 };
    const groups: Group[] = [{ id: "x", spec: four }, { id: "y", spec: two }];
    for (const order of [groups, [...groups].reverse()]) {
      const items = order.map((g, i) => groupItem(g, i));
      const hi = wide(items);
      const downs = walk(items, down(hi, 0));
      const folded: number[] = [];
      [...downs, ...walk(items, up(0, hi), downs[downs.length - 1])].forEach((fit, k) => {
        const at = formsOf(fit);
        const left = groups.map((g) => rowStepLeft(groupItem(g, 0).forms, shapeOf(g.spec), at[g.id]!));
        const isFolded = groups.map((g) => at[g.id]! >= foldAt(shapeOf(g.spec)));
        if (left.some(Boolean) && isFolded.some(Boolean)) folded.push(k);
      });
      expect(folded, `${order[0]!.id} first: a group folded while another still had a row step`).toEqual([]);
    }
  });

  it("hand case: two groups of three controls give way in the order tier, partial, fold, menu", () => {
    const spec = { controls: [{ id: "a", tiers: [50, 30] }, { id: "b", tiers: [40, 24] }, { id: "c", tiers: [60, 20] }], gap: 4, grip: 10, more: 16, cross: 28 };
    const items = [groupItem({ id: "x", spec }, 0), groupItem({ id: "y", spec }, 1)];
    const trail: string[] = [];
    let before = "0,0";
    for (const fit of walk(items, down(wide(items), 0))) {
      const f = formsOf(fit);
      const now = `${f.x},${f.y}`;
      if (now !== before) trail.push(now);
      before = now;
    }
    // The older group (x) takes each tie first; the groups never are more than a step apart.
    expect(trail).toEqual(["1,0", "1,1", "2,1", "2,2", "3,2", "3,3", "4,3", "4,4", "5,4", "5,5", "6,5", "6,6", "7,6", "7,7"]);
  });
});

describe("4. no jitter: a 1 px wobble around a step boundary flips only that step", () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: every boundary, with a title`, () => {
      const bar = randomBar(seed, { withTitle: true });
      const lengths = down(bar.hi, 0);
      const fits = walk(bar.items, lengths);
      let checked = 0;
      for (let k = 1; k < fits.length; k++) {
        const wide_ = formsOf(fits[k - 1]!);
        const narrow = formsOf(fits[k]!);
        const changed = Object.keys(wide_).filter((id) => wide_[id] !== narrow[id]);
        if (changed.length === 0) continue;
        checked++;
        // Wobble: start at the narrow side of the boundary, then alternate narrow, wide, narrow, wide, …
        let previous = fits[k]!;
        const L = lengths[k]!;
        for (const [i, length] of [L + 1, L, L + 1, L, L + 1, L].entries()) {
          const fit = walk(bar.items, [length], previous)[0]!;
          const expected = length === L ? narrow : wide_;
          expect(formsOf(fit), `boundary ${L}: wobble ${i} at ${length} px`).toEqual(expected);
          previous = fit;
        }
        // Only the changed items flipped (the title never has a form to change).
        expect(Object.keys(wide_).filter((id) => wide_[id] !== narrow[id]).every((id) => id !== "title")).toBe(true);
      }
      expect(checked, "the sweep crossed boundaries").toBeGreaterThan(5);
    });
  }

  it("a wobble in the middle of the title's shrink changes no form", () => {
    const bar = randomBar(3, { withTitle: true });
    const t = Math.round(bar.hi * 0.1);
    const reference = walk(bar.items, down(bar.hi, t));
    let previous = reference[reference.length - 1]!;
    for (const length of [t + 1, t, t + 1, t, t - 1, t, t + 1]) {
      const fit = walk(bar.items, [length], previous)[0]!;
      previous = fit;
    }
    expect(formsOf(previous)).toEqual(formsOf(walk(bar.items, [t + 1])[0]!));
  });
});

describe("hand case: the title gives way only after every toolbar's steps", () => {
  it("with generated ladders, a growing title in the same stack shrinks only once every group is on its last partial fold", () => {
    for (const seed of SEEDS) {
      const bar = randomBar(seed, { withTitle: true, strict: true });
      const lengths = down(bar.hi, 0);
      let natural = true;
      for (const fit of walk(bar.items, lengths)) {
        const f = formsOf(fit);
        const rowsLeft = bar.groups.some((g) => f[g.id]! < foldAt(shapeOf(g.spec)) - 1);
        const w = widthOfTitle(fit);
        if (w < TITLE.natural - 1e-6) natural = false;
        // Once the title is under its natural length, no group has a row step left: it keeps its natural length until then.
        if (rowsLeft) expect(natural, `seed ${seed}: the title shrank while a toolbar still had steps`).toBe(true);
        if (!natural) expect(rowsLeft).toBe(false);
      }
      expect(natural, `seed ${seed}: the sweep reaches the title's shrink`).toBe(false);
    }
  });

  it("the bar's own length at the end of every row step: groups and title, 1 px apart", () => {
    // Two groups at their last partial fold (one control each) need exactly: grip + one control + more, twice, a gap, the title.
    const spec = { controls: [{ id: "a", tiers: [50, 30] }, { id: "b", tiers: [40, 24] }, { id: "c", tiers: [60, 20] }], gap: 4, grip: 10, more: 16, cross: 28 };
    const items = [title(), groupItem({ id: "x", spec }, 0), groupItem({ id: "y", spec }, 1)];
    const lastPartial = 56 * 2 + 2 * 6 + TITLE.natural;
    const at = (length: number) => walk(items, [wide(items), length])[1]!;
    const held = at(lastPartial);
    expect(formsOf(held)).toMatchObject({ x: 5, y: 5 });
    expect(widthOfTitle(held)).toBe(TITLE.natural);
    // One px less and nothing is left to give but the title.
    const less = at(lastPartial - 1);
    expect(formsOf(less)).toMatchObject({ x: 5, y: 5 });
    expect(widthOfTitle(less)).toBe(TITLE.natural - 1);
  });
});
