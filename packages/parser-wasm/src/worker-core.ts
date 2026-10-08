import { instantiate, type RosettaParser } from "./index";

export { instantiate };
import type { Request, Response } from "./protocol";

/** The part of a worker's global scope (or a MessagePort) the core talks to. */
export interface Port {
  postMessage(message: Response): void;
  onmessage: ((event: { data: Request }) => void) | null;
}

/** Loads the WebAssembly parser from two URLs. Differs between a browser and Node. */
export type Loader = (wasmUrl: string, wasmExecUrl: string) => Promise<RosettaParser>;

/**
 * The browser loader. wasm_exec.js is a classic script that defines `globalThis.Go`; importing
 * it from a module worker runs it for that side effect.
 */
export const browserLoader: Loader = async (wasmUrl, wasmExecUrl) => {
  await import(/* @vite-ignore */ wasmExecUrl);
  const response = fetch(wasmUrl);
  let module: WebAssembly.Module;
  try {
    module = await WebAssembly.compileStreaming(response);
  } catch {
    // compileStreaming needs the MIME type application/wasm; fall back for servers that don't send it.
    module = await WebAssembly.compile(await (await fetch(wasmUrl)).arrayBuffer());
  }
  return instantiate(module);
};

/**
 * Answers requests on `port`, using `load` to start the parser on `init`. Requests are handled
 * strictly in order, so a `parse` sent right after `init` waits for it.
 */
export function serve(port: Port, load: Loader): void {
  let parser: RosettaParser | undefined;
  let queue: Promise<void> = Promise.resolve();

  const handle = async (req: Request): Promise<Response> => {
    switch (req.type) {
      case "init":
        parser ??= await load(req.wasmUrl, req.wasmExecUrl);
        return { id: req.id, ok: true };
      case "parse":
        if (!parser) throw new Error("the parser is not initialised: send `init` first");
        return { id: req.id, ok: true, result: parser.parse(req.markdown) };
      case "setComponents":
        if (!parser) throw new Error("the parser is not initialised: send `init` first");
        parser.setComponents(req.definitions);
        return { id: req.id, ok: true };
    }
  };

  port.onmessage = (event) => {
    const req = event.data;
    queue = queue.then(async () => {
      try {
        port.postMessage(await handle(req));
      } catch (e) {
        port.postMessage({ id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    });
  };
}
