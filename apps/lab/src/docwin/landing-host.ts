/**
 * The window as a host for the landing rows (`@n-uf/docking/testing`' `LANDING_CASES`): each row's state loaded
 * into the window under the landing model (`"landing"`), its path played on the window's own drag session a frame every
 * 1/60 s (the pointer held at the end through the rest, the same point every frame), each frame's landing read back.
 */
import type { Point } from "@n-uf/placement";
import type { LandingCase, LandingCaseFrame, LandingCaseHost } from "@n-uf/docking/testing";
import type { ItemId } from "./model";
import type { Docwin } from "./dock-state";

const FRAME = 1000 / 60;
const T0 = 10_000;

export function createDocwinLandingHost(c: Docwin): LandingCaseHost {
  return {
    play(row: LandingCase) {
      c.setBehavior("landing");
      c.setDropPreview("item");
      c.setState(row.state);
      const press = row.path[0]!;
      const frames: LandingCaseFrame[] = [];
      c.drive(true);
      try {
        if (!c.begin(row.item as ItemId, press, press, T0)) throw new Error(`${row.item} doesn't lift`);
        let t = 0;
        let at: Point = press;
        const read = (moving: boolean): void => {
          c.move(at);
          c.frame(T0 + t);
          const f = c.landingFrame;
          // A frame the window didn't play on the landing model is a broken host, not a frame to skip.
          if (!f) throw new Error(`no landing frame at ${Math.round(at.x)},${Math.round(at.y)} (t ${Math.round(t)})`);
          frames.push({ t, point: at, moving, region: f.region, lane: f.lane, spot: f.spot, landing: f.landing, room: f.room, guides: f.guides, ...(f.pending ? { pending: f.pending } : {}) });
        };
        for (let i = 1; i < row.path.length; i++) {
          const a = row.path[i - 1]!;
          const b = row.path[i]!;
          const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / row.speed / FRAME));
          for (let k = 1; k <= n; k++) {
            t += FRAME;
            at = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
            read(true);
          }
        }
        for (let r = FRAME; r <= (row.rest ?? 0); r += FRAME) {
          t += FRAME;
          read(false);
        }
        c.release(T0 + t + FRAME);
      } finally {
        c.drive(false);
      }
      // The stretch positions the window played under (the rows' checker reads the spots as the host asked for them).
      return { frames, layout: c.layout, stretchPositions: c.stretchPositions };
    },
  };
}
