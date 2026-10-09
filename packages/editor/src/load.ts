import type { JSONContent } from "@tiptap/core";
import type { Document, Node, Warning } from "@rosetta/contracts";

export interface LoadedDocument {
  /** The Tiptap document, ready for `editor.commands.setContent` or `createEditor({ content })`. */
  doc: JSONContent;
  /** Front matter is never shown in the editor; the caller keeps it and gives `frontMatterRaw` to `toMarkdown`. */
  frontMatter?: Record<string, unknown>;
  /** The front matter text as written, also when it is not valid YAML. */
  frontMatterRaw?: string;
  warnings: Warning[];
}

type Mark = NonNullable<JSONContent["marks"]>[number];

/** Converts the parser's AST (`ast` in the parse result) into a Tiptap document. Nothing the AST says is dropped except source positions. */
export function fromAst(ast: Document): LoadedDocument {
  return {
    doc: { type: "doc", content: blocks(ast.children) },
    ...(ast.frontMatter ? { frontMatter: ast.frontMatter as Record<string, unknown> } : {}),
    ...(ast.frontMatterRaw !== undefined ? { frontMatterRaw: ast.frontMatterRaw } : {}),
    warnings: ast.warnings,
  };
}

const blocks = (nodes: Node[] | undefined): JSONContent[] => (nodes ?? []).map(block);

/** Blocks for a container that needs at least one (list items, quotes, cells). */
const blocksOrEmpty = (nodes: Node[] | undefined): JSONContent[] => {
  const result = blocks(nodes);
  return result.length ? result : [{ type: "paragraph" }];
};

const withContent = (type: string, content: JSONContent[], attrs?: Record<string, unknown>): JSONContent => ({
  type,
  ...(attrs ? { attrs } : {}),
  ...(content.length ? { content } : {}),
});

function block(node: Node): JSONContent {
  switch (node.type) {
    case "paragraph":
      return withContent("paragraph", inline(node.children, []));
    case "heading":
      return withContent("heading", inline(node.children, []), { level: node.depth ?? 1 });
    case "blockquote":
      return withContent("blockquote", blocksOrEmpty(node.children));
    case "list":
      return withContent(
        node.ordered ? "orderedList" : "bulletList",
        (node.children ?? []).map((item) => withContent("listItem", blocksOrEmpty(item.children))),
        { ...(node.ordered ? { start: node.start ?? 1 } : {}), tight: node.tight ?? true },
      );
    case "code": {
      // The AST value ends with the newline before the closing fence; the editor shows only the lines.
      const text = (node.value ?? "").replace(/\n$/, "");
      return withContent("codeBlock", text ? [{ type: "text", text }] : [], { language: node.lang ?? null });
    }
    case "thematicBreak":
      return { type: "horizontalRule" };
    case "table":
      return withContent(
        "table",
        (node.children ?? []).map((row) =>
          withContent(
            "tableRow",
            (row.children ?? []).map((cell, column) => {
              const content = inline(cell.children, []);
              return withContent(row.header ? "tableHeader" : "tableCell", [withContent("paragraph", content)], {
                align: alignment(node.align?.[column]),
              });
            }),
          ),
        ),
      );
    case "directive":
      return withContent("directive", blocks(node.children), {
        name: node.name ?? "",
        form: node.form ?? "block",
        kind: node.kind ?? "unknown",
        breakable: node.breakable ?? null,
        attributes: node.attributes ?? {},
        attributesRaw: node.attributesRaw ?? null,
        fields: node.fields ?? null,
        raw: node.raw ?? null,
        warnings: node.warnings ?? [],
      });
    default:
      throw new Error(`Cannot load a "${node.type}" node as a block`);
  }
}

const alignment = (a: string | undefined) => (a === "left" || a === "right" || a === "center" ? a : null);

function inline(nodes: Node[] | undefined, marks: Mark[]): JSONContent[] {
  return (nodes ?? []).flatMap((node): JSONContent[] => {
    const marked = (n: JSONContent): JSONContent => (marks.length ? { ...n, marks } : n);
    switch (node.type) {
      case "text":
        return node.value ? [marked({ type: "text", text: node.value })] : [];
      case "inlineCode":
        return node.value ? [{ type: "text", text: node.value, marks: [...marks, { type: "code" }] }] : [];
      case "strong":
        return inline(node.children, [...marks, { type: "bold" }]);
      case "emphasis":
        return inline(node.children, [...marks, { type: "italic" }]);
      case "link":
        return inline(node.children, [...marks, { type: "link", attrs: { href: node.url ?? "", title: node.title ?? null } }]);
      case "image":
        return [marked({ type: "image", attrs: { src: node.url ?? "", alt: node.alt ?? "", title: node.title ?? null } })];
      case "break":
        return [{ type: "hardBreak" }];
      default:
        throw new Error(`Cannot load a "${node.type}" node as inline content`);
    }
  });
}
