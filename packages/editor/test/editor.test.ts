import type { JSONContent } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createToolbar } from "../src/index";
import { click, press, setup, type } from "./helpers";

let s: ReturnType<typeof setup>;
beforeEach(() => void (s = setup("<p>hello world</p>")));
afterEach(() => s.cleanup());

const selectAll = () => s.editor.commands.selectAll();

describe("toolbar creates and edits every standard element", () => {
  test.each([
    ["bold", "<strong>hello world</strong>"],
    ["italic", "<em>hello world</em>"],
    ["strike", "<s>hello world</s>"],
    ["code", "<code>hello world</code>"],
    ["h1", "<h1>hello world</h1>"],
    ["h2", "<h2>hello world</h2>"],
    ["h3", "<h3>hello world</h3>"],
    ["bulletList", "<ul><li><p>hello world</p></li></ul>"],
    ["orderedList", "<ol><li><p>hello world</p></li></ol>"],
    ["blockquote", "<blockquote><p>hello world</p></blockquote>"],
    ["codeBlock", "<pre><code>hello world</code></pre>"],
  ])("%s", async (command, expected) => {
    selectAll();
    await click(command);
    expect(s.html()).toContain(expected);
  });

  test("pressing a button again removes the formatting", async () => {
    selectAll();
    await click("bold");
    expect(s.editor.isActive("bold")).toBe(true);
    expect(document.querySelector('[data-command="bold"]')?.getAttribute("aria-pressed")).toBe("true");
    await click("bold");
    expect(s.html()).toBe("<p>hello world</p>");
  });

  test("heading back to paragraph", async () => {
    selectAll();
    await click("h2");
    await click("paragraph");
    expect(s.html()).toBe("<p>hello world</p>");
  });

  test("link", async () => {
    selectAll();
    await click("link");
    expect(s.html()).toContain('href="https://example.com">hello world</a>');
    expect(document.querySelector('[data-command="link"]')?.getAttribute("aria-pressed")).toBe("true");
  });

  test("an empty address removes a link", async () => {
    s.cleanup();
    s = setup('<p><a href="https://old.example">hello world</a></p>');
    s.toolbar.destroy();
    const toolbar = createToolbar(s.editor, { askUrl: () => "" });
    document.body.prepend(toolbar.element);
    s.editor.commands.setTextSelection(3);
    await click("link");
    expect(s.html()).toBe("<p>hello world</p>");
  });

  test("horizontal rule and image", async () => {
    await click("rule");
    await click("image");
    expect(s.html()).toContain("<hr>");
    expect(s.html()).toContain('<img src="https://example.com/a.png"');
  });

  test("table: insert, grow, shrink, delete", async () => {
    await click("table");
    const rows = () => (s.editor.getJSON().content!.find((n) => n.type === "table") as JSONContent).content as JSONContent[];
    expect(rows()).toHaveLength(3);
    expect(rows()[0]!.content![0]!.type).toBe("tableHeader");
    expect(rows()[0]!.content).toHaveLength(3);
    await click("addRow");
    expect(rows()).toHaveLength(4);
    await click("addColumn");
    expect(rows()[0]!.content).toHaveLength(4);
    await click("deleteRow");
    await click("deleteColumn");
    expect(rows()).toHaveLength(3);
    expect(rows()[0]!.content).toHaveLength(3);
    await click("deleteTable");
    expect(s.html()).not.toContain("<table");
  });

  test("table buttons are only shown inside a table", async () => {
    const row = () => document.querySelector<HTMLButtonElement>('[data-command="addRow"]')!;
    expect(row().hidden).toBe(true);
    await click("table");
    expect(row().hidden).toBe(false);
  });

  test("undo and redo", async () => {
    selectAll();
    await click("bold");
    await click("undo");
    expect(s.html()).toBe("<p>hello world</p>");
    await click("redo");
    expect(s.html()).toContain("<strong>");
  });
});

describe("keyboard", () => {
  test.each([
    ["b", { ctrl: true }, "<strong>"],
    ["i", { ctrl: true }, "<em>"],
    ["e", { ctrl: true }, "<code>"],
    ["s", { ctrl: true, shift: true }, "<s>"],
    ["1", { ctrl: true, alt: true }, "<h1>"],
    ["2", { ctrl: true, alt: true }, "<h2>"],
    ["3", { ctrl: true, alt: true }, "<h3>"],
    ["8", { ctrl: true, shift: true }, "<ul>"],
    ["7", { ctrl: true, shift: true }, "<ol>"],
    ["b", { ctrl: true, shift: true }, "<blockquote>"],
    ["c", { ctrl: true, alt: true }, "<pre>"],
  ] as const)("shortcut %s %o", (key, mods, expected) => {
    selectAll();
    press(s.editor, key, mods);
    expect(s.html()).toContain(expected);
  });

  test("Markdown shortcuts while typing", () => {
    s.editor.commands.clearContent();
    type(s.editor, "# Title");
    press(s.editor, "Enter");
    type(s.editor, "- item");
    press(s.editor, "Enter");
    press(s.editor, "Enter"); // leaves the list
    type(s.editor, "> quote");
    press(s.editor, "Enter");
    press(s.editor, "Enter");
    type(s.editor, "1. one");
    press(s.editor, "Enter");
    press(s.editor, "Enter");
    type(s.editor, "A **bold** and *italic* and `code` and ~~gone~~ word");
    const html = s.html();
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<ul><li><p>item</p></li></ul>");
    expect(html).toContain("<blockquote><p>quote</p></blockquote>");
    expect(html).toContain("<ol><li><p>one</p></li></ol>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("<s>gone</s>");
  });

  test("typing ``` makes a code block and --- a rule", () => {
    s.editor.commands.clearContent();
    type(s.editor, "``` ");
    expect(s.html()).toContain("<pre>");
    s.editor.commands.clearContent();
    type(s.editor, "---");
    expect(s.html()).toContain("<hr>");
  });

  test("Tab moves between table cells and undo works from the keyboard", async () => {
    await click("table");
    const before = s.editor.state.selection.from;
    press(s.editor, "Tab");
    expect(s.editor.state.selection.from).toBeGreaterThan(before);
    type(s.editor, "x");
    press(s.editor, "z", { ctrl: true });
    expect(s.html()).not.toContain(">x<");
  });
});

test("editing works on content that was loaded", () => {
  s.cleanup();
  s = setup("<h2>Loaded</h2><ul><li><p>a</p></li></ul><table><tbody><tr><th>h</th></tr><tr><td>c</td></tr></tbody></table><p><img src='x.png' alt='pic'></p>");
  const types = s.editor.getJSON().content!.map((n) => n.type);
  expect(types.slice(0, 4)).toEqual(["heading", "bulletList", "table", "paragraph"]);
});
