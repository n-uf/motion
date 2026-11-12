/**
 * 10 · Scaled page: the desk scaled with `transform: scale(s)`. The drag intent works in page space, so the kit
 * converts the pointer first, `page = (pointer − origin) / s`; the slot then lands under the pointer at every scale.
 */
import type { Point, Rect } from "@n-uf/motion";
import { H, W, createDossier, inRect, placements, type Dossier } from "./dossier";
import { drag, fmt, mid, settle } from "./drive";
import { allIdle, caseFrame, type Expect, type KitCase, type KitScenario } from "./kit-case";

const RULE = `The desk is scaled with <code>transform: scale(s)</code>. The intent works in page space, so the kit converts
the pointer first: <code>page = (pointer − origin) ÷ s</code>. The orange cross is the point the intent reads; with the
conversion it sits under the pointer and the slot lands there at every scale. Turn the conversion off to see the bug:
at 0.7 the intent reads a point away from the pointer.`;

export const case10: KitCase = {
  id: "scaled",
  title: "10 · Scaled page",
  mount(host, loop) {
    let scale = 0.7;
    let convert = true;
    let d: Dossier | null = null;
    const desks = caseFrame(host, RULE, [{ id: "w" }], () => reset());
    const controls = host.querySelector(".kcase .controls")!;
    controls.insertAdjacentHTML(
      "afterbegin",
      `<fieldset><legend>Scale</legend><input type="range" min="0.5" max="1" step="0.05" value="0.7" data-k="scale" /><output data-k="scale-out">0.70</output></fieldset>
       <label><input type="checkbox" data-k="xray" /> X-ray: hit rects</label>
       <label><input type="checkbox" data-k="convert" checked /> Convert the pointer into page space</label>`,
    );
    const q = <T extends Element>(k: string): T => controls.querySelector<T>(`[data-k="${k}"]`)!;
    const slider = q<HTMLInputElement>("scale");
    const out = q<HTMLOutputElement>("scale-out");
    const xray = q<HTMLInputElement>("xray");
    const conv = q<HTMLInputElement>("convert");
    const wrap = desks.w!;
    wrap.classList.add("k-scale");
    d = createDossier(wrap, { title: "Quarterly plan.pdf", loop, scale: () => scale, convert: () => convert });
    const dossier = d;
    const setScale = (s: number): void => {
      scale = s;
      dossier.el.style.transform = `scale(${s})`;
      // The scaled window's box: its border included.
      wrap.style.width = `${(W + 2) * s}px`;
      wrap.style.height = `${(H + 2) * s}px`;
      slider.value = String(s);
      out.textContent = s.toFixed(2);
    };
    const setConvert = (on: boolean): void => {
      convert = on;
      conv.checked = on;
    };
    function reset(): void {
      setConvert(true);
      setScale(0.7);
      dossier.reset();
    }
    slider.addEventListener("input", () => setScale(Number(slider.value)));
    xray.addEventListener("change", () => dossier.setXray(xray.checked));
    conv.addEventListener("change", () => setConvert(conv.checked));
    setScale(scale);
    return { reset, idle: allIdle([dossier]), scenarios: scenarios(dossier, setScale, setConvert) };
  },
};

function scenarios(c10: Dossier, setScale: (s: number) => void, setConvert: (on: boolean) => void): KitScenario[] {
  /** Drag Zoom onto the bottom bar's start, its pointer on where it would land: what the intent read, and the slot. */
  async function scaled(expect: Expect, s: number): Promise<{ read: Point[]; slots: (Rect | null)[]; aim: Point; landed: string | null }> {
    setScale(s);
    c10.reset();
    await settle(c10);
    const t = c10.allTargets("zoom").find((x) => x.id === "g:bottom:start:0");
    if (!t || t.kind === "float") {
      expect(false, "no bottom start target for Zoom");
      return { read: [], slots: [], aim: { x: 0, y: 0 }, landed: null };
    }
    const aim = mid(placements(t.arrangement).get("zoom")!.rect);
    const r = await drag(c10, "zoom", aim);
    const late = r.seen.filter((x) => x.t >= r.holdFrom + 300);
    await settle(c10);
    const rec = c10.lastDrag();
    const reads = rec ? rec.frames.slice(-10).map((f) => f.read) : [];
    return { read: reads, slots: late.map((x) => x.slot), aim, landed: rec?.landed ?? null };
  }

  return [
    {
      name: "10 · Scaled page: at 0.7 (and 0.5, 1) the intent reads the point under the pointer and the slot is under it",
      play: async (expect) => {
        setConvert(true);
        for (const s of [0.7, 0.5, 1]) {
          const r = await scaled(expect, s);
          const wrong = r.read.filter((p) => Math.hypot(p.x - r.aim.x, p.y - r.aim.y) > 1);
          expect(r.read.length > 0 && wrong.length === 0, `at ${s}: the intent read ${wrong[0] ? `${Math.round(wrong[0].x)},${Math.round(wrong[0].y)}` : "nothing"}, the pointer is at ${Math.round(r.aim.x)},${Math.round(r.aim.y)}`);
          const away = r.slots.filter((x) => !x || !inRect(x, r.aim));
          expect(r.slots.length > 0 && away.length === 0, `at ${s}: the slot was ${fmt(away[0] ?? null)}, not under the pointer, in ${away.length} of ${r.slots.length} frames`);
          expect(r.landed === "g:bottom:start:0", `at ${s}: landed on ${r.landed ?? "home"}`);
        }
      },
    },
    {
      name: "10 · Without the conversion, at 0.7 the intent reads a point away from the pointer and no slot is under it (the bug the conversion fixes)",
      play: async (expect) => {
        setConvert(false);
        const r = await scaled(expect, 0.7);
        setConvert(true);
        expect(r.read.length > 0 && r.read.every((p) => Math.hypot(p.x - r.aim.x, p.y - r.aim.y) > 20), "unconverted, the intent still read the point under the pointer");
        expect(!r.slots.some((x) => x && inRect(x, r.aim)), "unconverted, a slot still showed under the pointer");
        expect(r.landed !== "g:bottom:start:0", "unconverted, it still landed where the pointer was");
      },
    },
  ];
}
