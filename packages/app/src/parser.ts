import { createParser } from "@rosetta/parser-wasm";
import ParserWorker from "@rosetta/parser-wasm/worker?worker";
import wasmUrl from "@rosetta/parser-wasm/wasm?url";
import wasmExecUrl from "@rosetta/parser-wasm/wasm_exec?url";

/** The one parser the whole app shares. Nothing is loaded until the first call. */
export const parser = createParser({ worker: () => new ParserWorker(), wasmUrl, wasmExecUrl });
