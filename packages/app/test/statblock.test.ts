// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import { m1Components } from "@rosetta/contracts";
import { createEditor, createToolbar, fromAst, toMarkdown, type Editor } from "@rosetta/editor";
import { instantiate, type RosettaParser } from "@rosetta/parser-wasm";
import { afterEach, beforeAll, describe, expect, test } from "vitest";
import "./dom-setup";

// The statblock, with the temporary M1 definition from `contracts`, in the real editor and with the real parser.

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
const field = (name: string) => document.querySelector<HTMLElement>(`.rosetta-form > .rosetta-form-section [data-field="${name}"]`)!;
const control = (name: string) => field(name).querySelector<HTMLInputElement>("input, textarea, select")!;
const click = (el: Element) => el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const statblock = (editor: Editor) => {
  let pos = -1;
  editor.state.doc.descendants((n, p) => {
    if (pos < 0 && n.attrs.name === "statblock") pos = p;
  });
  return { pos, node: editor.state.doc.nodeAt(pos)! };
};

/** Fills the form of a new stat block, the way a person would. */
function fillIn() {
  type(control("system"), "5e");
  type(control("name"), "Bone Warden");
  type(control("size"), "Medium undead");
  type(control("ac"), "15");
  type(control("hp"), "52 (8d8+16)");
  type(control("speed"), "30 ft.");
  click(document.querySelector("[aria-label='Add traits']")!);
  click(document.querySelector("[aria-label='Add traits']")!);
  const rows = document.querySelectorAll<HTMLElement>('[data-field="traits"] .rosetta-form-item');
  type(rows[0]!.querySelector("input")!, "Undead Fortitude");
  type(rows[0]!.querySelector("textarea")!, "If damage reduces the warden to *0* hit points, it makes a saving throw.");
  type(rows[1]!.querySelector("input")!, "Brittle");
  type(rows[1]!.querySelector("textarea")!, "Takes **double** damage from bludgeoning.");
  type(control("actions"), "**Slam.** Melee Weapon Attack: +5 to hit.\n\n*Hit:* 11 (2d6+4) bludgeoning damage.");
}

const EXPECTED = {
  name: "Bone Warden", size: "Medium undead", ac: 15, hp: "52 (8d8+16)", speed: "30 ft.",
  traits: [
    { name: "Undead Fortitude", text: "If damage reduces the warden to *0* hit points, it makes a saving throw." },
    { name: "Brittle", text: "Takes **double** damage from bludgeoning." },
  ],
  actions: "**Slam.** Melee Weapon Attack: +5 to hit.\n\n*Hit:* 11 (2d6+4) bludgeoning damage.",
};

