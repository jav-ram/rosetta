import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { m1Components } from "../src/definitions";
import { ExportError, findAsset, isDocument, validateComponentDefinition, validateDocument, validateTheme, type AssetRef, type Document } from "../src/index";

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

describe("M1 component definitions", () => {
  test("every definition validates", () => {
    for (const def of m1Components) expect(validateComponentDefinition(def), def.name).toEqual({ valid: true, errors: [] });
  });

  test("covers statblock, readaloud, sidebar, pagebreak, layout, figure, page and toc, with breakable on block components", () => {
    expect(m1Components.map((d) => d.name)).toEqual(["statblock", "readaloud", "sidebar", "pagebreak", "layout", "figure", "page", "toc"]);
    expect(m1Components.map((d) => d.breakable)).toEqual([false, true, true, undefined, undefined, undefined, undefined, undefined]);
  });

  test("figure is a leaf with a required src and a span of column or all", () => {
    const figure = m1Components.find((d) => d.name === "figure")!;
    expect(figure.kind).toBe("leaf");
    expect(figure.attributes).toEqual([
      expect.objectContaining({ name: "src", type: "string", required: true }),
      expect.objectContaining({ name: "alt" }),
      expect.objectContaining({ name: "caption" }),
      expect.objectContaining({ name: "span", type: "enum", values: ["column", "all"], default: "column" }),
    ]);
  });

  test("page is a leaf with a required template (art-full, art-top, art-bottom), a required art, and an optional height and side", () => {
    const page = m1Components.find((d) => d.name === "page")!;
    expect(page.kind).toBe("leaf");
    expect(page.scope).toBeUndefined(); // one page, then the layout in force goes on
    expect(page.attributes).toEqual([
      expect.objectContaining({ name: "template", type: "enum", values: ["art-full", "art-top", "art-bottom"], required: true, default: "art-full" }),
      expect.objectContaining({ name: "art", type: "string", required: true }),
      expect.objectContaining({ name: "height", type: "string" }),
      expect.objectContaining({ name: "side", type: "enum", values: ["left"] }),
    ]);
  });

  test("toc is a leaf with an optional title and a depth of 1, 2 or 3", () => {
    const toc = m1Components.find((d) => d.name === "toc")!;
    expect(toc.kind).toBe("leaf");
    expect(toc.attributes).toEqual([
      expect.objectContaining({ name: "title", type: "string", default: "Contents" }),
      expect.objectContaining({ name: "depth", type: "enum", values: ["1", "2", "3"], default: "2" }),
    ]);
  });

  test("layout is a leaf that holds the content after it, with a required template", () => {
    const layout = m1Components.find((d) => d.name === "layout")!;
    expect(layout.kind).toBe("leaf");
    expect(layout.scope).toBe("following");
    expect(layout.attributes).toEqual([expect.objectContaining({ name: "template", type: "enum", values: ["one-column", "two-column"], required: true })]);
  });

  test("only leaf components can have a scope, and the only scope is following", () => {
    const leaf = { name: "layout", form: "leaf", kind: "leaf", scope: "following" };
    expect(validateComponentDefinition(leaf).valid).toBe(true);
    expect(validateComponentDefinition({ ...leaf, scope: "all" }).valid).toBe(false);
    expect(validateComponentDefinition({ name: "box", form: "block", kind: "container", breakable: true, scope: "following" }).valid).toBe(false);
  });
});

describe("theme", () => {
  const sample = () => example("sample-theme.json");

  test("sample theme validates", () => {
    expect(validateTheme(sample())).toEqual({ valid: true, errors: [] });
  });

  test("tokens need a known category and lowercase dotted name", () => {
    for (const bad of ["body", "font", "Font.body", "font.Body", "shadow.card", "font..body"]) {
      const t = sample();
      t.tokens = { [bad]: "x" };
      expect(validateTheme(t).valid, bad).toBe(false);
    }
  });

  test("values are non-empty strings, and a name is required", () => {
    const t = sample();
    t.tokens["spacing.gap"] = 4;
    expect(validateTheme(t).valid).toBe(false);
    const u = sample();
    delete u.name;
    expect(validateTheme(u).valid).toBe(false);
  });

  test("component override names are lowercase component names", () => {
    const t = sample();
    t.components = { "Read Aloud": { "color.text": "red" } };
    expect(validateTheme(t).valid).toBe(false);
  });
});

describe("finding the asset a chapter refers to", () => {
  const asset = (id: string, name?: string): AssetRef => ({ id, name, mediaType: "image/png", size: 1 });
  const assets = [asset("id-1", "tavern.jpg"), asset("id-2", "map.png"), asset("id-3", "map.png"), asset("id-4", "Dragon Lair.png")];

  test("by id, or by file name, with assets/ in front, spaces around, or URL-encoded", () => {
    expect(findAsset(assets, "id-1")?.id).toBe("id-1");
    expect(findAsset(assets, "tavern.jpg")?.id).toBe("id-1");
    expect(findAsset(assets, " assets/tavern.jpg ")?.id).toBe("id-1");
    expect(findAsset(assets, "Dragon%20Lair.png")?.id).toBe("id-4");
  });
  test("an id wins over a name, and a name two assets have is the one added first", () => {
    expect(findAsset([asset("a", "b"), asset("b", "c")], "b")?.id).toBe("b");
    expect(findAsset(assets, "map.png")?.id).toBe("id-2");
  });
  test("nothing matches, or the name is not valid URL encoding", () => {
    expect(findAsset(assets, "nope.png")).toBeUndefined();
    expect(findAsset([asset("x", "100%.png")], "100%.png")?.id).toBe("x");
  });
});

describe("ExportError", () => {
  test("has a code, so a caller can tell a cancel from a failure", () => {
    const e = new ExportError("cancelled", "stopped");
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe("cancelled");
    expect(e.name).toBe("ExportError");
  });
});
