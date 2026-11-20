// Questions and answers, shown on a page and in its FAQPage structured data (answers word for word as shown).
// A page that shows questions has its list in FAQS below, keyed by its path. An answer is one paragraph (it may hold
// <code>), opening with the direct answer, 40 to 60 words (scripts/faq.test.mjs checks the count). Facts come only
// from the packages' READMEs and docs. Tiling is named only as the shipped entry, `./tiling`, never as a topic of its own.
import { faqPage } from "./schema";

export interface QA { id?: string; q: string; a: string }

/** An answer as plain text (tags removed), for the FAQPage structured data. */
const plain = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** The page's FAQPage node: exactly the questions and answers the page shows (answers as plain text). */
export const faqJsonLd = (path: string) => faqPage((FAQS[path] ?? []).map(({ q, a }) => ({ q, a: plain(a) })));

export const FAQS: Record<string, QA[]> = {
  "/": [
    {
      q: "Can I use @n-uf/motion without React?",
      a: "Yes. None of the three libraries needs React or any framework. <code>@n-uf/motion</code> has no DOM, no framework and no globals in its core: the host hands in a clock. <code>@n-uf/placement</code> and <code>@n-uf/docking</code> are pure functions over plain data with no DOM and no framework, so you can call all three from plain TypeScript or from any framework's code.",
    },
    {
      q: "How do I handle long press, pinch, double click and wheel gestures in JavaScript?",
      a: "Feed pointer, wheel and trackpad events to <code>createRecognizer</code> from <code>@n-uf/motion</code>. It turns plain objects copied from DOM events into one gesture stream: click or drag, double click, long press, pinch, scroll and zoom. Nothing in it touches the DOM, and by default a touch long press fires after 500 ms.",
    },
    {
      q: "How do I position a popup or menu next to its anchor?",
      a: "Use <code>positionPopup</code> from <code>@n-uf/placement/popup</code>. Give it the anchor rect, popup size, bounds and a rule (anchor point, gravity, offset, and whether it may flip, slide or resize), and it flips, slides or resizes the popup to fit, as far as the rule allows, like Wayland's xdg-positioner. It works on plain data and moves nothing, so your app does the drawing.",
    },
    {
      q: "What license are the n-uf libraries under, and are they stable?",
      a: "<code>@n-uf/motion</code>, <code>@n-uf/placement</code> and <code>@n-uf/docking</code> are all under PolyForm Perimeter 1.0.1, and none is stable yet. Versions are dates (YY.M.R), not semantic versions, so any release may break things, including how springs settle and how gestures are timed. Pin an exact version and read the CHANGELOG before you upgrade.",
    },
    {
      q: "How do the three libraries work together?",
      a: "Motion moves things, placement works out where they fit, and docking works out where they dock. Motion imports neither of the others. A target list from <code>targets</code> in <code>@n-uf/docking</code> is exactly what the drag intent in <code>@n-uf/motion/drag</code> takes, and a rect from placement or docking is what <code>@n-uf/motion/layout</code> glides to. Each library also works alone.",
    },
    {
      q: "Does @n-uf/docking draw panels and tabs?",
      a: "No. <code>@n-uf/docking</code> draws nothing and touches no DOM. It holds the dock state (bars, rails, columns, items and floats) and works out rects and drop targets from it, as plain data. Your app draws the panels and tabs and reads the pointer, and <code>@n-uf/motion</code> can glide the rects.",
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
      q: "What do hysteresis and the switch delay do in drag intent?",
      a: "Hysteresis keeps the current target while the pointer stays within a 10 px margin of its hit area, unless a more precise target is under the pointer. A switch delay applies to changing targets: an aiming pointer moves the indicator only once the new target has held 150 ms. The other panels make room after 160 ms on one target.",
    },
    {
      q: "Does drag intent fix the HTML5 dragenter and dragleave problem?",
      a: "No. Drag intent is not a fix for the browser's HTML5 dragenter and dragleave events. It decides from the pointer's path when a drop indicator shows, which target it shows, when the others make room and what a release lands on. It is pure: the host feeds it the pointer once a frame and plain-data targets.",
    },
    {
      q: "Where does a dragged item land when I release it?",
      a: "On the shown target whenever one shows: the drop is what was shown. With no indicator showing, a release lands on the target under the pointer, and otherwise on nothing. <code>release(point, time, targets)</code> returns that target, or null for home, and a release over home does nothing.",
    },
  ],
  "/docking-layouts/": [
    {
      q: "How do I drag a panel from one dock to another?",
      a: "Take drop targets from <code>targets(state, id)</code> in <code>@n-uf/docking</code>, which lists only the places the dock state's edges accept, and feed them to <code>createDragIntent</code> from <code>@n-uf/motion/drag</code>. Each <code>DockDrop</code> carries what a release there makes: <code>target.after(point, grab)</code> returns the new dock state and its layout, so the preview is the result. Your app draws the rects.",
    },
    {
      q: "Which docking layouts can I build?",
      a: "Any you can describe as a <code>DockState</code> from <code>@n-uf/docking</code>: edges along the window's sides (columns, docks, toolbars), the panels in them, and floats. This page lays out four: side docks with a bottom dock, the same with a full-width dock, the same with floating panels, and a navigator. Panes that share an area come from <code>./tiling</code> in <code>@n-uf/placement</code>.",
    },
    {
      q: "What gives way when a docked window runs out of room?",
      a: "The least recently used section collapses to its header when a column runs short of height. Short of width (<code>contentMin</code>), columns narrow, then the least recently used collapses to its rail. A dock with <code>giveWay</code> shrinks, then collapses to a header bar. <code>solve</code> returns coded notes such as <code>column-folded</code>; your app supplies the wording.",
    },
  ],
  "/toolbar-groups/": [
    {
      q: "What happens to toolbar groups when the toolbar runs out of room?",
      a: "They step down their forms, a row of words, then icons, then the bar's » menu, lowest <code>priority</code> first, then the one used longest ago. <code>solve</code> from <code>@n-uf/docking</code> gives each group its form and lists the menu's groups in the bar's <code>menu</code>. A higher <code>priority</code> keeps a group's full form longest.",
    },
    {
      q: "How many toolbar areas and zones can a toolbar group go in?",
      a: "Five toolbar areas, title, top, bottom, left and right, each with three zones: start, center and end. A group can also float. Insertion points cover before all, between groups, after all and an empty zone. In <code>@n-uf/docking</code> each toolbar area is a bar edge, <code>solve</code> lays them out, and your app draws the result.",
    },
    {
      q: "How do I make toolbar groups draggable?",
      a: "Take drop targets from <code>targets(state, id)</code> in <code>@n-uf/docking</code>, and feed them to <code>createDragIntent</code> from <code>@n-uf/motion/drag</code>. The list holds every gap in every bar that accepts the group, the float target when groups may float, and the group's home. Each target carries the layout a release makes: the group's rect once it lands is <code>target.after(point, grab).layout.items[id].rect</code>.",
    },
    {
      q: "How do I save and restore a toolbar layout?",
      a: "Use <code>storeDockState</code> and <code>readDockState</code> from <code>@n-uf/docking</code>. <code>storeDockState</code> returns versioned plain data that you stringify. Pass the parsed data to <code>readDockState</code> with your starting dock state: it never throws, an unknown version gives that state back with the reason in <code>error</code>, and what it can't use is listed in <code>dropped</code>. Groups added later go where the starting state has them.",
    },
    {
      q: "How do I step through drop targets with the keyboard?",
      a: "Use <code>stops(state, id)</code> from <code>@n-uf/docking</code>. It returns the group's targets in reading order, the left side, the top bars, the bottom bars, the right side and floating last, for the arrow keys and a \"Move to\" menu. Each stop is a target, so its <code>after</code> is the move. Your app handles the keys and draws the focus.",
    },
  ],
};
