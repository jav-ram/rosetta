// @vitest-environment jsdom
import type { ComponentDefinition } from "@rosetta/contracts";
import { afterEach, describe, expect, test } from "vitest";
import { createEditor, setLayoutWarnings, toMarkdown } from "../src/index";

const data: ComponentDefinition = { name: "dummy-data", form: "block", kind: "data", breakable: false, fields: [{ name: "title", type: "string", plain: true }] };
const box: ComponentDefinition = { name: "dummy-box", form: "block", kind: "container", breakable: true };

const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const leaf = (title: string) => ({ type: "directiveLeaf", attrs: { name: "dummy-data", form: "block", kind: "data", fields: { title }, attributes: {} } });
const container = (...content: object[]) => ({ type: "directive", attrs: { name: "dummy-box", form: "block", kind: "container", attributes: {} }, content });

const open: (() => void)[] = [];
afterEach(() => open.splice(0).forEach((f) => f()));

function mount(content: object[]) {
  const host = document.createElement("div");
  document.body.append(host);
  const editor = createEditor({ element: host, components: [data, box], content: { type: "doc", content } });
  open.push(() => (editor.destroy(), host.remove()));
  const warned = () => [...host.querySelectorAll<HTMLElement>("[data-layout-warning]")].map((e) => `${e.dataset.component}:${e.dataset.layoutWarning}`);
  return { editor, host, warned };
}

describe("layout warnings on components", () => {
  test("a warning marks the component it is for, counted in document order", () => {
    const { editor, warned } = mount([para("a"), leaf("one"), container(para("in")), leaf("two")]);
    setLayoutWarnings(editor, [{ index: 2, message: "too tall" }]);
    expect(warned()).toEqual(["dummy-data:too tall"]);
    setLayoutWarnings(editor, [{ index: 1, message: "box" }]);
    expect(warned()).toEqual(["dummy-box:box"]);
  });

  test("components inside components are counted too, parent first", () => {
    const { editor, warned } = mount([container(para("x"), leaf("inner")), leaf("after")]);
    setLayoutWarnings(editor, [{ index: 1, message: "inner" }, { index: 2, message: "after" }]);
    expect(warned()).toEqual(["dummy-data:inner", "dummy-data:after"]);
  });

  test("the frame gets the class the app styles", () => {
    const { editor, host } = mount([leaf("one")]);
    setLayoutWarnings(editor, [{ index: 0, message: "m" }]);
    expect(host.querySelector(".rosetta-component")!.classList.contains("has-layout-warning")).toBe(true);
  });

  test("an empty list clears the warnings, and an index with no component is ignored", () => {
    const { editor, warned } = mount([leaf("one")]);
    setLayoutWarnings(editor, [{ index: 0, message: "m" }, { index: 5, message: "none" }]);
    expect(warned()).toEqual(["dummy-data:m"]);
    setLayoutWarnings(editor, []);
    expect(warned()).toEqual([]);
  });

  test("a warning follows its component when text is added above it", () => {
    const { editor, warned } = mount([para("start"), leaf("one")]);
    setLayoutWarnings(editor, [{ index: 0, message: "m" }]);
    editor.chain().focus("start").insertContent("more text ").run();
    expect(warned()).toEqual(["dummy-data:m"]);
    editor.chain().insertContentAt(0, { type: "paragraph", content: [{ type: "text", text: "a whole new paragraph" }] }).run();
    expect(warned()).toEqual(["dummy-data:m"]);
  });

  test("a warning is not part of the document: not saved, not an edit, not undoable", () => {
    const { editor } = mount([para("a"), leaf("one")]);
    const before = toMarkdown(editor.getJSON());
    let updates = 0;
    editor.on("update", () => updates++);
    setLayoutWarnings(editor, [{ index: 0, message: "m" }]);
    expect(toMarkdown(editor.getJSON())).toBe(before);
    expect(updates).toBe(0);
    expect(editor.can().undo()).toBe(false);
  });

  test("the message is kept as given", () => {
    const { editor, warned } = mount([leaf("one")]);
    setLayoutWarnings(editor, [{ index: 0, message: 'A "statblock" is taller than a column (461 mm)' }]);
    expect(warned()).toEqual(['dummy-data:A "statblock" is taller than a column (461 mm)']);
  });
});
