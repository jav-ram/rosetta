# @rosetta/app

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
