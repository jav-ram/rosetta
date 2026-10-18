#!/usr/bin/env node
// Measures exporting a book as a PDF, the way the app does it, in headless Chrome that this script starts and drives.
//
//   pnpm --filter @rosetta/app build && pnpm cf:preview          # in another terminal: the app, as it is served
//   node tools/benchmark-book/src/export-benchmark.mjs --url http://127.0.0.1:8787 --book out/book-100.rosetta --book out/book-300.rosetta
//
// Options: --runs N (default 3: the first is cold, in a new browser; the others are warm), --chrome <path> (or CHROME), --json <file>,
// --background (a second tab is brought to the front before the runs, so the one that exports is in the background).
//
// For each book it starts a new Chrome, opens the app, imports the `.rosetta` file, and clicks "PDF" on the project, N times. The print
// dialog is stubbed (it cannot be driven), so a run measures everything up to the moment the dialog would open: reading, converting,
// loading the original images, and laying the whole book out. After the last run the laid-out pages are printed with Chrome's own
// `Page.printToPDF` (the print engine behind Save as PDF), which gives the time to make the PDF, its size and its page count.
// Memory is the JavaScript heap of the page (`performance.memory`) and the resident memory of every Chrome process (`ps`), at its peak.
// A headless Chrome in its own window is used because a tab that is not in front is throttled, which made the same layout ten times slower.

import { spawn, execFileSync } from "node:child_process";
import { createWriteStream, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const all = (name) => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));
const url = option("--url", "http://127.0.0.1:8787");
const books = all("--book").map((b) => resolve(b));
const runs = Number(option("--runs", "3"));
const chromePath = option("--chrome", process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
if (books.length === 0) {
  console.error("Give at least one --book <file.rosetta>. See the top of this file.");
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mb = (bytes) => Math.round(bytes / 1e5) / 10;

/** A minimal DevTools Protocol client over the browser's WebSocket. */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.next = 1;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);
      if (m.id) {
        const p = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? p.reject(new Error(`${p.method}: ${m.error.message}`)) : p.resolve(m.result);
      } else for (const l of this.listeners) l(m);
    });
  }
  send(method, params = {}, sessionId) {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  on(listener) {
    this.listeners.push(listener);
  }
}

async function startChrome() {
  const profile = mkdtempSync(join(tmpdir(), "rosetta-bench-"));
  const chrome = spawn(
    chromePath,
    ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--enable-precise-memory-info", "--js-flags=--expose-gc", "about:blank"],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  const endpoint = await new Promise((resolveEndpoint, reject) => {
    let text = "";
    chrome.stderr.on("data", (d) => {
      text += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(text);
      if (m) resolveEndpoint(m[1]);
    });
    chrome.on("exit", (code) => reject(new Error(`Chrome exited (${code}) before it was ready`)));
    setTimeout(() => reject(new Error("Chrome did not start in 30 s")), 30000);
  });
  const ws = new WebSocket(endpoint);
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = () => j(new Error("could not connect to Chrome")))));
  const cdp = new Cdp(ws);
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const bringAnotherTabToFront = async () => {
    const other = await cdp.send("Target.createTarget", { url: "about:blank" });
    await cdp.send("Target.activateTarget", { targetId: other.targetId });
  };
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const page = (method, params) => cdp.send(method, params, sessionId);
  const failures = [];
  cdp.on((m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === "Inspector.targetCrashed") failures.push("the page crashed (out of memory)");
    if (m.method === "Runtime.exceptionThrown") failures.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
  });
  await page("Runtime.enable");
  await page("Page.enable");
  await page("DOM.enable");
  return {
    page,
    bringAnotherTabToFront,
    failures,
    profile,
    /** The resident memory, in bytes, of every process of this Chrome. */
    rss() {
      const out = execFileSync("ps", ["-axo", "rss=,command="], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      return out
        .split("\n")
        .filter((l) => l.includes(`--user-data-dir=${profile}`))
        .reduce((sum, l) => sum + Number(l.trim().split(/\s+/)[0]) * 1024, 0);
    },
    async stop() {
      try {
        await cdp.send("Browser.close");
      } catch {
        // already gone
      }
      const exited = new Promise((r) => chrome.once("exit", r));
      chrome.kill();
      await Promise.race([exited, sleep(10000)]);
      try {
        rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
      } catch {
        // a temporary folder that is left behind is not a failure of the measurement
      }
    },
  };
}

