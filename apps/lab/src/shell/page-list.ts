/**
 * Every page the Checks page runs (the pages listed in ./pages; the old routes are aliases of the Document window,
 * not pages of their own), as the shell registers them at start: the Checks page reads them here instead of importing
 * ./pages, which loads it.
 */
import type { PageDef } from "./page-defs";

let pages: readonly PageDef[] = [];

/** The shell's call, once, before any page loads. */
export function setPageList(list: readonly PageDef[]): void {
  pages = list;
}

/** The pages registered. */
export const pageList = (): readonly PageDef[] => pages;
