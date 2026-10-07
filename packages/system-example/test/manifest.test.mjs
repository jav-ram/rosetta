import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("manifest is valid JSON naming this package", () => {
  const m = JSON.parse(readFileSync(new URL("../rosetta-package.json", import.meta.url), "utf8"));
  assert.equal(m.name, "system-example");
});
