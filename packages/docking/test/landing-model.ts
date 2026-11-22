/**
 * A landing model over a drag, as a host plays it: `createLandingModel({ ...dockDrag(...) })`, each frame with its
 * guides drawn by the drag (`DockDrag.guides`), and a release's commit (`DockDrag.after`).
 */
import { createLandingModel, type DragPreview, type LandingFrame, type LandingModel, type LandingOptions, type PlaceGuides } from "@n-uf/motion/drag";
import type { Point } from "@n-uf/placement";
import type { DockAfter, DockDrag, DockGuide } from "../src";

/** A frame as a host draws it: the model's answer with its guides drawn. */
export type DrawnFrame = Omit<LandingFrame, "guides"> & { readonly guides: readonly DockGuide[]; readonly named: LandingFrame["guides"] };

export interface HostModel {
  readonly model: LandingModel;
  readonly drag: DockDrag;
  update(point: Point, time: number, keys?: Parameters<LandingModel["update"]>[2]): DrawnFrame;
  release(point: Point, time: number): ReturnType<LandingModel["release"]>;
  /** What a release now commits: the held place's `after`, or null where it lands nowhere or at home. */
  commit(point: Point, time: number): DockAfter | null;
}

/** A preview that names `level` as its guide level (the mode is beside the point: the model reads only the level). */
export const guided = (level: PlaceGuides): DragPreview => ({ mode: "placeholder", placeGuides: level });

/** The model over `drag` as a host wires it: the drag as it is (its `home` too), and the preview. */
export function modelOver(drag: DockDrag, more: Omit<LandingOptions, "regions" | "landingOf" | "spotsOf"> = {}): HostModel {
  const model = createLandingModel({ ...drag, ...more });
  const drawn = (f: LandingFrame): DrawnFrame => ({ ...f, guides: drag.guides(f), named: f.guides });
  return {
    model,
    drag,
    update: (p, t, keys) => drawn(model.update(p, t, keys)),
    release: (p, t) => model.release(p, t),
    commit: (p, t) => {
      const r = model.release(p, t);
      return r && !(r.kind === "spot" && r.home) ? drag.after(r) : null;
    },
  };
}
