# @rosetta/theme-classic

## 0.5.0

### Minor Changes

- 079a5da: `figure` component: an image with an optional caption, one column wide or spanning all columns (`span="all"`). It is written `::figure{src="name.png" caption="…"}`, where `src` is the file name or id of an image added to the project. The editor can draw components through `afterRender` and again with `redrawComponents`, and the preview exports `resolveImages` and `imageSources`.
- 079a5da: `page` templates `art-top` and `art-bottom`, with an optional `height` (a length or a percentage of the page): a band of art across the top or the bottom of the page, and the text that follows flows in the rest of it. The theme's default height is the token `page.art-height`.
- 079a5da: `page` component with the `art-full` template: `::page{template="art-full" art="name.png"}` makes one page filled with the image, with no running header and the page number drawn over the art in a backing pill; the layout in force carries on after it. The preview draws the art with a hook on Paged.js. Fixes page numbers: every page after a chapter's first repeated the first page's number (1, 1, 2, 3); the pages are now numbered from the chapter's first page, also with a blank page before it.
- 079a5da: Two-page spreads: `side="left"` on a `page` makes it a left-hand page, with a blank page before it when needed (also at the start of a chapter). The preview reports two or more pages of full art in a row whose first page is a right-hand page, so they do not face each other; the app lists the warning with the book's page numbers and marks the page in the editor.

## 0.4.2

### Patch Changes

- ab33ba8: Chapter start rules: `render({ startPage, startOn })` in the preview. A chapter that starts on a right-hand page gets a blank page before it when it would start on a left-hand one, and page numbers count from the chapter's first book page. The theme styles blank pages (`@page :blank`: no header, no page number). Chapters get a "start on a right-hand page" toggle (manifest `start`).

## 0.4.1

### Patch Changes

- aad20f5: Columns fill one after the other instead of being balanced: content no longer moves to the right column while the left one has room (statblocks in the two-column layout). The preview marks laid-out pages with `rosetta-filled` (`FILL_COLUMNS_SCRIPT`) and the theme fills those pages' columns in order.

## 0.4.0

### Minor Changes

- 5752a60: The editor uses the theme's content CSS, so text and components look like the book while editing. The theme's CSS is split into `content.css` (looks) and `pages.css` (pagination); `theme.css` is removed. Container components in the editor carry the same classes and title heading as the parser's HTML.

## 0.3.0

### Minor Changes

- ab06f42: `::layout{template="one-column"|"two-column"}`: a new leaf component definition with `scope: "following"` (a component that applies to all content after it; the renderer wraps that content in its element), data attributes on leaf elements, `component.misplaced` warning, spec section 9.2, and conformance cases. The Classic theme has a named page for each template, and the editor shows the layout as a page divider with a template select.

## 0.2.1

### Patch Changes

- 825d22d: Oversized element warning: after layout the preview reports unbreakable components that are taller than a column (and outlines them on the page), the preview pane lists them, and the visual editor marks the same block with a warning (`setLayoutWarnings` in `@rosetta/editor`). A test chapter with an oversized stat block is in `theme-classic/test-pages/oversized.md`.

## 0.2.0

### Minor Changes

- 2d5f42f: Flow and breakability: the Classic theme keeps unbreakable components, images, list items and table rows whole (driven by `data-breakable`), keeps headings with what follows, and takes orphans and widows from tokens. The preview repeats a table's header row when the table continues on a new page. A chapter of test pages (`theme-classic/test-pages/flow.md`) covers every case.

## 0.1.0

### Minor Changes

- b806355: Base theme: `theme-classic` now has `theme.json` (A4, margins, two columns, fonts, colors, borders, spacing) and `theme.css` for the page furniture and every M1 component, written only with tokens and checked by a lint. `theme-engine` adds `inlinePageVariables` for `@page` rules.
