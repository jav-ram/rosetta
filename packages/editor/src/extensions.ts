import Code from "@tiptap/extension-code";
import Image from "@tiptap/extension-image";
import { BulletList, ListItem, OrderedList } from "@tiptap/extension-list";
import Link from "@tiptap/extension-link";
import { TableCell, TableHeader, TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import { Directive } from "./directive";

/** `text-align` as a cell attribute: GFM tables align whole columns, and the parser's AST carries that. */
const align = {
  align: {
    default: null,
    parseHTML: (el: HTMLElement) => el.style.textAlign || null,
    renderHTML: (attrs: Record<string, unknown>) => (attrs.align ? { style: `text-align: ${String(attrs.align)}` } : {}),
  },
};

/** Lists are tight (`<li>a</li>`) or loose (`<li><p>a</p></li>`); the parser reports which and the serializer keeps it. */
const tight = {
  tight: {
    default: true,
    parseHTML: (el: HTMLElement) => el.getAttribute("data-tight") !== "false",
    renderHTML: (attrs: Record<string, unknown>) => (attrs.tight === false ? { "data-tight": "false" } : {}),
  },
};

/**
 * The standard Markdown elements: headings (1-6), paragraphs, bold, italic, inline code,
 * links, bullet and ordered lists, blockquotes, code blocks, horizontal rules, images and GFM tables,
 * plus the generic `directive` node that holds any component.
 *
 * A few built-ins are replaced so that everything the parser's AST can express fits the schema:
 * links keep their `title`; inline code may combine with bold, italic and links (`**`x`**`); list items may start
 * with any block; table cells keep their column alignment.
 */
export function standardExtensions() {
  return [
    StarterKit.configure({
      underline: false, // Markdown has no underline
      strike: false, // and the spec has no strikethrough: the parser would read ~~x~~ as plain text
      bulletList: false,
      orderedList: false,
      code: false,
      link: false,
      listItem: false,
    }),
    Code.extend({ excludes: "" }),
    Link.extend({
      addAttributes() {
        return { ...this.parent?.(), title: { default: null } };
      },
    }).configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer" } }),
    ListItem.extend({ content: "block+" }),
    BulletList.extend({ addAttributes: () => tight }),
    OrderedList.extend({
      addAttributes() {
        return { ...this.parent?.(), ...tight };
      },
    }),
    // Inline, like in Markdown, where an image is part of a paragraph.
    Image.configure({ inline: true }),
    // GFM tables: one header row, no merged cells.
    TableKit.configure({ table: { resizable: false }, tableCell: false, tableHeader: false }),
    TableCell.extend({ addAttributes: function () { return { ...this.parent?.(), ...align }; } }),
    TableHeader.extend({ addAttributes: function () { return { ...this.parent?.(), ...align }; } }),
    Directive,
  ];
}
