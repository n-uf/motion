// Questions and answers, shown on a page and in its FAQPage structured data (answers word for word as shown).
// A page that shows questions has its list in FAQS below, keyed by its path. An answer is one paragraph (it may hold
// <code>), opening with the direct answer, 40 to 60 words (scripts/faq.test.mjs checks the count). Facts come only
// from the packages' READMEs; nothing about the tiling entry, which isn't shipped.
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
      a: "Yes. Neither package needs React or any framework. <code>@n-uf/motion</code> has no DOM, no framework and no globals in its core: the host hands in a clock. <code>@n-uf/placement</code> is pure functions over plain data with no DOM and no dependencies, so you can call both from plain TypeScript or from any framework's code.",
    },
    {
      q: "How do I handle long press, pinch, double click and wheel gestures in JavaScript?",
      a: "Feed pointer, wheel and trackpad events to <code>createRecognizer</code> from <code>@n-uf/motion</code>. It turns plain objects copied from DOM events into one gesture stream: click or drag, double click, long press, pinch, scroll and zoom. Nothing in it touches the DOM, and by default a touch long press fires after 500 ms.",
    },
    {
      q: "How do I position a popup or menu next to its anchor?",
      a: "Use <code>positionPopup</code> from <code>@n-uf/placement</code>. Give it the anchor rect, popup size, bounds and a rule (anchor point, gravity, offset, and whether it may flip, slide or resize), and it flips, slides or resizes the popup to fit, as far as the rule allows, like Wayland's xdg-positioner. It works on plain data and moves nothing, so your app does the drawing.",
    },
    {
      q: "What license is @n-uf/motion under, and is it stable?",
      a: "It is under PolyForm Perimeter 1.0.1, and it is not yet stable. Versions are dates (YY.M.R), not semantic versions, so any release may break things, including how springs settle and how gestures are timed. Pin an exact version and read the CHANGELOG before you upgrade. <code>@n-uf/placement</code> has the same license and its own not-yet-stable notice.",
    },
    {
      q: "How do @n-uf/motion and @n-uf/placement work together?",
      a: "Placement computes where things go and motion moves them, and neither imports the other. A target list from <code>targets</code> in <code>@n-uf/placement/scene</code> is exactly what the drag intent in <code>@n-uf/motion/drag</code> takes, and a rect from any placement layout is what <code>@n-uf/motion/layout</code> glides to. Each package also works alone.",
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
      a: "On the shown target whenever one shows: the drop is what was shown. With no indicator showing, a release lands on the target under the pointer, and otherwise on nothing. <code>release(point, targets)</code> returns that target, or null for home, and a release over home does nothing.",
    },
  ],
  "/desk-layouts/": [
    {
      q: "How do I drag a panel from one dock to another?",
      a: "Take drop targets from <code>targets(scene, id)</code> in <code>@n-uf/placement/scene</code>, which lists only the places the scene's edges accept, and feed them to <code>createDragIntent</code> from <code>@n-uf/motion/drag</code>. Each target carries what a release there makes: <code>target.after(point, grab)</code> returns the new scene and its layout, so the preview is the result. Placement draws nothing, so your app draws the rects, and <code>@n-uf/motion/layout</code> can glide the panels there.",
    },
    {
      q: "Which desk layouts can I build?",
      a: "Any you can describe as a <code>Scene</code> from <code>@n-uf/placement/scene</code>: edges along the window's sides (side columns, top and bottom docks, toolbars, reserved or over the content), the panels in them, and floats. This page lays out four: side docks with a bottom dock between the columns, the same with a full-width bottom dock, the same with panels that can float, and a navigator with tabs on the left. Panes that share an area with no overlap come from <code>./tiling</code>. The page's other five layouts are demos it draws by its own rules.",
    },
    {
      q: "What gives way when a desk runs out of room?",
      a: "In a scene, the least recently used section collapses to its header when a stacked column runs short of height. When width runs out under <code>contentMin</code>, the columns narrow, then the least recently used collapses to its rail. <code>solve</code> returns coded notes such as <code>column-folded</code>; your app supplies the wording. On this page, the bottom dock's height is the page's own rule: it shrinks, then collapses to a header bar, to keep the documents their least height.",
    },
  ],
  "/toolbar-groups/": [
    {
      q: "What happens to toolbar groups when the toolbar runs out of room?",
      a: "They step down their forms, a row of words, then icons, then the bar's » menu, lowest <code>priority</code> first and, among equal priorities, the one used longest ago. <code>solve</code> from <code>@n-uf/placement/scene</code> gives each group the form it took and lists the groups in the » menu in the bar's <code>menu</code>. Give a primary group a higher <code>priority</code> and it keeps its full form longest. Your app draws the groups.",
    },
    {
      q: "How many toolbar areas and zones can a toolbar group go in?",
      a: "Five toolbar areas, title, top, bottom, left and right, each with three zones: start, center and end. A group can also float. Insertion points cover before all, between groups, after all and an empty zone. In <code>@n-uf/placement/scene</code> each toolbar area is a bar edge, <code>solve</code> lays them out, and your app draws the result.",
    },
    {
      q: "How do I make toolbar groups draggable?",
      a: "Take drop targets from <code>targets(scene, id)</code> in <code>@n-uf/placement/scene</code>, and feed them to <code>createDragIntent</code> from <code>@n-uf/motion/drag</code>. The list holds every gap in every bar that accepts the group, the float target when groups may float, and the group's own place as its home. Every target carries the layout a release there makes, so the rect the group fills once it lands is <code>target.after(point, grab).layout.items[id].rect</code>.",
    },
    {
      q: "How do I save and restore a toolbar layout?",
      a: "Use <code>storeScene</code> and <code>readScene</code> from <code>@n-uf/placement/scene</code>. <code>storeScene</code> returns versioned plain data that you stringify. Pass the parsed data, not the string, to <code>readScene</code> with your starting scene: it never throws, an unknown version gives your starting scene back with the reason in <code>error</code>, and whatever it can't use is listed in <code>dropped</code>. Groups added since the save go where the starting scene has them.",
    },
    {
      q: "How do I step through drop targets with the keyboard?",
      a: "Use <code>stops(scene, id)</code> from <code>@n-uf/placement/scene</code>. It returns the group's targets in reading order, the left side, the top bars, the bottom bars, the right side and floating last, for the arrow keys and a \"Move to\" menu. Each stop is a target, so its <code>after</code> is the move. Your app handles the keys and draws the focus.",
    },
  ],
};
