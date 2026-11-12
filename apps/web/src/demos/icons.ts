/** Small 16 px stroke icons for the sample toolbars. */
const P: Record<string, string> = {
  pointer: `<path d="M4 2.5l8 5.2-3.6.9-1.7 3.4z"/>`,
  text: `<path d="M3.5 13L8 3l4.5 10M5.2 9.5h5.6"/>`,
  eraser: `<path d="M6 13.5h7M2.8 9.6l6-6a1.4 1.4 0 0 1 2 0l2.1 2.1a1.4 1.4 0 0 1 0 2L8.3 12.3a1.4 1.4 0 0 1-1 .4H5.6a1.4 1.4 0 0 1-1-.4L2.8 10.6a.7.7 0 0 1 0-1z"/>`,
  rect: `<rect x="3" y="3.5" width="10" height="9" rx="1.5"/>`,
  pen: `<path d="M10.5 2.8l2.7 2.7-7.7 7.7-3.3.6.6-3.3z"/>`,
  single: `<rect x="4" y="2.5" width="8" height="11" rx="1.2"/>`,
  spread: `<rect x="1.8" y="3" width="5.6" height="10" rx="1"/><rect x="8.6" y="3" width="5.6" height="10" rx="1"/>`,
  panel: `<rect x="2.5" y="3" width="11" height="10" rx="1.5"/><path d="M6.5 3v10"/>`,
  notes: `<path d="M4 2.5h6l2.5 2.5v8.5H4zM6 7h4.5M6 9.5h4.5"/>`,
  preview: `<path d="M1.8 8s2.3-4.5 6.2-4.5S14.2 8 14.2 8 11.9 12.5 8 12.5 1.8 8 1.8 8z"/><circle cx="8" cy="8" r="1.8"/>`,
  download: `<path d="M8 2.5v8M4.8 7.5L8 10.7l3.2-3.2M3 13.5h10"/>`,
  share: `<path d="M8 10V2.5M5 5.3L8 2.5l3 2.8M4.5 7.5H3.5v6h9v-6h-1"/>`,
  print: `<path d="M4.5 6V2.5h7V6M4.5 11H2.5V6h11v5h-2M4.5 9h7v4.5h-7z"/>`,
  minus: `<path d="M4 8h8"/>`,
  plus: `<path d="M4 8h8M8 4v8"/>`,
  // The drop previews' compact forms, each a tiny picture of its mode: a dashed outline (Drop indicator), two blocks
  // with a gap between them (Open gap), a block seated in a slot (Snap to slot). And ⇄ for the layouts' "next".
  "drop-indicator": `<rect x="2.5" y="3.5" width="11" height="9" rx="1.5" stroke-dasharray="2.2 1.8"/>`,
  "drop-gap": `<rect x="1.5" y="4" width="4.5" height="8" rx="1"/><rect x="10" y="4" width="4.5" height="8" rx="1"/>`,
  "drop-snap": `<path d="M2 6.5v6h12v-6"/><rect x="5" y="3" width="6" height="7.5" rx="1"/>`,
  swap: `<path d="M3 5.5h9.5M10.2 3.2l2.3 2.3-2.3 2.3M13 10.5H3.5M5.8 8.2l-2.3 2.3 2.3 2.3"/>`,
};

export function icon(name: string): string {
  return `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true">${P[name] ?? ""}</svg>`;
}
