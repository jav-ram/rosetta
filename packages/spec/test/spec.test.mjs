import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";

test("spec document exists", () => {
  assert.ok(existsSync(new URL("../ROSETTA_SPEC.md", import.meta.url)));
});
