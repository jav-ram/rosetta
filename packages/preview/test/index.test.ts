import { expect, test } from "vitest";
import { name } from "../src/index";

test("exports the package name", () => {
  expect(name).toBe("@rosetta/preview");
});
