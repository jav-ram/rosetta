# @rosetta/theme-classic

The built-in v1 theme (tokens, CSS, assets).

## What is in it

- `theme.json`: the tokens (a `Theme` from `@rosetta/contracts`): fonts, colors, borders, spacing, and the page (A4, margins, two columns).
- `theme.css`: the layout and look of the page (running header with the chapter title, page number), the body text, tables, and the M1 components (`statblock`, `readaloud`, `sidebar`, `pagebreak`). Content goes inside an element with the class `rosetta-document`.
- `lint.mjs`: `lintCss(css)` returns the hardcoded fonts, colors, borders and spacing found in a CSS file. The tests run it on `theme.css`, so the CSS can only read tokens. To restyle the book, change `theme.json` (or a book's overrides), never the CSS.

`@page` rules cannot read custom properties, so a consumer passes the CSS through `inlinePageVariables` from `@rosetta/theme-engine`, and adds `compileTheme(theme)` for the rest.

## Development

```bash
pnpm --filter @rosetta/theme-classic test
```

This package may import only `@rosetta/contracts` and outside libraries (see `.dependency-cruiser.cjs`).
