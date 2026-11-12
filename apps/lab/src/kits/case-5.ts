/**
 * 5 · Drop preview in a dossier: the same drag, three ways of showing where the group lands, through
 * @n-uf/motion/drag's `previewPlan(frame, mode)`: Drop indicator (nothing moves, the outline over the insertion
 * point), Open gap (after 160 ms the neighbours move aside), Snap to slot (the gap opens and the group glides into it).
 * The slot is always the group's own outline. Next to them, today's kit drag: a 3 px line at the nearest insertion
 * point, shown wherever the pointer is.
 */
import type { Point, Rect } from "@n-uf/motion";
import type { DragPreview } from "@n-uf/motion/drag";
import { arrangement, type Arrangement } from "@n-uf/placement/toolbar";
import { nextFrame } from "../shared/geometry";
import { HOME, createDossier, type Dossier, type GroupId } from "./dossier";
import { fmt, mid, off, pointer, settle } from "./drive";
import { allIdle, caseFrame, type Expect, type KitCase, type KitScenario } from "./kit-case";

const RULE = `Drag a handle in any window. <b>Today</b>: no preview motion; a 3 px line marks the insertion point under the
pointer on the last move, and the group lands there. <b>Proposed</b>: <code>previewPlan(frame, mode)</code> with the mode
picked here; whatever the mode, the slot is the group's own outline (dashed, tinted), it shows only while you aim, holds
150 ms before switching, and a release lands where it shows. The second row is a side edge, where the groups take their
compact column form.`;

const MODES: readonly DragPreview[] = ["indicator", "gap", "snap"];
const MODE_NAME: Record<DragPreview, string> = { indicator: "Drop indicator", gap: "Open gap", snap: "Snap to slot" };
/** The side edge, sparse (three groups that fit) and dense (five: some fold to handle + »). */
const EDGE: Record<"sparse" | "dense", Arrangement<GroupId>> = {
  sparse: arrangement<GroupId>({ title: { end: ["share"] }, top: { start: ["navigate"] }, left: { start: ["zoom", "annotate", "redact"] } }),
  dense: arrangement<GroupId>({ left: { start: ["navigate", "zoom", "annotate"], end: ["redact", "share"] } }),
};

export const case5: KitCase = {
  id: "preview",
  title: "5 · Drop preview",
  mount(host, loop) {
    let mode: DragPreview = "snap";
    let edge: "sparse" | "dense" = "sparse";
    const desks = caseFrame(
      host,
      RULE,
      [
        { id: "today", caption: "Top bar · today, a hairline" },
        { id: "top", caption: "Top bar · proposed, the mode picked" },
        { id: "edgeToday", caption: "Side edge · today" },
        { id: "edge", caption: "Side edge · proposed" },
      ],
      () => reset(),
    );
    const today = createDossier(desks.today!, { title: "Quarterly plan.pdf", loop, today: true });
    const top = createDossier(desks.top!, { title: "Quarterly plan.pdf", loop, preview: () => mode });
    let edgeToday = createDossier(desks.edgeToday!, { title: "Quarterly plan.pdf", loop, today: true, home: EDGE[edge] });
    let edgeWin = createDossier(desks.edge!, { title: "Quarterly plan.pdf", loop, preview: () => mode, home: EDGE[edge] });
    const all = (): Dossier[] => [today, top, edgeToday, edgeWin];

    const controls = desks.today!.closest(".kcase")!.querySelector(".controls")!;
    const modes = document.createElement("fieldset");
    modes.innerHTML = `<legend>Preview mode</legend>${MODES.map((m) => `<label><input type="radio" name="c5-mode" value="${m}"${m === mode ? " checked" : ""} /> ${MODE_NAME[m]}</label>`).join("")}`;
    const edges = document.createElement("fieldset");
    edges.innerHTML = `<legend>Side edge holds</legend><label><input type="radio" name="c5-edge" value="sparse" checked /> 3 groups (sparse)</label><label><input type="radio" name="c5-edge" value="dense" /> 5 groups (dense)</label>`;
    controls.prepend(modes, edges);
    function setMode(m: DragPreview): void {
      mode = m;
      modes.querySelectorAll<HTMLInputElement>("input").forEach((i) => (i.checked = i.value === m));
    }
    /** The side-edge windows start from another arrangement: build them anew. */
    function setEdge(e: "sparse" | "dense"): void {
      if (e === edge) return;
      edge = e;
      edges.querySelectorAll<HTMLInputElement>("input").forEach((i) => (i.checked = i.value === e));
      desks.edgeToday!.replaceChildren();
      desks.edge!.replaceChildren();
      edgeToday = createDossier(desks.edgeToday!, { title: "Quarterly plan.pdf", loop, today: true, home: EDGE[e] });
      edgeWin = createDossier(desks.edge!, { title: "Quarterly plan.pdf", loop, preview: () => mode, home: EDGE[e] });
    }
    function reset(): void {
      for (const d of all()) d.reset();
    }
    modes.addEventListener("change", (e) => setMode((e.target as HTMLInputElement).value as DragPreview));
    edges.addEventListener("change", (e) => setEdge((e.target as HTMLInputElement).value as "sparse" | "dense"));

    return {
      reset: () => {
        setMode("snap");
        setEdge("sparse");
        reset();
      },
      idle: async () => allIdle(all())(),
      scenarios: scenarios({ today: () => today, top: () => top, edgeToday: () => edgeToday, edge: () => edgeWin, setMode, setEdge }),
    };
  },
};

