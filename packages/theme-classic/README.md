# @rosetta/theme-classic

The built-in v1 theme (tokens, CSS, assets).

## What is in it

- `theme.json`: the tokens (a `Theme` from `@rosetta/contracts`): fonts, colors, borders, spacing, and the page (A4, margins, two columns).
- `theme.css`: the layout and look of the page (running header with the chapter title, page number), the body text, tables, and the M1 components (`statblock`, `readaloud`, `sidebar`, `pagebreak`). Content goes inside an element with the class `rosetta-document`.
- `lint.mjs`: `lintCss(css)` returns the hardcoded fonts, colors, borders and spacing found in a CSS file. The tests run it on `theme.css`, so the CSS can only read tokens. To restyle the book, change `theme.json` (or a book's overrides), never the CSS.

**Flow.** Text, lists and tables split where a column ends. These never split and move whole to the next column: any element with `data-breakable="false"` (the parser writes it from the component's definition, so a component added later follows the rule with no CSS), images and figures, list items and table rows. Headings keep with the content after them (`break-after: avoid`), and `page.orphans` / `page.widows` set the minimum lines left or carried over. The table header repeats when a table continues on the next page (done by `@rosetta/preview`, Paged.js does not); it does **not** repeat when the table runs from one column to the next on the same page.

`test-pages/flow.md` is a chapter with every case (paragraphs, headings near a column end, a 60-row table, stat blocks, images, a read-aloud box and a sidebar long enough to split, a long list). To look at it, paste it into the app's Markdown tab.

`@page` rules cannot read custom properties, so a consumer passes the CSS through `inlinePageVariables` from `@rosetta/theme-engine`, and adds `compileTheme(theme)` for the rest.

## Development

```bash
pnpm --filter @rosetta/theme-classic test
```

This package may import only `@rosetta/contracts` and outside libraries (see `.dependency-cruiser.cjs`).
