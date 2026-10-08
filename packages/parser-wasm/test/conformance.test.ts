import { readFileSync } from "node:fs";
import { conformanceCases, normalizeHtml, toExpectedWarnings } from "@rosetta/contracts/conformance";
import { beforeAll, describe, expect, test } from "vitest";
import { instantiate, type RosettaParser } from "../src/index";

const dist = (f: string) => new URL(`../dist/${f}`, import.meta.url);

// The golden suite from contracts, run through the WebAssembly build.
let parser: RosettaParser;
beforeAll(async () => {
  await import(dist("wasm_exec.js").href);
  parser = await instantiate(readFileSync(dist("rosetta.wasm")));
});

const cases = conformanceCases();

test("the suite has cases", () => {
  expect(cases.length).toBeGreaterThanOrEqual(20);
});

describe.each(cases)("$name", (c) => {
  test("html matches", () => {
    expect(normalizeHtml(parser.parse(c.markdown).html)).toBe(normalizeHtml(c.html));
  });
  test("warnings match", () => {
    expect(toExpectedWarnings(parser.parse(c.markdown).warnings)).toEqual(c.warnings);
  });
});
