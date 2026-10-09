# @rosetta/editor

The Rosetta editor, built on Tiptap's framework-agnostic core. No React or other UI framework in this package: the app mounts it into any element.

```ts
import { createEditor, createToolbar } from "@rosetta/editor";

const editor = createEditor({ element: document.querySelector("#editor")!, content: "<p>Hello</p>" });
const toolbar = createToolbar(editor);        // a plain DOM element
document.querySelector("#toolbar")!.append(toolbar.element);
```

## What it edits today

The standard Markdown elements: headings 1-6, paragraphs, bold, italic, strikethrough (GFM), inline code, links, bullet and numbered lists, blockquotes, code blocks, horizontal rules, images and GFM tables. Each can be made from the toolbar, the keyboard shortcuts (shown in the button tooltips) or Markdown shortcuts while typing (`## `, `- `, `1. `, `> `, ` ``` `, `**bold**`).

Link and image buttons ask for an address with `window.prompt`; pass `askUrl` to `createToolbar` to use your own dialog. The toolbar's table buttons (add or delete a row or column, delete the table) appear while the cursor is in a table.

`underline` is turned off on purpose: Markdown has no underline.

## Not here yet

Loading a chapter into the editor (T1.3), saving back to Markdown (T1.4), components (T1.5+) and a raw source view (T1.8).

## Tests

`pnpm --filter @rosetta/editor test` runs the editor in jsdom: every toolbar button, the keyboard shortcuts, Markdown typing shortcuts and table editing.
