import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";

/**
 * The standard Markdown elements: headings (1-6), paragraphs, bold, italic, strikethrough (GFM), inline code,
 * links, bullet and ordered lists, blockquotes, code blocks, horizontal rules, images and GFM tables.
 * Components are added on top of these in T1.5.
 */
export function standardExtensions() {
  return [
    StarterKit.configure({
      underline: false, // Markdown has no underline
      link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer" } },
    }),
    // Images are block-level, as they are when written on their own line in Markdown.
    Image.configure({ inline: false }),
    // GFM tables: one header row, no merged cells.
    TableKit.configure({ table: { resizable: false } }),
  ];
}
