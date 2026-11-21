import { createFrameLoop, settleValue } from "@n-uf/motion";
import { createBrowserClock, prefersReducedMotion } from "@n-uf/motion/browser";

const box = document.querySelector<HTMLElement>("#box")!;
const loop = createFrameLoop({ clock: createBrowserClock() });
// 90 % of the way in 92 ms, never past the target; reduced motion lands at once.
const x = settleValue(loop, 0, { reducedMotion: prefersReducedMotion() });

// Written on each change; the loop idles once it rests.
x.subscribe((v) => (box.style.transform = `translateX(${v}px)`));
addEventListener("click", (e) => x.set(e.clientX)); // a retarget goes on from where the box is drawn
