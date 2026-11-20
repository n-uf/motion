/**
 * The scenes of the rail-entry tests: a real document window (`fixtures/side-rails-empty-scene.json`) and a library
 * window, each with an empty toolbar rail beside a panel column on both sides.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Scene, SceneItem } from "../src/scene";
import { bar, byId, column, form, group, panel } from "./scene-fixture";

const here = dirname(fileURLToPath(import.meta.url));
/** The real window: 868 × 630, empty rails of 30 px beside the columns, `tools` floating, `panels` in the bottom bar. */
export const realScene = (): Scene => JSON.parse(readFileSync(join(here, "fixtures", "side-rails-empty-scene.json"), "utf8")) as Scene;

/** A rail as the library declares it: `width` px, a toolbar's icons form `width` wide. */
export function libraryScene(width: number): Scene {
  const icons = (w: number): SceneItem["forms"]["column"] => [form("icons", 84, 84, w), form("menu", 0, 0, 0)];
  const g = (id: string, used: number): SceneItem => ({ ...group(id, used), forms: { ...group(id, used).forms, column: icons(width) } });
  const rail = (id: string, side: "left" | "right"): Scene["edges"][number] => ({ id, side, ring: 0, accepts: ["group"], items: [], cross: { min: width, max: width, rail: width }, compact: true, zones: ["start"] });
  return {
    stage: { x: 0, y: 0, width: 1080, height: 640 },
    edges: [
      bar("bottom", "bottom", 0, ["tools", "zoom"]),
      rail("rail-left", "left"),
      rail("rail-right", "right"),
      column("left-0", "left", 1, ["pages"], { column: true, accepts: ["panel"], cross: { min: 200, max: 480, rail: 32 }, gap: 12, hitBand: "middle" }),
      column("right-0", "right", 1, ["findings"], { column: true, accepts: ["panel"], cross: { min: 200, max: 480, rail: 32 }, gap: 12, hitBand: "middle" }),
    ],
    items: byId([g("tools", 1), g("zoom", 2), panel("pages", 3), panel("findings", 4)]),
    floats: [],
    floatKinds: ["group"],
  };
}


/** The real scene with its rails and the held toolbar's icons form `width` wide. */
export function realWith(width: number): Scene {
  const s = realScene();
  return {
    ...s,
    edges: s.edges.map((e) => (e.id === "bar:left" || e.id === "bar:right" ? { ...e, cross: { min: width, max: width, rail: width } } : e)),
    items: Object.fromEntries(Object.entries(s.items).map(([id, it]) => [id, id === "tools" || id === "panels" ? { ...it, forms: { ...it.forms, column: (it.forms.column ?? []).map((f) => (f.kind === "icons" ? { ...f, cross: { ...f.cross, natural: width } } : f)) } } : it])),
  } as Scene;
}

