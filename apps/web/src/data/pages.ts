// The pages that are not in a content collection: the one place for each page's title and description. The pages read
// them from here, with the page's last-change date from dates.mjs (their meta tags, h1 and share cards), and the Related cards and /llms.txt show them.
// Limits (n-uf-seo): title at most 60 characters, description 120 to 155.
import { updated } from "./dates.mjs";

export interface PageInfo {
  path: string;
  title: string;
  description: string;
  updated: string;
  /** the short name in the top bar, the breadcrumb and the home page's links */
  nav: string;
}

export const pages: PageInfo[] = [
  { path: "/", updated: updated["/"], nav: "Home",
    title: "Window motion, placement and docking | n-uf motion",
    description: "Three TypeScript libraries for windows, panels and toolbars: @n-uf/motion moves them, @n-uf/placement fits them, @n-uf/docking docks panels and toolbars." },
  // Inner pages: what the page is, plus " | n-uf motion" only when the whole fits in 60 characters.
  { path: "/window-motion/", updated: updated["/window-motion/"], nav: "Window motion",
    title: "Window motion rules: settle, direct drag, reveal",
    description: "How windows move in Hyprland, in hypr-tiling and under settle: real curves, a direct drag, a retarget mid-flight, and stretch versus reveal in frames." },
  { path: "/drag-intent/", updated: updated["/drag-intent/"], nav: "Drag intent",
    title: "Drag intent: a drop indicator only once you aim",
    description: "How a dragged panel finds its target: the indicator shows only once you aim, stays put at boundaries without flicker, and the drop lands where it showed." },
  { path: "/docking-layouts/", updated: updated["/docking-layouts/"], nav: "Docking layouts",
    title: "Docking layouts: four docked windows and five page sketches",
    description: "Nine ways to lay out a JavaScript docking workspace: four docked windows solved live by @n-uf/docking and five page sketches, and what gives way first." },
  { path: "/toolbar-groups/", updated: updated["/toolbar-groups/"], nav: "Toolbar groups",
    title: "Toolbar groups: one grip per group",
    description: "Toolbar groups on @n-uf/docking and @n-uf/motion: drag them between three bars and two side rails or float them, each led by one grip that is also its separator." },
];
export const pageOf = (path: string): PageInfo => {
  const p = pages.find((x) => x.path === path);
  if (!p) throw new Error(`no fixed page ${path}`);
  return p;
};
/** The four interactive pages, in reading order. */
export const demoPages = pages.filter((p) => p.path !== "/");
