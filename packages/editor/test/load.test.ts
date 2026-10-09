import { Node as PMNode } from "@tiptap/pm/model";
import type { Document, Node } from "@rosetta/contracts";
import { afterEach, describe, expect, test } from "vitest";
import { createEditor, fromAst, standardExtensions } from "../src/index";
import { getSchema } from "@tiptap/core";

const schema = getSchema(standardExtensions());
const doc = (...children: Node[]): Document => ({ rosettaVersion: "0.1", children, warnings: [] });
const text = (value: string): Node => ({ type: "text", value });
const p = (...children: Node[]): Node => ({ type: "paragraph", children });

const editors: { destroy: () => void }[] = [];
afterEach(() => editors.splice(0).forEach((e) => e.destroy()));

/** Loads the AST and checks the result is valid and that the editor keeps it exactly. */
function load(ast: Document) {
  const { doc: json, ...rest } = fromAst(ast);
  const expected = PMNode.fromJSON(schema, json);
  expected.check(); // throws if the document does not fit the schema
  const editor = createEditor({ element: document.createElement("div"), content: json });
  editors.push(editor);
  // The editor keeps an empty paragraph after a final table or code block, so you can type there; ignore it.
  const actual = editor.getJSON();
  const last = actual.content?.at(-1);
  if (last?.type === "paragraph" && !last.content && expected.lastChild?.type.name !== "paragraph") actual.content!.pop();
  expect(actual).toEqual(expected.toJSON()); // nothing dropped or normalized away
  return { json, editor, ...rest };
}

describe("inline content", () => {
  test("nested emphasis, links with titles, images and breaks", () => {
    const { json } = load(
      doc(
        p(
          text("a "),
          { type: "strong", children: [text("bold "), { type: "emphasis", children: [text("both")] }] },
          { type: "link", url: "https://x.test", title: "T", children: [text("link")] },
          { type: "image", url: "p.png", alt: "pic", title: "Pic" },
          { type: "break" },
          text("end"),
        ),
      ),
    );
    const para = json.content![0]!.content!;
    expect(para[1]).toMatchObject({ text: "bold ", marks: [{ type: "bold" }] });
    expect(para[2]).toMatchObject({ text: "both", marks: [{ type: "bold" }, { type: "italic" }] });
    expect(para[3]).toMatchObject({ text: "link", marks: [{ type: "link", attrs: { href: "https://x.test", title: "T" } }] });
    expect(para[4]).toMatchObject({ type: "image", attrs: { src: "p.png", alt: "pic", title: "Pic" } });
    expect(para[5]).toEqual({ type: "hardBreak" });
  });

  test("inline code can sit inside bold and links", () => {
    const { json } = load(
      doc(p({ type: "strong", children: [{ type: "inlineCode", value: "x" }] }, { type: "link", url: "u", children: [{ type: "inlineCode", value: "y" }] })),
    );
    expect(json.content![0]!.content![0]!.marks).toEqual([{ type: "bold" }, { type: "code" }]);
  });

  test("an image inside a link keeps the link", () => {
    const { json } = load(doc(p({ type: "link", url: "u", children: [{ type: "image", url: "i.png", alt: "" }] })));
    expect(json.content![0]!.content![0]!.marks).toEqual([{ type: "link", attrs: { href: "u", title: null } }]);
  });
});

describe("blocks", () => {
  test("headings and blockquotes", () => {
    const { json } = load(doc({ type: "heading", depth: 4, children: [text("H")] }, { type: "blockquote", children: [p(text("q"))] }));
    expect(json.content![0]).toMatchObject({ type: "heading", attrs: { level: 4 } });
    expect(json.content![1]!.type).toBe("blockquote");
  });

  test("lists keep order, start number, nesting and any first block", () => {
    const item = (...children: Node[]): Node => ({ type: "listItem", children });
    const { json } = load(
      doc(
        { type: "list", ordered: true, start: 3, children: [item(p(text("a")), { type: "list", ordered: false, children: [item(p(text("n")))] }), item({ type: "code", value: "x\n" })] },
        { type: "list", ordered: false, children: [item()] },
      ),
    );
    expect(json.content![0]).toMatchObject({ type: "orderedList", attrs: { start: 3 } });
    expect(json.content![0]!.content![1]!.content![0]!.type).toBe("codeBlock");
    expect(json.content![1]!.content![0]!.content).toEqual([{ type: "paragraph" }]); // empty item gets an empty paragraph
  });

  test("code blocks keep language and text, minus the final newline", () => {
    const { json } = load(doc({ type: "code", lang: "go", value: "a\nb\n" }, { type: "code", value: "" }));
    expect(json.content![0]).toEqual({ type: "codeBlock", attrs: { language: "go" }, content: [{ type: "text", text: "a\nb" }] });
    expect(json.content![1]).toEqual({ type: "codeBlock", attrs: { language: null } });
  });

  test("thematic break", () => {
    expect(load(doc({ type: "thematicBreak" })).json.content).toEqual([{ type: "horizontalRule" }]);
  });

  test("tables keep header cells and column alignment", () => {
    const cell = (v: string): Node => ({ type: "tableCell", children: [text(v)] });
    const { json } = load(
      doc({
        type: "table",
        align: ["left", "center", "none"],
        children: [
          { type: "tableRow", header: true, children: [cell("a"), cell("b"), cell("c")] },
          { type: "tableRow", children: [cell("1"), { type: "tableCell" }, cell("3")] },
        ],
      }),
    );
    const [head, body] = json.content![0]!.content!;
    expect(head!.content!.map((c) => [c.type, c.attrs!.align])).toEqual([["tableHeader", "left"], ["tableHeader", "center"], ["tableHeader", null]]);
    expect(body!.content![1]!.content).toEqual([{ type: "paragraph" }]); // empty cell
  });
});

