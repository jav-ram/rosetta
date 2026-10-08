import { readFileSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { conformanceCases, normalizeHtml, toExpectedWarnings } from "@rosetta/contracts/conformance";
import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { createParser, instantiate, type AsyncParser, type RosettaParser, type WorkerLike } from "../src/index";

const dist = (f: string) => new URL(`../dist/${f}`, import.meta.url);
const wasmUrl = dist("rosetta.wasm").href;
const wasmExecUrl = dist("wasm_exec.js").href;

/** A real worker thread running the real worker loop, adapted to the browser Worker interface. */
function nodeWorker(script = new URL("./fixtures/node-worker.mjs", import.meta.url)): WorkerLike {
  const w = new Worker(script);
  return {
    postMessage: (m) => w.postMessage(m),
    addEventListener: ((type: string, listener: (e: never) => void) => {
      if (type === "message") w.on("message", (data) => (listener as (e: { data: unknown }) => void)({ data }));
      else w.on("error", (err: Error) => (listener as (e: { message: string }) => void)({ message: err.message }));
    }) as WorkerLike["addEventListener"],
    terminate: () => void w.terminate(),
  };
}

const parsers: AsyncParser[] = [];
const make = (options: Partial<Parameters<typeof createParser>[0]> = {}) => {
  const p = createParser({ wasmUrl, wasmExecUrl, worker: () => nodeWorker(), ...options });
  parsers.push(p);
  return p;
};
afterEach(() => {
  while (parsers.length) parsers.pop()!.terminate();
});

describe("lazy loading", () => {
  test("creating a parser starts nothing", () => {
    let created = 0;
    make({ worker: () => (created++, nodeWorker()) });
    expect(created).toBe(0);
  });

  test("the first call starts one worker, later calls reuse it", async () => {
    let created = 0;
    const p = make({ worker: () => (created++, nodeWorker()) });
    await p.parse("one");
    await p.parse("two");
    await p.ready();
    expect(created).toBe(1);
  });

  test("ready() loads ahead of the first parse", async () => {
    let created = 0;
    const p = make({ worker: () => (created++, nodeWorker()) });
    await p.ready();
    expect(created).toBe(1);
  });

  test("needs a worker or a workerUrl", () => {
    expect(() => createParser({ wasmUrl, wasmExecUrl })).toThrow(/worker/);
  });
});

describe("parse", () => {
  test("returns html, ast and warnings, the same as in-thread", async () => {
    const md = "# Hi\n\n:::statblock\nname: Rat\nac: 15\n:::\n\n:::mystery\nx\n:::\n";
    await import(wasmExecUrl);
    const local = (await instantiate(readFileSync(dist("rosetta.wasm")))).parse(md);
    const remote = await make().parse(md);
    expect(remote).toEqual(local);
    expect(remote.warnings.map((w) => w.code)).toEqual(["component.unknown"]);
  });

  test("concurrent calls each get their own answer", async () => {
    const p = make();
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => p.parse(`# Title ${i}`)));
    expect(results.map((r) => r.html.trim())).toEqual(Array.from({ length: 20 }, (_, i) => `<h1>Title ${i}</h1>`));
  });

  test("bad input does not reject", async () => {
    await expect(make().parse(":::statblock\nname: [unclosed\n:::\n\n:::\n")).resolves.toMatchObject({ warnings: expect.any(Array) });
  });
});

describe("components", () => {
  test("setComponents changes the definitions", async () => {
    const p = make();
    await p.setComponents([{ name: "callout", form: "block", kind: "container", breakable: true }]);
    expect((await p.parse(":::callout\nhi\n:::\n")).html).toContain("rosetta-callout");
  });

  test("the components option applies on start", async () => {
    const p = make({ components: [{ name: "callout", form: "block", kind: "container", breakable: true }] });
    expect((await p.parse(":::callout\nhi\n:::\n")).html).toContain("rosetta-callout");
  });

  test("invalid definitions reject, and the parser keeps working", async () => {
    const p = make();
    await expect(p.setComponents([{ name: "x", form: "block", kind: "container" }])).rejects.toThrow(/breakable/);
    expect((await p.parse(":::readaloud\nhi\n:::\n")).html).toContain("rosetta-readaloud");
  });
});

describe("failures", () => {
  test("a module that cannot load rejects, and the next call tries again with a new worker", async () => {
    let created = 0;
    const p = make({ wasmUrl: "file:///does/not/exist.wasm", worker: () => (created++, nodeWorker()) });
    await expect(p.parse("x")).rejects.toThrow();
    await expect(p.parse("x")).rejects.toThrow();
    expect(created).toBe(2);
  });

  test("a worker script that fails rejects the waiting calls", async () => {
    const p = make({ worker: () => nodeWorker(new URL("./fixtures/missing-worker.mjs", import.meta.url)) });
    await expect(p.parse("x")).rejects.toThrow(/worker failed|failed to start/);
  });

  test("terminate rejects what is waiting, and a later call starts a new worker", async () => {
    let created = 0;
    const p = make({ worker: () => (created++, nodeWorker()) });
    await p.ready();
    const waiting = p.parse("# a");
    p.terminate();
    await expect(waiting).rejects.toThrow(/terminated/);
    expect((await p.parse("# b")).html.trim()).toBe("<h1>b</h1>");
    expect(created).toBe(2);
  });
});

describe("the main thread stays free", () => {
  test("a large document is parsed without blocking timers", { timeout: 60_000 }, async () => {
    const section = readFileSync(new URL("../../contracts/conformance/cases/components/all-components-document.md", import.meta.url), "utf8").replace(/^---[\s\S]*?---\n/, "");
    const big = Array.from({ length: 500 }, () => section).join("\n");

    // Parsing in this thread blocks it for as long as the parse takes...
    await import(wasmExecUrl);
    const local: RosettaParser = await instantiate(readFileSync(dist("rosetta.wasm")));
    const t0 = performance.now();
    local.parse(big);
    const blockedMs = performance.now() - t0;

    // ...while parsing in the worker leaves the event loop running: timers fire on time.
    const p = make();
    await p.ready();
    let last = performance.now();
    let maxGap = 0;
    const ticker = setInterval(() => {
      const now = performance.now();
      maxGap = Math.max(maxGap, now - last);
      last = now;
    }, 5);
    const result = await p.parse(big);
    clearInterval(ticker);

    expect(result.ast.children.length).toBeGreaterThan(1000);
    expect(blockedMs).toBeGreaterThan(300); // the document is big enough for the comparison to mean something
    expect(maxGap).toBeLessThan(blockedMs / 3);
  });
});

describe("golden suite through the worker client", () => {
  let p: AsyncParser;
  beforeAll(() => {
    p = createParser({ wasmUrl, wasmExecUrl, worker: () => nodeWorker() });
    return () => p.terminate();
  });
  const cases = conformanceCases();
  test.each(cases.map((c) => [c.name, c] as const))("%s", async (_name, c) => {
    const r = await p.parse(c.markdown);
    expect(normalizeHtml(r.html)).toBe(normalizeHtml(c.html));
    expect(toExpectedWarnings(r.warnings)).toEqual(c.warnings);
  });
});

