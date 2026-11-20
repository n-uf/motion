import { solve, targets, type DockItem, type DockState } from "@n-uf/docking";

// A toolbar group's forms along a bar, largest first: its row, its icons, the » menu.
const group = (id: string, used: number): DockItem => ({
  id,
  kind: "group",
  used,
  forms: {
    row: [
      { kind: "row", main: { min: 120, natural: 120 }, cross: { natural: 28 } },
      { kind: "icons", main: { min: 30, natural: 30 }, cross: { natural: 28 } },
      { kind: "menu", main: { min: 0, natural: 0 }, cross: { natural: 0 } },
    ],
  },
});
const state: DockState = {
  stage: { x: 0, y: 0, width: 320, height: 240 },
  edges: [{ id: "top", side: "top", ring: 0, accepts: ["group"], items: ["file", "edit", "share"], cross: { min: 42, max: 42 }, pad: { start: 8, end: 8 } }],
  items: { file: group("file", 3), edit: group("edit", 2), share: { ...group("share", 1), align: "end" } },
  floats: [],
  floatKinds: [],
};

// Where things go: every item's rect and form; when the bar runs out
// of room, the group used longest ago steps down first.
const layout = solve(state);
console.log(layout.items.share?.formKind); // icons

// Where "edit" may land: every gap, each with the layout a release
// there makes, the targets @n-uf/motion/drag takes. Its own place is home.
console.log(targets(state, "edit").map((t) => `${t.id} p${t.priority}`));
// gap:top:start:1 p2, gap:top:start:0 p2, gap:top:end:0 p2, gap:top:end:1 p2, home:edit p1
