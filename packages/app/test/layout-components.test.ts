// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { m1Components } from "@rosetta/contracts";
import { createEditor, createToolbar, fromAst, toMarkdown, type Editor } from "@rosetta/editor";
import { instantiate, type RosettaParser } from "@rosetta/parser-wasm";
import { afterEach, beforeAll, describe, expect, test } from "vitest";
import "./dom-setup";

// readaloud, sidebar and pagebreak, with the temporary M1 definitions, in the real editor and with the real parser.

const dist = (f: string) => new NodeURL(`../../parser-wasm/dist/${f}`, import.meta.url);
let parser: RosettaParser;
beforeAll(async () => {
  await import(dist("wasm_exec.js").href);
  parser = await instantiate(readFileSync(dist("rosetta.wasm")));
});

const open: (() => void)[] = [];
afterEach(() => open.splice(0).forEach((f) => f()));

function mount(markdown = "") {
  const host = document.body.appendChild(document.createElement("div"));
  const editor = createEditor({
    element: host,
    components: m1Components,
    renderComponent: async (md) => parser.parse(md).html,
    content: markdown ? fromAst(parser.parse(markdown).ast).doc : undefined,
  });
  const toolbar = createToolbar(editor);
  document.body.prepend(toolbar.element);
  open.push(() => (toolbar.destroy(), editor.destroy(), host.remove(), toolbar.element.remove()));
  return editor;
}

const type = (el: Element, value: string) => {
  (el as HTMLInputElement).value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
};
const insert = (name: string) => {
  const picker = document.querySelector<HTMLSelectElement>('[data-command="insertComponent"]')!;
  picker.value = name;
  picker.dispatchEvent(new Event("change"));
};
const control = (name: string) => document.querySelector<HTMLInputElement>(`.rosetta-form [data-field="${name}"] input, .rosetta-form [data-field="${name}"] textarea`)!;
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const find = (editor: Editor, name: string) => {
  let pos = -1;
  editor.state.doc.descendants((n, p) => {
    if (pos < 0 && n.attrs.name === name) pos = p;
  });
  return pos;
};
const checked = (markdown: string) => {
  const { ast, warnings } = parser.parse(markdown);
  expect(warnings).toEqual([]);
  return ast.children;
};

describe("readaloud", () => {
  test("is inserted with the cursor inside, typed into, saved and read back", () => {
    const editor = mount();
    insert("readaloud");
    editor.commands.insertContent("The door creaks open.");
    const markdown = toMarkdown(editor.getJSON());
    expect(markdown).toBe(":::readaloud\nThe door creaks open.\n:::\n");
    expect(checked(markdown)[0]).toMatchObject({ type: "directive", name: "readaloud", kind: "container" });
  });

  test("holds several blocks, and reloading and saving again changes nothing", () => {
    const source = ":::readaloud\nThe door opens.\n\n- a draft\n- a smell of rot\n:::\n";
    const editor = mount(source);
    expect(editor.state.doc.nodeAt(find(editor, "readaloud"))!.childCount).toBe(2);
    expect(toMarkdown(editor.getJSON())).toBe(source);
  });

  test("is shown boxed in the editor with its content editable", () => {
    const editor = mount();
    insert("readaloud");
    const frame = document.querySelector('.rosetta-component[data-component="readaloud"]')!;
    expect(frame.querySelector(".rosetta-component-body")).not.toBeNull();
    editor.commands.insertContent("Typed inside.");
    expect(frame.querySelector(".rosetta-component-body")!.textContent).toBe("Typed inside.");
  });
});

describe("sidebar", () => {
  test("is inserted and its title is edited in the header form", () => {
    const editor = mount();
    insert("sidebar");
    editor.commands.insertContent("Remember the keys.");
    type(control("title"), "Tip");
    const markdown = toMarkdown(editor.getJSON());
    expect(markdown).toBe(":::sidebar{title=Tip}\nRemember the keys.\n:::\n");
    expect(checked(markdown)[0]).toMatchObject({ name: "sidebar", attributes: { title: "Tip" } });
  });

  test("a title with spaces and quotes survives the round trip", () => {
    const editor = mount();
    insert("sidebar");
    editor.commands.insertContent("x");
    type(control("title"), 'A "quoted" tip');
    const markdown = toMarkdown(editor.getJSON());
    expect(checked(markdown)[0]).toMatchObject({ attributes: { title: 'A "quoted" tip' } });
    const again = mount(markdown);
    expect(toMarkdown(again.getJSON())).toBe(markdown);
  });

  test("clearing the title leaves a sidebar without one", () => {
    const editor = mount(":::sidebar{title=Tip}\nx\n:::\n");
    type(control("title"), "");
    expect(toMarkdown(editor.getJSON())).toBe(":::sidebar\nx\n:::\n");
  });

  test("a sidebar can hold a read-aloud box, and the other way round", () => {
    const source = "::::sidebar{title=Lore}\nText.\n\n:::readaloud\nInside.\n:::\n::::\n";
    expect(toMarkdown(mount(source).getJSON())).toBe(source);
  });

  test("hand-written attributes are saved as written until the title is edited", () => {
    const source = ":::sidebar{ title=\"Tip\" #tip }\nx\n:::\n";
    const editor = mount(source);
    expect(toMarkdown(editor.getJSON())).toBe(source);
  });
});

describe("pagebreak", () => {
  test("is inserted, saved on its own line and read back", () => {
    const editor = mount("Before.\n");
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    insert("pagebreak");
    const markdown = toMarkdown(editor.getJSON());
    expect(markdown).toBe("Before.\n\n::pagebreak\n");
    const children = checked(markdown);
    expect(children.map((c: { type: string }) => c.type)).toEqual(["paragraph", "directive"]);
    expect(children[1]).toMatchObject({ name: "pagebreak", kind: "leaf" });
  });

  test("reloading keeps it, and it is rendered as a page break", async () => {
    const source = "One.\n\n::pagebreak\n\nTwo.\n";
    const editor = mount(source);
    expect(toMarkdown(editor.getJSON())).toBe(source);
    await wait();
    expect(document.querySelector(".rosetta-component-rendered")!.innerHTML).toContain("pagebreak");
  });

  test("it can be removed with the keyboard", () => {
    const editor = mount("One.\n\n::pagebreak\n\nTwo.\n");
    editor.commands.setNodeSelection(find(editor, "pagebreak"));
    editor.commands.deleteSelection();
    expect(toMarkdown(editor.getJSON())).toBe("One.\n\nTwo.\n");
  });

  test("selecting it opens no form, as it has nothing to edit", () => {
    const editor = mount("::pagebreak\n");
    editor.commands.setNodeSelection(find(editor, "pagebreak"));
    expect(document.querySelectorAll(".rosetta-form input, .rosetta-form textarea")).toHaveLength(0);
  });
});
