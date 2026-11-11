/**
 * The desk page's scripted scenarios: each sets a construction, a stage size and options up, plays a few moves
 * through the page (`DeskLab`) and states what it expects; the page records and checks every frame of every move.
 */
import type { Rect } from "@n-uf/motion";
import { overlap, type Point } from "../shared/geometry";
import { CONSTRUCTIONS, type ConstructionId } from "./layouts";
import { LAYER, type DeskState, type Layout, type Options, type Side, type Size } from "./model";

/** What a scenario can do to the page and read from it. */
export interface DeskLab {
  construction(): ConstructionId;
  state(): DeskState;
  layout(): Layout;
  size(): Size;
  options(): Options;
  use(id: ConstructionId): void;
  setOptions(o: Partial<Options>): void;
  setSize(width: number, height: number): void;
  open(): void;
  close(): void;
  fold(id: number): void;
  icon(side: Side, id: number): void;
  tab(side: Side, id: number): void;
  focus(id: number): void;
  /** The item's rect as drawn now, or null when it isn't on the desk. */
  drawn(key: string): Rect | null;
  /** The item is fully shown (not folded away, not fading). */
  shown(key: string): boolean;
  /** Resolves once everything rests. */
  idle(): Promise<void>;
  /** A scripted drag: lift `key` at its grip, glide the pointer to `to()` (read after the lift), then release (or Escape at a step). */
  drag?(key: string, to: () => Point, opts?: { escapeAt?: number }): Promise<void>;
}

export type Expect = (ok: boolean, failure: string) => void;

export interface Scenario {
  readonly construction?: ConstructionId;
  readonly size?: readonly [number, number];
  readonly options?: Partial<Options>;
  readonly docs?: number;
  /** It only checks pure layouts: nothing has to move. */
  readonly still?: boolean;
  readonly play: (expect: Expect) => Promise<void>;
}

const sameRect = (a: Rect, b: Rect): boolean => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height)) < 0.5;
const fmt = (r: Rect): string => `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)} × ${Math.round(r.height)}`;

/** Everything shown rests where the layout puts it. */
export function settledAsLaidOut(lab: DeskLab, expect: Expect): void {
  for (const [key, p] of lab.layout().items) {
    if (p.hidden) continue;
    const d = lab.drawn(key);
    expect(!!d && sameRect(d, p.rect), `${key} rests at ${d ? fmt(d) : "nowhere"}, laid out at ${fmt(p.rect)}`);
    expect(lab.shown(key), `${key} isn't fully shown`);
  }
}

const TOOLBAR_MODES: Partial<Options>[] = [
  { toolbar: "top", toolbarSpace: "reserved" },
  { toolbar: "top", toolbarSpace: "overlay" },
  { toolbar: "bottom", toolbarSpace: "reserved" },
  { toolbar: "bottom", toolbarSpace: "overlay" },
];
const BOTTOM_MODES: Options["bottom"][] = ["reserved", "overlay", "off"];

/**
 * A pure layout's promises: every shown item inside the stage (unless it may scroll off), at least its minimum, a
 * real rect; items on the documents' and docks' layers never overlap; a reserved toolbar covers no document.
 */
export function layoutFailures(l: Layout, size: Size, opt: Options, what: string): string[] {
  const out: string[] = [];
  const shown = [...l.items].filter(([, p]) => !p.hidden);
  for (const [key, p] of shown) {
    const r = p.rect;
    if (![r.x, r.y, r.width, r.height].every(Number.isFinite) || r.width <= 0 || r.height <= 0) out.push(`${what}: ${key} at ${fmt(r)}`);
    else if (!p.offStage && (r.x < -0.5 || r.y < -0.5 || r.x + r.width > size.width + 0.5 || r.y + r.height > size.height + 0.5)) out.push(`${what}: ${key} at ${fmt(r)} leaves the stage`);
    const min = p.min;
    if (min && ((min.width !== undefined && r.width < min.width - 0.5) || (min.height !== undefined && r.height < min.height - 0.5))) out.push(`${what}: ${key} ${Math.round(r.width)} × ${Math.round(r.height)} is below its minimum`);
  }
  const flat = shown.filter(([, p]) => p.layer <= LAYER.dock && p.look !== "rail");
  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      const [ka, a] = flat[i]!;
      const [kb, b] = flat[j]!;
      if (overlap(a.rect, b.rect) > 1) out.push(`${what}: ${ka} overlaps ${kb}`);
    }
  }
  const tb = l.items.get("toolbar");
  if (tb && tb.look === "pill" && opt.toolbarSpace === "reserved") {
    for (const [key, p] of shown) if (key.startsWith("doc:") && overlap(p.rect, tb.rect) > 1) out.push(`${what}: the reserved toolbar covers ${key}`);
  }
  return out;
}

export function makeScenarios(lab: DeskLab): Record<string, Scenario> {
  const scenarios: Record<string, Scenario> = {
    "layouts: every construction, size and mode keeps its promises": {
      still: true,
      play: async (expect) => {
        const fails: string[] = [];
        for (const c of CONSTRUCTIONS) {
          const modes: Options[] = [];
          for (const t of c.pill ? TOOLBAR_MODES : [TOOLBAR_MODES[0]!]) for (const b of c.bottom ? BOTTOM_MODES : (["reserved"] as const)) modes.push({ ...(t as Options), bottom: b });
          for (const W of [480, 520, 640, 760, 960, 1040, 1440]) {
            for (const H of [320, 420, 480, 560, 800]) {
              for (let n = 1; n <= 4; n++) {
                const s = c.initial(Array.from({ length: n }, (_, i) => i + 1));
                for (const opt of modes) fails.push(...layoutFailures(c.layout(s, { width: W, height: H }, opt), { width: W, height: H }, opt, `${c.title} ${W} × ${H}, ${n} docs, ${opt.toolbar}/${opt.toolbarSpace}/${opt.bottom}`));
              }
            }
          }
        }
        expect(fails.length === 0, `${fails.length} broken promises; first: ${fails[0]}`);
      },
    },
  };
  CONSTRUCTIONS.forEach((c, i) => {
    // From the construction before it in the list, so everything has somewhere to glide.
    scenarios[`switch to ${c.title}`] = {
      construction: CONSTRUCTIONS[(i + CONSTRUCTIONS.length - 1) % CONSTRUCTIONS.length]!.id,
      play: async (expect) => {
        lab.use(c.id);
        await lab.idle();
        expect(lab.construction() === c.id, `the construction is ${lab.construction()}`);
        settledAsLaidOut(lab, expect);
      },
    };
  });
  return scenarios;
}
