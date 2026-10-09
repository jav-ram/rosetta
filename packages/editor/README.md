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

## Loading a document

```ts
import { fromAst } from "@rosetta/editor";

const { doc, frontMatter, warnings } = fromAst(parseResult.ast); // `ast` from @rosetta/parser-wasm
editor.commands.setContent(doc);
```

`fromAst` turns the parser's AST into a Tiptap document and drops nothing except source positions. The schema was widened for that: links keep their `title`; inline code can combine with bold, italic and links; a list item may start with any block; table cells keep the column alignment (`left`, `center`, `right`); images are inline, as in Markdown.

- **Components** load as a generic `directive` node (any name, known or not). It keeps the name, attributes, `breakable`, parsed `fields` (data components), `raw` text (unknown components) and warnings as attributes, holds its body blocks as editable content, and shows its header and data as plain text. The real node views come in T1.5.
- **Front matter** is returned, not shown: the caller keeps it, and the serializer (T1.4) writes it back.
- Empty list items, quotes and table cells get an empty paragraph, because the editor needs one. A code block's final newline is not shown.
- An AST node type the loader does not know throws an error naming it, instead of silently dropping content.

## Not here yet

Saving back to Markdown (T1.4), component node views (T1.5+) and a raw source view (T1.8).

## Tests

`pnpm --filter @rosetta/editor test` runs the editor in jsdom: every toolbar button, the keyboard shortcuts, Markdown typing shortcuts, table editing and the AST loader. Loading every golden file is tested in `app` (`test/golden-load.test.ts`), because it needs the parser and `editor` may not depend on it.
