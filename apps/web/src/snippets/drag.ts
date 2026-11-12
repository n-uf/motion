import { createFrameLoop } from "@n-uf/motion";
import { createBrowserClock } from "@n-uf/motion/browser";
import { createDragIntent, type DragTarget } from "@n-uf/motion/drag";

const targets: DragTarget[] = [
  { id: "tabs", priority: 1, hit: { x: 240, y: 0, width: 720, height: 36 } },
  { id: "sidebar", priority: 2, hit: { x: 0, y: 0, width: 240, height: 600 } },
];
const intent = createDragIntent({ home: { x: 600, y: 240, width: 200, height: 120 } });
const indicator = document.querySelector<HTMLElement>("#indicator")!;
let pointer = { x: 700, y: 300 };
addEventListener("pointermove", (e) => (pointer = { x: e.clientX, y: e.clientY }));

// Once a frame, also while the pointer rests: a dwell is time passing.
const loop = createFrameLoop({ clock: createBrowserClock() });
const stop = loop.repeat("input", (frame) => {
  const { shown } = intent.update(pointer, frame.time, targets);
  indicator.hidden = !shown; // only once the pointer aims, no flicker on borders
});
addEventListener("pointerup", () => {
  stop();
  console.log("lands on", intent.release(pointer, targets)?.id ?? "home");
});
