# @rosetta/theme-engine

Compiles theme tokens to CSS custom properties.

## Use

```ts
import { compileTheme, resolveTokens } from "@rosetta/theme-engine";

const css = compileTheme(theme, bookOverrides); // :root { --font-body: ...; } [data-component="readaloud"] { ... }
const tokens = resolveTokens(theme, bookOverrides, "readaloud"); // the values one component sees
```

A theme is a JSON file (`Theme` in `@rosetta/contracts`): `tokens` are the defaults, `components` holds per-component overrides. Token `font.body` becomes `--font-body`; the categories are `font`, `color`, `border`, `spacing`, `texture`, `mask` and `page`.

`@page` rules (page size, margins, running headers) cannot read custom properties, so `inlinePageVariables(css, resolveTokens(theme, overrides))` writes the token values into them.

Cascade, most specific first: component override, then book, then theme default. The CSS has one `:root` rule and one `[data-component="name"]` rule per component, so the browser inherits the rest. Values that could break out of a declaration (`;`, `{`, `}` outside quotes, unbalanced quotes) are rejected.

## Development

```bash
pnpm --filter @rosetta/theme-engine test
```

This package may import only `@rosetta/contracts` and outside libraries (see `.dependency-cruiser.cjs`).
