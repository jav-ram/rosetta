import type { ComponentDefinition } from "@rosetta/contracts";
import { describe, expect, test } from "vitest";
import { createInline, skeleton } from "../src/index";

const def: ComponentDefinition = {
  name: "thing", form: "block", kind: "data", breakable: false,
  fields: [
    { name: "name", type: "string", required: true, plain: true },
    { name: "level", type: "number" },
    { name: "kind", type: "enum", values: ["a", "b"] },
    { name: "tags", type: "list", items: { name: "tag", type: "string", plain: true } },
    { name: "rows", type: "list", items: { name: "row", type: "object", fields: [{ name: "k", type: "string" }, { name: "v", type: "number" }] } as never },
  ],
};

describe("skeleton: what is rendered so that every field has a place", () => {
  test("empty fields get a stand-in of their type, with one item in each empty list", () => {
    expect(skeleton(def, {})).toEqual({ name: "x", level: 0, kind: "a", tags: ["x"], rows: [{ k: "x", v: 0 }] });
  });

  test("values that are there are kept, and only what is missing is filled", () => {
    expect(skeleton(def, { name: "Rat", tags: ["a", "b"], rows: [{ k: "k1" }] })).toEqual({
      name: "Rat", level: 0, kind: "a", tags: ["a", "b"], rows: [{ k: "k1", v: 0 }],
    });
  });

  test("it does not change the values it is given", () => {
    const values = { name: "Rat", rows: [{ k: "k1" }] };
    skeleton(def, values);
    expect(values).toEqual({ name: "Rat", rows: [{ k: "k1" }] });
  });
});

describe("createInline", () => {
  const html = (items = 1) =>
    `<div class="rosetta-thing" data-component="thing"><dl class="rosetta-fields">` +
    `<div class="rosetta-field" data-field="name"><dt>name</dt><dd>x</dd></div>` +
    `<div class="rosetta-field" data-field="level"><dt>level</dt><dd>0</dd></div>` +
    `<div class="rosetta-field" data-field="kind"><dt>kind</dt><dd>a</dd></div>` +
    `<div class="rosetta-field" data-field="tags"><dt>tags</dt><dd><ul class="rosetta-list">${"<li>x</li>".repeat(items)}</ul></dd></div>` +
    `<div class="rosetta-field" data-field="rows"><dt>rows</dt><dd><ul class="rosetta-list"><li><dl class="rosetta-fields">` +
    `<div class="rosetta-field" data-field="k"><dt>k</dt><dd>x</dd></div><div class="rosetta-field" data-field="v"><dt>v</dt><dd>0</dd></div>` +
    `</dl></li></ul></dd></div></dl></div>`;
  const make = (fields: Record<string, unknown>, items = 1, extra = {}) => {
    const edits: unknown[] = [];
    const structure: unknown[][] = [];
    const inline = createInline({ def, html: html(items), fields, onEdit: (f) => edits.push(structuredClone(f)), onStructure: (f, focus) => structure.push([structuredClone(f), focus]), ...extra });
    return { inline, edits, structure };
  };

  test("each value is replaced by a control of its type, inside the parser's own markup", () => {
    const { inline } = make({ name: "Rat", level: 3, kind: "b" }, 0);
    const el = inline!.element;
    expect(el.querySelector('[data-field="name"] > dd > input[type=text]')).toMatchObject({ value: "Rat" });
    expect(el.querySelector('[data-field="level"] > dd > input[type=number]')).toMatchObject({ value: "3" });
    expect(el.querySelector('[data-field="kind"] > dd > select')).toMatchObject({ value: "b" });
    expect(el.querySelector('[data-field="name"] > dt')!.textContent).toBe("name"); // the label is the rendered one
  });

  test("the stand-in item of an empty list is removed, leaving only the add button", () => {
    const { inline } = make({ name: "Rat" }, 1);
    expect(inline!.element.querySelectorAll('[data-field="tags"] li')).toHaveLength(0);
    expect(inline!.element.querySelector('[aria-label="Add tags"]')).not.toBeNull();
  });

  test("typing changes the values and reports them; emptying a control reports it as undefined", () => {
    const { inline, edits } = make({ name: "Rat" });
    const name = inline!.element.querySelector<HTMLInputElement>('[data-path="name"]')!;
    name.value = "Giant Rat";
    name.dispatchEvent(new Event("input"));
    name.value = "";
    name.dispatchEvent(new Event("input"));
    expect(edits.map((e) => (e as { name?: string }).name)).toEqual(["Giant Rat", undefined]);
  });

  test("a required value that is empty is marked, and the mark goes when it is filled", () => {
    const { inline } = make({});
    const name = inline!.element.querySelector<HTMLInputElement>('[data-path="name"]')!;
    expect(name.classList.contains("is-missing")).toBe(true);
    name.value = "x";
    name.dispatchEvent(new Event("input"));
    expect(name.classList.contains("is-missing")).toBe(false);
  });

  test("adding an item reports the structure change, with the new item's path to focus", () => {
    const { inline, structure } = make({ name: "Rat", tags: ["a"] });
    inline!.element.querySelector<HTMLButtonElement>('[aria-label="Add tags"]')!.click();
    expect(structure).toHaveLength(1);
    expect(structure[0]![0]).toMatchObject({ name: "Rat", tags: ["a", ""] });
    expect(structure[0]![1]).toBe("tags.1");
  });

  test("removing an item reports the structure change", () => {
    const { inline, structure } = make({ name: "Rat", tags: ["a", "b"] }, 2);
    inline!.element.querySelector<HTMLButtonElement>('[aria-label="Remove tags 1"]')!.click();
    expect(structure[0]![0]).toMatchObject({ tags: ["b"] });
  });

  test("an item of a list of objects gets a control for each member", () => {
    const { inline, edits } = make({ name: "Rat", rows: [{ k: "a", v: 2 }] });
    const v = inline!.element.querySelector<HTMLInputElement>('[data-path="rows.0.v"]')!;
    expect(v.value).toBe("2");
    v.value = "5";
    v.dispatchEvent(new Event("input"));
    expect(edits.at(-1)).toMatchObject({ rows: [{ k: "a", v: 5 }] });
  });

  test("HTML that lacks a field's place gives null, so the caller falls back to the form", () => {
    expect(createInline({ def, html: "<p>nope</p>", fields: {}, onEdit() {}, onStructure() {} })).toBeNull();
    expect(createInline({ def, html: html().replace('data-field="level"', 'data-field="other"'), fields: {}, onEdit() {}, onStructure() {} })).toBeNull();
  });
});
