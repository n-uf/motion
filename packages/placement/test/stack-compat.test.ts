/**
 * Additive only: an input with none of the new options (no `previous`, `rank`, `gap`, `pad`, `endReach`, no `fold`
 * form, no explicit `cross.min` over the limits' `max`) gives exactly the 26.11.13 fit, except where one of the two fixes
 * the kits asked for applies:
 *
 * - T2/T4, a give-way step goes only to a form that shortens the stack: an item that was stepped into a form that is the
 *   same length or longer is no longer.
 * - the menu batch: an item at most as long as the » entry is no longer stepped into the menu alone (the old solver did
 *   it whenever another item could still give way); the stuck items go in together, or not at all.
 * - the pass limit (the old solver gave up after as many passes as forms in all, which a long run of cross-fit and
 *   give-way steps can use up, and returned a stack that still doesn't fit with no `overflow` note).
 *
 * `legacy/` holds the 26.11.13 solver, copied verbatim (git show 5eaa31b).
 */
import { describe, expect, it } from "vitest";
import { fitStack, stackTargets, type StackFit, type StackForm, type StackInput, type StackItem } from "../src/stack";
import { fitStack as legacyFit } from "./legacy/layout-26.11.13";
import { fitStack as legacy15Fit } from "./legacy/layout-26.11.15";
import type { StackFit as LegacyFit, StackInput as LegacyInput } from "./legacy/model-26.11.13";
import type { StackInput as Legacy15Input } from "./legacy/model-26.11.15";
import { stackTargets as legacy15Targets } from "./legacy/targets-26.11.15";
import { barGroup, group, limits, panel, seeded } from "./stack-fixture";

const EPS = 1e-6;
const form = (kind: StackForm["kind"], min: number, cross = 28): StackForm => ({ kind, main: { min, natural: min }, cross: { natural: cross } });
/** A group whose forms aren't all shorter than the one before: stacked as long as the row, icons longer than stacked. */
const oddGroup = (id: string, used: number, kept: boolean, rand: () => number): StackItem => {
  const a = 80 + Math.floor(rand() * 120);
  return { id, used, ...(kept ? { kept } : {}), forms: [form("row", a), form("stacked", a), form("icons", rand() < 0.5 ? a : a - 40), form("menu", 0)] };
};

function randomInput(rand: () => number): StackInput {
  const axis = rand() < 0.5 ? "column" : "row";
  const n = 1 + Math.floor(rand() * 6);
  const items: StackItem[] = Array.from({ length: n }, (_, i) => {
    const used = Math.floor(rand() * 6);
    const kept = rand() < 0.25;
    const r = rand();
    if (r < 0.4) {
      const p = panel(`p${i}`, used, 100 + Math.floor(rand() * 120), kept, 80 + Math.floor(rand() * 200));
      // Some open forms carry a `cross.min` (it existed in 26.11.13): over the limits' max or not, it only clamps without strictCross.
      const open = rand() < 0.4 ? { ...p.forms[0]!, cross: { ...p.forms[0]!.cross, min: Math.floor(rand() * 400) } } : p.forms[0]!;
      const q = { ...p, forms: [open, ...p.forms.slice(1)] };
      return rand() < 0.15 ? { ...q, from: 1 } : q;
    }
    if (r < 0.7) return axis === "column" ? group(`g${i}`, used, kept) : barGroup(`g${i}`, used, kept);
    return oddGroup(`o${i}`, used, kept, rand);
  });
  return { axis, length: 30 + Math.floor(rand() * 700), cross: limits, items, ...(rand() < 0.3 ? { menu: { main: 20 + Math.floor(rand() * 20) } } : {}) };
}

/** The fit without the field the new solver adds (`need`). */
const plain = (f: StackFit): unknown => {
  const { need: _need, ...rest } = f;
  return rest;
};
/** JSON with the keys sorted, so two fits compare by content, not by the order their keys were made in. */
const canon = (x: unknown): string => JSON.stringify(x, (_k, v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v));

/**
 * The items whose path in a fit passes a hop that is not shorter (the T2 skip), or a step into the menu from a form that is
 * not longer than the » entry (the batch: the old solver took it alone, the new one only together with others).
 */
