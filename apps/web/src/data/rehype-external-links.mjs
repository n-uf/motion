// A rehype step for the articles' markdown: a link to another host opens in a new tab (n-uf's rule for its sites),
// with rel="noopener" (no noreferrer: the sites we
// link to may see the visit came from here), the small ↗ after the text and a note for screen readers, as the
// ExtLink component gives the hand-written links (src/components/ExtLink.astro).
// Inside a heading (h1-h6) the link still opens in a new tab, but gets neither the arrow nor the note: Astro makes the
// heading's id from its text after this step, and the contents list reads the same text, so they would end up in both.
// Plain JS with no imports, so that scripts/links.test.mjs can run it; astro.config.mjs passes in
// `isExternal` and the note from src/data/links.mjs, the one definition of "external" for the site.

/**
 * @param {{ isExternal: (href: string) => boolean, note: string }} options
 * @returns {() => (tree: object) => void} a rehype plugin
 */
export default function rehypeExternalLinks({ isExternal, note }) {
  const text = (value) => ({ type: 'text', value });
  const span = (properties, value) => ({ type: 'element', tagName: 'span', properties, children: [text(value)] });
  return () => {
    const visit = (node, inHeading) => {
      const heading = inHeading || (node.type === 'element' && /^h[1-6]$/.test(node.tagName));
      if (node.type === 'element' && node.tagName === 'a' && typeof node.properties?.href === 'string' && isExternal(node.properties.href)) {
        node.properties.target = '_blank';
        node.properties.rel = ['noopener'];
        if (!heading) {
          node.children.push(span({ className: ['ext-arrow'], ariaHidden: 'true' }, '↗'), span({ className: ['sr-only'] }, note));
        }
      }
      for (const child of node.children ?? []) visit(child, heading);
    };
    return (tree) => visit(tree, false);
  };
}
