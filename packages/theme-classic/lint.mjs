// Checks that a theme's CSS only reads tokens: no literal fonts, colors, borders or spacing.
// Usage: import { lintCss } from "./lint.mjs"; lintCss(css) -> string[] of problems (empty when clean).

// Properties whose value must be a token (var(--name)), or one of the plain keywords below.
const TOKEN_ONLY = [
  /^font-family$/, /^font$/, /^font-size$/, /^line-height$/, /^letter-spacing$/,
  /^color$/, /^background(-color|-image)?$/, /^text-decoration-color$/, /^fill$/, /^stroke$/,
  /^border(-(top|right|bottom|left))?(-(color|width|style))?$/, /^border-radius$/, /^outline(-.*)?$/, /^column-rule(-.*)?$/,
  /^box-shadow$/, /^text-shadow$/, /^mask(-image)?$/,
  /^margin(-.*)?$/, /^padding(-.*)?$/, /^gap$/, /^column-gap$/, /^column-count$/, /^size$/,
];
const PLAIN = new Set(["none", "0", "inherit", "initial", "unset", "currentcolor", "transparent", "auto", "normal"]);

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Every `property: value` in the CSS, at any depth (rules, @page, margin boxes). */
export function declarations(css) {
  const out = [];
  let depth = 0;
  let current = "";
  let paren = 0;
  let quote = "";
  const flush = () => {
    const i = current.indexOf(":");
    if (i > 0 && !/[{}]/.test(current)) {
      out.push({ property: current.slice(0, i).trim().toLowerCase(), value: current.slice(i + 1).trim() });
    }
    current = "";
  };
  for (const c of stripComments(css)) {
    if (quote) {
      current += c;
      if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'") { quote = c; current += c; continue; }
    if (c === "(") paren++;
    if (c === ")") paren--;
    if (c === "{" && paren === 0) { depth++; current = ""; continue; } // a selector or at-rule prelude, not a declaration
    if (c === "}" && paren === 0) { if (current.trim()) flush(); depth--; current = ""; continue; }
    if (c === ";" && paren === 0) { flush(); continue; }
    current += c;
  }
  return out;
}

const withoutStrings = (v) => v.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, "");
const withoutTokens = (v) => v.replace(/var\(\s*--[a-z0-9-]+\s*\)/gi, " ");

export function lintCss(css) {
  const problems = [];
  for (const { property, value } of declarations(css)) {
    const where = `${property}: ${value}`;
    if (property.startsWith("--")) {
      problems.push(`${where}: a theme's CSS reads tokens, it does not define them (put it in theme.json)`);
      continue;
    }
    const plain = withoutStrings(value);
    if (/#[0-9a-f]{3,8}\b/i.test(plain) || /\b(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(/i.test(plain)) {
      problems.push(`${where}: hardcoded color`);
      continue;
    }
    if (!TOKEN_ONLY.some((re) => re.test(property))) continue;
    const rest = withoutTokens(plain).split(/[\s,/]+/).filter(Boolean);
    const bad = rest.filter((word) => !PLAIN.has(word.toLowerCase()));
    if (bad.length) problems.push(`${where}: hardcoded ${bad.join(" ")} (use a token)`);
  }
  return problems;
}
