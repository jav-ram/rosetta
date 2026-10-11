import type { ComponentDefinition } from "@rosetta/contracts";
import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, test, vi } from "vitest";
import { componentsOf, createEditor, createToolbar, setDocument, toMarkdown } from "../src/index";

// One dummy component of each kind. Nothing in the editor knows these names: they are data.
const data: ComponentDefinition = {
  name: "dummy-data", form: "block", kind: "data", breakable: false,
  attributes: [{ name: "mode", type: "enum", values: ["a", "b"] }],
  fields: [
    { name: "title", type: "string", required: true, plain: true },
    { name: "notes", type: "string" },
    { name: "count", type: "number" },
    { name: "flag", type: "boolean" },
    { name: "level", type: "enum", values: ["low", "high"] },
    { name: "tags", type: "list", items: { name: "tag", type: "string", plain: true } },
    { name: "rows", type: "list", items: { name: "row", type: "object", fields: [{ name: "k", type: "string", plain: true }, { name: "v", type: "number" }] } as never },
    { name: "box", type: "object", fields: [{ name: "w", type: "number" }, { name: "h", type: "number" }] as never },
  ],
};
const box: ComponentDefinition = { name: "dummy-box", form: "block", kind: "container", breakable: true, attributes: [{ name: "title", type: "string" }, { name: "wide", type: "boolean" }] };
const mark: ComponentDefinition = { name: "dummy-mark", form: "leaf", kind: "leaf", attributes: [{ name: "n", type: "number", default: "1" }] };

const open: (() => void)[] = [];
afterEach(() => open.splice(0).forEach((f) => f()));

function mount(options: { components?: ComponentDefinition[]; renderComponent?: (md: string) => Promise<string>; content?: unknown } = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const editor = createEditor({ element: host, components: options.components ?? [data, box, mark], renderComponent: options.renderComponent, content: options.content as never });
  const toolbar = createToolbar(editor);
  document.body.prepend(toolbar.element);
  open.push(() => (toolbar.destroy(), editor.destroy(), host.remove()));
  return { editor, host, toolbar };
}

const find = (editor: Editor, name: string) => {
  let found: { pos: number; attrs: Record<string, unknown> } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (!found && node.attrs.name === name) found = { pos, attrs: node.attrs };
  });
  if (!found) throw new Error(`no ${name}`);
  return found as { pos: number; attrs: Record<string, unknown> };
};
const select = (editor: Editor, name: string) => editor.commands.setNodeSelection(find(editor, name).pos);
const type = (el: Element, value: string) => {
  (el as HTMLInputElement).value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
};
const field = (name: string) => document.querySelector<HTMLElement>(`.rosetta-form [data-field="${name}"]`)!;
const control = (name: string) => field(name).querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")!;
const click = (el: Element) => el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
const wait = (ms = 200) => new Promise((r) => setTimeout(r, ms));

describe("registration from definitions", () => {
  test("the editor knows exactly the definitions it was given", () => {
    expect(componentsOf(mount().editor).map((c) => c.name)).toEqual(["dummy-data", "dummy-box", "dummy-mark"]);
    expect(componentsOf(mount({ components: [] }).editor)).toEqual([]);
  });

  test("the toolbar lists them and inserts the chosen one", () => {
    const { editor } = mount();
    const picker = document.querySelector<HTMLSelectElement>('[data-command="insertComponent"]')!;
    expect([...picker.options].map((o) => o.value)).toEqual(["", "dummy-data", "dummy-box", "dummy-mark"]);
    picker.value = "dummy-box";
    picker.dispatchEvent(new Event("change"));
    expect(find(editor, "dummy-box").attrs).toMatchObject({ kind: "container", breakable: true, attributes: {} });
    expect(picker.value).toBe("");
  });

  test("without definitions there is no component picker", () => {
    mount({ components: [] });
    expect(document.querySelector('[data-command="insertComponent"]')).toBeNull();
  });

  test("insertComponent: defaults, selection, and unknown names", () => {
    const { editor } = mount();
    expect(editor.commands.insertComponent("nope")).toBe(false);
    editor.commands.insertComponent("dummy-mark");
    expect(find(editor, "dummy-mark").attrs).toMatchObject({ kind: "leaf", form: "leaf", attributes: { n: "1" }, fields: null });
    editor.commands.insertComponent("dummy-data");
    expect(find(editor, "dummy-data").attrs).toMatchObject({ kind: "data", fields: {}, raw: null });
    expect(editor.state.selection.constructor.name).toBe("NodeSelection");
  });
});

