// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { toMarkdown } from "@rosetta/editor";
import { instantiate, type RosettaParser } from "@rosetta/parser-wasm";
import { beforeAll, describe, expect, test } from "vitest";
import type { Node } from "@rosetta/contracts";
import "./dom-setup";

// Text that looks like Markdown or like a directive must survive a save as plain text.

const dist = (f: string) => new NodeURL(`../../parser-wasm/dist/${f}`, import.meta.url);
let parser: RosettaParser;
beforeAll(async () => {
  await import(dist("wasm_exec.js").href);
  parser = await instantiate(readFileSync(dist("rosetta.wasm")));
});

const tricky = [
  "*star*", "**double**", "_under_", "snake_case_word", "__init__", "# not a heading", "## two", "#hashtag", "#",
  "- not a list", "+ not a list", "* not a list", "-", "+", "1. not a list", "1) not a list", "10. ten", "5.", "> not a quote", ">",
  "```fence```", "``", "`tick`", "~~~", "~~~js", "---", "***", "___", "===", "= x", "|pipe|", "a | b",
  "<b>html</b>", "<script>alert(1)</script>", "<!-- comment -->", "1 < 2 > 3", "&amp; &copy; &#35; &#x41; &bogus; & plain",
  "[link](https://x.test)", "![img](x.png)", "[ref]: http://x", "[x]", "back\\slash", "a\\*b", "ends with backslash\\", "\\\\",
  ":::", "::name", ":::name{x=1}", "::pagebreak", "text :: more", "https://example.com/a_b_c", "www.example.com",
  "Ünïcödé 🌳 – “quotes”", "tab\there", "two  spaces", "a:b", "http://x.test", "C#", "trailing #", "50% off!", "(parens) {braces} [brackets]",
];

const multiline = ["line one\n# line two", "x\n- y", "x\n---", "x\n===", "x\n> y", "x\n1. y", "x\n:::", "x\n::name", "x\n```", "x\n+ y"];

/** The text of an inline AST, with each node's marks; adjacent text with equal marks joined. */
function segments(nodes: Node[] | undefined, marks: string[] = []): { text: string; marks: string[] }[] {
  const out: { text: string; marks: string[] }[] = [];
  const add = (text: string, m: string[]) => {
    const last = out.at(-1);
    if (last && last.marks.join() === m.join()) last.text += text;
    else out.push({ text, marks: m });
  };
  for (const n of nodes ?? []) {
    if (n.type === "text") add(n.value ?? "", marks);
    else if (n.type === "strong") segments(n.children, [...marks, "bold"]).forEach((s) => add(s.text, s.marks));
    else if (n.type === "link") segments(n.children, [...marks, "link"]).forEach((s) => add(s.text, s.marks));
    else throw new Error(`unexpected ${n.type}`);
  }
  return out;
}

const text = (s: string, marks?: { type: string; attrs?: Record<string, unknown> }[]) => ({ type: "text", text: s, ...(marks ? { marks } : {}) });
const para = (s: string) => ({ type: "paragraph", content: [text(s)] });

/** Where to put the text, and where to find it again in the parsed AST. */
const places: [string, (s: string) => unknown, (children: Node[]) => Node[] | undefined][] = [
  ["paragraph", (s) => para(s), (c) => c[0]?.children],
  ["heading", (s) => ({ type: "heading", attrs: { level: 2 }, content: [text(s)] }), (c) => c[0]?.children],
  ["quote", (s) => ({ type: "blockquote", content: [para(s)] }), (c) => c[0]?.children?.[0]?.children],
  ["bullet item", (s) => ({ type: "bulletList", attrs: { tight: true }, content: [{ type: "listItem", content: [para(s)] }] }), (c) => c[0]?.children?.[0]?.children?.[0]?.children],
  ["numbered item", (s) => ({ type: "orderedList", attrs: { start: 1, tight: true }, content: [{ type: "listItem", content: [para(s)] }] }), (c) => c[0]?.children?.[0]?.children?.[0]?.children],
  ["component body", (s) => ({ type: "directive", attrs: { name: "readaloud", form: "block", kind: "container" }, content: [para(s)] }), (c) => c[0]?.children?.[0]?.children],
  ["bold", (s) => ({ type: "paragraph", content: [text(s, [{ type: "bold" }])] }), (c) => c[0]?.children],
  ["link text", (s) => ({ type: "paragraph", content: [text(s, [{ type: "link", attrs: { href: "https://x.test" } }])] }), (c) => c[0]?.children?.[0]?.children],
];
const singleLine: [string, (s: string) => unknown, (children: Node[]) => Node[] | undefined][] = [
  ["table cell", (s) => ({ type: "table", content: [{ type: "tableRow", content: [{ type: "tableHeader", attrs: { align: null }, content: [para(s)] }] }] }), (c) => c[0]?.children?.[0]?.children?.[0]?.children],
];

function check(s: string, place: (typeof places)[number] | (typeof singleLine)[number]) {
  const markdown = toMarkdown({ type: "doc", content: [place[1](s)] } as never);
  const found = place[2](parser.parse(markdown).ast.children);
  const got = segments(found).map((x) => x.text).join("");
  expect(got, `${place[0]}: ${JSON.stringify(s)} was saved as ${JSON.stringify(markdown)}`).toBe(s);
}

describe("text that looks like Markdown stays text", () => {
  for (const place of places) {
    test.each(tricky)(`${place[0]}: %j`, (s) => check(s, place));
  }
  for (const place of singleLine) test.each(tricky)(`${place[0]}: %j`, (s) => check(s, place));
  test.each(multiline)("paragraph with a line break: %j", (s) => check(s, places[0]!));
});

test("the whole-document form of the same texts keeps the paragraphs apart", () => {
  const content = tricky.map(para);
  const { ast } = parser.parse(toMarkdown({ type: "doc", content } as never));
  expect(ast.children.map((c) => segments(c.children).map((x) => x.text).join(""))).toEqual(tricky);
});
