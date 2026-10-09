import type { JSONContent } from "@tiptap/core";
import { describe, expect, test } from "vitest";
import { toMarkdown, yamlMapping } from "../src/index";

const t = (text: string, ...marks: (string | { type: string; attrs?: Record<string, unknown> })[]): JSONContent => ({
  type: "text",
  text,
  ...(marks.length ? { marks: marks.map((m) => (typeof m === "string" ? { type: m } : m)) } : {}),
});
const p = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", ...(content.length ? { content } : {}) });
const doc = (...content: JSONContent[]) => ({ type: "doc", content });
const md = (...content: JSONContent[]) => toMarkdown(doc(...content));
const item = (...content: JSONContent[]): JSONContent => ({ type: "listItem", content });
const ul = (items: JSONContent[], tight = true): JSONContent => ({ type: "bulletList", attrs: { tight }, content: items });
const ol = (items: JSONContent[], start = 1, tight = true): JSONContent => ({ type: "orderedList", attrs: { start, tight }, content: items });

describe("blocks", () => {
  test("blocks are separated by blank lines and the file ends with one newline", () => {
    expect(md({ type: "heading", attrs: { level: 2 }, content: [t("Title")] }, p(t("One.")), p(t("Two.")))).toBe("## Title\n\nOne.\n\nTwo.\n");
  });

  test("an empty document is empty, and empty paragraphs are dropped", () => {
    expect(md()).toBe("");
    expect(md(p(), p(t("x")), p())).toBe("x\n");
  });

  test("blockquote, rule, code block", () => {
    expect(md({ type: "blockquote", content: [p(t("a")), p(t("b"))] }, { type: "horizontalRule" })).toBe("> a\n>\n> b\n\n---\n");
    expect(md({ type: "codeBlock", attrs: { language: "go" }, content: [t("x := 1")] })).toBe("```go\nx := 1\n```\n");
  });

  test("a code fence is longer than any backtick run inside", () => {
    expect(md({ type: "codeBlock", attrs: { language: null }, content: [t("a ``` b")] })).toBe("````\na ``` b\n````\n");
    expect(md({ type: "codeBlock", attrs: { language: null } })).toBe("```\n```\n");
  });

  test("tables: header, alignment, pipes in cells", () => {
    const cell = (type: string, text: string, align: string | null = null): JSONContent => ({ type, attrs: { align }, content: [p(t(text))] });
    expect(
      md({
        type: "table",
        content: [
          { type: "tableRow", content: [cell("tableHeader", "L", "left"), cell("tableHeader", "C", "center"), cell("tableHeader", "R", "right"), cell("tableHeader", "N")] },
          { type: "tableRow", content: [cell("tableCell", "a|b"), cell("tableCell", "x"), cell("tableCell", ""), cell("tableCell", "y")] },
        ],
      }),
    ).toBe("| L | C | R | N |\n| :-- | :-: | --: | --- |\n| a\\|b | x |  | y |\n");
  });
});

describe("lists", () => {
  test("tight and loose, bullets and numbers", () => {
    expect(md(ul([item(p(t("a"))), item(p(t("b")))]))).toBe("- a\n- b\n");
    expect(md(ul([item(p(t("a"))), item(p(t("b")))], false))).toBe("- a\n\n- b\n");
    expect(md(ol([item(p(t("a"))), item(p(t("b")))], 3))).toBe("3. a\n4. b\n");
  });

  test("nested lists and blocks are indented under the marker", () => {
    expect(md(ul([item(p(t("a")), ul([item(p(t("n")))])), item({ type: "codeBlock", attrs: {}, content: [t("x")] })]))).toBe("- a\n  - n\n- ```\n  x\n  ```\n");
    expect(md(ol([item(p(t("a")), ul([item(p(t("n")))]))], 9))).toBe("9. a\n   - n\n");
  });

  test("two lists in a row use different markers so they stay two lists", () => {
    expect(md(ul([item(p(t("a")))]), ul([item(p(t("b")))]))).toBe("- a\n\n* b\n");
    expect(md(ol([item(p(t("a")))]), ol([item(p(t("b")))]))).toBe("1. a\n\n1) b\n");
  });

  test("an empty item", () => {
    expect(md(ul([item(p()), item(p(t("b")))]))).toBe("-\n- b\n");
  });
});