function flagged(input: StackInput, fit: { readonly items: readonly { readonly id: string; readonly form: number }[] }): Map<string, string> {
  const menu = input.menu?.main ?? 28;
  const out = new Map<string, string>();
  for (const p of fit.items) {
    const item = input.items.find((it) => it.id === p.id)!;
    const start = Math.min(Math.max(0, Math.floor(item.from ?? 0)), item.forms.length - 1);
    for (let j = start; j < p.form; j++) {
      const cur = item.forms[j]!;
      const next = item.forms[j + 1]!;
      if (next.kind === "menu" ? cur.kind !== "menu" && cur.main.min <= menu : next.main.min >= cur.main.min) out.set(p.id, next.kind === "menu" ? "menu batch" : "T2 skip");
    }
  }
  return out;
}

/**
 * Why the old fit may differ from the new, or null. Only the items that differ (another form) count, not the whole fit: one of
 * them must itself pass a flagged hop on its old path or its new one (the T2 skip, or a step into the menu from a form no
 * longer than the » entry; a batch can pull in an item the old steps left out, so the new path counts too). With every form the same only
 * the order of the `to-menu` notes can differ (a batch enters the menu in give-way order), and only where an item is flagged.
 * An old fit that stopped early (it doesn't fit and has no `overflow` note) is the pass limit.
 */
function explained(input: StackInput, old: LegacyFit, now: StackFit): string | null {
  const before = flagged(input, old);
  const after = flagged(input, now);
  const differing = old.items.filter((p, i) => p.form !== now.items[i]!.form).map((p) => p.id);
  if (differing.length > 0) {
    // A root: a differing item that is flagged itself. The items a flagged step pushes around (it takes room, or frees it)
    // differ too, so they can't each be required to be flagged; but a difference with no flagged item among them is a bug.
    const roots = differing.map((id) => before.get(id) ?? after.get(id) ?? null).filter((r) => r !== null);
    return roots[0] ?? null;
  }
  const items = (plain(now) as { items: unknown }).items;
  if (canon(old.items) === canon(items) && canon(old.menu) === canon(now.menu) && (before.size > 0 || after.size > 0)) return "menu batch";
  const menu = input.menu?.main ?? 28;
  const need = old.items.reduce((s, p) => s + (p.kind === "menu" ? 0 : input.items.find((it) => it.id === p.id)!.forms[p.form]!.main.min), 0) + (old.menu ? menu : 0);
  if (need > old.length + EPS && !old.notes.some((n) => n.code === "overflow")) return "pass limit";
  return null;
}

/** A strict input: every form strictly shorter than the one before, the last before `menu` longer than the » entry, `cross.min` only on forms that don't set the cross size. */
function strictInput(rand: () => number): StackInput {
  const axis = rand() < 0.5 ? "column" : "row";
  const entry = 20 + Math.floor(rand() * 16);
  const items: StackItem[] = Array.from({ length: 1 + Math.floor(rand() * 6) }, (_, i) => {
    const used = Math.floor(rand() * 6);
    const kept = rand() < 0.3;
    // Strictly decreasing mins, all over the entry.
    const mins: number[] = [];
    let m = entry + 40 + Math.floor(rand() * 120);
    for (let k = 0; k < 3 + Math.floor(rand() * 2); k++) {
      mins.push(m);
      m = Math.max(entry + 1, m - 1 - Math.floor(rand() * 40));
      if (mins.length > 1 && mins.at(-1)! <= entry + 1) break;
    }
    const strictlyDown = mins.filter((x, k) => k === 0 || x < mins[k - 1]!);
    const panelLike = rand() < 0.5;
    const kinds: StackForm["kind"][] = panelLike ? ["open", "header", "rail", "icons"] : ["row", "stacked", "icons", "row"];
    const forms: StackForm[] = strictlyDown.map((x, k) => ({
      kind: kinds[k]!,
      main: { min: x, natural: x + (k === 0 ? Math.floor(rand() * 30) : 0), ...(panelLike && k === 0 ? { grows: true } : {}) },
      cross: { natural: panelLike && k === 0 ? 100 + Math.floor(rand() * 200) : 20 + Math.floor(rand() * 60), ...(!(panelLike && k === 0) && rand() < 0.5 ? { min: 10 + Math.floor(rand() * 120) } : {}) },
    }));
    forms.push(form("menu", 0));
    const item: StackItem = { id: `s${i}`, used, ...(kept ? { kept } : {}), forms, ...(rand() < 0.15 ? { from: 1 } : {}) };
    return item;
  });
  return { axis, length: 20 + Math.floor(rand() * 600), cross: limits, items, menu: { main: entry } };
}

