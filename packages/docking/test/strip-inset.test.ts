/**
 * `DockItem.countsAsDocked`: whether an item counts as a docked panel for `insetWhen: "docked"`. A side strip (an item
 * whose column form takes room beside the content like a narrow column but is no panel card) declares `false`, so it
 * never switches the inset on; a real docked panel still does. Left out, the old rule holds (first column form `open`,
 * `header` or `rail`); `true` counts an item of another form.
 */
import { describe, expect, it } from "vitest";
import type { StackForm } from "@n-uf/placement/stack";
import { readDockState, solve, storeDockState, type DockEdge, type DockItem, type DockState } from "../src";
import { floatRegion } from "../src/helpers";

const STRIP = 24;
const PAD = 12;
const COLUMN = 280;
const STAGE = { x: 0, y: 0, width: 1400, height: 800 };

const panelForms: StackForm[] = [
  { kind: "open", main: { min: 120, natural: 300, grows: true }, cross: { natural: COLUMN, min: 200 } },
  { kind: "header", main: { min: 32, natural: 32 }, cross: { natural: COLUMN, min: 32 } },
  { kind: "rail", main: { min: 36, natural: 36 }, cross: { natural: 32 } },
];
const stripForm = (kind: StackForm["kind"] = "open"): StackForm => ({ kind, main: { min: 0, natural: 0, grows: true }, cross: { natural: STRIP, min: STRIP }, setsCross: true });

/** Where the strip lies on the right: a column edge of its own, or a toolbar-like edge of its own (not a column). */
type Place = "column" | "edge";
const PLACES: readonly Place[] = ["column", "edge"];

interface Opts {
  readonly panel?: boolean;
  readonly strip?: boolean;
  /** The strip item's `countsAsDocked`; left out when undefined. */
  readonly counts?: boolean;
  /** The strip's first column form kind (default `open`). */
  readonly kind?: StackForm["kind"];
  readonly place?: Place;
}

/** A window with a left panel column and a side strip on the right, each open or closed. */
function scene(o: Opts = {}): DockState {
  const place = o.place ?? "column";
  const panels = { accepts: ["panel"], cross: { min: 200, max: 640, rail: 32 }, gap: PAD };
  const strips = { accepts: ["strip"], cross: { min: STRIP, max: STRIP, rail: STRIP }, gap: 0 };
  const items: Record<string, DockItem> = {
    notes: { id: "notes", kind: "panel", used: 1, forms: { column: panelForms }, ...(o.panel ? {} : { closed: true }) },
    "side-strip": {
      id: "side-strip",
      kind: "strip",
      used: 2,
      forms: { column: [stripForm(o.kind)] },
      ...(o.counts === undefined ? {} : { countsAsDocked: o.counts }),
      ...(o.strip ? {} : { closed: true }),
    },
  };
  const edges: DockEdge[] = [
    { id: "left-0", side: "left", ring: 0, column: true, items: ["notes"], ...panels },
    { id: "right-0", side: "right", ring: 0, items: ["side-strip"], ...(place === "column" ? { column: true } : {}), ...strips },
  ];
  return {
    stage: STAGE,
    edges,
    items,
    floats: [],
    floatKinds: ["panel"],
    columns: { left: panels, right: strips },
    rails: { left: { width: 32, accepts: ["panel"] } },
    contentMin: { width: 320, height: 240 },
    handFold: "ride",
    inset: { top: PAD, right: PAD, bottom: PAD, left: PAD },
    insetWhen: "docked",
    gutter: 0,
  };
}

