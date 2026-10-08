import type { Document, Warning } from "@rosetta/contracts";
import { useEffect, useState } from "react";
import { parser } from "./parser";

export type Parsed =
  | { state: "loading" }
  | { state: "ready"; html: string; ast: Document; warnings: Warning[] }
  | { state: "error"; message: string };

/** Parses `markdown` in the worker, shortly after the last change. Out-of-date results are dropped. */
export function useParsed(markdown: string, delayMs = 150): Parsed {
  const [result, setResult] = useState<Parsed>({ state: "loading" });

  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      parser.parse(markdown).then(
        (r) => current && setResult({ state: "ready", ...r }),
        (e: Error) => current && setResult({ state: "error", message: e.message }),
      );
    }, delayMs);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [markdown, delayMs]);

  return result;
}
