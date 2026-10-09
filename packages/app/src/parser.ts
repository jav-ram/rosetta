import { createParser, type AsyncParser } from "@rosetta/parser-wasm";
import ParserWorker from "@rosetta/parser-wasm/worker?worker";
import wasmUrl from "@rosetta/parser-wasm/wasm?url";
import wasmExecUrl from "@rosetta/parser-wasm/wasm_exec?url";

let instance: AsyncParser | null = null;
const get = () => (instance ??= createParser({ worker: () => new ParserWorker(), wasmUrl, wasmExecUrl }));

/** The one parser the whole app shares. Nothing is created or loaded until the first call. */
export const parser: Pick<AsyncParser, "parse" | "setComponents" | "ready"> = {
  parse: (markdown) => get().parse(markdown),
  setComponents: (definitions) => get().setComponents(definitions),
  ready: () => get().ready(),
};