describe("data component: rendered output, or a form while selected", () => {
  test("the form has a control for every attribute and field, by type", () => {
    const { editor } = mount();
    editor.commands.insertComponent("dummy-data"); // selects it
    expect(control("mode").tagName).toBe("SELECT");
    expect([...(control("mode") as HTMLSelectElement).options].map((o) => o.value)).toEqual(["", "a", "b"]);
    expect(control("title")).toMatchObject({ tagName: "INPUT", type: "text" }); // plain: one line
    expect(field("title").querySelector("label")!.textContent).toBe("title *"); // required
    expect(control("notes").tagName).toBe("TEXTAREA"); // Markdown: several lines
    expect(control("count")).toMatchObject({ type: "number" });
    expect(control("flag")).toMatchObject({ type: "checkbox" });
    expect([...(control("level") as HTMLSelectElement).options].map((o) => o.value)).toEqual(["", "low", "high"]);
    expect(field("tags").querySelector("button")!.textContent).toBe("Add");
    expect(field("box").querySelectorAll("input[type=number]")).toHaveLength(2);
  });

  test("editing writes the values into the node and drops the author's text", () => {
    const { editor } = mount({
      content: { type: "doc", content: [{ type: "directiveLeaf", attrs: { name: "dummy-data", form: "block", kind: "data", breakable: false, attributes: { mode: "a" }, attributesRaw: ' mode="a" ', fields: { title: "Old" }, raw: "# note\ntitle: Old" } }] },
    });
    select(editor, "dummy-data");
    expect((control("title") as HTMLInputElement).value).toBe("Old");
    type(control("title"), "New");
    const attrs = find(editor, "dummy-data").attrs;
    expect(attrs.fields).toEqual({ title: "New" });
    expect(attrs.raw).toBeNull();
    expect(attrs.attributesRaw).toBeNull();
    expect(toMarkdown(editor.getJSON())).toBe(":::dummy-data{mode=a}\ntitle: New\n:::\n");
  });

  test("every kind of control writes the right kind of value", () => {
    const { editor } = mount();
    editor.commands.insertComponent("dummy-data");
    type(control("title"), "T");
    type(control("notes"), "Some *text*\nmore");
    type(control("count"), "12");
    (control("flag") as HTMLInputElement).checked = true;
    control("flag").dispatchEvent(new Event("change"));
    (control("level") as HTMLSelectElement).value = "high";
    control("level").dispatchEvent(new Event("change"));
    (control("mode") as HTMLSelectElement).value = "b";
    control("mode").dispatchEvent(new Event("change"));
    const [w, h] = field("box").querySelectorAll("input");
    type(w!, "3");
    type(h!, "4");
    const { fields, attributes } = find(editor, "dummy-data").attrs as { fields: Record<string, unknown>; attributes: Record<string, string> };
    expect(fields).toEqual({ title: "T", notes: "Some *text*\nmore", count: 12, flag: true, level: "high", box: { w: 3, h: 4 } });
    expect(attributes).toEqual({ mode: "b" });
  });

  test("values are written in the order of the definition, not the order they were typed", () => {
    const { editor } = mount();
    editor.commands.insertComponent("dummy-data");
    type(control("count"), "1");
    type(control("title"), "T");
    type(control("notes"), "N");
    expect(Object.keys(find(editor, "dummy-data").attrs.fields as object)).toEqual(["title", "notes", "count"]);
  });

  test("emptying a control removes the value", () => {
    const { editor } = mount();
    editor.commands.insertComponent("dummy-data");
    type(control("title"), "T");
    type(control("count"), "5");
    type(control("count"), "");
    type(control("notes"), "");
    expect(find(editor, "dummy-data").attrs.fields).toEqual({ title: "T" });
  });

  test("lists: add, edit, add an object, remove", () => {
    const { editor } = mount();
    editor.commands.insertComponent("dummy-data");
    click(field("tags").querySelector("button[aria-label='Add tags']")!);
    type(field("tags").querySelector("input")!, "first");
    click(field("tags").querySelector("button[aria-label='Add tags']")!);
    const tagInputs = field("tags").querySelectorAll<HTMLInputElement>(".rosetta-form-item input");
    type(tagInputs[1]!, "second");
    expect(find(editor, "dummy-data").attrs.fields).toEqual({ tags: ["first", "second"] });

    click(field("rows").querySelector("button[aria-label='Add rows']")!);
    const [k, v] = field("rows").querySelectorAll(".rosetta-form-item input");
    type(k!, "x");
    type(v!, "7");
    expect((find(editor, "dummy-data").attrs.fields as Record<string, unknown>).rows).toEqual([{ k: "x", v: 7 }]);

    click(field("tags").querySelector("button[aria-label='Remove tags 1']")!);
    expect((find(editor, "dummy-data").attrs.fields as Record<string, unknown>).tags).toEqual(["second"]);
    click(field("tags").querySelector("button[aria-label='Remove tags 1']")!);
    expect((find(editor, "dummy-data").attrs.fields as Record<string, unknown>).tags).toBeUndefined();
  });

  test("the form follows changes made from outside, such as undo", () => {
    const { editor } = mount();
    editor.commands.insertComponent("dummy-data");
    type(control("title"), "one");
    const { pos, attrs } = find(editor, "dummy-data");
    editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...attrs, fields: { title: "from outside" } }));
    expect((control("title") as HTMLInputElement).value).toBe("from outside");
  });

  test("typing keeps the same input (it is not rebuilt, so focus is kept)", () => {
    const { editor } = mount();
    editor.commands.insertComponent("dummy-data");
    const before = control("title");
    type(before, "a");
    type(before, "ab");
    expect(control("title")).toBe(before);
  });

  test("leaving the component closes the form", () => {
    const { editor } = mount();
    editor.commands.insertComponent("dummy-data");
    expect(document.querySelector(".rosetta-form")).not.toBeNull();
    editor.commands.setTextSelection(1);
    expect(document.querySelector(".rosetta-form")).toBeNull();
    expect(document.querySelector<HTMLElement>(".rosetta-component-rendered")!.hidden).toBe(false);
  });
});

