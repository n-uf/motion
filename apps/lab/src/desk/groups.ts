/**
 * The desk's toolbar groups: their ids and names, the twelve arrangements the lab can switch through, and the
 * default one (where Reset puts a group back). The model and the layout rules are @n-uf/placement/toolbar's.
 */
import { arrangement as arr, type Arrangement as ToolbarArrangement } from "@n-uf/placement/toolbar";

export type GroupId = "doc" | "edit" | "history" | "view" | "zoom" | "panel" | "share";
/** An arrangement of the desk's groups. */
export type Arrangement = ToolbarArrangement<GroupId>;

export const GROUPS: readonly GroupId[] = ["doc", "edit", "history", "view", "zoom", "panel", "share"];
export const GROUP_LABEL: Readonly<Record<GroupId, string>> = { doc: "Document", edit: "Edit", history: "History", view: "View", zoom: "Zoom", panel: "Panels", share: "Share" };

/** The twelve cases: the sketch's, on the desk (its tools are the desk's edit and history; its export joins share). */
export const CASES: readonly { readonly name: string; readonly note: string; readonly arrangement: Arrangement }[] = [
  {
    name: "Like the app today",
    note: "Document left and zoom right in the title bar; edit · history · view in the top bar; panels and share in a bottom bar.",
    arrangement: arr<GroupId>({ title: { start: ["doc"], end: ["zoom"] }, top: { center: ["edit", "history", "view"] }, bottom: { start: ["panel"], end: ["share"] } }),
  },
  {
    name: "Tools in the title bar, before all",
    note: "Edit and history go to the title bar's left zone, ahead of the document.",
    arrangement: arr<GroupId>({ title: { start: ["edit", "history", "doc"], end: ["zoom"] }, top: { center: ["view"] }, bottom: { start: ["panel"], end: ["share"] } }),
  },
  {
    name: "Zoom to the title bar's centre",
    note: "Zoom sits centred on the bar.",
    arrangement: arr<GroupId>({ title: { start: ["doc"], center: ["zoom"] }, top: { center: ["edit", "history", "view"] }, bottom: { start: ["panel"], end: ["share"] } }),
  },
  {
    name: "View after all, title bar right",
    note: "View moves past zoom to the very end.",
    arrangement: arr<GroupId>({ title: { start: ["doc"], end: ["zoom", "view"] }, top: { center: ["edit", "history"] }, bottom: { start: ["panel"], end: ["share"] } }),
  },
  {
    name: "A top bar with three zones",
    note: "Edit and history on the top bar's left, view in its centre, zoom on its right.",
    arrangement: arr<GroupId>({ title: { start: ["doc"] }, top: { start: ["edit", "history"], center: ["view"], end: ["zoom"] }, bottom: { start: ["panel"], end: ["share"] } }),
  },
  {
    name: "Zoom to the bottom bar's centre",
    note: "The bottom bar gets a centre zone.",
    arrangement: arr<GroupId>({ title: { start: ["doc"] }, top: { center: ["edit", "history", "view"] }, bottom: { start: ["panel"], center: ["zoom"], end: ["share"] } }),
  },
  {
    name: "Bottom bar: share before all",
    note: "Share moves to the bottom bar's left, ahead of panels.",
    arrangement: arr<GroupId>({ title: { start: ["doc"], end: ["zoom"] }, top: { center: ["edit", "history", "view"] }, bottom: { start: ["share", "panel"] } }),
  },
  {
    name: "Tools on the right edge",
    note: "Edit and history leave the top bar for the right edge.",
    arrangement: arr<GroupId>({ title: { start: ["doc"], end: ["zoom"] }, top: { center: ["view"] }, right: { start: ["edit", "history"] }, bottom: { start: ["panel"], end: ["share"] } }),
  },
  {
    name: "Bottom bar's groups to the left edge",
    note: "The bottom bar's groups turn vertical on the left: panels on top, share at the bottom.",
    arrangement: arr<GroupId>({ title: { start: ["doc"], end: ["zoom"] }, top: { center: ["edit", "history", "view"] }, left: { start: ["panel"], end: ["share"] } }),
  },
  {
    name: "Two side toolbars",
    note: "Edit and history on the left; view and zoom on the right, centred.",
    arrangement: arr<GroupId>({ title: { start: ["doc"] }, left: { start: ["edit", "history"] }, right: { center: ["view", "zoom"] }, bottom: { start: ["panel"], end: ["share"] } }),
  },
  {
    name: "Everything in the title bar",
    note: "One compact bar; no other toolbars (the top bar takes no space).",
    arrangement: arr<GroupId>({ title: { start: ["doc", "edit", "history"], center: ["zoom"], end: ["view", "panel", "share"] } }),
  },
  {
    name: "Document centred in the top bar",
    note: "The title bar keeps only share; the document centres in the top bar.",
    arrangement: arr<GroupId>({ title: { end: ["share"] }, top: { start: ["edit", "history"], center: ["doc"], end: ["view", "zoom"] }, bottom: { start: ["panel"] } }),
  },
];

export const DEFAULT_ARRANGEMENT: Arrangement = CASES[0]!.arrangement;
