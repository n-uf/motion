/**
 * A landing model over a drag, as a host plays it: `createLandingModel({ ...dockDrag(...) })`, each frame with its
 * guides drawn by the drag (`DockDrag.guides`), and a release's commit (`DockDrag.after`).
 */
import { createLandingModel, type LandingFrame, type LandingModel, type LandingOptions } from "@n-uf/motion/drag";
import type { Point } from "@n-uf/placement";
import type { DockAfter, DockDrag, DockGuide } from "../src";

/** A frame as a host draws it: the model's answer with its guides drawn. */
export type DrawnFrame = Omit<LandingFrame, "guides"> & { readonly guides: readonly DockGuide[]; readonly named: LandingFrame["guides"] };

export interface HostModel {
  readonly model: LandingModel;
  readonly drag: DockDrag;
  update(point: Point, time: number, keys?: Parameters<LandingModel["update"]>[2]): DrawnFrame;
  release(point: Point, time: number): ReturnType<LandingModel["release"]>;
  /** What a release now commits: the state's `after`, or null where it lands nowhere or at home. */
  commit(point: Point, time: number): DockAfter | null;
}

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
