import Code from "@tiptap/extension-code";
import Image from "@tiptap/extension-image";
import { ListItem } from "@tiptap/extension-list";
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

/**
 * The standard Markdown elements: headings (1-6), paragraphs, bold, italic, strikethrough (GFM), inline code,
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
    // Inline, like in Markdown, where an image is part of a paragraph.
    Image.configure({ inline: true }),
    // GFM tables: one header row, no merged cells.
    TableKit.configure({ table: { resizable: false }, tableCell: false, tableHeader: false }),
    TableCell.extend({ addAttributes: function () { return { ...this.parent?.(), ...align }; } }),
    TableHeader.extend({ addAttributes: function () { return { ...this.parent?.(), ...align }; } }),
    Directive,
  ];
}
