/**
 * A side strip (a narrow column that only moves the content aside, `DockItem.countsAsDocked: false`) in a window whose
 * inset applies only while a panel is docked (`insetWhen: "docked"`), checked on the DockState directly: the window
 * is left as it is. With only the strip open the inset is off; with a docked panel open as well it is on.
 */
import type { StackForm } from "@n-uf/placement/stack";
import type { DockEdge, DockItem, DockState } from "@n-uf/docking";
import { solve } from "@n-uf/docking";

/** A case's verdict and the case itself, in the presets' shape (it needs no window). */
interface Verdict {
  readonly pass: boolean;
  readonly now: string;
}
interface Preset {
  readonly id: string;
  readonly title: string;
  readonly expected: string;
  setup(): void;
  check(): Verdict;
}

const WIDTH = 1400;
const HEIGHT = 800;
const PAD = 12;
const STRIP = 24;

/** A window with a panel column on the left and a side strip on the right; each is open or closed. */
function stripWindow(o: { panel: boolean; strip: boolean; flag: boolean }): DockState {
  const panels = { accepts: ["panel"], cross: { min: 220, max: 640, rail: 32 }, gap: PAD };
  const strips = { accepts: ["strip"], cross: { min: STRIP, max: STRIP, rail: STRIP }, gap: 0 };
  const panelForms: StackForm[] = [
    { kind: "open", main: { min: 120, natural: 300, grows: true }, cross: { natural: 300, min: 220 } },
    { kind: "header", main: { min: 34, natural: 34 }, cross: { natural: 300, min: 32 } },
    { kind: "rail", main: { min: 36, natural: 36 }, cross: { natural: 32 } },
  ];
  const stripForm: StackForm = { kind: "open", main: { min: 0, natural: 0, grows: true }, cross: { natural: STRIP, min: STRIP }, setsCross: true };
  const items: Record<string, DockItem> = {
    notes: { id: "notes", kind: "panel", used: 1, forms: { column: panelForms }, ...(o.panel ? {} : { closed: true }) },
    sidebar: { id: "sidebar", kind: "strip", used: 2, forms: { column: [stripForm] }, ...(o.flag ? { countsAsDocked: false } : {}), ...(o.strip ? {} : { closed: true }) },
  };
  const edges: DockEdge[] = [
    { id: "left-0", side: "left", ring: 0, column: true, items: ["notes"], ...panels },
    { id: "right-0", side: "right", ring: 0, column: true, items: ["sidebar"], ...strips },
  ];
  return {
    stage: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
    edges,
    items,
    floats: [],
    floatKinds: ["panel"],
    columns: { left: panels, right: strips },
    rails: { left: { width: 32, accepts: ["panel"] } },
    contentMin: { width: 320, height: 240 },
    handFold: "ride",
    inset: { top: PAD, right: PAD, bottom: PAD, left: PAD },
    insetWhen: "docked",
    gutter: 0,
  };
}

const r0 = (n: number): number => Math.round(n);
const box = (r: { x: number; y: number; width: number; height: number }): string => `${r0(r.x)},${r0(r.y)} ${r0(r.width)}×${r0(r.height)}`;

/** A side strip opened alone leaves the inset off; with a docked panel open too the inset is on (a strip with no declaration turns it on). */
function sideStripCase(): Preset {
  return {
    id: "side-strip-no-inset",
    title: "A side strip alone leaves the inset off",
    expected:
      "In a window inset by 12 px only while a panel is docked (`insetWhen: \"docked\"`), a 24 px side strip item declaring `countsAsDocked: false`: with nothing open the content is the whole 1400×800 stage; with only the strip open the strip lies flush at the window's right edge, full height, and the content is 1376 wide at 0,0 (the stage less the strip's width, no inset); with a docked panel open as well the inset is on, as before (content and strip 12 px in on every side). A strip item that leaves the declaration out switches the inset on when it opens alone.",
    setup: () => undefined,
    check(): Verdict {
      const bad: string[] = [];
      const none = solve(stripWindow({ panel: false, strip: false, flag: true })).content;
      const alone = solve(stripWindow({ panel: false, strip: true, flag: true }));
      const both = solve(stripWindow({ panel: true, strip: true, flag: true }));
      const plain = solve(stripWindow({ panel: false, strip: true, flag: false }));
      const strip = alone.items.sidebar!.rect;
      if (none.x !== 0 || none.y !== 0 || none.width !== WIDTH || none.height !== HEIGHT) bad.push(`nothing open: content ${box(none)}`);
      if (alone.content.x !== 0 || alone.content.y !== 0 || alone.content.height !== HEIGHT || alone.content.width !== none.width - STRIP) bad.push(`(a) strip alone: content ${box(alone.content)}`);
      if (strip.x + strip.width !== WIDTH || strip.y !== 0 || strip.height !== HEIGHT || strip.width !== STRIP) bad.push(`(a) strip alone: strip ${box(strip)}`);
      const stripBoth = both.items.sidebar!.rect;
      if (both.content.y !== PAD || both.content.height !== HEIGHT - 2 * PAD) bad.push(`(b) strip and panel: content ${box(both.content)}`);
      if (stripBoth.x + stripBoth.width !== WIDTH - PAD || stripBoth.y !== PAD || stripBoth.height !== HEIGHT - 2 * PAD) bad.push(`(b) strip and panel: strip ${box(stripBoth)}`);
      if (plain.content.y !== PAD) bad.push(`no declaration: the strip alone left the inset off (content ${box(plain.content)})`);
      return {
        pass: bad.length === 0,
        now: `Nothing open: content ${box(none)}; strip alone: content ${box(alone.content)}, strip ${box(strip)}; strip and panel: content ${box(both.content)}, strip ${box(stripBoth)}; no declaration, strip alone: content ${box(plain.content)}.${bad.length ? ` Broken: ${bad.join("; ")}.` : ""}`,
      };
    },
  };
}

export function SIDE_STRIP_PRESETS(): Preset[] {
  return [sideStripCase()];
}
