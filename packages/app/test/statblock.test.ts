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
// A stat block is edited where it is shown: the parser's HTML with a control in place of each value, found by the path of the value.
const control = (path: string) => document.querySelector<HTMLInputElement>(`.rosetta-inline [data-path="${path}"]`)!;
const attribute = (name: string) => document.querySelector<HTMLInputElement>(`.rosetta-inline-header [data-field="${name}"] input`)!;
const waitFor = async (check: () => unknown, ms = 3000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out waiting for the stat block to be ready");
    await new Promise((r) => setTimeout(r, 10));
  }
};
/** The stat block is selected and its controls are in place (the parser renders them first). */
const ready = () => waitFor(() => control("name"));
const click = (el: Element) => el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const statblock = (editor: Editor) => {
  let pos = -1;
  editor.state.doc.descendants((n, p) => {
    if (pos < 0 && n.attrs.name === "statblock") pos = p;
  });
  return { pos, node: editor.state.doc.nodeAt(pos)! };
};

/** Fills a new stat block in place, the way a person would. */
async function fillIn() {
  await ready();
  type(attribute("system"), "5e");
  type(control("name"), "Bone Warden");
  type(control("size"), "Medium undead");
  type(control("ac"), "15");
  type(control("hp"), "52 (8d8+16)");
  type(control("speed"), "30 ft.");
  click(document.querySelector("[aria-label='Add traits']")!);
  await waitFor(() => control("traits.0.name"));
  click(document.querySelector("[aria-label='Add traits']")!);
  await waitFor(() => control("traits.1.name"));
  type(control("traits.0.name"), "Undead Fortitude");
  type(control("traits.0.text"), "If damage reduces the warden to *0* hit points, it makes a saving throw.");
  type(control("traits.1.name"), "Brittle");
  type(control("traits.1.text"), "Takes **double** damage from bludgeoning.");
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

describe("insert, edit in place, save, reload", () => {
  test("the toolbar inserts a stat block and every field of the definition has a control in place", async () => {
    const editor = mount();
    const picker = document.querySelector<HTMLSelectElement>('[data-command="insertComponent"]')!;
    picker.value = "statblock";
    picker.dispatchEvent(new Event("change"));
    expect(statblock(editor).node.type.name).toBe("directiveLeaf");
    await ready();
    expect(attribute("system")).toBeTruthy(); // attributes are in the header above the component
    expect(["name", "size", "ac", "hp", "speed", "actions"].map((f) => !!control(f))).toEqual(Array(6).fill(true));
    expect(document.querySelector('.rosetta-inline [data-field="traits"]')).toBeTruthy(); // a list: an add button, no items yet
    expect(document.querySelector("[aria-label='Add traits']")).toBeTruthy();
    expect(control("name").type).toBe("text");
    expect(control("name").classList.contains("is-missing")).toBe(true); // a required value that is empty is marked
    expect(control("ac").type).toBe("number");
    expect(control("actions").tagName).toBe("TEXTAREA");
    // The controls sit in the parser's own markup, so the theme styles them as it styles the rendered component.
    expect(control("name").closest(".rosetta-statblock > .rosetta-fields > .rosetta-field[data-field='name'] > dd")).not.toBeNull();
  });

  test("a filled-in stat block is saved, and the parser reads back exactly what was entered", async () => {
    const editor = mount();
    editor.commands.insertComponent("statblock");
    await fillIn();
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

  test("it is shown as the parser renders it, and the changes show once it is closed", async () => {
    const editor = mount();
    editor.commands.insertComponent("statblock");
    await fillIn();
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

  test("reloading: the saved file opens with the same values in place, and saving again changes nothing", async () => {
    const first = mount();
    first.commands.insertComponent("statblock");
    await fillIn();
    const markdown = toMarkdown(first.getJSON());
    first.destroy();

    const second = mount(markdown);
    second.commands.setNodeSelection(statblock(second).pos);
    await ready();
    expect(attribute("system").value).toBe("5e");
    expect(control("name").value).toBe("Bone Warden");
    expect(control("ac").value).toBe("15");
    expect(document.querySelectorAll(".rosetta-inline li.rosetta-inline-item")).toHaveLength(2);
    expect(control("traits.1.name").value).toBe("Brittle");
    expect(control("actions").value).toBe(EXPECTED.actions);
    expect(toMarkdown(second.getJSON())).toBe(markdown);
  });
});

describe("editing a stat block that already exists", () => {
  const source = ":::statblock{system=5e}\n# written by hand\nname: Giant Rat\nac: 12\nhp: 7 (2d6)\nspeed: 30 ft.\n:::\n";

  test("nothing changes until a value is edited: the file is saved exactly as written", () => {
    expect(toMarkdown(mount(source).getJSON())).toBe(source);
  });

  test("changing one field keeps the others, in the order of the definition", async () => {
    const editor = mount(source);
    editor.commands.setNodeSelection(statblock(editor).pos);
    await ready();
    type(control("ac"), "13");
    expect(toMarkdown(editor.getJSON())).toBe(":::statblock{system=5e}\nname: Giant Rat\nac: 13\nhp: 7 (2d6)\nspeed: 30 ft.\n:::\n");
    expect(parser.parse(toMarkdown(editor.getJSON())).warnings).toEqual([]);
  });

  test("clearing a field removes it, and clearing the required name is reported", async () => {
    const editor = mount(source);
    editor.commands.setNodeSelection(statblock(editor).pos);
    await ready();
    type(control("speed"), "");
    type(control("name"), "");
    const markdown = toMarkdown(editor.getJSON());
    expect(markdown).toBe(":::statblock{system=5e}\nac: 12\nhp: 7 (2d6)\n:::\n");
    expect(parser.parse(markdown).warnings.map((w) => w.code)).toEqual(["field.missing"]);
  });

  test("a stat block with a body that could not be read keeps its text", () => {
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
