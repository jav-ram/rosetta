import type { ComponentDefinition } from "@rosetta/contracts";
import type { ParseResult } from "./index";
import type { Request, Response } from "./protocol";

/** What the client needs from a worker. A browser `Worker` satisfies it. */
export interface WorkerLike {
  postMessage(message: Request): void;
  addEventListener(type: "message", listener: (event: { data: Response }) => void): void;
  addEventListener(type: "error", listener: (event: { message?: string }) => void): void;
  terminate(): void;
}

export interface ParserOptions {
  /** URL of rosetta.wasm. */
  wasmUrl: string | URL;
  /** URL of the wasm_exec.js built together with it. */
  wasmExecUrl: string | URL;
  /** Creates the worker. With Vite: `() => new ParserWorker()` after `import ParserWorker from "@rosetta/parser-wasm/worker?worker"`. */
  worker?: () => WorkerLike;
  /** Alternative to `worker`: URL of the worker script (a module worker is created from it). */
  workerUrl?: string | URL;
  /** Component definitions to use instead of the built-in M1 set. */
  components?: ComponentDefinition[];
}

/** The parser, running in a Web Worker. */
export interface AsyncParser {
  /** Parses Rosetta Markdown off the main thread. Bad input never rejects: problems come back as warnings. */
  parse(markdown: string): Promise<ParseResult>;
  /** Replaces the component definitions. Rejects if one is invalid. */
  setComponents(definitions: ComponentDefinition[]): Promise<void>;
  /** Starts the worker and loads the module now, instead of on the first call. */
  ready(): Promise<void>;
  /** Stops the worker. The next call starts a new one. */
  terminate(): void;
}

interface Pending {
  resolve(response: Response): void;
  reject(error: Error): void;
}

/**
 * Creates a parser that runs in a Web Worker. **Nothing is loaded until it is first used**
 * (`parse`, `setComponents` or `ready`), so creating one is free and the ~2 MB module is only
 * fetched when a document is actually parsed.
 */
export function createParser(options: ParserOptions): AsyncParser {
  if (!options.worker && !options.workerUrl) throw new Error("createParser needs `worker` or `workerUrl`");
  const makeWorker = options.worker ?? (() => new Worker(options.workerUrl!, { type: "module" }) as unknown as WorkerLike);
  const wasmUrl = new URL(options.wasmUrl, globalThis.location?.href).href;
  const wasmExecUrl = new URL(options.wasmExecUrl, globalThis.location?.href).href;

  let worker: WorkerLike | undefined;
  let starting: Promise<void> | undefined;
  let nextId = 1;
  // Why there is no worker, for calls that arrive after it stopped.
  let stopReason = "the parser worker is not running";
  const pending = new Map<number, Pending>();

  const stop = (reason: string) => {
    stopReason = reason;
    worker?.terminate();
    worker = undefined;
    starting = undefined;
    const error = new Error(reason);
    for (const p of pending.values()) p.reject(error);
    pending.clear();
  };

  const send = (message: Request extends infer R ? (R extends { id: number } ? Omit<R, "id"> : never) : never): Promise<Response> =>
    new Promise((resolve, reject) => {
      if (!worker) return reject(new Error(stopReason));
      const id = nextId++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ ...message, id } as Request);
    });

  const call = async (message: Parameters<typeof send>[0]): Promise<Response & { ok: true }> => {
    const response = await send(message);
    if (!response.ok) throw new Error(response.error);
    return response;
  };

  const start = (): Promise<void> => {
    if (!starting) {
      const w = makeWorker();
      worker = w;
      w.addEventListener("message", (event) => {
        const p = pending.get(event.data.id);
        if (p) {
          pending.delete(event.data.id);
          p.resolve(event.data);
        }
      });
      // A worker that cannot start (bad URL, script error) never answers; fail what is waiting.
      w.addEventListener("error", (event) => stop(`the parser worker failed: ${event.message ?? "unknown error"}`));
      const s: Promise<void> = (async () => {
        await call({ type: "init", wasmUrl, wasmExecUrl });
        if (options.components) await call({ type: "setComponents", definitions: options.components });
      })();
      starting = s;
      // If loading fails, forget it so that the next call tries again with a fresh worker.
      s.catch(() => {
        if (starting === s) stop("the parser failed to start");
      });
    }
    return starting;
  };

  return {
    ready: start,
    async parse(markdown) {
      await start();
      const r = await call({ type: "parse", markdown });
      return r.result as ParseResult;
    },
    async setComponents(definitions) {
      await start();
      await call({ type: "setComponents", definitions });
    },
    terminate: () => stop("the parser was terminated"),
  };
}
