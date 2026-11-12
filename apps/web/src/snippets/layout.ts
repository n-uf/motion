import { createFrameLoop } from "@n-uf/motion";
import { createBrowserClock } from "@n-uf/motion/browser";
import { createLayoutMotion, domDrawable } from "@n-uf/motion/layout";

const loop = createFrameLoop({ clock: createBrowserClock() });
const motion = createLayoutMotion({ loop }); // frames run only while something moves

const node = document.querySelector<HTMLElement>("#panel")!;
const panel = motion.add("panel", domDrawable({ node }), { x: 0, y: 0, width: 320, height: 200 });

// Your layout picks the rects. The panel glides from where it is drawn;
// its content is laid out once at 480 px and revealed, never stretched.
document.querySelector("#wider")!.addEventListener("click", () => {
  panel.moveTo({ x: 40, y: 0, width: 480, height: 200 });
});
