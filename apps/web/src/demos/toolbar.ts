/**
 * Toolbar groups: the groups, the slots and the cases, and the sample window's markup. Pure strings, so the server
 * renders the default state and the island renders every later one with the same code.
 */
import { icon } from "./icons";

export type Host = "title" | "top" | "bottom" | "left" | "right";
export type Zone = "start" | "center" | "end";
export type Slots = Record<Zone, string[]>;
/** A floating group: at x, y in the window's body, or anchored ("bottom": centred above the body's bottom edge). */
export interface Float { id: string; x: number; y: number; anchor?: "bottom" }
export type Model = Record<Host, Slots> & { float: Float[]; collapsed: string[] };
type Spec = Partial<Record<Host, Partial<Slots>>>;

const btns = (list: string[], on = -1): string => list.map((t, i) => `<button class="tb${i === on ? " on" : ""}" tabindex="-1" aria-label="${t}">${icon(t)}</button>`).join("");
const tbtn = (list: [string, string][], on = -1): string =>
  list.map(([t, i], k) => `<button class="tb text${k === on ? " on" : ""}" title="${t}" tabindex="-1"><span class="t">${t}</span><span class="i">${icon(i)}</span></button>`).join("");

export const GROUPS: Record<string, { label: string; html: string }> = {
  doc: { label: "Document", html: `<span class="ident"><span class="name">Quarterly plan.pdf</span><span class="page">P 02/04</span></span>` },
  tools: { label: "Tools", html: btns(["pointer", "text", "eraser", "rect", "pen"], 4) },
  view: { label: "View", html: btns(["single", "spread"]) },
  zoom: { label: "Zoom", html: `<span class="zoom"><button class="tb" tabindex="-1" aria-label="Zoom out">${icon("minus")}</button><span class="zoomval">79<span class="h-only">%</span></span><button class="tb" tabindex="-1" aria-label="Zoom in">${icon("plus")}</button></span>` },
  panel: { label: "Panels", html: tbtn([["Panel", "panel"], ["Notes", "notes"]], 0) },
  export: { label: "Export", html: tbtn([["Preview", "preview"], ["Download", "download"]]) },
  share: { label: "Share", html: tbtn([["Share", "share"], ["Print", "print"]]) },
};
export const HOSTS: Host[] = ["title", "top", "bottom", "left", "right"];
export const ZONES: Zone[] = ["start", "center", "end"];
export const HOSTNAME: Record<Host, string> = { title: "Title bar", top: "Top bar", bottom: "Bottom bar", left: "Left edge", right: "Right edge" };
export const ZONENAME = (h: Host, z: Zone): string => (h === "left" || h === "right" ? { start: "top", center: "middle", end: "bottom" } : { start: "left", center: "centre", end: "right" })[z];
const empty = (): Slots => ({ start: [], center: [], end: [] });
export const clone = (m: Model): Model => JSON.parse(JSON.stringify(m)) as Model;
/** An arrangement from the hosts and zones that have groups. */
export const arrangement = (spec: Spec, float: Float[] = []): Model => make(spec, float);
const make = (spec: Spec, float: Float[] = []): Model => {
  const m: Model = { title: empty(), top: empty(), bottom: empty(), left: empty(), right: empty(), float, collapsed: [] };
  for (const h of Object.keys(spec) as Host[]) for (const z of Object.keys(spec[h]!) as Zone[]) m[h][z] = [...spec[h]![z]!];
  return m;
};

