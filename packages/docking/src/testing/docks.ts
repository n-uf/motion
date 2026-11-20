/**
 * Which rows need docked panels (`requires.docks`): one rule, `needsDocks`, read from the row itself. A host that docks
 * panels only from some stage width (`CaseHost.dockMinWidth`) has the runner skip those rows below it. A row that states
 * `requires.docks` (true or false) keeps what it states.
 */
import { solve } from "../index";
import type { CaseRow, LayoutExpect } from "./types";

/**
 * Whether the row's expected outcome depends on panels being docked: an expectation (final or at a checkpoint) names
 * columns or rails, a panel in an edge's order, a docked place of a panel (its edge, zone, rail, the column it rides,
 * its » menu), the rect or form of a panel docked at the start that it doesn't say floats, the content's rect or least
 * size while a panel is docked at the start, an edge that takes panels, or floats that leave out a panel (so it is
 * docked).
 */
export function needsDocks(row: CaseRow): boolean {
  if (row.requires?.docks !== undefined) return row.requires.docks;
  const items = row.state.items;
  const isPanel = (id: string): boolean => items[id]?.kind === "panel";
  const panels = Object.keys(items).filter((id) => isPanel(id) && !items[id]!.closed);
  const start = solve(row.state);
  const dockedAtStart = new Set(panels.filter((id) => !!start.items[id]?.edge && !start.items[id]!.floating));
  const takesPanels = (edge: string): boolean => !!row.state.edges.find((e) => e.id === edge)?.accepts.includes("panel");
  const expects: LayoutExpect[] = [row.expectLayout, ...(row.checkpoints ?? []).flatMap((c) => (c.layout ? [c.layout] : []))];
  return expects.some(
    (e) =>
      e.columns !== undefined ||
      e.rails !== undefined ||
      Object.values(e.order ?? {}).some((ids) => ids.some(isPanel)) ||
      Object.entries(e.items ?? {}).some(([id, x]) => {
        if (!x || !isPanel(id)) return false;
        if ((x.edge !== undefined && x.edge !== null) || x.zone !== undefined || (x.rail !== undefined && x.rail !== null) || x.rides || x.inMenu) return true;
        return dockedAtStart.has(id) && !x.floating && x.edge !== null && (x.rect !== undefined || x.formKind !== undefined);
      }) ||
      ((e.content !== undefined || e.contentAtLeast !== undefined) && dockedAtStart.size > 0) ||
      Object.keys(e.edges ?? {}).some(takesPanels) ||
      (e.floats !== undefined && panels.some((id) => !e.floats!.includes(id))),
  );
}

/** `rows`, each carrying `requires.docks` by `needsDocks` (set only where it is true, or where the row states it). */
export const withDocks = (rows: readonly CaseRow[]): CaseRow[] =>
  rows.map((row) => (row.requires?.docks === undefined && needsDocks(row) ? { ...row, requires: { ...row.requires, docks: true } } : row));
