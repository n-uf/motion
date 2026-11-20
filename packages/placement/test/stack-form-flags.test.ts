/**
 * A form's kind is the host's label: `body`, `folded` and `compact` say what `open`, `header`/`fold` and `icons` stand
 * for, and default from the kind, so a form that leaves them out reads as before and one that sets them reads as the
 * kind they stand for, whatever its label.
 */
import { describe, expect, it } from "vitest";
import { fitStack, formBody, formCompact, formFolded, formSetsCross, type StackForm } from "../src/stack";

const f = (kind: StackForm["kind"], extra: Partial<StackForm> = {}): StackForm => ({ kind, main: { min: 30, natural: 30 }, cross: { natural: 260 }, ...extra });

describe("the form flags", () => {
  it("default from the kind", () => {
    expect([formBody(f("open")), formBody(f("header")), formBody(f("row"))]).toEqual([true, false, false]);
    expect([formFolded(f("header")), formFolded(f("fold")), formFolded(f("open")), formFolded(f("icons"))]).toEqual([true, true, false, false]);
    expect([formCompact(f("icons")), formCompact(f("row")), formCompact(f("rail"))]).toEqual([true, false, false]);
    expect([formSetsCross(f("open")), formSetsCross(f("header")), formSetsCross(f("open", { setsCross: false }))]).toEqual([true, false, false]);
  });

  it("set by the host, they win over the kind", () => {
    expect(formBody(f("row", { body: true }))).toBe(true);
    expect(formBody(f("open", { body: false }))).toBe(false);
    expect(formFolded(f("row", { folded: true }))).toBe(true);
    expect(formFolded(f("header", { folded: false }))).toBe(false);
    expect(formCompact(f("stacked", { compact: true }))).toBe(true);
    expect(formCompact(f("icons", { compact: false }))).toBe(false);
  });

  it("a form with `body` sets the stack's cross size whatever its kind; one without doesn't", () => {
    const fit = (form: StackForm) => fitStack({ axis: "column", length: 400, cross: { min: 100, max: 400, rail: 30 }, items: [{ id: "a", used: 1, forms: [form] }] }).cross;
    expect(fit(f("open"))).toBe(260);
    expect(fit(f("row", { body: true }))).toBe(260);
    expect(fit(f("open", { body: false }))).toBe(30);
  });
});
