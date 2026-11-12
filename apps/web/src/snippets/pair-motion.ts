import { createFrameLoop } from "@n-uf/motion";
import { createBrowserClock } from "@n-uf/motion/browser";
import { createDragIntent, type DragTarget } from "@n-uf/motion/drag";
import { createLayoutMotion, domDrawable, holdItem } from "@n-uf/motion/layout";

const loop = createFrameLoop({ clock: createBrowserClock() });
const motion = createLayoutMotion({ loop });
const node = document.querySelector<HTMLElement>("#panel")!;
const home = { x: 40, y: 40, width: 240, height: 120 };
const panel = motion.add("panel", domDrawable({ node }), home);
const dock: DragTarget = {
  id: "right",
  priority: 2,
  hit: { x: 600, y: 0, width: 280, height: 480 },
  slot: { x: 620, y: 40, width: 240, height: 120 },
};

// How it moves: held 1:1, a drop shown only once the pointer aims,
// then a settle from where it was let go: into the slot, or home.
const held = holdItem(panel, { x: 20, y: 10 });
const intent = createDragIntent({ home });
let pointer = { x: 60, y: 50 };
addEventListener("pointermove", (e) => {
  held.move((pointer = { x: e.clientX, y: e.clientY }));
});
const stop = loop.repeat("input", (frame) => {
  intent.update(pointer, frame.time, [dock]);
});
addEventListener("pointerup", () => {
  stop();
  intent.update(pointer, performance.now(), [dock]);
  const to = intent.release(pointer, [dock]);
  if (to?.slot) held.land(to.slot);
  else held.cancel(home);
});
