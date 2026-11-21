/**
 * The pre-render's recorder (docs/lab-checks.md): while a preset plays, it records a dump at each key frame of every
 * drag the check drives (the start, each frame where the held item changes place, the release), and keeps a copy of the
 * window's markup at that frame, so a script can show and photograph any of them afterwards without replaying.
 *
 * A dump holds only facts (window px, origin at the window's top left); the copies are never part of one.
 */
import type { Rect } from "@n-uf/placement";
import type { ItemId } from "./model";
import type { Docwin, ProbeFrame } from "./dock-state";

export type Mark = "state" | "start" | "hop" | "release";

/**
 * A key frame's facts. The drag's own facts (landing, lane, spot, `pending`: the lane being entered, `cantGo`: the
 * "Can't go here" tag's refusal id, the guides) are the window's `ProbeFrame` fields as they are; a state has them empty.
 */
export interface Dump extends Pick<ProbeFrame, "landing" | "lane" | "spot" | "pending" | "cantGo" | "guides"> {
  /** ms on the session's clock since the drag's first frame (the release: at most one frame after the last one); 0 for the state. */
  readonly t: number;
  readonly mark: Mark;
  readonly pointer: { readonly x: number; readonly y: number } | null;
  readonly held: { readonly id: string; readonly rect: Rect; readonly placed: string | null } | null;
  readonly region: string | null;
  /** `hidden` and `tiers` are the item's layout's (`DockItemLayout`), left out when empty. */
  readonly items: readonly { readonly id: string; readonly edge: string | null; readonly form: string | null; readonly rect: Rect; readonly hidden?: readonly string[]; readonly tiers?: Readonly<Record<string, number>> }[];
  readonly errors: readonly string[];
  /** A key frame a check marked (`mark`): what it is, such as the window's width. */
  readonly note?: string;
}

/** The most key frames kept for one preset: a case that drags hundreds of times keeps its first ones. */
const MAX_FRAMES = 80;

/** Where the window's copy sits in a picture: px from the viewport's top left. */
const SHOT_INSET = 16;

const r2 = (n: number): number => Math.round(n * 100) / 100;
const rect = (r: Rect): Rect => ({ x: r2(r.x), y: r2(r.y), width: r2(r.width), height: r2(r.height) });

/** What a held item's place is: where it would land (region and spot), so a hop is a change of either. */
const placeOf = (f: ProbeFrame): string => `${f.region}|${f.spot ?? ""}`;

interface Shot {
  readonly node: HTMLElement;
  readonly scrollTop: number;
}

