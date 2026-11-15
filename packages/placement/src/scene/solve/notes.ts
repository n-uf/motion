/** The notes about the content itself: narrower or shorter than `contentMin`, moved since `previous`. */
import { EPS, type Rect } from "../../geometry";
import type { Draft } from "./draft";
import { isSide, px } from "./order";

export function contentNotes(d: Draft, content: Rect): void {
  const { scene, notes, previous } = d;
  if (scene.contentMin) {
    const minW = px(scene.contentMin.width);
    const minH = px(scene.contentMin.height);
    if (content.width < minW - EPS) notes.push({ code: "content-narrow", width: content.width, min: minW });
    // Overlay bars lie over the content: what they cover isn't the content's height.
    const bars = d.order.filter((e) => e.mode === "overlay" && !isSide(e)).reduce((s, e) => s + (d.edges[e.id]?.cross ?? 0), 0);
    if (content.height - bars < minH - EPS) notes.push({ code: "content-short", height: content.height - bars, min: minH });
  }
  if (previous) {
    const was = previous.content;
    const moved = Math.abs(was.x - content.x) > EPS || Math.abs(was.y - content.y) > EPS || Math.abs(was.width - content.width) > EPS || Math.abs(was.height - content.height) > EPS;
    if (moved) notes.push({ code: "content-changed", from: was, to: content });
  }
}