describe("inline content", () => {
  test("marks, nesting and spaces next to delimiters", () => {
    expect(md(p(t("a "), t("b", "bold"), t(" c")))).toBe("a **b** c\n");
    expect(md(p(t("both", "bold", "italic")))).toBe("***both***\n");
    expect(md(p(t("x ", "bold"), t("y", "bold", "italic")))).toBe("**x** ***y***\n"); // equivalent to **x *y***; sharing the outer bold is not attempted
    expect(md(p(t(" padded ", "bold")))).toBe(" **padded** \n");
  });

  test("links and images, with titles and awkward addresses", () => {
    expect(md(p(t("go", { type: "link", attrs: { href: "https://x.test", title: 'A "t"' } })))).toBe('[go](https://x.test "A \\"t\\"")\n');
    expect(md(p(t("go", { type: "link", attrs: { href: "a b(c)" } })))).toBe("[go](<a b(c)>)\n");
    expect(md(p({ type: "image", attrs: { src: "a.png", alt: "x [y]", title: "T" } }))).toBe('![x \\[y\\]](a.png "T")\n');
  });

  test("a link around bold text and code", () => {
    expect(md(p(t("a", { type: "link", attrs: { href: "u" } }, "bold"), t("b", { type: "link", attrs: { href: "u" } })))).toBe("[**a**b](u)\n");
    expect(md(p(t("x", "bold", "code")))).toBe("**`x`**\n");
  });

  test("inline code with backticks", () => {
    expect(md(p(t("a`b", "code")))).toBe("``a`b``\n");
    expect(md(p(t("`a", "code")))).toBe("`` `a ``\n");
  });

  test("hard breaks: written as a backslash, dropped at the end, a space in a heading", () => {
    expect(md(p(t("a"), { type: "hardBreak" }, t("b")))).toBe("a\\\nb\n");
    expect(md(p(t("a"), { type: "hardBreak" }))).toBe("a\n");
    expect(md({ type: "heading", attrs: { level: 1 }, content: [t("a"), { type: "hardBreak" }, t("b")] })).toBe("# a b\n");
  });

  test("marks the spec does not have are ignored", () => {
    expect(md(p(t("x", "strike", "underline")))).toBe("x\n");
  });
});

describe("components", () => {
  const dir = (attrs: Record<string, unknown>, ...content: JSONContent[]): JSONContent => ({ type: "directive", attrs: { form: "block", kind: "container", ...attrs }, ...(content.length ? { content } : {}) });

  test("a container with attributes from values: bare when allowed, quoted and escaped otherwise", () => {
    expect(md(dir({ name: "sidebar", attributes: { id: "x1", title: 'A "b" \\ c' } }, p(t("hi"))))).toBe(':::sidebar{id=x1 title="A \\"b\\" \\\\ c"}\nhi\n:::\n');
  });

  test("the attribute text as written wins over the values", () => {
    expect(md(dir({ name: "sidebar", attributes: { id: "tip", class: "wide" }, attributesRaw: " #tip .wide " }, p(t("x"))))).toBe(":::sidebar{ #tip .wide }\nx\n:::\n");
    expect(md(dir({ name: "sidebar", attributes: {}, attributesRaw: "" }, p(t("x"))))).toBe(":::sidebar\nx\n:::\n");
  });

  test("a leaf, and an empty container", () => {
    expect(md(dir({ name: "pagebreak", form: "leaf", kind: "leaf", attributes: { n: "1" } }))).toBe("::pagebreak{n=1}\n");
    expect(md(dir({ name: "readaloud" }))).toBe(":::readaloud\n:::\n");
  });

  test("nesting: the outer fence is longer than the inner ones", () => {
    const inner = dir({ name: "readaloud" }, p(t("deep")));
    expect(md(dir({ name: "sidebar" }, p(t("a")), inner))).toBe("::::sidebar\na\n\n:::readaloud\ndeep\n:::\n::::\n");
    expect(md(dir({ name: "a" }, dir({ name: "b" }, inner)))).toBe(":::::a\n::::b\n:::readaloud\ndeep\n:::\n::::\n:::::\n");
  });

  test("data: fields as YAML, or the body as written", () => {
    const fields = { name: "Rat", ac: 15, traits: [{ name: "Keen", text: "Smells." }] };
    expect(md(dir({ name: "statblock", kind: "data", fields }))).toBe(":::statblock\nname: Rat\nac: 15\ntraits:\n  - name: Keen\n    text: Smells.\n:::\n");
    expect(md(dir({ name: "statblock", kind: "data", fields, raw: "# note\nname:   Rat" }))).toBe(":::statblock\n# note\nname:   Rat\n:::\n");
  });

  test("unknown components keep their body, and a body that looks like a closing line gets a longer fence", () => {
    expect(md(dir({ name: "mystery", kind: "unknown", raw: "Not **known**" }))).toBe(":::mystery\nNot **known**\n:::\n");
    expect(md(dir({ name: "mystery", kind: "unknown", raw: "x\n:::\ny" }))).toBe("::::mystery\nx\n:::\ny\n::::\n");
  });
});

