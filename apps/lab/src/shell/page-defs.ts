/**
 * What a lab page is (`PageDef`) and the sidebar's groups. The pages themselves are listed in ./pages; the Checks page
 * reads them from ./page-list, which the shell fills, so it never imports the list that loads it.
 */

export type GroupId = "overview" | "motion" | "docwin" | "checks";
export const GROUPS: readonly { id: GroupId; title: string }[] = [
  { id: "overview", title: "Overview" },
  { id: "motion", title: "Motion" },
  { id: "docwin", title: "Document window" },
  { id: "checks", title: "Checks" },
];

/** Which scenarios a page runs: those whose name contains it, or passes it. */
export type View = string | ((scenario: string) => boolean);

export interface PageDef {
  /** The route: `#/<id>`. */
  readonly id: string;
  readonly group: GroupId;
  /** In the sidebar (default: the title). */
  readonly nav?: string;
  readonly title: string;
  /** One line on what it shows. */
  readonly line: string;
  /** More about it (HTML), folded under the line. */
  readonly about?: string;
  /** The page's markup, injected before its module loads. */
  readonly markup?: () => Promise<string>;
  /** The page module (it sets `window.__motionLab`), and its styles. */
  readonly load?: () => Promise<unknown>;
  /** The module behind it, for the Checks page: pages that share a module run it once. */
  readonly module?: string;
  /** The scenarios it runs (default: all of its module's). */
  readonly view?: View;
  /** Put this element first on the page. */
  readonly first?: string;
  /** The page's own Reset (a button's selector); default: reload the page. */
  readonly reset?: string;
  /** Room for a wide stage. */
  readonly wide?: boolean;
}
