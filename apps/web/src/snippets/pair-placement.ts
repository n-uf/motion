import { arrangement, layoutHost } from "@n-uf/placement/toolbar";
import { hostTargets } from "@n-uf/placement/targets";

const bar = arrangement({ top: { start: ["file", "edit"], end: ["share"] } });
const spec = { length: 320, thickness: 42, lead: 8, tail: 8 };
const size = (_id: string, _vertical: boolean, collapsed: boolean) => ({
  along: collapsed ? 30 : 120,
  across: 28,
});

// Where things go: each group's rect in the top bar; when the bar runs
// out of room, trailing groups collapse first.
const top = layoutHost(bar.top, "top", spec, size);
console.log(top.overflow); // [ 'share' ]

// Where "edit" may land: insertion lines and empty zones, the targets
// @n-uf/motion/drag takes. Its own place is home, never a target.
const { targets } = hostTargets({
  group: "edit",
  arrangement: bar,
  host: "top",
  origin: { x: 0, y: 0 },
  spec,
  size,
});
console.log(targets.map((t) => `${t.id} p${t.priority}`));
// g:top:start:0 p2, g:top:center:0 p1, g:top:end:0 p2, g:top:end:1 p2