describe("rendering is done by the renderer that was passed in", () => {
  test("the component's Markdown goes in, its HTML is shown, and nothing is rendered twice", async () => {
    const render = vi.fn(async (md: string) => `<div class="from-parser">${md.length}</div>`);
    const { editor } = mount({ renderComponent: render });
    editor.commands.insertComponent("dummy-mark");
    editor.commands.setTextSelection(1); // deselect
    await wait();
    expect(render).toHaveBeenCalledWith("::dummy-mark{n=1}");
    expect(document.querySelector(".rosetta-component-rendered .from-parser")!.textContent).toBe("17");
    editor.commands.setNodeSelection(find(editor, "dummy-mark").pos);
    editor.commands.setTextSelection(1);
    await wait();
    expect(render).toHaveBeenCalledTimes(1); // the second time came from the cache
  });

  test("after editing, the new Markdown is rendered when the form closes", async () => {
    const render = vi.fn(async (md: string) => `<pre>${md}</pre>`);
    const { editor } = mount({ renderComponent: render });
    editor.commands.insertComponent("dummy-data");
    type(control("title"), "Edited");
    editor.commands.setTextSelection(1);
    await wait();
    expect(document.querySelector(".rosetta-component-rendered")!.textContent).toBe(":::dummy-data\ntitle: Edited\n:::");
  });

  test("an old result never replaces a newer one", async () => {
    const pending = new Map<string, (html: string) => void>();
    const { editor } = mount({ renderComponent: (md) => new Promise<string>((r) => pending.set(md, r)) });
    editor.commands.insertComponent("dummy-mark"); // asks for ::dummy-mark{n=1}
    type(control("n"), "5");
    editor.commands.setTextSelection(1); // asks for ::dummy-mark{n=5}
    await wait();
    expect([...pending.keys()]).toEqual(["::dummy-mark{n=1}", "::dummy-mark{n=5}"]);
    pending.get("::dummy-mark{n=5}")!("<p>new</p>");
    await wait(10);
    pending.get("::dummy-mark{n=1}")!("<p>old</p>");
    await wait(10);
    expect(document.querySelector(".rosetta-component-rendered")!.textContent).toBe("new");
  });

  test("a renderer that fails shows the problem instead of breaking the editor", async () => {
    const { editor } = mount({ renderComponent: () => Promise.reject(new Error("worker is down")) });
    editor.commands.insertComponent("dummy-mark");
    editor.commands.setTextSelection(1);
    await wait();
    expect(document.querySelector(".rosetta-component-rendered")!.textContent).toContain("worker is down");
  });

  test("a component nobody defined is still shown (rendered by the parser) and has no form", async () => {
    const render = vi.fn(async () => "<div class='warning'>Unknown component</div>");
    const { editor } = mount({
      components: [],
      renderComponent: render,
      content: { type: "doc", content: [{ type: "directiveLeaf", attrs: { name: "mystery", form: "block", kind: "unknown", raw: "body", attributes: {} } }] },
    });
    await wait();
    expect(render).toHaveBeenCalledWith(":::mystery\nbody\n:::");
    select(editor, "mystery");
    expect(document.querySelector(".rosetta-form")).toBeNull();
    expect(document.querySelector(".rosetta-component-rendered .warning")).not.toBeNull();
  });
});

