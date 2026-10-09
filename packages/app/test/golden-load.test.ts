// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import type { Document } from "@rosetta/contracts";
import { createEditor, fromAst } from "@rosetta/editor";
import { instantiate, type RosettaParser } from "@rosetta/parser-wasm";
import { beforeAll, describe, expect, inject, test } from "vitest";
import { astBlock, docBlock, type Json } from "./canonical";
import "./dom-setup";

// Every golden file is parsed by the real parser, loaded into the real editor, and compared with the AST.

// Node's own URL class: jsdom replaces the global one, and `readFileSync` rejects it.
const dist = (f: string) => new NodeURL(`../../parser-wasm/dist/${f}`, import.meta.url);
let parser: RosettaParser;
beforeAll(async () => {
  await import(dist("wasm_exec.js").href);
  parser = await instantiate(readFileSync(dist("rosetta.wasm")));
});

const cases = inject("goldenCases");

describe("golden files load into the editor without losing content", () => {
  test("there are cases", () => expect(cases.length).toBeGreaterThan(30));

  test.each(cases.map((c) => [c.name, c.markdown] as const))("%s", (_name, markdown) => {
    const { ast } = parser.parse(markdown) as { ast: Document };
    const { doc, frontMatter } = fromAst(ast);

    const editor = createEditor({ element: document.createElement("div"), content: doc });
    try {
      editor.schema.nodeFromJSON(doc).check(); // fits the schema exactly
      const content = (editor.getJSON().content ?? []) as Json[];
      // The editor keeps an empty paragraph after a final table, code block or component, to type in; it is not content.
      if (content.at(-1)?.type === "paragraph" && !content.at(-1)?.content && ast.children.at(-1)?.type !== "paragraph") content.pop();

      expect(content.map(docBlock)).toEqual(ast.children.map(astBlock));
      expect(frontMatter).toEqual(ast.frontMatter);
    } finally {
      editor.destroy();
    }
  });
});

describe("the check can fail", () => {
  test("a lost link title is noticed", () => {
    const { ast } = parser.parse('[a](https://x.test "T")\n') as { ast: Document };
    const { doc } = fromAst(ast);
    delete (doc.content![0]!.content![0]!.marks![0]!.attrs as Record<string, unknown>).title;
    expect(doc.content!.map((b) => docBlock(b as Json))).not.toEqual(ast.children.map(astBlock));
  });
});
