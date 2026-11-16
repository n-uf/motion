/** The property check's window generator, shared by the target-model and timing tests. */
import type { Edge, Scene, SceneItem } from "../src/scene";
import { bar, byId, column, controls, group, panel, seeded, title } from "./scene-fixture";

/**
 * A generated window: a top bar (plain or title), a bottom bar, each side one edge kind, maybe a side bar; floats of each
 * kind. `flush`: no inset, rails on both sides, hand folds that ride, and a panel column inside every side bar.
 */
export function modelScene(seed: number, flush = false, middle = false, railDrop = false): Scene {
  const rnd = seeded(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const items: SceneItem[] = [];
  const edges: Edge[] = [];
  let n = 0;
  const g = (): string => {
    const id = `g${n++}`;
    const w = 60 + Math.floor(rnd() * 120);
    items.push({
      ...group(id, Math.floor(rnd() * 50), rnd() < 0.4 ? { align: pick(["start", "center", "end"] as const) } : {}),
      forms: { row: [{ kind: "row", main: { min: w, natural: w }, cross: { natural: 28 } }, { kind: "icons", main: { min: 40, natural: 40 }, cross: { natural: 28 } }, { kind: "menu", main: { min: 0, natural: 0 }, cross: { natural: 0 } }], column: [{ kind: "icons", main: { min: 84, natural: 84 }, cross: { natural: 28 } }, { kind: "menu", main: { min: 0, natural: 0 }, cross: { natural: 0 } }] },
    });
    return id;
  };
  const p = (): string => {
    const id = `p${n++}`;
    items.push(panel(id, Math.floor(rnd() * 50), rnd() < 0.2 ? { from: 1 } : {}, 200 + Math.floor(rnd() * 80)));
    return id;
  };
  const some = (make: () => string, max: number): string[] => (rnd() < 0.35 ? [] : Array.from({ length: 1 + Math.floor(rnd() * max) }, make));
  // Every fifth group made for an edge is closed: a member that draws nothing but still bounds its gaps.
  const gEdge = (): string => {
    const id = g();
    if (n % 5 === 3) items[items.length - 1] = { ...items[items.length - 1]!, closed: true };
    return id;
  };
  // Top: a title bar (title, groups, controls) or a plain bar; bottom: a bar.
  if (rnd() < 0.5) {
    items.push(title(), controls());
    edges.push({ id: "titlebar", side: "top", ring: 0, accepts: ["group"], items: ["title", ...some(gEdge, 2), "controls"], cross: { min: 32, max: 32, rail: 32 } });
  } else edges.push(bar("top", "top", 0, some(gEdge, 3)));
  if (rnd() < 0.7) edges.push(bar("bottom", "bottom", 0, some(gEdge, 2)));
  for (const side of ["left", "right"] as const) {
    const kind = pick(["none", "column", "tray", "rail", "sidebar"] as const);
    if (kind === "column") edges.push(column(`${side}-col`, side, 1, some(p, 2)));
    if (kind === "tray") edges.push(column(`${side}-col`, side, 1, [...some(p, 1), ...some(gEdge, 1)], { accepts: ["panel", "group"], zoneAccepts: { start: ["panel"], end: ["group"] } }));
    if (kind === "rail") edges.push({ id: `${side}-rail`, side, ring: 0, accepts: ["group"], items: some(gEdge, 2), cross: { min: 30, max: 30, rail: 30 }, compact: true });
    if (kind === "sidebar") edges.push({ id: `${side}-bar`, side, ring: 0, accepts: ["group"], items: some(gEdge, 2), cross: { min: 32, max: 32, rail: 32 }, outsideInset: rnd() < 0.5 });
  }
  // Floats of each kind, so every edge has a kind to take.
  const fg = g();
  const fp = p();
  const W = 700 + Math.floor(rnd() * 700);
  const H = 500 + Math.floor(rnd() * 300);
  const inset = rnd() < 0.4 && !flush ? 12 : 0;
  // Every third window has rails: its side columns are dynamic and fold into their rail to keep the content's minimum.
  const rails = seed % 3 === 0 || flush;
  if (flush) {
    for (const side of ["left", "right"] as const) {
      if (!edges.some((e) => e.id === `${side}-bar`)) continue;
      items.push(panel(`${side}-p`, 1));
      edges.push(column(`${side}-col`, side, 1, [`${side}-p`]));
    }
  }
  // `middle`: the side columns and the templates new columns are made from split panels in halves (`hitBand: "middle"`).
  const band = middle ? { hitBand: "middle" as const } : {};
  const cols = edges.map((e) => (e.id.endsWith("-col") ? { ...e, ...band, ...(rails ? { column: true } : {}) } : e));
  // Every fourth window has a thumbnail anchor at the far left: an edge that takes nothing, its fixed item open.
  if (seed % 4 === 1 && !cols.some((e) => e.side === "left" && e.ring === 0)) {
    items.push({ id: "thumbs", kind: "anchor", used: 0, fixed: true, forms: { column: [{ kind: "open", main: { min: 0, natural: 0, grows: true }, cross: { natural: 72, min: 56 }, setsCross: true }] } });
    cols.unshift({ id: "thumbs-edge", side: "left", ring: 0, accepts: [], items: ["thumbs"], cross: { min: 56, max: 200, rail: 30 }, outsideInset: true });
  }
  return {
    stage: { x: 0, y: 0, width: W, height: H },
    edges: cols,
    ...(rails ? { rails: { left: { width: 30, accepts: ["panel"] }, right: { width: 30, accepts: ["panel"] } }, contentMin: { width: flush ? 300 : W - 250, height: 200 } } : {}),
    ...(flush ? { handFold: "ride" as const } : {}),
    // `railDrop`: panels drop into their side's rail through a spring-loaded strip (`Scene.railDrop`).
    ...(railDrop ? { railDrop: { panel: {} } } : {}),
    items: byId(items),
    floats: [
      { id: fg, rect: { x: W / 2, y: H / 2, width: 200, height: 40 } },
      { id: fp, rect: { x: W / 2, y: H / 3, width: 220, height: 200 } },
    ],
    floatKinds: ["group", "panel"],
    columns: { left: { accepts: ["panel"], cross: { min: 160, max: 480, rail: 30 }, ...band }, right: { accepts: ["panel"], cross: { min: 160, max: 480, rail: 30 }, ...band } },
    gutter: 8,
    ...(inset ? { inset: { left: inset, right: inset, top: inset, bottom: inset } } : {}),
  };
}