interface Windows {
  readonly today: () => Dossier;
  readonly top: () => Dossier;
  readonly edgeToday: () => Dossier;
  readonly edge: () => Dossier;
  readonly setMode: (m: DragPreview) => void;
  readonly setEdge: (e: "sparse" | "dense") => void;
}

/** One frame of a drag as the page drew it: the slot, the dragged group, the others. */
interface Frame {
  readonly t: number;
  readonly p: Point;
  readonly slot: Rect | null;
  readonly item: Rect;
  readonly others: ReadonlyMap<GroupId, Rect>;
}

/**
 * Drag `g` in `d` to `to`: fly most of the way, aim the last stretch, hold `holdMs`, release. Every frame is recorded
 * from what the page drew. Returns the frames, the frames of the hold, and the slot the page showed at the release.
 */
async function dragTo(d: Dossier, g: GroupId, to: Point, holdMs = 520): Promise<{ frames: Frame[]; hold: Frame[]; slotAtRelease: Rect | null; grab: Point }> {
  const h = d.handle(g);
  const home = d.drawn(d.groupEl(g));
  const start = mid(d.drawn(h));
  const grab = { x: start.x - home.x, y: start.y - home.y };
  const others = (): Map<GroupId, Rect> => new Map((["navigate", "zoom", "annotate", "redact", "share"] as const).filter((x) => x !== g).map((x) => [x, d.drawn(d.groupEl(x))]));
  pointer("pointerdown", h, d.toClient(start));
  const frames: Frame[] = [];
  const near = { x: to.x - (to.x - start.x) * 0.15, y: to.y - (to.y - start.y) * 0.15 };
  const legs: [Point, Point, number][] = [[start, near, 10], [near, to, 18]];
  for (const [a, b, n] of legs) {
    for (let i = 1; i <= n; i++) {
      await nextFrame();
      const p = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
      pointer("pointermove", window, d.toClient(p));
      frames.push({ t: performance.now(), p, slot: d.slot(), item: d.drawn(d.groupEl(g)), others: others() });
    }
  }
  const t0 = performance.now();
  const hold: Frame[] = [];
  while (performance.now() - t0 < holdMs) {
    await nextFrame();
    pointer("pointermove", window, d.toClient(to));
    const f = { t: performance.now(), p: to, slot: d.slot(), item: d.drawn(d.groupEl(g)), others: others() };
    frames.push(f);
    hold.push(f);
  }
  const slotAtRelease = d.slot();
  pointer("pointerup", window, d.toClient(to));
  return { frames, hold, slotAtRelease, grab };
}

