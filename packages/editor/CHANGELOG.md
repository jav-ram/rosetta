# @rosetta/editor

## 0.6.1

### Patch Changes

- Updated dependencies [ab06f42]
  - @rosetta/contracts@0.7.0

## 0.6.0

### Minor Changes

- 825d22d: Oversized element warning: after layout the preview reports unbreakable components that are taller than a column (and outlines them on the page), the preview pane lists them, and the visual editor marks the same block with a warning (`setLayoutWarnings` in `@rosetta/editor`). A test chapter with an oversized stat block is in `theme-classic/test-pages/oversized.md`.

## 0.5.1

### Patch Changes

- Updated dependencies [bd30a2f]
  - @rosetta/contracts@0.6.0

## 0.5.0

### Minor Changes

- 310acd2: Stat block end to end (insert, edit through the form, save, reload). New `setDocument` loads a document without opening a component's form, without counting as an edit and without an undo step; the app uses it.

## 0.4.0

### Minor Changes

- 4ae9294: Component node view framework: components are registered from definitions, rendered by an injected renderer (the parser worker), and edited through generated forms (data and leaf) or in a frame with editable content (container). The app inserts and edits the built-in components.

## 0.3.0

### Minor Changes

- e823b89: Save the editor's document as Rosetta Markdown (`toMarkdown`); the app saves Visual edits to the chapter. Strikethrough is removed (the spec has none).

### Patch Changes

- Updated dependencies [e823b89]
  - @rosetta/contracts@0.5.0

## 0.2.0

### Minor Changes

- de9aca3: Load the parser's AST into the editor (`fromAst`), with a generic node for components; the app's Visual tab now shows the chapter.

## 0.1.0

### Minor Changes

- ef3665c: Tiptap editor for standard Markdown elements with a toolbar (editor), mounted as a Visual tab in the app.

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
