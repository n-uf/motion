/**
 * 3 · Floats and orientation. A group takes its form from where it sits: a row on a bar, a column on a side edge.
 * A floating group has x and y; does it also have a direction?
 *
 * - Proposal A (the default): floats are always a row. Off a side edge onto the document, the group turns into a
 *   row before the drop. Nothing to store: placement's float record has x and y only.
 * - Proposal B (the switch): the kit keeps a direction for floats. Off a side edge it stays a column, and floats as
 *   one; into a bar it turns into a row. The kit stores the direction itself (placement has no field for it).
 *
 * Either way the held group takes its new form once a target shows (motion's held-drag resize: revealed from where
 * it is drawn, no stretch), so the drop has no second motion.
 */
import { STAGE, createDossier, type Dossier, type GroupId } from "./dossier";
import { drag, fmt, mid, settle } from "./drive";
import { allIdle, caseFrame, type Expect, type KitCase, type KitScenario } from "./kit-case";

const RULE = `A group takes its form from where it sits: a row on a bar, a column on a side edge. Does a floating group
also have a direction? <b>Proposal A</b> (the default): floats are always a row, so a group dragged off a side edge onto
the document turns into a row before the drop; placement's float record (x and y) is all there is to store.
<b>Proposal B</b>: the kit keeps a direction for floats, so the group stays a column and floats as one. Either way the
held group takes its new form once a target shows, revealed from where it is drawn, and the drop has no second motion.
Try: drag Zoom onto the left edge, then off it onto the document.`;

export const case3: KitCase = {
  id: "floats",
  title: "3 · Floats and orientation",
  mount(host, loop) {
    let mode: "row" | "keep" = "row";
    let d: Dossier | null = null;
    const desks = caseFrame(host, RULE, [{ id: "w" }], () => reset());
    const controls = host.querySelector(".kcase .controls")!;
    controls.insertAdjacentHTML(
      "afterbegin",
      `<fieldset><legend>Floats</legend>
         <label><input type="radio" name="k3-floats" value="row" checked /> A · always a row</label>
         <label><input type="radio" name="k3-floats" value="keep" /> B · keep their direction</label>
       </fieldset>`,
    );
    d = createDossier(desks.w!, { title: "Quarterly plan.pdf", loop, floats: () => mode });
    const dossier = d;
    const setMode = (m: "row" | "keep"): void => {
      mode = m;
      controls.querySelector<HTMLInputElement>(`input[value="${m}"]`)!.checked = true;
    };
    function reset(): void {
      setMode("row");
      dossier.reset();
    }
    controls.querySelectorAll<HTMLInputElement>('input[name="k3-floats"]').forEach((r) =>
      r.addEventListener("change", () => {
        setMode(r.value as "row" | "keep");
        dossier.reset();
      }),
    );
    return { reset, idle: allIdle([dossier]), scenarios: scenarios(dossier, setMode) };
  },
};

function scenarios(d: Dossier, setMode: (m: "row" | "keep") => void): KitScenario[] {
  const column = (g: GroupId): boolean => {
    const r = d.drawn(d.groupEl(g));
    return r.height > r.width;
  };
  /** Zoom onto the left edge: a column before the drop, and it lands as one. */
  async function ontoLeft(expect: Expect): Promise<void> {
    const t = d.targets("zoom").find((x) => x.id === "g:left:start:0");
    if (!t || t.kind === "float") return expect(false, "no left start target");
    const r = await drag(d, "zoom", mid(t.slot));
    const last = r.seen.at(-1);
    expect(!!last && last.vertical && last.item.height > last.item.width, `onto the left edge, just before the drop: ${last?.vertical ? "a column" : "a row"} at ${fmt(last?.item ?? null)}`);
    await settle(d);
    expect(d.arrangement().left.start.includes("zoom") && column("zoom"), "Zoom didn't land as a column on the left edge");
  }
  /** Off the left edge onto the document: the form just before the drop, and after it rests. */
  async function offLeft(): Promise<{ before: boolean | null; rests: boolean; floating: boolean; second: boolean }> {
    const r = await drag(d, "zoom", mid(STAGE));
    const last = r.seen.at(-1);
    const before = last ? last.vertical : null;
    // After the release, no change of form (no second motion).
    const formsAfter = new Set<boolean>();
    for (let i = 0; i < 20; i++) {
      await new Promise((res) => requestAnimationFrame(() => res(null)));
      formsAfter.add(d.groupEl("zoom").classList.contains("v"));
    }
    await settle(d);
    return { before, rests: column("zoom"), floating: d.arrangement().floating.some((f) => f.id === "zoom"), second: formsAfter.size > 1 || (before !== null && !formsAfter.has(before)) };
  }

  return [
    {
      name: "3 · A (default): off the left edge onto the document Zoom turns into a row before the drop, floats as a row, with no second motion",
      play: async (expect) => {
        setMode("row");
        await ontoLeft(expect);
        const r = await offLeft();
        expect(r.before === false, `just before the drop it was ${r.before ? "a column" : "nothing held"}`);
        expect(r.floating && !r.rests, `it ${r.floating ? "floats" : "doesn't float"} as ${r.rests ? "a column" : "a row"}`);
        expect(!r.second, "its form changed after the drop");
      },
    },
    {
      name: "3 · B (switch): off the left edge Zoom stays a column and floats as one, keeps it when moved, and turns into a row in the top bar",
      play: async (expect) => {
        setMode("keep");
        d.reset();
        await settle(d);
        await ontoLeft(expect);
        const r = await offLeft();
        expect(r.before === true, `just before the drop it was ${r.before === false ? "a row" : "nothing held"}`);
        expect(r.floating && r.rests, `it ${r.floating ? "floats" : "doesn't float"} as ${r.rests ? "a column" : "a row"}`);
        expect(!r.second, "its form changed after the drop");
        // Moved over the document again: still a column.
        await drag(d, "zoom", { x: STAGE.x + STAGE.width * 0.7, y: STAGE.y + STAGE.height * 0.4 });
        await settle(d);
        expect(d.arrangement().floating.some((f) => f.id === "zoom") && column("zoom"), "moved, the float isn't a column any more");
        // Into the top bar's end: a row.
        const t = d.targets("zoom").find((x) => x.kind !== "float" && x.place.host === "top" && x.place.zone === "end");
        if (!t || t.kind === "float") return expect(false, "no top bar end target");
        // On the insertion line itself.
        await drag(d, "zoom", mid(t.kind === "line" ? t.line : t.slot));
        await settle(d);
        expect(d.arrangement().top.end.includes("zoom") && !column("zoom"), "in the top bar it isn't a row");
      },
    },
  ];
}