describe("26.11.13 compatibility", () => {
  it("an input with none of the new options gives the 26.11.13 fit, except where a listed fix applies", () => {
    const rand = seeded(2611);
    let same = 0;
    const why: Record<string, number> = {};
    for (let trial = 0; trial < 4000; trial++) {
      const input = randomInput(rand);
      const old = legacyFit(input as unknown as LegacyInput);
      const now = plain(fitStack(input));
      if (canon(now) === canon(old)) {
        same++;
        continue;
      }
      const reason = explained(input, old, fitStack(input));
      why[reason ?? "UNEXPLAINED"] = (why[reason ?? "UNEXPLAINED"] ?? 0) + 1;
      expect(reason, `${JSON.stringify(input)}\nold ${JSON.stringify(old)}\nnew ${JSON.stringify(now)}`).not.toBeNull();
    }
    // The sweep sees both: plenty of identical fits, and each listed difference at least once (so the list is not vacuous).
    expect(same).toBeGreaterThan(2000);
    expect(why["T2 skip"] ?? 0).toBeGreaterThan(0);
    expect(why["menu batch"] ?? 0).toBeGreaterThan(0);
  });

  it("a strict input (every form shorter, the last before the menu longer than the » entry, from, kept, both axes, cross.min on non-setters) gives the 26.11.13 fit exactly", () => {
    const rand = seeded(1113);
    for (let trial = 0; trial < 3000; trial++) {
      const input = strictInput(rand);
      const old = legacyFit(input as unknown as LegacyInput);
      const now = plain(fitStack(input));
      expect(canon(now), `${JSON.stringify(input)}`).toBe(canon(old));
    }
  });

  it("a setter form with a cross.min over cross.max is clamped as in 26.11.13, unless strictCross says otherwise", () => {
    const form4 = (kind: StackForm["kind"], min: number, cross: number, crossMin?: number, grows = false): StackForm => ({ kind, main: { min, natural: min === 90 ? 160 : min, ...(grows ? { grows } : {}) }, cross: { natural: cross, ...(crossMin === undefined ? {} : { min: crossMin }) } });
    const p: StackItem = { id: "p", used: 1, forms: [form4("open", 90, 240, 200, true), form4("header", 28, 240, 80), form4("rail", 24, 30), form4("menu", 0, 0)] };
    const input = { axis: "column", length: 600, cross: { min: 60, max: 150 }, items: [p] } as const;
    const old = legacyFit(input as unknown as LegacyInput);
    expect(old.items.map((i) => i.kind)).toEqual(["open"]);
    expect(plain(fitStack(input))).toEqual(old);
    expect(fitStack({ ...input, strictCross: true }).items.map((i) => i.kind)).toEqual(["rail"]);
  });

  it("the sample inputs of the 26.11.13 README give the 26.11.13 fits", () => {
    const column = { axis: "column", length: 250, cross: { min: 120, max: 360 } } as const;
    const items = [panel("pages", 1), panel("findings", 2), group("tools", 3)];
    expect(plain(fitStack({ ...column, items }))).toEqual(legacyFit({ ...column, items } as unknown as LegacyInput));
    expect(plain(fitStack({ ...column, items: [group("tools", 3)] }))).toEqual(legacyFit({ ...column, items: [group("tools", 3)] } as unknown as LegacyInput));
  });
});

/**
 * 26.11.15 compatibility (the C25, C28, C29 options: `accepts`, `allows`, `ownCross`, `fixed`). An input that uses none
 * of them gives exactly the 26.11.15 fit, with every earlier option in play: `previous`, `rank`, `gap`, `pad`,
 * `strictCross`, `fold`, `endReach`. `legacy/*-26.11.15.ts` holds the solver and the targets at origin/main 821b6a1,
 * copied verbatim.
 */
