// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import type { Document } from "@rosetta/contracts";
import { createEditor, fromAst, toMarkdown } from "@rosetta/editor";
import { instantiate, type RosettaParser } from "@rosetta/parser-wasm";
import { beforeAll, describe, expect, inject, test } from "vitest";
import { astBlock, docBlock, withoutWarnings, type Json } from "./canonical";
import "./dom-setup";

// Every golden file: parse, load into the editor, save, parse again, compare.

const dist = (f: string) => new NodeURL(`../../parser-wasm/dist/${f}`, import.meta.url);
let parser: RosettaParser;
beforeAll(async () => {
  await import(dist("wasm_exec.js").href);
  parser = await instantiate(readFileSync(dist("rosetta.wasm")));
});

/** Parse -> editor -> Markdown, going through a real editor like the app does. */
function save(markdown: string, mutate?: (doc: Json) => void) {
  const { ast } = parser.parse(markdown) as { ast: Document };
  const { doc, frontMatterRaw } = fromAst(ast);
  const editor = createEditor({ element: document.createElement("div"), content: doc });
  try {
    const json = editor.getJSON() as Json;
    mutate?.(json);
    return toMarkdown(json, { frontMatterRaw });
  } finally {
    editor.destroy();
  }
}

const cases = inject("goldenCases");

/**
 * Cases where the HTML legitimately differs after a save: saving repairs the source (so a problem and its warning in
 * the HTML are gone), or the HTML reported something that is not part of the document. For these the saved document
 * must still have the same content, only without the warning.
 */
const REPAIRED: Record<string, string> = {
  "errors/unclosed-block": "the missing closing line is written, so the 'never closed' warning is gone",
  "errors/unclosed-inner-block": "the missing closing lines are written",
  "errors/wrong-form": "a directive written in the wrong form is written in the right one",
  "markdown/raw-html-is-omitted": "raw HTML is not part of the document (the HTML says 'omitted'), so it is gone after a save",
};

describe("golden files round-trip through the editor", () => {
  test.each(cases.map((c) => [c.name, c.markdown, c.html] as const))("%s", (name, markdown, html) => {
    const saved = save(markdown);
    const first = parser.parse(markdown);
    const second = parser.parse(saved);

    // The content is the same.
    expect(withoutWarnings(second.ast.children).map(astBlock), saved).toEqual(withoutWarnings(first.ast.children).map(astBlock));
    // So is the HTML, unless saving repaired a problem the HTML reported.
    if (!(name in REPAIRED)) expect(second.html, saved).toBe(html);
    else expect(second.html, `${name} no longer needs to be in REPAIRED`).not.toBe(html);
    // Saving what was saved changes nothing: the output is stable.
    expect(save(saved)).toBe(saved);
  });

  test("front matter is written back exactly, comments and all, also when it is invalid", () => {
    expect(save("---\n# note\ntitle:   X\n---\n\nBody\n")).toBe("---\n# note\ntitle:   X\n---\n\nBody\n");
    expect(save("---\nkey: [unclosed\n---\n\nBody\n")).toBe("---\nkey: [unclosed\n---\n\nBody\n");
  });

  test("a data component is written back as the author wrote it", () => {
    const source = ":::statblock\n# first the name\nname: Rat\nac: 15\nhp: 5\n:::\n";
    expect(save(source)).toBe(source);
  });

  test("a data component whose raw text was dropped is written from its fields", () => {
    const source = ":::statblock{system=\"5e\"}\nname: Bone Warden\nsize: Medium undead\nac: 15\ntraits:\n  - name: Brittle\n    text: Takes **double** damage.\nactions: |\n  **Slam.** Hit.\n\n  *Hit:* 11 damage.\n:::\n";
    const saved = save(source, (doc) => {
      for (const n of doc.content ?? []) if (n.type === "directive") n.attrs!.raw = null; // what an edit of the fields does
    });
    expect(parser.parse(saved).html).toBe(parser.parse(source).html);
    const first = parser.parse(source).ast.children[0]!;
    expect(parser.parse(saved).ast.children[0]!.fields).toEqual(first.fields);
  });
});
