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
    title: "n-uf motion: window motion that settles, never overshoots",
    description: "A TypeScript motion library for windows, panels and toolbars: a settle that never overshoots, reveal without stretching, held drags, drag intent." },
  { path: "/window-motion/", updated: updated["/window-motion/"], nav: "Window motion",
    title: "Window motion rules: settle, hold, reveal | n-uf motion",
    description: "How windows move in Hyprland, in a typical app and under settle: real curves, a held drag, a retarget mid-flight, and stretch versus reveal in frames." },
  { path: "/drag-intent/", updated: updated["/drag-intent/"], nav: "Drag intent",
    title: "Drag intent: drop targets once you aim | n-uf motion",
    description: "How a dragged panel finds its drop target: the indicator shows only once you aim, holds on borders without flicker, and the drop lands where it showed." },
  { path: "/desk-layouts/", updated: updated["/desk-layouts/"], nav: "Desk layouts",
    title: "Desk layouts: nine ways to dock panels | n-uf motion",
    description: "Nine ways to lay out a desk of tool panels and documents, from edge docks to floating palettes, and what each gives way as width or height runs out." },
  { path: "/toolbar-groups/", updated: updated["/toolbar-groups/"], nav: "Toolbar groups",
    title: "Toolbar groups: one drag handle per group | n-uf motion",
    description: "Toolbar groups that dock into five slots or float, each led by one drag handle that is also its separator, and a lock that hides every grip until Alt." },
];
export const pageOf = (path: string): PageInfo => {
  const p = pages.find((x) => x.path === path);
  if (!p) throw new Error(`no fixed page ${path}`);
  return p;
};
/** The four interactive pages, in reading order. */
export const demoPages = pages.filter((p) => p.path !== "/");
