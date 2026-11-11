// Questions and answers, shown on a page and in its FAQPage structured data (answers word for word as shown).
// None yet: a page that shows questions adds its own list here. An answer is a list of paragraphs (may hold <code>).
// `id` makes the question linkable.
export interface QA { id?: string; q: string; a: string[] }
export interface Group { title: string; items: QA[] }

/** An answer as plain text (tags removed), for the FAQPage structured data. */
export const plain = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
