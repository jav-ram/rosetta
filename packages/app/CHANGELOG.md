# @rosetta/app

## 0.16.0

### Minor Changes

- 14af452: Hosting on Cloudflare (Workers with static assets): `wrangler.jsonc`, caching and security headers in `public/_headers`, and the commands `cf:build`, `cf:preview` and `cf:deploy`. A build made with `VITE_MOVED_TO` (the old GitHub Pages address) shows a note on the projects screen that Rosetta has moved, and that projects must be exported there and imported here.

## 0.15.0

### Minor Changes

- 079a5da: `figure` component: an image with an optional caption, one column wide or spanning all columns (`span="all"`). It is written `::figure{src="name.png" caption="…"}`, where `src` is the file name or id of an image added to the project. The editor can draw components through `afterRender` and again with `redrawComponents`, and the preview exports `resolveImages` and `imageSources`.
- 079a5da: Images: add them with a button or by dropping files, and the editor makes a smaller preview copy of each in a worker. `ProjectStore` gets `setAssetPreview`, and the preview of an asset is its original until one is set.
- 079a5da: Low-resolution warning: images that would have fewer than 150 dots per inch at the size they are placed (figures, pages of art, Markdown images) are listed with the layout problems and marked on their component in the editor. The preview reports every image's placed size after layout (`PreviewResult.images`); the app reads the pixel size of each original from the start of its file.
- 079a5da: `page` component with the `art-full` template: `::page{template="art-full" art="name.png"}` makes one page filled with the image, with no running header and the page number drawn over the art in a backing pill; the layout in force carries on after it. The preview draws the art with a hook on Paged.js. Fixes page numbers: every page after a chapter's first repeated the first page's number (1, 1, 2, 3); the pages are now numbered from the chapter's first page, also with a blank page before it.
- 079a5da: Two-page spreads: `side="left"` on a `page` makes it a left-hand page, with a blank page before it when needed (also at the start of a chapter). The preview reports two or more pages of full art in a row whose first page is a right-hand page, so they do not face each other; the app lists the warning with the book's page numbers and marks the page in the editor.

### Patch Changes

- Updated dependencies [079a5da]
- Updated dependencies [079a5da]
- Updated dependencies [079a5da]
- Updated dependencies [079a5da]
- Updated dependencies [079a5da]
- Updated dependencies [079a5da]
  - @rosetta/contracts@0.10.0
  - @rosetta/parser-wasm@0.3.0
  - @rosetta/theme-classic@0.5.0
  - @rosetta/preview@0.5.0
  - @rosetta/editor@0.9.0
  - @rosetta/store-local@0.3.0
  - @rosetta/theme-engine@0.2.4

## 0.14.0

### Minor Changes

- ab33ba8: Backup reminder: a banner in the editor asks to export a `.rosetta` backup after 7 days of changes without one. It can be dismissed (it returns after another 7 days) and goes away when a backup is exported or the project was imported from a file.
- ab33ba8: Chapter start rules: `render({ startPage, startOn })` in the preview. A chapter that starts on a right-hand page gets a blank page before it when it would start on a left-hand one, and page numbers count from the chapter's first book page. The theme styles blank pages (`@page :blank`: no header, no page number). Chapters get a "start on a right-hand page" toggle (manifest `start`).
- ab33ba8: Page numbers across chapters: a chapter's page count from its last layout (`pages`) and whether it may be out of date (`stale`) are stored in the manifest. The preview numbers a chapter from the pages of the ones before it, and the chapter list shows each chapter's pages, flagged when they may be out of date.
- ab33ba8: `.rosetta` import and export: a whole project in one zip (`exportProject`, `importProject`, with `fflate`), saved with the File System Access API where available (otherwise downloaded) and imported from a file input. `ProjectStore` gains `listAssets` and `putAsset(..., { id })`. The projects screen has Export and Import; the editor has Export.

### Patch Changes

