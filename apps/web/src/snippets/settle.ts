import { createFrameLoop, createSettle } from "@n-uf/motion";
import { createBrowserClock } from "@n-uf/motion/browser";

const box = document.querySelector<HTMLElement>("#box")!;
const loop = createFrameLoop({ clock: createBrowserClock() });
const x = createSettle(0); // 90 % of the way in 92 ms, never past the target
let moving = false;

addEventListener("click", (e) => {
  x.setTarget(e.clientX); // a retarget goes on from where the box is drawn
  if (moving) return;
  moving = true;
  loop.repeat("write", (frame) => {
    moving = x.step(frame.delta);
    box.style.transform = `translateX(${x.value}px)`;
    return moving; // the loop idles once it rests
  });
});