describe("insert, edit through the form, save, reload", () => {
  test("the toolbar inserts a stat block and its form shows every field of the definition", () => {
    const editor = mount();
    const picker = document.querySelector<HTMLSelectElement>('[data-command="insertComponent"]')!;
    picker.value = "statblock";
    picker.dispatchEvent(new Event("change"));
    expect(statblock(editor).node.type.name).toBe("directiveLeaf");
    expect(control("system")).toBeTruthy();
    expect(["name", "size", "ac", "hp", "speed", "traits", "actions"].map((f) => !!field(f))).toEqual(Array(7).fill(true));
    expect(control("name").type).toBe("text");
    expect(field("name").querySelector("label")!.textContent).toBe("name *");
    expect(control("ac").type).toBe("number");
    expect(control("actions").tagName).toBe("TEXTAREA");
  });

  test("a filled-in stat block is saved, and the parser reads back exactly what was entered", () => {
    const editor = mount();
    editor.commands.insertComponent("statblock");
    fillIn();
    const markdown = toMarkdown(editor.getJSON());
    expect(markdown).toBe(
      [
        ":::statblock{system=5e}",
        "name: Bone Warden",
        "size: Medium undead",
        "ac: 15",
        "hp: 52 (8d8+16)",
        "speed: 30 ft.",
        "traits:",
        "  - name: Undead Fortitude",
        "    text: If damage reduces the warden to *0* hit points, it makes a saving throw.",
        "  - name: Brittle",
        "    text: Takes **double** damage from bludgeoning.",
        "actions: |-",
        "  **Slam.** Melee Weapon Attack: +5 to hit.",
        "",
        "  *Hit:* 11 (2d6+4) bludgeoning damage.",
        ":::",
        "",
      ].join("\n"),
    );
    const { ast, warnings } = parser.parse(markdown);
    expect(warnings).toEqual([]);
    expect(ast.children).toHaveLength(1);
    expect(ast.children[0]).toMatchObject({ name: "statblock", attributes: { system: "5e" }, fields: EXPECTED });
  });

  test("it is shown as the parser renders it, and the form's changes show once it is closed", async () => {
    const editor = mount();
    editor.commands.insertComponent("statblock");
    fillIn();
    editor.commands.setTextSelection(1);
    await wait();
    const shown = document.querySelector(".rosetta-component-rendered")!;
    expect(shown.querySelector(".rosetta-statblock")).not.toBeNull();
    expect(shown.textContent).toContain("Bone Warden");
    expect(shown.textContent).toContain("Brittle");
    expect(shown.querySelector("strong")!.textContent).toBe("double"); // Markdown inside a field
    expect(shown.querySelector(".rosetta-warnings")).toBeNull();
  });

  test("an empty stat block shows the parser's warning about the missing name", async () => {
    const editor = mount();
    editor.commands.insertComponent("statblock");
    editor.commands.setTextSelection(1);
    await wait();
    expect(document.querySelector(".rosetta-component-rendered")!.textContent).toMatch(/name/i);
    expect(document.querySelector(".rosetta-component-rendered .rosetta-warnings")).not.toBeNull();
  });

  test("reloading: the saved file opens with the same values in the form, and saving again changes nothing", () => {
    const first = mount();
    first.commands.insertComponent("statblock");
    fillIn();
    const markdown = toMarkdown(first.getJSON());
    first.destroy();

    const second = mount(markdown);
    second.commands.setNodeSelection(statblock(second).pos);
    expect((control("system") as HTMLInputElement).value).toBe("5e");
    expect((control("name") as HTMLInputElement).value).toBe("Bone Warden");
    expect((control("ac") as HTMLInputElement).value).toBe("15");
    const traits = document.querySelectorAll<HTMLElement>('[data-field="traits"] .rosetta-form-item');
    expect(traits).toHaveLength(2);
    expect(traits[1]!.querySelector("input")!.value).toBe("Brittle");
    expect(control("actions").value).toBe(EXPECTED.actions);
    expect(toMarkdown(second.getJSON())).toBe(markdown);
  });
});

describe("editing a stat block that already exists", () => {
  const source = ":::statblock{system=5e}\n# written by hand\nname: Giant Rat\nac: 12\nhp: 7 (2d6)\nspeed: 30 ft.\n:::\n";

  test("nothing changes until the form is used: the file is saved exactly as written", () => {
    expect(toMarkdown(mount(source).getJSON())).toBe(source);
  });

  test("changing one field keeps the others, in the order of the definition", () => {
    const editor = mount(source);
    editor.commands.setNodeSelection(statblock(editor).pos);
    type(control("ac"), "13");
    expect(toMarkdown(editor.getJSON())).toBe(":::statblock{system=5e}\nname: Giant Rat\nac: 13\nhp: 7 (2d6)\nspeed: 30 ft.\n:::\n");
    expect(parser.parse(toMarkdown(editor.getJSON())).warnings).toEqual([]);
  });

  test("clearing a field removes it, and clearing the required name is reported", async () => {
    const editor = mount(source);
    editor.commands.setNodeSelection(statblock(editor).pos);
    type(control("speed"), "");
    type(control("name"), "");
    const markdown = toMarkdown(editor.getJSON());
    expect(markdown).toBe(":::statblock{system=5e}\nac: 12\nhp: 7 (2d6)\n:::\n");
    expect(parser.parse(markdown).warnings.map((w) => w.code)).toEqual(["field.missing"]);
  });

  test("a stat block with a body that could not be read keeps its text, and the form starts empty", () => {
    const broken = ":::statblock\nname: [unclosed\n:::\n";
    const editor = mount(broken);
    expect(toMarkdown(editor.getJSON())).toBe(broken); // untouched: kept exactly
  });

  test("it can be removed with the keyboard", () => {
    const editor = mount(source);
    editor.commands.setNodeSelection(statblock(editor).pos);
    editor.commands.deleteSelection();
    expect(toMarkdown(editor.getJSON())).toBe("");
  });
});
