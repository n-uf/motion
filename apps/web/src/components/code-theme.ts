// A Shiki theme made of the site's tokens: light and dark come from tokens.css, contrast included. Shared by every
// code block the site colours at build time (CodeTabs, PairCode).
export const codeTheme = {
  name: "motion-tokens",
  type: "light",
  colors: { "editor.foreground": "var(--code-text)", "editor.background": "var(--code-bg)" },
  tokenColors: [
    { settings: { foreground: "var(--code-text)" } },
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "var(--code-comment)", fontStyle: "italic" } },
    { scope: ["keyword", "storage", "storage.type", "storage.modifier", "punctuation.definition.template-expression"], settings: { foreground: "var(--code-keyword)" } },
    { scope: ["keyword.operator", "punctuation", "meta.brace"], settings: { foreground: "var(--code-punct)" } },
    { scope: ["string", "string.template", "punctuation.definition.string"], settings: { foreground: "var(--code-string)" } },
    { scope: ["constant.numeric", "constant.language"], settings: { foreground: "var(--code-number)" } },
    { scope: ["entity.name.type", "support.type", "support.class", "entity.name.type.alias"], settings: { foreground: "var(--code-type)" } },
    { scope: ["entity.name.function", "support.function", "meta.function-call entity.name.function"], settings: { foreground: "var(--code-function)" } },
  ],
};
