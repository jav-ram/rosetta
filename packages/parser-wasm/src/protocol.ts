import type { ComponentDefinition } from "@rosetta/contracts";
import type { ParseResult } from "./index";

/** Messages from the client (main thread) to the worker. Each carries an `id` echoed in the reply. */
export type Request =
  | { id: number; type: "init"; wasmUrl: string; wasmExecUrl: string }
  | { id: number; type: "parse"; markdown: string }
  | { id: number; type: "setComponents"; definitions: ComponentDefinition[] };

/** The worker's reply to the request with the same `id`. */
export type Response =
  | { id: number; ok: true; result?: ParseResult }
  | { id: number; ok: false; error: string };