function scenarios(w: Windows): KitScenario[] {
  /** In `mode`, drag `g` to `to` in `d`: check the preview the mode promises and that it lands on its outline. */
  async function inMode(expect: Expect, d: Dossier, mode: DragPreview, g: GroupId, aim: (d: Dossier) => Point, where: string): Promise<void> {
    w.setMode(mode);
    d.reset();
    await settle(d);
    const before = new Map((["navigate", "zoom", "annotate", "redact", "share"] as const).map((x) => [x, d.drawn(d.groupEl(x))]));
    // Where to aim, read from the window as it starts (after the reset).
    const r = await dragTo(d, g, aim(d));
    await settle(d);
    const landed = d.drawn(d.groupEl(g));
    const slot = r.slotAtRelease;
    const tag = `${MODE_NAME[mode]}, ${where}`;
    expect(!!slot, `${tag}: no outline showed while aiming`);
    if (!slot) return;
    expect(Math.min(slot.width, slot.height) >= 6, `${tag}: the outline is ${fmt(slot)}, a hairline`);
    expect(off(landed, slot) < 1.5, `${tag}: landed at ${fmt(landed)}, the outline was ${fmt(slot)}`);
    expect(d.lastDrag()?.landed !== null, `${tag}: it went home`);
    const late = r.hold.slice(-6);
    const moved = (f: Frame): string[] => [...f.others].filter(([x, rr]) => off(rr, before.get(x)!) > 1.5).map(([x]) => x);
    if (mode === "indicator") {
      const m = r.hold.flatMap(moved);
      expect(m.length === 0, `${tag}: ${[...new Set(m)].join(", ")} moved; the indicator moves nothing`);
    } else {
      expect(late.some((f) => moved(f).length > 0), `${tag}: the neighbours never moved aside`);
    }
    // Snap: the group sits in its slot; indicator and gap: it stays under the pointer (turned into a column over a
    // side edge, so the pointer is on it rather than at the same grab offset).
    const f = late.at(-1)!;
    const under = f.p.x >= f.item.x - 1 && f.p.x <= f.item.x + f.item.width + 1 && f.p.y >= f.item.y - 1 && f.p.y <= f.item.y + f.item.height + 1;
    if (mode === "snap") expect(off(f.item, f.slot ?? f.item) < 1.5, `${tag}: the group is at ${fmt(f.item)}, not in its slot ${fmt(f.slot)}`);
    else expect(under, `${tag}: the group (${fmt(f.item)}) isn't under the pointer (${Math.round(f.p.x)},${Math.round(f.p.y)})`);
  }

  /** The top bar's end zone, between Annotate and Redact. */
  const between = (d: Dossier): Point => {
    const a = d.drawn(d.groupEl("annotate"));
    const b = d.drawn(d.groupEl("redact"));
    return { x: (a.x + a.width + b.x) / 2, y: a.y + a.height / 2 };
  };

  return [
    {
      name: "5 · Top bar, each mode: the outline is the group's own, the preview is the mode's, and the drop lands on the outline",
      play: async (expect) => {
        for (const m of MODES) await inMode(expect, w.top(), m, "zoom", between, "Zoom between Annotate and Redact");
        w.setMode("snap");
      },
    },
    {
      name: "5 · Side edge (sparse and dense), each mode: a column outline, the mode's preview, the drop on the outline, nothing off the edge",
      play: async (expect) => {
        for (const e of ["sparse", "dense"] as const) {
          w.setEdge(e);
          const d = w.edge();
          await settle(d);
          // Into the left edge, between its first two groups.
          const g: GroupId = e === "sparse" ? "navigate" : "share";
          // Between the column's first two groups.
          const aim = (dd: Dossier): Point => {
            const col = (["zoom", "annotate", "redact", "navigate"] as const).filter((x) => x !== g).map((x) => dd.drawn(dd.groupEl(x))).filter((r) => r.x < 40);
            col.sort((p, q) => p.y - q.y);
            return { x: col[0]!.x + col[0]!.width / 2, y: (col[0]!.y + col[0]!.height + col[1]!.y) / 2 };
          };
          for (const m of MODES) {
            await inMode(expect, d, m, g, aim, `${e} edge, ${g} into the column`);
            const edge = d.drawn(d.el.querySelector(".kbar-left")!);
            const out = (["navigate", "zoom", "annotate", "redact", "share"] as const).filter((x) => {
              const r = d.drawn(d.groupEl(x));
              return r.x < edge.x + edge.width && (r.y < edge.y - 0.5 || r.y + r.height > edge.y + edge.height + 0.5);
            });
            expect(out.length === 0, `${e} edge, ${MODE_NAME[m]}: ${out.join(", ")} spill off the edge`);
          }
        }
        w.setEdge("sparse");
        w.setMode("snap");
      },
    },
    {
      name: "5 · Today: a 3 px line at the insertion point under the pointer, shown even while flying, and the group lands there",
      play: async (expect) => {
        const d = w.today();
        d.reset();
        await settle(d);
        const r = await dragTo(d, "zoom", between(d));
        await settle(d);
        const lines = r.frames.filter((f) => f.slot);
        expect(lines.length > 0 && lines.every((f) => Math.min(f.slot!.width, f.slot!.height) <= 3.5), `the line is ${fmt(lines.find((f) => Math.min(f.slot!.width, f.slot!.height) > 3.5)?.slot ?? null)}`);
        // Flying (the first leg, fast): today shows the line anyway.
        expect(r.frames.slice(0, 10).some((f) => f.slot), "today showed nothing while the pointer flew over the bar");
        expect(d.arrangement().top.end.includes("zoom"), `Zoom didn't land in the top bar's end zone: ${JSON.stringify(d.arrangement().top)}`);
        expect(JSON.stringify(HOME.top.end) !== JSON.stringify(d.arrangement().top.end), "nothing changed");
      },
    },
  ];
}
