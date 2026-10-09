import { conformanceCases, type ConformanceCase } from "@rosetta/contracts/conformance";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    goldenCases: ConformanceCase[];
  }
}

// Runs in plain Node, so the golden suite reader works; the tests that need a DOM get the cases through `inject`.
export default function setup(project: TestProject) {
  project.provide("goldenCases", conformanceCases());
}
