import { validateTheme, type Theme } from "@rosetta/contracts";

export type { Theme } from "@rosetta/contracts";

/** Token name to CSS value, such as `{ "font.body": "Georgia, serif" }`. */
export type Tokens = Record<string, string>;

/**
 * Changes made on top of a theme, for example by a book: tokens for everything, and tokens for single components.
 * Same shape as the token part of a theme.
 */
export interface Overrides {
  tokens?: Tokens;
  components?: Record<string, Tokens>;
}

/** `font.body` becomes `--font-body`. */
export const propertyName = (token: string) => `--${token.replace(/\./g, "-")}`;

/**
 * The value of every token, for the page (no component) or for one component.
 *
 * Cascade, most specific first: the component's override (the book's, then the theme's), then the book's
 * tokens, then the theme's defaults. A component only gets the tokens that differ from the page; the rest it inherits.
 */
export function resolveTokens(theme: Theme, overrides: Overrides = {}, component?: string): Tokens {
  const page = { ...theme.tokens, ...overrides.tokens };
  if (component === undefined) return page;
  return { ...page, ...theme.components?.[component], ...overrides.components?.[component] };
}

/** Throws if a value could end its declaration early or open a rule: `;`, `{` or `}` outside quotes, or unbalanced quotes and parentheses. */
function checkValue(token: string, value: string) {
  let quote = "";
  let depth = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i]!;
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = "";
      else if (c === "\n") break;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "{" || c === "}" || c === "<") throw new Error(`theme token ${token}: "${c}" is not allowed in a value`);
    else if (c === ";" && depth === 0) throw new Error(`theme token ${token}: ";" is not allowed in a value`);
    else if (c === "/" && value[i + 1] === "*") throw new Error(`theme token ${token}: comments are not allowed in a value`);
    if (depth < 0) break;
  }
  if (quote || depth !== 0) throw new Error(`theme token ${token}: unbalanced quote or parenthesis in "${value}"`);
}

function declarations(tokens: Tokens, indent = "  ") {
  return Object.entries(tokens)
    .map(([token, value]) => {
      checkValue(token, value);
      return `${indent}${propertyName(token)}: ${value};`;
    })
    .join("\n");
}

/**
 * Compiles a theme (and the book's overrides) to CSS custom properties: the page values on `:root`, then one rule per
 * component with the tokens it changes, selected by `[data-component="name"]` (what the parser and the editor both put on a component).
 * Components inherit what they do not change, so the browser does the rest of the cascade.
 *
 * Throws on a theme that does not follow the schema, or a value that is not safe to put in CSS.
 */
export function compileTheme(theme: Theme, overrides: Overrides = {}): string {
  const checked = validateTheme({ ...theme, tokens: { ...theme.tokens, ...overrides.tokens }, components: mergedComponents(theme, overrides) });
  if (!checked.valid) throw new Error(`invalid theme: ${checked.errors.join("; ")}`);

  const page = resolveTokens(theme, overrides);
  const rules = [`:root {\n${declarations(page)}\n}`];
  const names = new Set([...Object.keys(theme.components ?? {}), ...Object.keys(overrides.components ?? {})]);
  for (const name of [...names].sort()) {
    const own = { ...theme.components?.[name], ...overrides.components?.[name] };
    // A component only restates what differs from the page; its own tokens win over the book's.
    if (Object.keys(own).length) rules.push(`[data-component="${name}"] {\n${declarations(own)}\n}`);
  }
  return rules.join("\n\n") + "\n";
}

function mergedComponents(theme: Theme, overrides: Overrides) {
  const names = new Set([...Object.keys(theme.components ?? {}), ...Object.keys(overrides.components ?? {})]);
  if (!names.size) return undefined;
  return Object.fromEntries([...names].map((n) => [n, { ...theme.components?.[n], ...overrides.components?.[n] }]));
}