describe("26.11.15 compatibility", () => {
  /** A random input using the earlier options too (gap, pad, rank, fold, strictCross, `from`, `kept`, a menu size). */
  function richInput(rand: () => number): StackInput {
    const base = randomInput(rand);
    const items = base.items.map((it): StackItem => {
      const forms = it.forms.map((f, k): StackForm => {
        const kind = rand() < 0.1 && f.kind !== "menu" && k > 0 ? ("fold" as const) : f.kind;
        return { ...f, kind, ...(rand() < 0.25 && f.kind !== "menu" ? { rank: Math.floor(rand() * 3) } : {}) };
      });
      return { ...it, forms };
    });
    return { ...base, items, ...(rand() < 0.4 ? { gap: Math.floor(rand() * 10) } : {}), ...(rand() < 0.4 ? { pad: { start: Math.floor(rand() * 12), end: Math.floor(rand() * 12) } } : {}), ...(rand() < 0.3 ? { strictCross: true } : {}) };
  }
  const asLegacy = (input: StackInput): Legacy15Input => input as unknown as Legacy15Input;

  it("fitStack, with and without previous, equals the 26.11.15 solver (chains: where no form has a rank of its own)", () => {
    const rand = seeded(26115);
    let chained = 0;
    for (let trial = 0; trial < 3000; trial++) {
      const input = richInput(rand);
      expect(canon(fitStack(input)), JSON.stringify(input)).toBe(canon(legacy15Fit(asLegacy(input))));
      // A chain of lengths, the fit of each as `previous` of the next: the same fits as the old solver gives along the same
      // chain. Since 26.11.21 a menu item no longer leaves the menu ahead of an item whose step down ranked higher than
      // its own step into the menu (growing back is the strict reverse of giving way), so chains with ranked forms differ
      // from the old solver by design and are left out here (stack-previous.test.ts covers them).
      const ranked = input.items.some((it) => it.forms.some((f) => (f.rank ?? 0) !== 0));
      let now: StackFit = fitStack(input);
      let old = legacy15Fit(asLegacy(input));
      for (let step = 0; step < 4; step++) {
        const next = { ...input, length: Math.max(0, input.length + Math.floor((rand() - 0.5) * 400)) };
        now = fitStack(next, { previous: now });
        old = legacy15Fit(asLegacy(next), { previous: old });
        if (ranked) continue;
        expect(canon(now), JSON.stringify(next)).toBe(canon(old));
        chained++;
      }
    }
    expect(chained).toBeGreaterThan(2000);
  });

  it("stackTargets equals the 26.11.15 targets, with endReach and previous", () => {
    const rand = seeded(2611);
    for (let trial = 0; trial < 1500; trial++) {
      const input = richInput(rand);
      const dragged = (richInput(rand).items[0] ?? input.items[0])!;
      const options = { ...(rand() < 0.5 ? { endReach: Math.floor(rand() * 20) } : {}), ...(rand() < 0.4 ? { previous: fitStack(input) } : {}) };
      expect(canon(stackTargets(input, dragged, options)), JSON.stringify(input)).toBe(canon(legacy15Targets(asLegacy(input), dragged as never, options as never)));
    }
  });

  it("the new options at their defaults change nothing: false, undefined, accepts and allows that allow all", () => {
    const rand = seeded(1115);
    for (let trial = 0; trial < 500; trial++) {
      const input = richInput(rand);
      const off: StackInput = { ...input, ownCross: false, accepts: () => true };
      const items = input.items.map((it) => ({ ...it, fixed: false }));
      expect(canon(fitStack({ ...off, items }))).toBe(canon(fitStack(input)));
      const dragged = input.items[0];
      if (dragged) {
        const same = stackTargets({ ...off, items }, { ...dragged, fixed: false }, { allows: () => true });
        const was = legacy15Targets(asLegacy(input), dragged as never, {});
        expect(same.map((t) => [t.id, t.place, t.hit, t.slot, t.marker, t.fit])).toEqual(was.map((t) => [t.id, t.place, t.hit, t.slot, t.marker, t.fit]));
      }
    }
  });
});
