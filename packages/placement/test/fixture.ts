/** A sample desk for the tests: five panels with their natural heights, two docks and a bottom dock. */
import type { Rect } from "../index";
import { createDesk, panelKey as P, type Options } from "../src/dock";

export const desk = createDesk({
  panels: [
    { id: 1, title: "Files", natural: 166 },
    { id: 2, title: "Outline", natural: 210 },
    { id: 3, title: "Notes", natural: 122 },
    { id: 4, title: "Inspector", natural: 158 },
    { id: 5, title: "History", natural: 166 },
  ],
  docTitle: (id) => ["Plan", "Notes", "List", "Draft"][(id - 1) % 4]!,
  start: {
    left: [1, 2],
    right: [3, 4],
    bottom: [5],
    active: { left: 1, right: 4 },
    tree: { L: [P(1), P(2)], R: [P(3), P(5)], C: [P(4)] },
    cols: [
      [P(1), P(2)],
      [P(3), P(4), P(5)],
    ],
    stacks: { left: [1, 2], right: [3, 4, 5] },
  },
  opened: [1, 3, 2, 4, 5],
});

export const docs = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

export const TOOLBAR_MODES: Pick<Options, "toolbar" | "toolbarSpace">[] = [
  { toolbar: "top", toolbarSpace: "reserved" },
  { toolbar: "top", toolbarSpace: "overlay" },
  { toolbar: "bottom", toolbarSpace: "reserved" },
  { toolbar: "bottom", toolbarSpace: "overlay" },
];
export const BOTTOM_MODES: Options["bottom"][] = ["reserved", "overlay", "off"];

export const fmt = (r: Rect): string => `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)} × ${Math.round(r.height)}`;
export const sameRect = (a: Rect, b: Rect): boolean => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height)) < 0.5;
export const mid = (r: Rect): { x: number; y: number } => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
export const inRect = (r: Rect, p: { x: number; y: number }): boolean => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

/** A small seeded random source, so a sweep is the same on every run. */
export function seeded(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
