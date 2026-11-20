/**
 * A hand fold folds: after `foldItem(state, id, true)`, every item folded by hand is drawn in a folded form (a panel's
 * header, a group's fold, else its rail tile), or a smaller form give-way chose after it (its rail tile, the menu).
 * Never a variant before the folded form (a group's stacked or icons). Swept over the model windows in every mode.
 */
import { describe, expect, it } from "vitest";
import { canFold, foldItem, solve, targets, type DockState } from "../src";
import type { StackForm } from "@n-uf/placement/stack";
import { axisOf, foldedIndex, formsOf, isHandFolded } from "../src/helpers";
import { modelState } from "./model-window";
import { windowState } from "./fixture";

describe("a hand fold is the folded form", () => {
  it("every folded item is in a folded form, or a smaller one give-way chose after it", () => {
    const failures: string[] = [];
    let folded = 0;
    let groups = 0;
    for (const [flush, middle, railDrop] of [
      [false, false, false],
      [true, false, false],
      [false, true, false],
      [true, false, true],
    ] as const)
      for (let seed = 1; seed <= 60; seed++)
        for (const s of [modelState(seed, flush, middle, railDrop), withFoldForms(modelState(seed, flush, middle, railDrop))]) {
        for (const id of Object.keys(s.items)) {
          const it = s.items[id]!;
          if (it.fixed || it.closed || !canFold(s, id)) continue;
          const l = solve(foldItem(s, id, true));
          const at = l.items[id];
          if (!at || at.inMenu) continue;
          const edge = s.edges.find((e) => e.id === at.edge);
          const forms = formsOf(it, edge ? axisOf(edge.side) : (s.floats.find((f) => f.id === id)?.orient ?? (it.kind === "group" ? "row" : "column")));
          const f = foldedIndex(it, forms);
          const ok = at.formKind === "header" || at.formKind === "fold" || (at.form >= f && (at.formKind === "rail" || at.formKind === "menu"));
          folded++;
          if (it.kind === "group") groups++;
          if (!ok) failures.push(`seed ${seed}${flush ? " flush" : ""}${middle ? " middle" : ""}${railDrop ? " strip" : ""}: ${id} folded is ${at.formKind} (form ${at.form}, folded form ${f})`);
          if (at.foldedBy !== "hand" && at.formKind !== "rail") failures.push(`seed ${seed}: ${id} folded by hand reads foldedBy ${at.foldedBy ?? "nothing"}`);
        }
      }
    expect(failures.slice(0, 10)).toEqual([]);
    expect(folded).toBeGreaterThan(500);
    expect(groups).toBeGreaterThan(200);
  });

  // A panel shaped [open, rail] on an open column: no header, and not a fixed anchor, so it has no folded form there.
  const railOnly = (from?: number): DockState => {
    const s = windowState();
    const open = s.items.pages!.forms.column![0]!;
    const rail: StackForm = { kind: "rail", main: { min: 26, natural: 26 }, cross: { natural: 32 } };
    return { ...s, items: { ...s.items, pages: { ...s.items.pages!, forms: { column: [open, rail] }, ...(from ? { from } : {}) } } };
  };

  it("an [open, rail] panel on an open column can't be folded by hand: canFold is false, and it draws no rail form", () => {
    const s = railOnly();
    expect(canFold(s, "pages")).toBe(false);
    expect(foldItem(s, "pages", true)).toBe(s);
    // Stored folded by hand all the same (`from: 1`): it draws open, and nothing reads it as folded.
    const l = solve(railOnly(1));
    expect(l.items.pages).toMatchObject({ formKind: "open", form: 0 });
    expect(l.items.pages!.foldedBy).toBeUndefined();
    expect(isHandFolded(railOnly(1), "pages")).toBe(false);
  });

  it("a stored from: 1 reads as the fold solve draws: the own column's rail drop strip goes only where the item shows folded", () => {
    // A kind with a rail drop policy and no declared rail: each side's outermost column is its rail (`columnStrip`).
    const strip = (s: DockState): DockState => ({ ...s, railDrop: { panel: { railStripWidth: 28 } } });
    const ids = (s: DockState): string[] => targets(strip(s), "pages").map((t) => `${t.id}${t.strip ? "*" : ""}`);
    // No folded form (an [open, rail] panel): `from: 1` is no fold, so the targets are those of the item unfolded.
    expect(ids(railOnly(1))).toEqual(ids(railOnly()));
    // With a header it shows folded: its own column's strip is home (no strip there), the other side's stays.
    const s = windowState();
    expect(ids(s)).toContain("rail:left:0*");
    const folded = ids({ ...s, items: { ...s.items, pages: { ...s.items.pages!, from: 1 } } });
    expect(folded).not.toContain("rail:left:0*");
    expect(folded).toContain("rail:right:0*");
  });
});

/** `s` with every group's row forms row, stacked, icons, fold and menu: variants before the fold a hand fold must skip. */
function withFoldForms(s: DockState): DockState {
  const items = Object.fromEntries(
    Object.entries(s.items).map(([id, it]) => {
      if (it.kind !== "group" || it.fixed || !it.forms.row?.length) return [id, it];
      const [row, ...rest] = it.forms.row;
      const stacked: StackForm = { ...row!, kind: "stacked", main: { min: Math.max(1, row!.main.min * 0.6), natural: Math.max(1, row!.main.natural * 0.6) } };
      const fold: StackForm = { kind: "fold", main: { min: 24, natural: 24 }, cross: { natural: 28 } };
      const menu = rest.filter((f) => f.kind === "menu");
      const icons = rest.filter((f) => f.kind === "icons");
      return [id, { ...it, forms: { ...it.forms, row: [row!, stacked, ...icons, fold, ...menu] } }];
    }),
  );
  return { ...s, items };
}
