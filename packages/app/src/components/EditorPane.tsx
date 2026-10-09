import { useState } from "react";
import type { Parsed } from "../useParsed";
import { VisualEditor } from "./VisualEditor";

interface Props {
  markdown: string;
  parsed: Parsed;
  onChange: (markdown: string) => void;
}

/**
 * Two views for now. "Visual" is the Tiptap editor: it shows the parsed chapter (T1.3), but its edits are not saved
 * back to Markdown until T1.4. "Markdown" is the temporary text box that drives the preview.
 */
export function EditorPane({ markdown, parsed, onChange }: Props) {
  const [view, setView] = useState<"visual" | "markdown">("visual");
  return (
    <section className="pane editor" aria-label="Editor">
      <header>
        <h2>Editor</h2>
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={view === "visual"} onClick={() => setView("visual")}>
            Visual
          </button>
          <button type="button" role="tab" aria-selected={view === "markdown"} onClick={() => setView("markdown")}>
            Markdown
          </button>
        </div>
        <span className="hint">{view === "visual" ? "shows the chapter · edits are not saved yet" : "temporary"}</span>
      </header>
      {/* Both stay mounted so switching tabs keeps the editor's content and undo history. */}
      <div className="editor-body" hidden={view !== "visual"}>
        <VisualEditor ast={parsed.state === "ready" ? parsed.ast : null} />
      </div>
      <textarea hidden={view !== "markdown"} value={markdown} onChange={(e) => onChange(e.target.value)} spellCheck={false} aria-label="Chapter text" />
    </section>
  );
}
