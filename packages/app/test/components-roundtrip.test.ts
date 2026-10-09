// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import type { ComponentDefinition } from "@rosetta/contracts";
import { createEditor, fromAst, toMarkdown, type Editor } from "@rosetta/editor";
import { instantiate, type RosettaParser } from "@rosetta/parser-wasm";
import { afterEach, beforeAll, describe, expect, test } from "vitest";
import "./dom-setup";

// A dummy component of each kind, defined here as data. The editor and the parser are given the same definitions,
// the editor makes the component, edits it through its form, saves it, and the parser must read back what was edited.

const data: ComponentDefinition = {
  name: "dummy-data", form: "block", kind: "data", breakable: false,
  attributes: [{ name: "mode", type: "enum", values: ["a", "b"] }],
  fields: [
    { name: "title", type: "string", required: true, plain: true },
    { name: "notes", type: "string" },
    { name: "count", type: "number" },
    { name: "flag", type: "boolean" },
    { name: "tags", type: "list", items: { name: "tag", type: "string", plain: true } },
    { name: "rows", type: "list", items: { name: "row", type: "object", fields: [{ name: "k", type: "string", plain: true }, { name: "v", type: "number" }] } as never },
  ],
};
const box: ComponentDefinition = { name: "dummy-box", form: "block", kind: "container", breakable: true, attributes: [{ name: "title", type: "string" }] };
const mark: ComponentDefinition = { name: "dummy-mark", form: "leaf", kind: "leaf", attributes: [{ name: "n", type: "number" }] };

const dist = (f: string) => new NodeURL(`../../parser-wasm/dist/${f}`, import.meta.url);
let parser: RosettaParser;
beforeAll(async () => {
  await import(dist("wasm_exec.js").href);
  parser = await instantiate(readFileSync(dist("rosetta.wasm")));
  parser.setComponents([data, box, mark]);
});

const open: Editor[] = [];
afterEach(() => open.splice(0).forEach((e) => e.destroy()));

function mount(content?: unknown) {
  const editor = createEditor({
    element: document.body.appendChild(document.createElement("div")),
    components: [data, box, mark],
    renderComponent: async (md) => parser.parse(md).html, // the parser renders; the editor has no templates
    content: content as never,
  });
  open.push(editor);
  return editor;
}
const type = (el: Element, value: string) => {
  (el as HTMLInputElement).value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
};
const control = (name: string) => document.querySelector<HTMLInputElement>(`.rosetta-form [data-field="${name}"] input, .rosetta-form [data-field="${name}"] textarea, .rosetta-form [data-field="${name}"] select`)!;
const click = (el: Element) => el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));

/** Parses the Markdown, loads it into a new editor and saves it again. */
function reload(markdown: string) {
  const { ast, warnings } = parser.parse(markdown);
  const editor = mount(fromAst(ast).doc);
  return { ast, warnings, saved: toMarkdown(editor.getJSON()) };
}

describe("a dummy component of each kind round-trips", () => {
  test("data: made, edited through its form, saved, read back, loaded and saved again", () => {
    const editor = mount();
    editor.commands.insertComponent("dummy-data");
    type(control("title"), "The title");
    type(control("notes"), "Some *notes*\nOn two lines");
    type(control("count"), "7");
    const flag = control("flag");
    flag.checked = true;
    flag.dispatchEvent(new Event("change"));
    const mode = control("mode") as unknown as HTMLSelectElement;
    mode.value = "b";
    mode.dispatchEvent(new Event("change"));
    click(document.querySelector("[aria-label='Add tags']")!);
    type(document.querySelector<HTMLInputElement>('[data-field="tags"] .rosetta-form-item input')!, "first");
    click(document.querySelector("[aria-label='Add rows']")!);
    const [k, v] = document.querySelectorAll<HTMLInputElement>('[data-field="rows"] .rosetta-form-item input');
    type(k!, "x: y"); // text that needs quoting in YAML
    type(v!, "3");

    const markdown = toMarkdown(editor.getJSON());
    const { ast, warnings, saved } = reload(markdown);
    expect(warnings).toEqual([]);
    expect(ast.children).toHaveLength(1);
    expect(ast.children[0]).toMatchObject({
      type: "directive", name: "dummy-data", kind: "data", attributes: { mode: "b" },
      fields: { title: "The title", notes: "Some *notes*\nOn two lines", count: 7, flag: true, tags: ["first"], rows: [{ k: "x: y", v: 3 }] },
    });
    expect(saved).toBe(markdown); // loading it and saving it again changes nothing
  });

  test("container: made, given an attribute and content, saved, read back", () => {
    const editor = mount();
    editor.commands.insertComponent("dummy-box");
    type(document.querySelector<HTMLInputElement>('.rosetta-component-header [data-field="title"] input')!, "A: box");
    editor.commands.setTextSelection(3);
    editor.commands.insertContent("Inside.");

    const markdown = toMarkdown(editor.getJSON());
    const { ast, warnings, saved } = reload(markdown);
    expect(warnings).toEqual([]);
    expect(ast.children[0]).toMatchObject({ name: "dummy-box", kind: "container", attributes: { title: "A: box" } });
    expect(ast.children[0]!.children![0]).toMatchObject({ type: "paragraph", children: [{ value: "Inside." }] });
    expect(saved).toBe(markdown);
  });

  test("leaf: made, given an attribute, saved, read back", () => {
    const editor = mount();
    editor.commands.insertComponent("dummy-mark");
    type(control("n"), "4");

    const markdown = toMarkdown(editor.getJSON());
    const { ast, warnings, saved } = reload(markdown);
    expect(warnings).toEqual([]);
    expect(ast.children[0]).toMatchObject({ name: "dummy-mark", form: "leaf", kind: "leaf", attributes: { n: "4" } });
    expect(saved).toBe(markdown);
  });

  test("all three together: each is inserted after the one before", () => {
    const editor = mount();
    editor.commands.insertComponent("dummy-mark");
    editor.commands.insertComponent("dummy-data");
    editor.commands.insertComponent("dummy-box");
    const names = parser.parse(toMarkdown(editor.getJSON())).ast.children.map((c) => c.name);
    expect(names).toEqual(["dummy-mark", "dummy-data", "dummy-box"]);
  });
});

describe("rendering comes from the parser", () => {
  test("a data component shows the parser's HTML, and the form's changes show after it closes", async () => {
    const editor = mount();
    editor.commands.insertComponent("dummy-data");
    type(control("title"), "Shown");
    editor.commands.setTextSelection(1);
    await wait();
    const rendered = document.querySelector(".rosetta-component-rendered")!;
    expect(rendered.querySelector(".rosetta-dummy-data")).not.toBeNull(); // the parser's wrapper
    expect(rendered.textContent).toContain("Shown");
  });
});