- Updated dependencies [ab33ba8]
- Updated dependencies [ab33ba8]
- Updated dependencies [ab33ba8]
  - @rosetta/preview@0.4.0
  - @rosetta/theme-classic@0.4.2
  - @rosetta/contracts@0.9.0
  - @rosetta/store-local@0.2.0
  - @rosetta/editor@0.8.1
  - @rosetta/parser-wasm@0.2.5
  - @rosetta/theme-engine@0.2.3

## 0.13.0

### Minor Changes

- 8150232: Chapter list and autosave: a project opens with its own chapters (read from the store); add, rename, delete and reorder chapters (drag, or ↑ ↓); every edit is saved automatically a moment after typing, with a "Saving… / Saved / Not saved (Retry)" indicator.

## 0.12.0

### Minor Changes

- fa9e866: Projects screen: the app starts on the list of projects, kept in the browser's IndexedDB (`LocalStore`). Create, rename and delete projects; opening one shows the editor (its chapters are still the sample ones until T3.4).

## 0.11.3

### Patch Changes

- f500f9a: A data component such as the statblock is now edited where it is shown: the parser's own HTML with each value replaced by a control that takes its font, color and size, so editing looks like the rendered component. It is driven by the component's definition (`createInline`, `skeleton`), validates as before, keeps lists (add and remove items) and saves the same Markdown. The form remains for leaf components and as a fallback.
- Updated dependencies [f500f9a]
  - @rosetta/editor@0.8.0

## 0.11.2

### Patch Changes

