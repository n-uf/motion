/**
 * Draws a @n-uf/placement/stack fit: one element per item at its rect, dressed by the form's kind, and the » entry
 * where the items that gave way up stand. The package gives forms, kinds and rects; the words are this page's.
 */
import type { Rect } from "@n-uf/motion";
import type { StackAxis, StackFit, StackFormKind } from "@n-uf/placement/stack";
import { SAMPLES, badgeOf, isPanel, titleOf, type ItemId, type ItemMeta } from "./sample";

const dots = '<span class="st-grip" aria-hidden="true">' + "<i></i>".repeat(6) + "</span>";

/** What an item's element holds in a form. */
export function dress(id: string, kind: StackFormKind, meta?: ItemMeta): string {
  const s = SAMPLES[id as ItemId];
  const title = titleOf(id);
  // With a meta: a count badge in a fixed slot (it never changes the item's size; `fluid` makes it as wide as its digits), and a phase line in an open panel.
  const num = meta ? `<span class="st-num" title="${meta.count}">${meta.fluid ? Math.max(0, Math.floor(meta.count)) : badgeOf(meta.count)}</span>` : "";
  const phase = meta ? `<li class="st-phase">${meta.phase}</li>` : "";
  switch (kind) {
    case "open":
      return `<div class="st-head" data-grab>${dots}<b>${title}</b>${num}</div><ul class="st-body">${phase}${s.words.map((w) => `<li>${w}</li>`).join("")}</ul>`;
    case "header":
      return `<div class="st-head" data-grab>${dots}<b>${title}</b>${num}<span class="st-caret" aria-hidden="true">▸</span></div>`;
    case "rail":
      return `<span class="st-badge" data-grab title="${title}">${title[0]}</span><i class="st-count">${meta ? badgeOf(meta.count) : s.words.length}</i>`;
    case "row":
      return `<span class="st-gh" data-grab>${dots}</span>${s.words.map((w) => `<span class="st-pill">${w}</span>`).join("")}${num}`;
    case "stacked":
      return `<span class="st-gh" data-grab>${dots}</span><span class="st-col">${s.words.map((w) => `<span class="st-pill">${w}</span>`).join("")}</span>${num}`;
    case "icons":
      return `<span class="st-gh" data-grab title="${title}">${dots}</span>${s.words.map((w) => `<span class="st-pill st-ico" title="${w}">${w[0]}</span>`).join("")}`;
    case "menu":
      return "";
  }
}

export interface StackView {
  readonly el: HTMLElement;
  readonly axis: StackAxis;
  /** Draw `fit`; `skip` is an id not drawn (the item held under the pointer). */
  draw(fit: StackFit, skip?: string): void;
  /** The element of an item, if it is in the stack as drawn last. */
  itemEl(id: string): HTMLElement | undefined;
  readonly menuEl: HTMLElement;
  /** Every drawn item's rect as the DOM has it, relative to the stack's element. */
  drawn(): Map<string, Rect>;
  /** The fit last drawn. */
  fit(): StackFit | null;
}

const px = (n: number): string => `${n}px`;

/** `meta` gives an item's count and phase (the pages that show them); without it nothing is badged. */
export function createStackView(parent: HTMLElement, axis: StackAxis, label: string, meta?: (id: string) => ItemMeta | undefined): StackView {
  const el = document.createElement("div");
  el.className = `st-stack st-${axis}`;
  el.dataset.axis = axis;
  el.setAttribute("role", "group");
  el.setAttribute("aria-label", label);
  const menuEl = document.createElement("button");
  menuEl.type = "button";
  menuEl.className = "st-menu";
  menuEl.hidden = true;
  menuEl.setAttribute("aria-label", "More");
  const list = document.createElement("ul");
  list.className = "st-menu-list";
  list.hidden = true;
  el.append(menuEl, list);
  parent.append(el);
  const items = new Map<string, HTMLElement>();
  let last: StackFit | null = null;
  menuEl.addEventListener("click", () => {
    list.hidden = !list.hidden;
  });
  const put = (n: HTMLElement, r: Rect): void => {
    n.style.left = px(r.x);
    n.style.top = px(r.y);
    n.style.width = px(r.width);
    n.style.height = px(r.height);
  };

  return {
    el,
    axis,
    menuEl,
    draw(fit, skip) {
      last = fit;
      el.style.width = px(axis === "column" ? fit.cross : fit.length);
      el.style.height = px(axis === "column" ? fit.length : fit.cross);
      const live = new Set(fit.items.map((p) => p.id));
      for (const [id, n] of items) {
        if (!live.has(id)) {
          n.remove();
          items.delete(id);
        }
      }
      for (const p of fit.items) {
        let n = items.get(p.id);
        if (!n) {
          n = document.createElement("section");
          n.className = `st-item ${isPanel(p.id) ? "st-panel" : "st-group"}`;
          n.dataset.id = p.id;
          el.append(n);
          items.set(p.id, n);
        }
        const m = meta?.(p.id);
        const sig = `${p.kind}|${m?.count}|${m?.phase}|${m?.fluid}`;
        if (n.dataset.sig !== sig) {
          n.dataset.sig = sig;
          n.dataset.kind = p.kind;
          n.innerHTML = dress(p.id, p.kind, m);
        }
        if (m) n.dataset.phase = m.phase;
        n.dataset.form = String(p.form);
        n.hidden = p.kind === "menu" || p.id === skip;
        if (p.kind !== "menu") put(n, p.rect);
      }
      if (fit.menu) {
        put(menuEl, fit.menu.rect);
        menuEl.hidden = false;
        menuEl.textContent = `» ${fit.menu.items.length}`;
        menuEl.title = fit.menu.items.map(titleOf).join(", ");
        list.innerHTML = fit.menu.items.map((id) => `<li>${titleOf(id)}</li>`).join("");
      } else {
        menuEl.hidden = true;
        list.hidden = true;
      }
      // The list opens beside the » entry, on the stack's inside.
      if (fit.menu) {
        const r = fit.menu.rect;
        list.style.left = px(axis === "column" ? Math.max(0, r.x - 6) : r.x);
        list.style.top = px(axis === "column" ? Math.max(0, r.y - 24 * fit.menu.items.length - 6) : r.y + r.height + 4);
      }
    },
    itemEl: (id) => items.get(id),
    drawn() {
      const base = el.getBoundingClientRect();
      const out = new Map<string, Rect>();
      for (const [id, n] of items) {
        if (n.hidden) continue;
        const r = n.getBoundingClientRect();
        out.set(id, { x: r.left - base.left - el.clientLeft, y: r.top - base.top - el.clientTop, width: r.width, height: r.height });
      }
      return out;
    },
    fit: () => last,
  };
}