describe("container component", () => {
  test("holds editable blocks inside a frame, with its attributes in the header", () => {
    const { editor } = mount();
    editor.commands.insertComponent("dummy-box");
    const frame = document.querySelector<HTMLElement>(".rosetta-component-container")!;
    expect(frame.querySelector(".rosetta-component-name")!.textContent).toBe("dummy-box");
    expect(frame.querySelector(".rosetta-component-header .rosetta-form")).not.toBeNull();
    expect(frame.querySelector(".rosetta-component-body")).not.toBeNull();
    editor.commands.setTextSelection(find(editor, "dummy-box").pos + 2);
    editor.commands.insertContent("Inside the box");
    expect(toMarkdown(editor.getJSON())).toBe(":::dummy-box\nInside the box\n:::\n");
  });

  test("editing an attribute updates the node, drops the author's text and keeps the input", () => {
    const { editor } = mount({
      content: { type: "doc", content: [{ type: "directive", attrs: { name: "dummy-box", form: "block", kind: "container", breakable: true, attributes: { title: "A" }, attributesRaw: ' title = "A" ' }, content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] }] },
    });
    const input = document.querySelector<HTMLInputElement>('.rosetta-component-header [data-field="title"] input')!;
    expect(input.value).toBe("A");
    type(input, "B");
    const flag = document.querySelector<HTMLInputElement>('.rosetta-component-header [data-field="wide"] input')!;
    flag.checked = true;
    flag.dispatchEvent(new Event("change"));
    const attrs = find(editor, "dummy-box").attrs;
    expect(attrs.attributes).toEqual({ title: "B", wide: "true" });
    expect(attrs.attributesRaw).toBeNull();
    expect(document.querySelector('.rosetta-component-header [data-field="title"] input')).toBe(input);
    expect(toMarkdown(editor.getJSON())).toBe(":::dummy-box{title=B wide=true}\nx\n:::\n");
  });

  test("another component name is not a container view of the same node", () => {
    const { editor } = mount();
    editor.commands.insertComponent("dummy-box");
    const { pos, attrs } = find(editor, "dummy-box");
    editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...attrs, name: "other" }));
    expect(document.querySelector(".rosetta-component-container .rosetta-component-name")!.textContent).toBe("other");
  });
});

describe("leaf component", () => {
  test("shows its attributes in a form while selected", () => {
    const { editor } = mount();
    editor.commands.insertComponent("dummy-mark");
    expect((control("n") as HTMLInputElement).value).toBe("1");
    type(control("n"), "5");
    expect(toMarkdown(editor.getJSON())).toBe("::dummy-mark{n=5}\n");
  });
});

test("every kind survives copy and paste of the editor's HTML", () => {
  const { editor } = mount();
  editor.commands.insertComponent("dummy-box");
  editor.commands.insertComponent("dummy-mark");
  editor.commands.insertComponent("dummy-data");
  const before = editor.getJSON();
  editor.commands.setContent(editor.getHTML());
  expect(editor.getJSON().content!.filter((n) => n.type?.startsWith("directive"))).toEqual(before.content!.filter((n) => n.type?.startsWith("directive")));
});

describe("setDocument", () => {
  const statblock = { type: "directiveLeaf", attrs: { name: "dummy-data", form: "block", kind: "data", fields: { title: "T" }, attributes: {} } };

  test("loading a document that starts with a data component does not open its form", () => {
    const { editor } = mount();
    setDocument(editor, { type: "doc", content: [statblock, { type: "paragraph", content: [{ type: "text", text: "after" }] }] });
    expect(editor.state.selection.constructor.name).toBe("TextSelection");
    expect(document.querySelector(".rosetta-form")).toBeNull();
  });

  test("a document that is only a component gets an empty paragraph to put the cursor in, which is not saved", () => {
    const { editor } = mount();
    setDocument(editor, { type: "doc", content: [statblock] });
    expect(editor.state.selection.constructor.name).toBe("TextSelection");
    expect(document.querySelector(".rosetta-form")).toBeNull();
    expect(toMarkdown(editor.getJSON())).toBe(":::dummy-data\ntitle: T\n:::\n");
  });

  test("loading does not count as an edit, so a chapter is not rewritten just by opening it", () => {
    const onUpdate = vi.fn();
    const editor = createEditor({ element: document.body.appendChild(document.createElement("div")), onUpdate });
    open.push(() => editor.destroy());
    setDocument(editor, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] });
    expect(onUpdate).not.toHaveBeenCalled();
    editor.commands.insertContent("y");
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  test("loading is not an undoable step", () => {
    const { editor } = mount();
    setDocument(editor, { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] });
    expect(editor.can().undo()).toBe(false);
  });
});
