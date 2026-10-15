# @rosetta/app

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