export function createRecorder(c: Docwin, root: HTMLElement) {
  /** The state, then the key frames in order. */
  let dumps: Dump[] = [];
  let shots: Shot[] = [];
  let errors: string[] = [];
  let truncated = false;
  /** The drag's first frame time, the last frame's `t`, and the place at the last key frame; null between drags. */
  let t0: number | null = null;
  let lastT = 0;
  let lastPlace: string | null = null;
  let overlay: HTMLElement | null = null;

  const onError = (e: ErrorEvent): void => void errors.push(e.message);

  /** Items as drawn now, without the held one (the drag draws it), sorted by id. */
  function itemsNow(): Dump["items"] {
    const { layout, hidden } = c.drawn;
    return Object.entries(layout.items)
      .filter(([id, p]) => id !== hidden && !p.inMenu)
      .map(([id, p]) => ({ id, edge: p.floating ? "float" : (p.edge ?? null), form: p.formKind ?? null, rect: rect(p.rect), ...(p.hidden.length ? { hidden: p.hidden } : {}), ...(p.tiers ? { tiers: p.tiers } : {}) }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  function snap(): Shot {
    const node = root.cloneNode(true) as HTMLElement;
    // The copy is shown beside the live window: one id each, so none of its markup answers a lookup by id.
    node.removeAttribute("id");
    for (const el of node.querySelectorAll("[id]")) el.removeAttribute("id");
    return { node, scrollTop: c.scroll.scrollTop };
  }

  function push(mark: Mark, t: number, f: ProbeFrame | null, note?: string): void {
    const held = f ? { id: f.held.id as ItemId, rect: rect(f.held.rect), placed: f.held.placed } : null;
    dumps.push({
      t,
      mark,
      pointer: f ? { x: r2(f.pointer.x), y: r2(f.pointer.y) } : null,
      held,
      landing: f?.landing ? rect(f.landing) : null,
      region: f?.region ?? null,
      lane: f?.lane ?? null,
      spot: f?.spot ?? null,
      pending: f?.pending ?? null,
      cantGo: f?.cantGo ?? null,
      guides: (f?.guides ?? []).map((g) => ({ id: g.id, kind: g.kind, lane: g.lane, rect: rect(g.rect) })),
      items: itemsNow(),
      errors: errors.splice(0),
      ...(note !== undefined ? { note } : {}),
    });
    shots.push(snap());
  }

  function onProbe(f: ProbeFrame): void {
    if (f.kind === "frame") {
      if (t0 === null) {
        t0 = f.now;
        lastT = 0;
        lastPlace = placeOf(f);
        if (dumps.length > MAX_FRAMES) truncated = true;
        else push("start", 0, f);
        return;
      }
      lastT = Math.round(f.now - t0);
      const place = placeOf(f);
      if (place === lastPlace) return;
      lastPlace = place;
      if (dumps.length > MAX_FRAMES) truncated = true;
      else push("hop", lastT, f);
      return;
    }
    // The release: the session's own clock can be the page's (a mouse path), so its time is at most a frame past the last.
    const t = t0 === null ? 0 : Math.round(Math.min(f.now - t0, lastT + 16));
    t0 = null;
    lastPlace = null;
    if (dumps.length > MAX_FRAMES) truncated = true;
    else push("release", t, f);
  }

  /** A check that plays no drag (a window being resized) marks a key frame: a dump and a copy of the window as drawn now. */
  const mark = (note: string): void => {
    if (dumps.length > MAX_FRAMES) truncated = true;
    else push("hop", dumps.length, null, note);
  };

  return {
    /** Start recording: drop the last run's dumps and copies, and listen to the window and to page errors. */
    start(): void {
      dumps = [];
      shots = [];
      errors = [];
      truncated = false;
      t0 = null;
      lastT = 0;
      lastPlace = null;
      window.addEventListener("error", onError);
      c.setProbe(onProbe);
      c.setKeyFrames(mark);
    },
    /** The window after setup: the state's dump and copy (always the first). */
    state(): void {
      push("state", 0, null);
    },
    /** Stop recording; the state's dump and the key frames' as recorded. */
    stop(): { state: Dump; frames: Dump[]; truncated: boolean } {
      c.setProbe(null);
      c.setKeyFrames(null);
      window.removeEventListener("error", onError);
      // Errors after the last dump belong to it.
      const last = dumps.length - 1;
      if (errors.length && last >= 0) dumps[last] = { ...dumps[last]!, errors: [...dumps[last]!.errors, ...errors.splice(0)] };
      return { state: dumps[0]!, frames: dumps.slice(1), truncated };
    },
    /**
     * Show the copy of the state (0) or of key frame `n` (1, 2, …) as it was drawn then, on a backdrop over the page
     * (`#dw-shot`, the window's copy at `SHOT_INSET` px from the top left); null takes it away. False: no such copy.
     */
    show(n: number | null): boolean {
      overlay?.remove();
      overlay = null;
      if (n === null) return true;
      const s = shots[n];
      if (!s) return false;
      // A backdrop over the whole viewport with the window's copy at (16, 16): a screenshot of the page is the window
      // alone, wherever the page is scrolled, and the same every run.
      const host = document.createElement("div");
      host.id = "dw-shot";
      host.style.cssText = `position:fixed;inset:0;z-index:99999;pointer-events:none;overflow:hidden;padding:${SHOT_INSET}px;background:var(--bg,#fff)`;
      host.append(s.node.cloneNode(true));
      document.body.append(host);
      const sc = host.querySelector<HTMLElement>(".dw-scroll");
      if (sc) sc.scrollTop = s.scrollTop;
      overlay = host;
      return true;
    },
    /** The dump of the state (0) or key frame `n` as recorded, or null past the last. */
    at(n: number): Dump | null {
      return dumps[n] ?? null;
    },
    /** How many dumps were recorded: the state and the key frames. */
    get count(): number {
      return dumps.length;
    },
    /** The window as it stands now, as a dump of the state (no drag, no copy kept). */
    now(): Dump {
      return { t: 0, mark: "state", pointer: null, held: null, landing: null, region: null, lane: null, spot: null, pending: null, cantGo: null, guides: [], items: itemsNow(), errors: [] };
    },
    /** Whether the last run dropped key frames past `MAX_FRAMES`. */
    get truncated(): boolean {
      return truncated;
    },
  };
}