- b4883c2: Component forms are readable in dark mode (they take their colors from the theme's page, not the app), and the visual editor's page is scaled to fill the pane.

## 0.11.1

### Patch Changes

- Updated dependencies [e23941b]
  - @rosetta/contracts@0.8.0
  - @rosetta/editor@0.7.1
  - @rosetta/parser-wasm@0.2.4
  - @rosetta/preview@0.3.2
  - @rosetta/theme-engine@0.2.2

## 0.11.0

### Minor Changes

- 5752a60: The editor uses the theme's content CSS, so text and components look like the book while editing. The theme's CSS is split into `content.css` (looks) and `pages.css` (pagination); `theme.css` is removed. Container components in the editor carry the same classes and title heading as the parser's HTML.

### Patch Changes

- Updated dependencies [5752a60]
  - @rosetta/theme-classic@0.4.0
  - @rosetta/editor@0.7.0

## 0.10.0

### Minor Changes

- ab06f42: `::layout{template="one-column"|"two-column"}`: a new leaf component definition with `scope: "following"` (a component that applies to all content after it; the renderer wraps that content in its element), data attributes on leaf elements, `component.misplaced` warning, spec section 9.2, and conformance cases. The Classic theme has a named page for each template, and the editor shows the layout as a page divider with a template select.

### Patch Changes

- Updated dependencies [ab06f42]
  - @rosetta/contracts@0.7.0
  - @rosetta/theme-classic@0.3.0
  - @rosetta/editor@0.6.1
  - @rosetta/parser-wasm@0.2.3
  - @rosetta/preview@0.3.1
  - @rosetta/theme-engine@0.2.1

## 0.9.0

### Minor Changes

- 825d22d: Oversized element warning: after layout the preview reports unbreakable components that are taller than a column (and outlines them on the page), the preview pane lists them, and the visual editor marks the same block with a warning (`setLayoutWarnings` in `@rosetta/editor`). A test chapter with an oversized stat block is in `theme-classic/test-pages/oversized.md`.

### Patch Changes

- Updated dependencies [825d22d]
  - @rosetta/preview@0.3.0
  - @rosetta/editor@0.6.0
  - @rosetta/theme-classic@0.2.1

## 0.8.1

### Patch Changes

- 2d5f42f: Flow and breakability: the Classic theme keeps unbreakable components, images, list items and table rows whole (driven by `data-breakable`), keeps headings with what follows, and takes orphans and widows from tokens. The preview repeats a table's header row when the table continues on a new page. A chapter of test pages (`theme-classic/test-pages/flow.md`) covers every case.
- Updated dependencies [2d5f42f]
  - @rosetta/theme-classic@0.2.0
  - @rosetta/preview@0.2.0

## 0.8.0

### Minor Changes

- a660f26: Paged.js preview: `createPreview` in `@rosetta/preview` shows the chapter as pages in an iframe (new pages swap in when ready, scroll kept, missing images get a placeholder), and the app's preview pane uses it with the Classic theme.

### Patch Changes

- Updated dependencies [a660f26]
  - @rosetta/preview@0.1.0

## 0.7.2

### Patch Changes

- b806355: Base theme: `theme-classic` now has `theme.json` (A4, margins, two columns, fonts, colors, borders, spacing) and `theme.css` for the page furniture and every M1 component, written only with tokens and checked by a lint. `theme-engine` adds `inlinePageVariables` for `@page` rules.
- Updated dependencies [b806355]
  - @rosetta/theme-classic@0.1.0
  - @rosetta/theme-engine@0.2.0

## 0.7.1

### Patch Changes

- Updated dependencies [bd30a2f]
  - @rosetta/contracts@0.6.0
  - @rosetta/editor@0.5.1
  - @rosetta/parser-wasm@0.2.2

## 0.7.0

### Minor Changes

- a034772: The Markdown view and the visual editor stay in sync without losing text: pending visual edits are saved when switching views, and the editor is locked until Markdown typed elsewhere has loaded.

## 0.6.1

### Patch Changes

- ad13361: readaloud, sidebar and pagebreak are checked end to end, and a page break is shown as a dashed line in the editor.

## 0.6.0

### Minor Changes

- 310acd2: Stat block end to end (insert, edit through the form, save, reload). New `setDocument` loads a document without opening a component's form, without counting as an edit and without an undo step; the app uses it.

### Patch Changes

- Updated dependencies [310acd2]
  - @rosetta/editor@0.5.0

## 0.5.0

### Minor Changes

- 4ae9294: Component node view framework: components are registered from definitions, rendered by an injected renderer (the parser worker), and edited through generated forms (data and leaf) or in a frame with editable content (container). The app inserts and edits the built-in components.

### Patch Changes

- Updated dependencies [4ae9294]
  - @rosetta/editor@0.4.0

## 0.4.0

### Minor Changes

- e823b89: Save the editor's document as Rosetta Markdown (`toMarkdown`); the app saves Visual edits to the chapter. Strikethrough is removed (the spec has none).

### Patch Changes

- Updated dependencies [e823b89]
- Updated dependencies [e823b89]
  - @rosetta/contracts@0.5.0
  - @rosetta/editor@0.3.0
  - @rosetta/parser-wasm@0.2.1

## 0.3.0

### Minor Changes

- de9aca3: Load the parser's AST into the editor (`fromAst`), with a generic node for components; the app's Visual tab now shows the chapter.

### Patch Changes

- Updated dependencies [de9aca3]
  - @rosetta/editor@0.2.0

## 0.2.0

### Minor Changes

- ef3665c: Tiptap editor for standard Markdown elements with a toolbar (editor), mounted as a Visual tab in the app.

### Patch Changes

- Updated dependencies [ef3665c]
  - @rosetta/editor@0.1.0

## 0.1.0

### Minor Changes

- 929f2d6: App shell: Vite + React app with a chapter sidebar, placeholder editor and preview, and the parser worker wired in.

## 0.0.4

### Patch Changes

- Updated dependencies [0e3720d]
  - @rosetta/contracts@0.4.0

## 0.0.3

### Patch Changes

- Updated dependencies [e8a3e4e]
  - @rosetta/contracts@0.3.0

## 0.0.2

### Patch Changes

- Updated dependencies [00c4b27]
  - @rosetta/contracts@0.2.0

## 0.0.1

### Patch Changes

- Updated dependencies [8135000]
  - @rosetta/contracts@0.1.0
