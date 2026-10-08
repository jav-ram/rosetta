// Entry point of the Web Worker. Bundlers: import it with `?worker` (Vite) or point `workerUrl`
// at dist/worker.js.
import { browserLoader, serve, type Port } from "./worker-core";

serve(self as unknown as Port, browserLoader);