describe("a side strip: an item with countsAsDocked false", () => {
  for (const place of PLACES) {
    describe(`the strip in a ${place}`, () => {
      it("the case: without the declaration the strip alone switches the inset on (as before)", () => {
        const l = solve(scene({ strip: true, place }));
        expect(l.content).toEqual({ x: PAD, y: PAD, width: 1400 - 2 * PAD - STRIP, height: 800 - 2 * PAD });
        expect(l.items["side-strip"]!.rect).toMatchObject({ y: PAD, height: 800 - 2 * PAD, width: STRIP });
      });

      it("(a) with only the strip open the inset is off: the content is the no-strip content less the strip's width", () => {
        const none = solve(scene({ place, counts: false }));
        expect(none.content).toEqual(STAGE);
        const l = solve(scene({ strip: true, counts: false, place }));
        expect(l.items["side-strip"]!.rect).toEqual({ x: 1400 - STRIP, y: 0, width: STRIP, height: 800 });
        expect(l.content).toEqual({ ...none.content, width: none.content.width - STRIP });
      });

      it("(b) with a docked panel open as well the inset is on, as before", () => {
        const declared = solve(scene({ strip: true, panel: true, counts: false, place }));
        expect(declared).toEqual(solve(scene({ strip: true, panel: true, place })));
        expect(declared.content.y).toBe(PAD);
        expect(declared.content.height).toBe(800 - 2 * PAD);
        expect(declared.items["side-strip"]!.rect).toMatchObject({ x: 1400 - PAD - STRIP, y: PAD, height: 800 - 2 * PAD });
      });

      it("a panel alone brings the inset on, with the strip's declaration or without", () => {
        expect(solve(scene({ panel: true, counts: false, place }))).toEqual(solve(scene({ panel: true, place })));
        expect(solve(scene({ panel: true, counts: false, place })).content.y).toBe(PAD);
      });

      it("a closed strip is not docked either way", () => {
        expect(solve(scene({ place, counts: false })).content).toEqual(STAGE);
        expect(solve(scene({ place })).content).toEqual(STAGE);
      });

      it("the float region follows: the whole stage with only the strip open, less the inset with a panel", () => {
        expect(floatRegion(scene({ strip: true, counts: false, place }))).toEqual(STAGE);
        expect(floatRegion(scene({ strip: true, panel: true, counts: false, place }))).toMatchObject({ x: PAD, width: 1400 - 2 * PAD });
      });

      it("`true` on an item whose first form is no panel's counts it: the inset comes on with it alone", () => {
        for (const kind of ["icons", "row", "stacked"] as const) {
          const plain = solve(scene({ strip: true, kind, place }));
          expect(plain.content.y, `${kind} without it`).toBe(0);
          const counted = solve(scene({ strip: true, kind, counts: true, place }));
          expect(counted.content.y, `${kind} with it`).toBe(PAD);
          expect(floatRegion(scene({ strip: true, kind, counts: true, place })).x).toBe(PAD);
        }
      });
    });
  }

  it("(c) no change for a state without it: the declared default reads as leaving it out", () => {
    for (const place of PLACES)
      for (const panel of [false, true])
        for (const strip of [false, true])
          for (const kind of ["open", "header", "rail", "icons", "row"] as const) {
            const base = scene({ panel, strip, kind, place });
            const declared = scene({ panel, strip, kind, place, counts: kind === "open" || kind === "header" || kind === "rail" });
            expect(solve(declared), `${place} panel ${panel} strip ${strip} ${kind}`).toEqual(solve(base));
          }
  });

  it("a closed or fixed item never counts, whatever it declares", () => {
    const s = scene({ strip: true, kind: "icons", counts: true });
    expect(solve(s).content.y).toBe(PAD);
    const closed: DockState = { ...s, items: { ...s.items, "side-strip": { ...s.items["side-strip"]!, closed: true } } };
    expect(solve(closed).content).toEqual(STAGE);
    const fixed: DockState = { ...s, items: { ...s.items, "side-strip": { ...s.items["side-strip"]!, fixed: true } } };
    expect(solve(fixed).content.y).toBe(0);
  });

  it("it is a declaration: `readDockState` takes it from `base`, `storeDockState` never writes it", () => {
    const base = scene({ strip: true, counts: false });
    const stored = storeDockState(base);
    expect(JSON.stringify(stored)).not.toContain("countsAsDocked");
    const { state } = readDockState(stored, base);
    expect(state.items["side-strip"]!.countsAsDocked).toBe(false);
    expect(solve(state).content).toEqual({ ...STAGE, width: STAGE.width - STRIP });
    // A stored one is dropped, not read.
    const forged = JSON.parse(JSON.stringify(stored)) as { items: Record<string, Record<string, unknown>> };
    forged.items.notes!.countsAsDocked = true;
    const read = readDockState(forged, base);
    expect(read.state.items.notes!.countsAsDocked).toBeUndefined();
  });
});