/** Everything that runs inside the page. The print dialog is replaced; what it would have printed is described, or kept for the PDF. */
const harness = `
window.__bench = async (label, keepForPdf) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const stages = []; let peak = 0; const t0 = performance.now(); let at = null; let facts = null;
  const sample = setInterval(() => {
    const m = performance.memory; if (m) peak = Math.max(peak, m.usedJSHeapSize);
    const msg = document.querySelector('[role=dialog] [role=status]')?.textContent || '';
    const stage = /^Reading/.test(msg) ? 'reading' : /^Converting/.test(msg) ? 'converting' : /^Loading images/.test(msg) ? 'images after layout' : /^Loading /.test(msg) ? 'loading originals' : /^Laying out the pages/.test(msg) ? 'layout starts' : /^Laying out page/.test(msg) ? 'layout' : /^Opening/.test(msg) ? 'ready to print' : '';
    if (stage && stages.at(-1)?.[1] !== stage) stages.push([Math.round(performance.now() - t0), stage]);
  }, 10);
  const patcher = setInterval(() => {
    const f = document.querySelector('iframe.rosetta-book-frame'); const w = f?.contentWindow;
    if (w && !w.__patched && w.PagedPolyfill) {
      w.__patched = true;
      w.print = async function () {
        at = Math.round(performance.now() - t0);
        const d = f.contentDocument;
        facts = { pages: d.querySelectorAll('.pagedjs_page').length, nodes: d.querySelectorAll('*').length, images: d.querySelectorAll('img').length };
        if (keepForPdf) {
          // The laid-out pages become the page itself, so that Chrome prints them as it would the frame.
          const html = d.documentElement.cloneNode(true);
          html.querySelectorAll('script').forEach((s) => s.remove());
          window.__facts = facts; window.__ready = true;
          document.open(); document.write('<!doctype html>' + html.outerHTML); document.close();
          return;
        }
        w.dispatchEvent(new Event('afterprint'));
      };
    }
  }, 10);
  document.querySelector('button[aria-label="Export ' + label + ' as PDF"]').click();
  while (performance.now() - t0 < 1500000) {
    await wait(25);
    if (keepForPdf && window.__ready) break;
    if (document.querySelector('[role=dialog]')?.textContent.includes('Done') || document.querySelector('[role=alert].export-error')) break;
  }
  clearInterval(sample); clearInterval(patcher);
  const error = document.querySelector('[role=alert].export-error')?.textContent || null;
  const warnings = [...document.querySelectorAll('.export-warnings li')].map((l) => l.textContent);
  if (!keepForPdf) { [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent === 'Close')?.click(); await wait(100); }
  return { readyMs: at, stages, heapPeakBytes: peak, facts, error, warnings };
};
true;
`;

