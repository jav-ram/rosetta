# @rosetta/editor

The Rosetta editor, built on Tiptap's framework-agnostic core. No React or other UI framework in this package: the app mounts it into any element.

```ts
import { createEditor, createToolbar } from "@rosetta/editor";

const editor = createEditor({ element: document.querySelector("#editor")!, content: "<p>Hello</p>" });
const toolbar = createToolbar(editor);        // a plain DOM element
document.querySelector("#toolbar")!.append(toolbar.element);
```

## What it edits today

The standard Markdown elements: headings 1-6, paragraphs, bold, italic, inline code, links, bullet and numbered lists, blockquotes, code blocks, horizontal rules, images and GFM tables. Each can be made from the toolbar, the keyboard shortcuts (shown in the button tooltips) or Markdown shortcuts while typing (`## `, `- `, `1. `, `> `, ` ``` `, `**bold**`).

Link and image buttons ask for an address with `window.prompt`; pass `askUrl` to `createToolbar` to use your own dialog. The toolbar's table buttons (add or delete a row or column, delete the table) appear while the cursor is in a table.

`underline` and strikethrough are off on purpose: the spec has neither, so saving them would lose them.

## Loading a document

```ts
import { fromAst } from "@rosetta/editor";

const { doc, frontMatter, warnings } = fromAst(parseResult.ast); // `ast` from @rosetta/parser-wasm
editor.commands.setContent(doc);
```

`fromAst` turns the parser's AST into a Tiptap document and drops nothing except source positions. The schema was widened for that: links keep their `title`; inline code can combine with bold, italic and links; a list item may start with any block; table cells keep the column alignment (`left`, `center`, `right`); images are inline, as in Markdown.

- **Components** load as one of two nodes (see Components below). They keep the name, attributes, `breakable`, parsed `fields` (data components), `raw` text and warnings as attributes.
- **Front matter** is returned, not shown: the caller keeps it, and the serializer (T1.4) writes it back.
- Empty list items, quotes and table cells get an empty paragraph, because the editor needs one. A code block's final newline is not shown.
- An AST node type the loader does not know throws an error naming it, instead of silently dropping content.

## Components

The editor does not know any component by name. It is given definitions as data (the `ComponentDefinition` type from `@rosetta/contracts`, from the built-in set or a system plugin) and a function that renders Markdown to HTML:

```ts
const editor = createEditor({
  element,
  components: m1Components,                                   // definitions
  renderComponent: async (markdown) => (await parser.parse(markdown)).html, // the parser worker
});
```

Nothing is rendered by the editor itself: it writes one component as Markdown (with `toMarkdown`), asks `renderComponent` for its HTML and shows that. Results are cached and a late answer never replaces a newer one. Without `renderComponent` a component shows its Markdown as plain text.

| Kind | Node | In the editor |
|---|---|---|
| container | `directive` | A frame with the component's attributes in a header (a small form) and editable blocks inside. |
| data | `directiveLeaf` | The parser's rendering. **Selecting it opens a form** made from its definition; leaving it renders the new values. |
| leaf | `directiveLeaf` | The parser's rendering; a form for its attributes while selected. |
| unknown (no definition) | `directiveLeaf` | The parser's rendering (a visible warning block). No form. |

The form has a control for each attribute and field by type: text (one line when `plain`, otherwise a text area, because it is Markdown), number, checkbox, select for enums, an add/remove list for lists, and a group for objects. Values are written in the order of the definition, and empty values are left out.

**Editing a component drops the text the author wrote** for what was edited (`raw` for fields, `attributesRaw` for attributes), so the new values are what gets saved. Anything that edits `fields` or `attributes` must do the same.

`editor.commands.insertComponent(name)` inserts a component with its default values after the current block and selects it; the toolbar has a picker for it, filled from the definitions. `componentsOf(editor)` lists them.

## Saving a document

```ts
import { toMarkdown } from "@rosetta/editor";

const markdown = toMarkdown(editor.getJSON(), { frontMatterRaw }); // frontMatterRaw from fromAst()
```

The output parses back to the same content. Saving does not keep the author's formatting: it writes one style (`-` bullets, ATX headings, `*` and `**` for emphasis, fenced code, one blank line between blocks), and raw HTML, which is not part of the document, is gone.

- **Text is escaped** so it stays text: `*`, `_`, `[`, `<`, `&amp;`, a leading `#`, `-`, `1.` or `>`, and a line starting with `::` (the spec's escape for a would-be directive).
- **Kept as written:** front matter (`frontMatterRaw`, comments included, also when it is invalid), a data component's body (`raw`), and every directive's attribute text (`attributesRaw`). Whoever edits a component's `fields` must set its `raw` to `null`, and whoever edits its `attributes` must set `attributesRaw` to `null`; otherwise the old text is saved. Without `raw` the fields are written as the YAML subset of the spec.
- **Fences:** a container's `:::` fence is longer than any closing line inside it, so nesting always works. A code fence is longer than any backtick run inside.
- **Lists** keep tight or loose; two lists in a row use different markers so they do not merge.
- Empty paragraphs are not saved (Markdown cannot say them). A hard break at the end of a paragraph is dropped.
- Known limits: when bold and italic cover different stretches the output may use more delimiters than needed; and italic or bold right next to punctuation and a letter (`*"a"*b`) can fail the CommonMark delimiter rules.

## Not here yet

Component node views (T1.5+) and a raw source view (T1.8).

## Tests

`pnpm --filter @rosetta/editor test` runs the editor in jsdom: every toolbar button, the keyboard shortcuts, Markdown typing shortcuts, table editing, the AST loader and the Markdown writer. Loading every golden file is tested in `app` (`test/golden-load.test.ts`), because it needs the parser and `editor` may not depend on it.
