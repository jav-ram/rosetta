import type { ComponentDefinition, Document, Warning } from "@rosetta/contracts";

/** What `parse` returns. */
export interface ParseResult {
  /** The rendered document, with warnings shown in place. */
  html: string;
  /** The document tree, in the shape of the contracts Document schema. The editor loads this. */
  ast: Document;
  /** Every warning found, in source order. */
  warnings: Warning[];
}

export interface RosettaParser {
  /** Parses Rosetta Markdown. Never throws on bad input: problems come back as warnings. */
  parse(markdown: string): ParseResult;
  /** Replaces the component definitions (the M1 set is the default). Throws on invalid definitions. */
  setComponents(definitions: ComponentDefinition[]): void;
}

/** The functions the Go program defines on `globalThis.rosetta`. Both return strings. */
interface RawApi {
  parse(markdown: string): string;
  setComponents(json: string): string;
}

/** The `Go` class from wasm_exec.js, which must be loaded before `instantiate` is called. */
interface GoRuntime {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): Promise<void>;
}

/**
 * Starts the WebAssembly parser.
 *
 * `wasm` is the compiled module (`dist/rosetta.wasm`). wasm_exec.js (also in `dist/`, and it
 * must be the one built together with the module) has to be loaded first so that `Go` exists.
 */
export async function instantiate(wasm: BufferSource | WebAssembly.Module): Promise<RosettaParser> {
  const g = globalThis as unknown as { Go?: new () => GoRuntime; rosetta?: RawApi };
  if (!g.Go) throw new Error("wasm_exec.js is not loaded: load dist/wasm_exec.js before calling instantiate()");
  const go = new g.Go();
  const instance =
    wasm instanceof WebAssembly.Module
      ? await WebAssembly.instantiate(wasm, go.importObject)
      : (await WebAssembly.instantiate(wasm, go.importObject)).instance;
  // run() resolves only when the Go program exits, which never happens here. main() defines the
  // global before it blocks, so it is there as soon as run() returns its promise.
  void go.run(instance);
  const api = g.rosetta;
  if (!api) throw new Error("the WebAssembly module did not define globalThis.rosetta");
  // Take it off the global scope, so that more than one instance can run side by side.
  delete g.rosetta;

  return {
    parse(markdown) {
      const out = JSON.parse(api.parse(markdown)) as ParseResult & { error?: string };
      if (out.error !== undefined) throw new Error(out.error);
      return out;
    },
    setComponents(definitions) {
      const error = api.setComponents(JSON.stringify(definitions));
      if (error) throw new Error(error);
    },
  };
}