async function measureBook(file) {
  const label = file.split("/").pop();
  const result = { book: label, bytes: statSync(file).size, runs: [], failures: [] };
  const browser = await startChrome();
  const { page } = browser;
  let peakRss = 0;
  const watch = setInterval(() => (peakRss = Math.max(peakRss, browser.rss())), 250);
  const evaluate = async (expression, awaitPromise = true) => {
    const r = await page("Runtime.evaluate", { expression, awaitPromise, returnByValue: true, timeout: 1500000 });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  try {
    await page("Page.navigate", { url });
    for (let i = 0; i < 100 && !(await evaluate(`!!document.querySelector('input[aria-label="Import a .rosetta file"]')`)); i++) await sleep(100);
    // Import (the file is given to the page's file input, as the Import… button would).
    const importStart = Date.now();
    const { root } = await page("DOM.getDocument");
    const { nodeId } = await page("DOM.querySelector", { nodeId: root.nodeId, selector: 'input[aria-label="Import a .rosetta file"]' });
    await page("DOM.setFileInputFiles", { files: [file], nodeId });
    let title = null;
    for (let i = 0; i < 6000 && !title; i++) {
      await sleep(100);
      title = await evaluate(`document.querySelector('.projects-list li strong')?.textContent || null`);
      const error = await evaluate(`document.querySelector('.projects-error')?.textContent || null`);
      if (error) throw new Error(`import failed: ${error}`);
    }
    result.importMs = Date.now() - importStart;
    result.title = title;
    await evaluate(harness);
    if (args.includes("--background")) await browser.bringAnotherTabToFront();
    await sleep(1000);
    // Resident memory counts shared pages in every process, so the absolute figure is inflated: what the export adds is the number to read.
    result.baselineRssMB = mb(browser.rss());
    for (let run = 1; run <= runs; run++) {
      const last = run === runs;
      const before = browser.rss();
      peakRss = before;
      const started = Date.now();
      const r = await evaluate(`window.__bench(${JSON.stringify(title)}, ${last})`);
      result.runs.push({ run, kind: run === 1 ? "cold" : "warm", ...r, heapPeakMB: mb(r.heapPeakBytes), peakRssMB: mb(peakRss), addedRssMB: mb(peakRss - result.baselineRssMB * 1e6), wallMs: Date.now() - started });
      if (r.error) result.failures.push(r.error);
    }
    // The PDF: Chrome's print engine on the laid-out book.
    peakRss = browser.rss();
    const printStart = Date.now();
    const pdfPath = join(tmpdir(), `rosetta-bench-${label}.pdf`);
    const { stream } = await page("Page.printToPDF", { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false, transferMode: "ReturnAsStream" });
    const out = createWriteStream(pdfPath);
    for (;;) {
      const chunk = await page("IO.read", { handle: stream, size: 1 << 20 });
      out.write(chunk.base64Encoded ? Buffer.from(chunk.data, "base64") : chunk.data);
      if (chunk.eof) break;
    }
    await new Promise((r) => out.end(r));
    await page("IO.close", { handle: stream });
    const pdfMs = Date.now() - printStart;
    const pdf = readFileSync(pdfPath, "latin1");
    result.pdf = { ms: pdfMs, bytes: statSync(pdfPath).size, pages: (pdf.match(/\/Type\s*\/Page[^s]/g) ?? []).length, peakRssMB: mb(peakRss), addedRssMB: mb(peakRss - result.baselineRssMB * 1e6) };
    rmSync(pdfPath, { force: true });
    result.facts = await evaluate("window.__facts");
  } catch (e) {
    result.failures.push(e instanceof Error ? e.message : String(e));
  } finally {
    clearInterval(watch);
    result.failures.push(...browser.failures);
    await browser.stop();
  }
  return result;
}

const results = [];
for (const book of books) {
  console.error(`Measuring ${book} …`);
  results.push(await measureBook(book));
}
const outFile = option("--json");
if (outFile) writeFileSync(outFile, JSON.stringify(results, null, 2));

// A table for docs/benchmarks.md.
for (const r of results) {
  console.log(`\n### ${r.book} (${mb(r.bytes)} MB file; ${r.facts?.pages ?? "?"} pages, ${r.facts?.images ?? "?"} images)`);
  console.log(`import: ${r.importMs} ms; Chrome with the app open and the book imported: ${r.baselineRssMB} MB`);
  console.log("| Run | Ready to print | Reading + converting | Loading originals | Layout, images checked | Heap peak | Chrome, added |");
  console.log("|---|---|---|---|---|---|---|");
  for (const run of r.runs) {
    const t = Object.fromEntries(run.stages.map(([ms, name]) => [name, ms]));
    const next = (name) => run.stages.find(([, s]) => s === name)?.[0];
    const layoutStart = t["layout starts"] ?? t.layout ?? 0;
    console.log(`| ${run.kind} | ${run.readyMs ?? "n/a"} ms | ${t["loading originals"] ?? next("layout starts") ?? 0} ms | ${layoutStart - (t["loading originals"] ?? 0)} ms | ${(run.readyMs ?? 0) - layoutStart} ms | ${run.heapPeakMB} MB | ${run.addedRssMB} MB |`);
  }
  if (r.pdf) console.log(`PDF: ${r.pdf.ms} ms, ${mb(r.pdf.bytes)} MB, ${r.pdf.pages} pages, Chrome added ${r.pdf.addedRssMB} MB`);
  console.log(`failures: ${r.failures.length ? r.failures.join("; ") : "none"}`);
}
