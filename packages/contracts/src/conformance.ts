// Node-only entry (`@rosetta/contracts/conformance`): reads the golden suite from disk so
// TypeScript parsers can run it. Kept out of the main entry because it uses node:fs.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Warning } from "./generated/types";

/** The identifying fields of a warning. Messages are not compared in .warnings.json. */
export interface ExpectedWarning {
  code: string;
  line: number;
  component?: string;
  field?: string;
}

export interface ConformanceCase {
  /** Path without extension, such as "components/sidebar-title". */
  name: string;
  markdown: string;
  html: string;
  warnings: ExpectedWarning[];
}

const casesDir = fileURLToPath(new URL("../conformance/cases", import.meta.url));

function walk(dir: string, prefix = ""): string[] {
  return readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(dir, join(prefix, e.name)) : e.name.endsWith(".md") ? [join(prefix, e.name.slice(0, -3))] : [],
  );
}

/** Loads every case of the golden suite, sorted by name. */
export function conformanceCases(): ConformanceCase[] {
  return walk(casesDir)
    .map((n) => n.split("\\").join("/"))
    .sort()
    .map((name) => {
      const base = join(casesDir, name);
      const warningsFile = `${base}.warnings.json`;
      return {
        name,
        markdown: readFileSync(`${base}.md`, "utf8"),
        html: readFileSync(`${base}.html`, "utf8"),
        warnings: existsSync(warningsFile) ? (JSON.parse(readFileSync(warningsFile, "utf8")) as ExpectedWarning[]) : [],
      };
    });
}

/** Line endings normalised, trailing whitespace and trailing blank lines ignored. */
export function normalizeHtml(s: string): string {
  return s
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

/** Reduces parser warnings to the fields a .warnings.json file records. */
export function toExpectedWarnings(warnings: Warning[]): ExpectedWarning[] {
  return warnings.map((w) => ({
    code: w.code,
    line: w.range?.start.line ?? 0,
    ...(w.component ? { component: w.component } : {}),
    ...(w.field ? { field: w.field } : {}),
  }));
}
