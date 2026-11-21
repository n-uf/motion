/**
 * Kit-shaped windows: dynamic panel columns on both sides, a 32 px rail each side, hand folds that ride, and maybe a
 * thumbnail anchor (72 px) at the left. `INSET` is an inset window (12 px inset and gaps, the inset only while a panel
 * is docked); `FLUSH` has none. The names are generic.
 */
import type { DockEdge, DockState, DockItem } from "../src";
import type { StackForm } from "@n-uf/placement/stack";

export interface KitShape {
  readonly card: { readonly min: number; readonly max: number; readonly natural: number };
  readonly gap: number;
  readonly pad: number;
  readonly rail: number;
  readonly bar: number;
  readonly docked?: boolean;
}
export const INSET: KitShape = { card: { min: 220, max: 640, natural: 300 }, gap: 12, pad: 12, rail: 32, bar: 32, docked: true };
export const FLUSH: KitShape = { card: { min: 200, max: 560, natural: 280 }, gap: 0, pad: 0, rail: 32, bar: 38 };

export function kitState(k: KitShape, o: { W?: number; H?: number; left?: string[][]; right?: string[][]; anchor?: boolean } = {}): DockState {
  const ids = ["pages", "notes", "findings"];
  const forms: StackForm[] = [
    { kind: "open", main: { min: 120, natural: 300, grows: true }, cross: { natural: k.card.natural, min: k.card.min } },
    { kind: "header", main: { min: k.bar, natural: k.bar }, cross: { natural: k.card.natural, min: k.rail } },
    { kind: "rail", main: { min: 36, natural: 36 }, cross: { natural: k.rail } },
  ];
  const items: Record<string, DockItem> = {};
  ids.forEach((id, i) => (items[id] = { id, kind: "panel", used: i + 1, forms: { column: forms }, floatSizes: { column: { width: k.card.natural, height: 440 } }, floatMin: { width: k.card.min, height: 160 } }));
  const template = { accepts: ["panel"], cross: { min: k.card.min, max: k.card.max, rail: k.rail }, gap: k.gap };
  const edges: DockEdge[] = [];
  if (o.anchor) {
    edges.push({ id: "anchor:thumbs", side: "left", ring: 0, accepts: [], items: ["thumbs"], cross: { min: 56, max: 200, rail: k.rail }, outsideInset: true, giveWay: true });
    items.thumbs = {
      id: "thumbs",
      kind: "anchor",
      used: 0,
      fixed: true,
      forms: {
        column: [
          { kind: "open", main: { min: 0, natural: 0, grows: true }, cross: { natural: 72, min: 56 }, setsCross: true },
          { kind: "header", main: { min: 36, natural: 36 }, cross: { natural: k.rail, min: k.rail } },
          { kind: "rail", main: { min: 36, natural: 36 }, cross: { natural: k.rail } },
        ],
      },
    };
  }
  const dyn = (side: "left" | "right", list: string[][]): DockEdge[] => list.map((members, i) => ({ id: `${side}-${i}`, side, ring: i, column: true, items: members, ...template }));
  edges.push(...dyn("left", o.left ?? [["pages", "notes"]]), ...dyn("right", o.right ?? [["findings"]]));
  return {
    stage: { x: 0, y: 0, width: o.W ?? 1440, height: o.H ?? 900 },
    edges,
    items,
    floats: [],
    floatKinds: ["panel"],
    columns: { left: template, right: template },
    rails: { left: { width: k.rail, accepts: ["panel"] }, right: { width: k.rail, accepts: ["panel"] } },
    contentMin: { width: 320, height: 240 },
    handFold: "ride",
    inset: { top: k.pad, right: k.pad, bottom: k.pad, left: k.pad },
    ...(k.docked ? { insetWhen: "docked" as const } : {}),
    gutter: k.gap,
  };
}
