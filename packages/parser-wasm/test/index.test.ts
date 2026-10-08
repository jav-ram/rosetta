import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, test } from "vitest";
import { instantiate, type RosettaParser } from "../src/index";

const dist = (f: string) => new URL(`../dist/${f}`, import.meta.url);

let parser: RosettaParser;
beforeAll(async () => {
  await import(dist("wasm_exec.js").href); // defines globalThis.Go
  parser = await instantiate(readFileSync(dist("rosetta.wasm")));
});

describe("parse", () => {
  test("returns html, ast and warnings", () => {
    const r = parser.parse("# Hi\n\n:::mystery\nx\n:::\n");
    expect(r.html).toContain("<h1>Hi</h1>");
    expect(r.ast.rosettaVersion).toBe("0.1");
    expect(r.ast.children.map((n) => n.type)).toEqual(["heading", "directive"]);
    expect(r.warnings.map((w) => w.code)).toEqual(["component.unknown"]);
    expect(r.ast.warnings).toEqual(r.warnings);
  });

  test("the AST is typed JSON the editor can load", () => {
    const r = parser.parse(":::statblock\nname: Rat\nac: 15\n:::\n");
    const [node] = r.ast.children;
    expect(node).toMatchObject({ type: "directive", name: "statblock", kind: "data", breakable: false, fields: { name: "Rat", ac: 15 } });
  });

  test("bad input never throws", () => {
    expect(() => parser.parse(":::statblock\nname: [unclosed\n:::\n\n:::\n\n::unknown\n")).not.toThrow();
    expect(() => parser.parse("")).not.toThrow();
  });

  test("handles non-ASCII text", () => {
    expect(parser.parse("Árbol 🌳 – “quotes”\n").html).toContain("Árbol 🌳 – “quotes”");
  });
});

describe("setComponents", () => {
  test("replaces the definitions", async () => {
    await import(dist("wasm_exec.js").href);
    const other = await instantiate(readFileSync(dist("rosetta.wasm")));
    other.setComponents([{ name: "callout", form: "block", kind: "container", breakable: true }]);
    expect(other.parse(":::callout\nhi\n:::\n").html).toContain("rosetta-callout");
    // Instances are independent: the first parser still knows the M1 components.
    expect(parser.parse(":::readaloud\nhi\n:::\n").html).toContain("rosetta-readaloud");
  });

  test("rejects invalid definitions", () => {
    expect(() => parser.setComponents([{ name: "x", form: "block", kind: "container" }])).toThrow(/breakable/);
  });
});

test("instantiate explains a missing wasm_exec.js", async () => {
  const saved = (globalThis as { Go?: unknown }).Go;
  delete (globalThis as { Go?: unknown }).Go;
  try {
    await expect(instantiate(new Uint8Array())).rejects.toThrow(/wasm_exec\.js/);
  } finally {
    (globalThis as { Go?: unknown }).Go = saved;
  }
});
