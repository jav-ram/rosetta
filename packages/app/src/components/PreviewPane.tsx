import type { Parsed } from "../useParsed";

/** Placeholder: shows the parser's HTML unpaginated. The Paged.js preview replaces it in M2. */
export function PreviewPane({ parsed }: { parsed: Parsed }) {
  return (
    <section className="pane preview" aria-label="Preview">
      <header>
        <h2>Preview</h2>
        <span className="hint" role="status">
          {parsed.state === "loading" && "loading the parser…"}
          {parsed.state === "error" && "parser error"}
          {parsed.state === "ready" && `placeholder · ${parsed.warnings.length} warning${parsed.warnings.length === 1 ? "" : "s"}`}
        </span>
      </header>
      {parsed.state === "error" && <p className="error">{parsed.message}</p>}
      {/* The parser drops raw HTML from the source, so its output is safe to insert. */}
      {parsed.state === "ready" && <article className="page" dangerouslySetInnerHTML={{ __html: parsed.html }} />}
    </section>
  );
}
