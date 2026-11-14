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
import { fitStack, type StackFit, type StackForm, type StackInput, type StackItem } from "../src/stack";
import { fitStack as legacyFit } from "./legacy/layout-26.11.13";
import type { StackFit as LegacyFit, StackInput as LegacyInput } from "./legacy/model-26.11.13";
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
      return rand() < 0.15 ? { ...p, from: 1 } : p;
    }
    if (r < 0.7) return axis === "column" ? group(`g${i}`, used, kept) : barGroup(`g${i}`, used, kept);
    return oddGroup(`o${i}`, used, kept, rand);
  });
  return { axis, length: 30 + Math.floor(rand() * 700), cross: limits, items, ...(rand() < 0.3 ? { menu: { main: 20 + Math.floor(rand() * 20) } } : {}) };
}

/** The fit without the `need` field the new solver adds. */
const plain = (f: StackFit): Omit<StackFit, "need"> => {
  const { need: _need, ...rest } = f;
  return rest;
};

/** Why the old fit may differ from the new: which of the listed fixes applies to it, or null. */
function explained(input: StackInput, old: LegacyFit): string | null {
  const menu = input.menu?.main ?? 28;
  for (const p of old.items) {
    const forms = input.items.find((it) => it.id === p.id)!.forms;
    const start = Math.min(Math.max(0, Math.floor(input.items.find((it) => it.id === p.id)!.from ?? 0)), forms.length - 1);
    for (let j = start; j < p.form; j++) {
      const cur = forms[j]!;
      const next = forms[j + 1]!;
      if (next.kind === "menu" ? cur.kind !== "menu" && cur.main.min <= menu : next.main.min >= cur.main.min) return next.kind === "menu" ? "menu batch" : "T2 skip";
    }
  }
  const need = old.items.reduce((s, p) => s + (p.kind === "menu" ? 0 : input.items.find((it) => it.id === p.id)!.forms[p.form]!.main.min), 0) + (old.menu ? menu : 0);
  if (need > old.length + EPS && !old.notes.some((n) => n.code === "overflow")) return "pass limit";
  return null;
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
      if (JSON.stringify(now) === JSON.stringify(old)) {
        same++;
        continue;
      }
      const reason = explained(input, old);
      why[reason ?? "UNEXPLAINED"] = (why[reason ?? "UNEXPLAINED"] ?? 0) + 1;
      expect(reason, `${JSON.stringify(input)}\nold ${JSON.stringify(old)}\nnew ${JSON.stringify(now)}`).not.toBeNull();
    }
    // The sweep sees both: plenty of identical fits, and each listed difference at least once (so the list is not vacuous).
    expect(same).toBeGreaterThan(2000);
    expect(why["T2 skip"] ?? 0).toBeGreaterThan(0);
    expect(why["menu batch"] ?? 0).toBeGreaterThan(0);
  });

  it("the sample inputs of the 26.11.13 README give the 26.11.13 fits", () => {
    const column = { axis: "column", length: 250, cross: { min: 120, max: 360 } } as const;
    const items = [panel("pages", 1), panel("findings", 2), group("tools", 3)];
    expect(plain(fitStack({ ...column, items }))).toEqual(legacyFit({ ...column, items } as unknown as LegacyInput));
    expect(plain(fitStack({ ...column, items: [group("tools", 3)] }))).toEqual(legacyFit({ ...column, items: [group("tools", 3)] } as unknown as LegacyInput));
  });
});
