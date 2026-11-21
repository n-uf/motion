/**
 * Light syntax coloring for the Code view: a tiny tokenizer over the generated TypeScript (comments, strings, numbers,
 * keywords), as HTML with one span per token; the colors are CSS (`.tk-c`, `.tk-s`, `.tk-n`, `.tk-k` in ./docwin.css).
 * Everything else is left as text. No dependency.
 */
const KEYWORDS = new Set(["import", "from", "export", "const", "let", "type", "interface", "declare", "as", "true", "false", "null", "undefined", "return"]);

const TOKEN = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|((?<![\w$.])-?\d+(?:\.\d+)?(?![\w$]))|([A-Za-z_$][\w$]*)/g;

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** `code` as HTML: tokens wrapped in `<span class="tk-…">`, the rest escaped text. */
export function highlight(code: string): string {
  let out = "";
  let at = 0;
  for (const m of code.matchAll(TOKEN)) {
    const [text, comment, string, number, word] = m;
    const cls = comment ? "tk-c" : string ? "tk-s" : number ? "tk-n" : word && KEYWORDS.has(word) ? "tk-k" : null;
    out += esc(code.slice(at, m.index));
    out += cls ? `<span class="${cls}">${esc(text)}</span>` : esc(text);
    at = m.index + text.length;
  }
  return out + esc(code.slice(at));
}