describe("front matter", () => {
  const body = doc(p(t("x")));
  test("the raw text is written back unchanged", () => {
    expect(toMarkdown(body, { frontMatterRaw: "# a note\ntitle:   X" })).toBe("---\n# a note\ntitle:   X\n---\n\nx\n");
    expect(toMarkdown(body, { frontMatterRaw: "" })).toBe("---\n\n---\n\nx\n");
  });
  test("without raw text, the values are written as YAML", () => {
    expect(toMarkdown(body, { frontMatter: { rosetta: "0.1", tags: ["a", "b"] } })).toBe('---\nrosetta: "0.1"\ntags:\n  - a\n  - b\n---\n\nx\n');
    expect(toMarkdown(body, { frontMatter: {} })).toBe("x\n");
  });
  test("a document with only front matter", () => {
    expect(toMarkdown(doc(), { frontMatterRaw: "a: 1" })).toBe("---\na: 1\n---\n");
  });
});

test("a node it cannot write is an error, not silent loss", () => {
  expect(() => md({ type: "mystery" })).toThrow(/mystery/);
});

describe("yaml", () => {
  const y = (data: Record<string, unknown>) => yamlMapping(data as never).join("\n");

  test("scalars", () => {
    expect(y({ a: "text", b: 15, c: true, d: null, e: -1.5 })).toBe("a: text\nb: 15\nc: true\nd: null\ne: -1.5");
  });

  test("strings that would be read as something else are quoted", () => {
    expect(y({ a: "15", b: "true", c: "null", d: "", e: " pad", f: "a: b", g: "# c", h: "2024-01-01", i: "- x", j: "*y", k: "a #b", l: "yes", m: "1e3", n: "0x1F" })).toBe(
      ['a: "15"', 'b: "true"', 'c: "null"', 'd: ""', 'e: " pad"', 'f: "a: b"', 'g: "# c"', 'h: "2024-01-01"', 'i: "- x"', 'j: "*y"', 'k: "a #b"', 'l: "yes"', 'm: "1e3"', 'n: "0x1F"'].join("\n"),
    );
  });

  test("text that is safe stays plain", () => {
    expect(y({ hp: "52 (8d8+16)", speed: "30 ft.", size: "Medium undead", dash: "-x", url: "https://x.test/a" })).toBe("hp: 52 (8d8+16)\nspeed: 30 ft.\nsize: Medium undead\ndash: -x\nurl: https://x.test/a");
  });

  test("multi-line text uses block scalars, or quotes when that would not be exact", () => {
    expect(y({ a: "one\ntwo\n", b: "one\n\ntwo", c: " lead\nx", d: "x\n\n" })).toBe('a: |\n  one\n  two\nb: |-\n  one\n\n  two\nc: " lead\\nx"\nd: "x\\n\\n"');
  });

  test("sequences, nested mappings, empty values and odd keys", () => {
    expect(y({ list: [1, "a", { k: "v", n: { x: 1 } }, [2, 3]], empty: [], none: {}, "odd key": 1 })).toBe(
      ["list:", "  - 1", "  - a", "  - k: v", "    n:", "      x: 1", "  -", "    - 2", "    - 3", "empty: []", "none: {}", '"odd key": 1'].join("\n"),
    );
  });
});