describe("components", () => {
  test("a container keeps its attributes and holds editable blocks, nested", () => {
    const { json } = load(
      doc({
        type: "directive", name: "sidebar", form: "block", kind: "container", breakable: true, attributes: { title: "## Hi" },
        children: [p(text("in")), { type: "directive", name: "readaloud", form: "block", kind: "container", breakable: true, children: [p(text("deep"))] }],
      }),
    );
    expect(json.content![0]).toMatchObject({ type: "directive", attrs: { name: "sidebar", kind: "container", breakable: true, attributes: { title: "## Hi" } } });
    expect(json.content![0]!.content![1]!.content![0]!.content![0]!.text).toBe("deep");
  });

  test("a data component keeps its parsed fields", () => {
    const fields = { name: "Rat", ac: 15, traits: [{ name: "Keen", text: "x" }] };
    const { json } = load(doc({ type: "directive", name: "statblock", form: "block", kind: "data", breakable: false, attributes: { system: "5e" }, fields }));
    expect(json.content![0]!.attrs).toMatchObject({ fields, attributes: { system: "5e" }, breakable: false });
  });

  test("an unknown component keeps its raw body and warnings", () => {
    const warnings = [{ code: "component.unknown", message: "Unknown component", severity: "warning" as const, range: { start: { line: 1, column: 1, offset: 0 }, end: { line: 2, column: 1, offset: 5 } } }];
    const { json } = load(doc({ type: "directive", name: "mystery", form: "block", kind: "unknown", raw: "Not **known**", warnings }));
    expect(json.content![0]!.attrs).toMatchObject({ raw: "Not **known**", kind: "unknown", warnings });
  });

  test("a leaf component", () => {
    const { json } = load(doc({ type: "directive", name: "pagebreak", form: "leaf", kind: "leaf" }));
    expect(json.content![0]).toMatchObject({ type: "directiveLeaf", attrs: { name: "pagebreak", form: "leaf" } });
  });

  test("without a renderer, a component shows its Markdown as plain text", () => {
    const { editor } = load(doc({ type: "directive", name: "statblock", form: "block", kind: "data", fields: { name: "Rat" }, attributes: { system: "5e" } }));
    const dom = editor.view.dom.querySelector(".rosetta-component")!;
    expect(dom.getAttribute("data-component")).toBe("statblock");
    expect(dom.querySelector(".rosetta-component-rendered")!.textContent).toBe(':::statblock{system=5e}\nname: Rat\n:::');
  });

  test("component data survives copy and paste of the editor's HTML", () => {
    const { editor } = load(doc({ type: "directive", name: "statblock", form: "block", kind: "data", breakable: false, attributes: { system: "5e" }, fields: { name: "Rat", ac: 15 } }));
    const before = editor.getJSON();
    editor.commands.setContent(editor.getHTML());
    expect(editor.getJSON().content![0]).toEqual(before.content![0]);
  });
});

describe("document", () => {
  test("front matter and warnings are returned, not shown", () => {
    const ast: Document = { ...doc(p(text("x"))), frontMatter: { title: "T" }, warnings: [{ code: "frontmatter.syntax", message: "m", severity: "warning" }] };
    const loaded = load(ast);
    expect(loaded.frontMatter).toEqual({ title: "T" });
    expect(loaded.warnings).toHaveLength(1);
    expect(JSON.stringify(loaded.json)).not.toContain("title");
  });

  test("an empty document loads", () => {
    expect(fromAst(doc()).doc).toEqual({ type: "doc", content: [] });
  });

  test("an unknown node type is an error, not silent loss", () => {
    expect(() => fromAst(doc({ type: "tableRow" }))).toThrow(/tableRow/);
  });
});
