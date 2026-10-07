import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { isDocument, validateComponentDefinition, validateDocument, type Document } from "../src/index";

const example = (name: string) => JSON.parse(readFileSync(new URL(`../examples/${name}`, import.meta.url), "utf8"));

describe("document (AST)", () => {
  test("sample AST validates", () => {
    const sample = example("sample-ast.json");
    expect(validateDocument(sample)).toEqual({ valid: true, errors: [] });
    expect(isDocument(sample)).toBe(true);
  });

  test("typed access compiles", () => {
    const doc: Document = example("sample-ast.json");
    expect(doc.children[0]?.type).toBe("heading");
  });

  test("invalid AST is rejected with messages", () => {
    const result = validateDocument(example("invalid-ast.json"));
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  test("warnings need a stable dotted code", () => {
    const doc = example("sample-ast.json");
    doc.warnings[0].code = "Unknown";
    expect(validateDocument(doc).valid).toBe(false);
  });
});

describe("component definition", () => {
  test("sample definition validates", () => {
    expect(validateComponentDefinition(example("sample-component-definition.json")).valid).toBe(true);
  });

  test("block components must declare breakable", () => {
    expect(validateComponentDefinition(example("invalid-component-definition.json")).valid).toBe(false);
  });

  test("leaf components cannot have breakable or fields", () => {
    const leaf = { name: "pagebreak", form: "leaf", kind: "leaf" };
    expect(validateComponentDefinition(leaf).valid).toBe(true);
    expect(validateComponentDefinition({ ...leaf, breakable: true }).valid).toBe(false);
  });

  test("container components cannot have fields", () => {
    const c = { name: "readaloud", form: "block", kind: "container", breakable: true };
    expect(validateComponentDefinition(c).valid).toBe(true);
    expect(validateComponentDefinition({ ...c, fields: [{ name: "x", type: "string" }] }).valid).toBe(false);
  });
});
