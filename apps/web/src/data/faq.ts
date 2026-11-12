// Questions and answers, shown on a page and in its FAQPage structured data (answers word for word as shown).
// A page that shows questions has its list in FAQS below, keyed by its path. An answer is one paragraph (it may hold
// <code>), opening with the direct answer, 40 to 60 words (scripts/faq.test.mjs checks the count). Facts come only
// from the packages' READMEs; nothing about the tiling entry, which isn't shipped.
import { faqPage } from "./schema";

export interface QA { id?: string; q: string; a: string }

/** An answer as plain text (tags removed), for the FAQPage structured data. */
export const plain = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** The page's FAQPage node: exactly the questions and answers the page shows (answers as plain text). */
export const faqJsonLd = (path: string) => faqPage((FAQS[path] ?? []).map(({ q, a }) => ({ q, a: plain(a) })));

export const FAQS: Record<string, QA[]> = {
  "/": [
    {
      q: "Can I use @n-uf/motion without React?",
      a: "Yes. Neither package needs React or any framework. <code>@n-uf/motion</code> has no DOM, no framework and no globals in its core: the host hands in a clock. <code>@n-uf/placement</code> is pure functions over plain data with no DOM and no dependencies, so you can call both from plain TypeScript or from any framework's code.",
    },
    {
      q: "How do I handle long press, pinch, double click and wheel gestures in JavaScript?",
      a: "Feed pointer, wheel and trackpad events to <code>createRecognizer</code> from <code>@n-uf/motion</code>. It turns plain objects copied from DOM events into one gesture stream: click or drag, double click, long press, pinch, scroll and zoom. Nothing in it touches the DOM, and by default a touch long press fires after 500 ms.",
    },
    {
      q: "How do I position a popup or menu next to its anchor?",
      a: "Use <code>positionPopup</code> from <code>@n-uf/placement</code>. Give it an anchor, a gravity and an offset, and it then flips, slides and resizes the popup to fit, as Wayland's xdg-positioner does. Like everything in the package it works on plain data and moves nothing, so your app does the drawing.",
    },
    {
      q: "What license is @n-uf/motion under, and is it stable?",
      a: "It is under PolyForm Perimeter 1.0.1, and it is not yet stable. Versions are dates (YY.M.R), not semantic versions, so any release may break things, including how springs settle and how gestures are timed. Pin an exact version and read the CHANGELOG before you upgrade. <code>@n-uf/placement</code> carries the same notice.",
    },
    {
      q: "How do @n-uf/motion and @n-uf/placement work together?",
      a: "Placement computes where things go and motion moves them, and neither imports the other. A target list from <code>@n-uf/placement/targets</code> is exactly what the drag intent in <code>@n-uf/motion/drag</code> takes, and a rect from any placement layout is what <code>@n-uf/motion/layout</code> glides to. Each package also works alone.",
    },
  ],
  "/window-motion/": [
    {
      q: "Why does the settle never overshoot its target?",
      a: "Because <code>createSettle</code> follows <code>distance · e^(−omega·t)</code>, a curve that only approaches its target. On every new target each component gets the velocity <code>omega · distance</code> toward it from wherever it is drawn, so there is no overshoot on position and no wobble on size, however often it is retargeted.",
    },
    {
      q: "What are the settle's tempo values?",
      a: "<code>SETTLE_TEMPO</code> has three: calm 20, default 25 and quick 37, as the <code>omega</code> in 1/s. They cover 90 % of the way in 115, 92 and 62 ms, then ease in to the target. Pass one as the <code>omega</code> option of <code>createSettle</code> or <code>settleValue</code>.",
    },
    {
      q: "How do I respect prefers-reduced-motion?",
      a: "Pass the <code>reducedMotion</code> option, and targets are reached at once, with no glide and no fade. <code>prefersReducedMotion()</code> from <code>@n-uf/motion/browser</code> returns a function that reads the <code>(prefers-reduced-motion: reduce)</code> media query, which is what the option takes. <code>settleValue</code>, <code>springValue</code> and <code>createLayoutMotion</code> all accept it.",
    },
    {
      q: "Does resizing a window stretch its content?",
      a: "Not when you use <code>reveal</code>. <code>reveal(drawn, target)</code> says how to draw a window gliding at <code>drawn</code> whose content is laid out at <code>target</code>: move the element, draw the frame at its animated size and clip the content. There is no scale and no layout per frame, so content is never stretched.",
    },
  ],
  "/drag-intent/": [
    {
      q: "How do I stop a drop indicator flickering between targets?",
      a: "Feed the pointer to <code>createDragIntent</code> from <code>@n-uf/motion/drag</code> and draw what it says. It shows an indicator only once the pointer has left the item's home, a target is under it, and the pointer aims, meaning it slows down or holds still. Crossing targets at speed shows nothing.",
    },
    {
      q: "What do hold and hysteresis do in drag intent?",
      a: "Hysteresis keeps the current target: it holds within a band around its zone, 10 px by default, unless a more precise target is clearly under the pointer. The hold applies to switching: an aiming pointer moves the indicator only once the new target has held 150 ms. The other panels make room after 160 ms on one target.",
    },
    {
      q: "Does drag intent fix the HTML5 dragenter and dragleave problem?",
      a: "No. It is not a fix for the browser's HTML5 dragenter and dragleave events, and it does not use them. Drag intent is a pure decision: your code feeds it the pointer once a frame plus plain-data targets, and it says which target shows, when the others make room and what a release lands on.",
    },
    {
      q: "Where does a dragged item land when I release it?",
      a: "On the shown target whenever one shows: the drop is what was shown. With no indicator showing, a release lands on the target under the pointer, and otherwise on nothing. <code>release(point, targets)</code> returns that target, or null for home, and a release over home does nothing.",
    },
  ],
  "/desk-layouts/": [
    {
      q: "How do I drag a panel from one dock to another?",
      a: "Build drop targets with <code>deskTargets</code> from <code>@n-uf/placement/targets</code> and feed them to <code>createDragIntent</code> from <code>@n-uf/motion/drag</code>. When the intent names a target, <code>deskDrop</code> returns its label and the slot the panel lands in. Placement draws nothing, so your app draws the rects, and <code>@n-uf/motion/layout</code> can glide the panels there.",
    },
    {
      q: "How do I save and restore a layout?",
      a: "For a toolbar's groups, use <code>storeArrangement</code> and <code>readArrangement</code> from <code>@n-uf/placement/toolbar</code>. <code>storeArrangement</code> returns versioned plain data that you stringify. Pass the parsed data, not the string, to <code>readArrangement</code>: it never throws, and an unknown version comes back as <code>ok: false</code>. Place groups added since the save with <code>resetGroup</code>.",
    },
    {
      q: "How do I step through drop targets with the keyboard?",
      a: "Order the targets with <code>keyboardStops</code> from <code>@n-uf/placement/targets</code>. It puts a toolbar group's targets in reading order, title, top, left, right, bottom and then start, centre, end, for the arrow keys and a \"Move to\" menu, with the group's own place as <code>home</code>. Your app handles the keys and draws the focus.",
    },
    {
      q: "What gives way when a desk runs out of room?",
      a: "Sections fold first, least recently used first, and then whole docks fold to their rails. Each layout also returns notes saying how it gave way, such as <code>bottom-folded</code>, <code>dock-folded</code> and <code>sections-folded</code>. A note's <code>code</code> is the stable contract; its English <code>text</code> is for people and may change in any release.",
    },
  ],
  "/toolbar-groups/": [
    {
      q: "What happens to toolbar groups when the toolbar runs out of room?",
      a: "They fold from the trailing end first. <code>layoutHost</code> from <code>@n-uf/placement/toolbar</code> lists the folded groups in <code>overflow</code>. Give a primary group a higher <code>keep</code> and it keeps its full form longest; groups with equal keeps still fold from the trailing end. Your app draws the folded groups.",
    },
    {
      q: "How many hosts and zones can a toolbar group go in?",
      a: "Five hosts, title, top, bottom, left and right, each with three zones: start, centre and end. A group can also float. Insertion points cover before all, between groups, after all and an empty zone. <code>@n-uf/placement/toolbar</code> lays this out, and your app draws the result.",
    },
    {
      q: "How do I make toolbar groups draggable?",
      a: "Take drop targets from <code>hostTargets</code> and <code>floatTarget</code> in <code>@n-uf/placement/targets</code>, and feed them to <code>createDragIntent</code> from <code>@n-uf/motion/drag</code>. <code>hostTargets</code> leaves the group's own place out and returns it as <code>own</code>, for the drag's home, and every target carries its <code>slot</code>, the rect the group fills once it lands there.",
    },
    {
      q: "Can I stop a toolbar group from going to certain places?",
      a: "Yes. Pass an <code>allows(group, place)</code> function to <code>hostTargets</code>, and the places a group may not go get no target. Use the same rule for floating: add <code>floatTarget</code> only when <code>allows(group, \"float\")</code> is true. Its <code>place.index</code> counts the groups there without the dragged one.",
    },
  ],
};