export interface Case { name: string; note: string; m: Model }
export const CASES: Case[] = [
  { name: "Like the viewer today", note: "Document left, view and zoom right; tools on the left edge; a bottom bar.", m: make({ title: { start: ["doc"], end: ["view", "zoom"] }, left: { start: ["tools"] }, bottom: { start: ["panel"], end: ["export", "share"] } }) },
  { name: "Tools in the title bar, before all", note: "Tools lead the title bar's left zone, ahead of the document.", m: make({ title: { start: ["tools", "doc"], end: ["view", "zoom"] }, bottom: { start: ["panel"], end: ["export", "share"] } }) },
  { name: "Zoom to the title bar's centre", note: "Zoom sits centred on the bar.", m: make({ title: { start: ["doc"], center: ["zoom"], end: ["view"] }, left: { start: ["tools"] }, bottom: { start: ["panel"], end: ["export", "share"] } }) },
  { name: "View after all, title bar right", note: "View moves past zoom to the very end.", m: make({ title: { start: ["doc"], end: ["zoom", "view"] }, left: { start: ["tools"] }, bottom: { start: ["panel"], end: ["export", "share"] } }) },
  { name: "A top bar", note: "Tools and view open a top bar on the left; zoom on its right.", m: make({ title: { start: ["doc"] }, top: { start: ["tools", "view"], end: ["zoom"] }, bottom: { start: ["panel"], end: ["export", "share"] } }) },
  { name: "Zoom to the bottom bar's centre", note: "The bottom bar gets a centre zone.", m: make({ title: { start: ["doc"], end: ["view"] }, left: { start: ["tools"] }, bottom: { start: ["panel"], center: ["zoom"], end: ["export", "share"] } }) },
  { name: "Bottom bar: export before all", note: "Export moves to the bottom bar's left, ahead of the panels.", m: make({ title: { start: ["doc"], end: ["view", "zoom"] }, left: { start: ["tools"] }, bottom: { start: ["export", "panel"], end: ["share"] } }) },
  { name: "Tools on the right edge", note: "Tools move from the left edge to the right edge.", m: make({ title: { start: ["doc"], end: ["view", "zoom"] }, right: { start: ["tools"] }, bottom: { start: ["panel"], end: ["export", "share"] } }) },
  { name: "Bottom bar's groups to the left edge", note: "All of the bottom bar's groups move together (their menu: Move this bar's groups to › Left edge).", m: make({ title: { start: ["doc"], end: ["view", "zoom"] }, left: { start: ["tools", "panel"], end: ["export", "share"] } }) },
  { name: "Two side edges", note: "Tools left; view and zoom on the right, middle zone.", m: make({ title: { start: ["doc"] }, left: { start: ["tools"] }, right: { center: ["view", "zoom"] }, bottom: { start: ["panel"], end: ["export", "share"] } }) },
  { name: "Everything in the title bar", note: "One bar, no others; when it runs out of room, trailing groups collapse to handle + ».", m: make({ title: { start: ["doc", "tools"], center: ["zoom"], end: ["view", "panel", "export", "share"] } }) },
  { name: "Tools floating", note: "Tools float over the document: the same group plus a frame and shadow.", m: make({ title: { start: ["doc"], end: ["view", "zoom"] }, bottom: { start: ["panel"], end: ["export", "share"] } }, [{ id: "tools", x: 30, y: 30 }]) },
  { name: "A collapsed group", note: "Export double-clicked: its handle plus ».", m: Object.assign(make({ title: { start: ["doc"], end: ["view", "zoom"] }, left: { start: ["tools"] }, bottom: { start: ["panel"], end: ["export", "share"] } }), { collapsed: ["export"] }) },
];

export const label = (g: string): string => GROUPS[g]!.label;
const dots = (n: number): string => "<i></i>".repeat(n);

/**
 * A toolbar group: its handle, its controls, and the » that stands in for them while collapsed (the `collapsed` class
 * switches between the two, so a group's controls keep their listeners when it collapses or moves). » is a real
 * button: it opens a popover with the group's full horizontal form (islands/chrome.ts).
 */
export function chromeGroupHTML(id: string, name: string, controls: string, collapsed = false): string {
  return `<div class="group${collapsed ? " collapsed" : ""}" data-g="${id}"><span class="g c" tabindex="0" role="button" aria-label="${name} handle" title="${name}" data-handle="${id}">${dots(3)}</span><span class="ctl">${controls}</span><button type="button" class="tb ovf" data-ovf="${id}" aria-haspopup="dialog" aria-expanded="false" aria-label="${name}: show its controls" title="${name}">»</button></div>`;
}
/** Where a floating group sits in the window's body. */
export const floatStyle = (f: Float): string =>
  f.anchor === "bottom" ? "left:0;right:0;bottom:12px;margin-inline:auto;width:max-content" : `left:${f.x}px;top:${f.y}px`;
export function groupHTML(model: Model, g: string, auto: ReadonlySet<string> = new Set()): string {
  return chromeGroupHTML(g, label(g), GROUPS[g]!.html, model.collapsed.includes(g) || auto.has(g));
}
const isEmptyHost = (model: Model, h: Host): boolean => ZONES.every((z) => model[h][z].length === 0);
function barHTML(model: Model, h: Host, auto: ReadonlySet<string>): string {
  const v = h === "left" || h === "right";
  const cls = `bar ${v ? "v" : "h"} ${h}${isEmptyHost(model, h) && h !== "title" ? " empty" : ""}`;
  // The window cannot move, so its title bar starts with the lights: no grip.
  const lead = h === "title" ? `<span class="winh"><span class="lights" aria-hidden="true"><i></i><i></i><i></i></span></span>` : "";
  const zones = ZONES.map((z) => `<div class="zone ${z}" data-host="${h}" data-zone="${z}">${model[h][z].map((g) => groupHTML(model, g, auto)).join("")}</div>`).join("");
  return `<div class="${cls}" data-host="${h}">${lead}${zones}</div>`;
}
const PAPER = `<div class="paper"><span class="kicker">Section 2</span><p class="ph">Scope of work</p>${'<div class="l"></div>'.repeat(9)}</div>`;

/** The whole sample window for a model: bars, document, floating groups. */
export function windowHTML(model: Model, auto: ReadonlySet<string> = new Set()): string {
  const floats = model.float.map((f) => `<div class="floating" style="${floatStyle(f)}">${groupHTML(model, f.id, auto)}</div>`).join("");
  return `${barHTML(model, "title", auto)}${barHTML(model, "top", auto)}<div class="mid">${barHTML(model, "left", auto)}<div class="docarea stage-host">${PAPER}</div>${barHTML(model, "right", auto)}${floats}</div>${barHTML(model, "bottom", auto)}`;
}
