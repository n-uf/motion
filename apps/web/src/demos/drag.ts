/**
 * The drag-intent model's desk: zones drawn for orientation, the drop targets with their hit zone, indicator rect and
 * priority, the dragged panel's home, and the recorded paths. Plain data, shared by the server (which draws the desk)
 * and the island (which runs the model).
 */
export interface R { x: number; y: number; w: number; h: number }
export interface Target { id: string; label: string; prio: number; hit: R; ind?: R; slot?: { x: number; y: number; w: number }; float?: boolean }

export const AIM_SPEED = 0.45, DWELL = 90, STILL = 12, BAND = 10, GAP_GRACE = 120, ROOM_AFTER = 160, LIFT = 5, FLASH = 150;
export const STAGE = { w: 880, h: 400 };

export const ZONES: (R & { cls: string; label: string })[] = [
  { x: 0, y: 0, w: 28, h: 400, cls: "rail", label: "" },
  { x: 34, y: 8, w: 180, h: 170, cls: "panel", label: "Files" },
  { x: 222, y: 8, w: 214, h: 26, cls: "tabs", label: "Quarterly plan · Budget" },
  { x: 222, y: 34, w: 214, h: 330, cls: "doc", label: "" },
  { x: 444, y: 8, w: 214, h: 26, cls: "tabs", label: "Meeting notes" },
  { x: 444, y: 34, w: 214, h: 330, cls: "doc", label: "" },
  { x: 222, y: 370, w: 436, h: 22, cls: "panel", label: "Bottom dock" },
  { x: 666, y: 8, w: 180, h: 130, cls: "panel", label: "Notes" },
  { x: 666, y: 146, w: 180, h: 120, cls: "panel", label: "Inspector" },
  { x: 666, y: 274, w: 180, h: 118, cls: "panel", label: "History" },
  { x: 852, y: 0, w: 28, h: 400, cls: "rail", label: "" },
];
export const ICONS = [
  { x: 3, y: 10, t: "F" }, { x: 3, y: 38, t: "O" },
  { x: 855, y: 10, t: "N" }, { x: 855, y: 38, t: "I" }, { x: 855, y: 66, t: "H" },
];
export const HOME: R = { x: 34, y: 186, w: 180, h: 206 };
export const CHIP_HOME = { x: HOME.x + 15, y: HOME.y + 20 };
export const T: Target[] = [
  { id: "rail-right", label: "Right rail: into the right dock", prio: 1, hit: { x: 852, y: 0, w: 28, h: 400 }, ind: { x: 852, y: 4, w: 28, h: 92 } },
  { id: "rail-left", label: "Left rail: into the left dock", prio: 1, hit: { x: 0, y: 0, w: 28, h: 400 }, ind: { x: 0, y: 4, w: 28, h: 64 } },
  { id: "tab-a", label: "Tab with Quarterly plan", prio: 1, hit: { x: 222, y: 4, w: 214, h: 34 }, ind: { x: 222, y: 6, w: 214, h: 30 } },
  { id: "tab-b", label: "Tab with Meeting notes", prio: 1, hit: { x: 444, y: 4, w: 214, h: 34 }, ind: { x: 444, y: 6, w: 214, h: 30 } },
  { id: "left-under-files", label: "Left dock, under Files", prio: 2, hit: { x: 34, y: 150, w: 180, h: 40 }, slot: { x: 34, y: 180, w: 180 } },
  { id: "right-top", label: "Right dock, above Notes", prio: 2, hit: { x: 666, y: 0, w: 180, h: 30 }, slot: { x: 666, y: 3, w: 180 } },
  { id: "right-notes-inspector", label: "Right dock, between Notes and Inspector", prio: 2, hit: { x: 666, y: 118, w: 180, h: 46 }, slot: { x: 666, y: 141, w: 180 } },
  { id: "right-inspector-history", label: "Right dock, between Inspector and History", prio: 2, hit: { x: 666, y: 248, w: 180, h: 46 }, slot: { x: 666, y: 269, w: 180 } },
  { id: "right-bottom", label: "Right dock, under History", prio: 2, hit: { x: 666, y: 372, w: 180, h: 28 }, slot: { x: 666, y: 394, w: 180 } },
  { id: "bottom", label: "Bottom dock", prio: 2, hit: { x: 222, y: 364, w: 436, h: 36 }, ind: { x: 222, y: 368, w: 436, h: 26 } },
  { id: "float", label: "Float here", prio: 3, hit: { x: 222, y: 38, w: 436, h: 326 }, float: true },
];

// Recorded paths: [time ms, x, y] keyframes, played in real time.
export type Key = [number, number, number];
export interface Path { name: string; expect: string; note: string; keys: Key[] }
export const PATHS: Record<string, Path> = {
  fly: {
    name: "Fly over, then aim",
    expect: "Right dock, between Notes and Inspector",
    note: "Crosses the desk at speed, then slows over the border between Notes and Inspector. No indicator until it slows.",
    keys: [[0, 110, 250], [80, 170, 230], [200, 330, 60], [300, 450, 20], [420, 600, 25], [520, 700, 90], [600, 740, 135], [720, 752, 142], [1100, 754, 141], [1400, 755, 141]],
  },
  jitter: {
    name: "Hold on a border",
    expect: "Right dock, between Notes and Inspector",
    note: "Waggles up and down on that border for a second. The indicator must not flicker.",
    keys: (() => {
      const k: Key[] = [[0, 110, 250], [500, 740, 150]];
      for (let i = 0; i < 14; i++) k.push([620 + i * 70, 745, i % 2 ? 160 : 168]);
      k.push([1700, 745, 160]);
      return k;
    })(),
  },
  flick: {
    name: "Quick flick onto a rail icon",
    expect: "Right rail: into the right dock",
    note: "A fast throw onto the right rail's icon, released before any indicator shows.",
    keys: [[0, 110, 250], [60, 200, 230], [200, 520, 150], [300, 760, 90], [350, 866, 50]],
  },
};
export const CASES: { key: string | null; name: string; note: string }[] = [
  { key: null, name: "Drag it yourself", note: "Resets the stage. Pick up Outline and drag it over the desk with the mouse or touch." },
  ...Object.keys(PATHS).map((key) => ({ key, name: PATHS[key]!.name, note: PATHS[key]!.note })),
];
