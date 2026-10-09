import { useState } from "react";
import type { Parsed } from "../useParsed";
import { VisualEditor } from "./VisualEditor";

interface Props {
  chapterId: string;
  markdown: string;
  parsed: Parsed;
  /** Gets the new Markdown and the chapter it belongs to (the chapter can change while a save is pending). */
  onChange: (markdown: string, chapterId?: string) => void;
}

/**
 * Two views of the same chapter: "Visual" (Tiptap) and "Markdown" (a text box). Edits in either are saved to the
 * chapter's Markdown, which the other view and the preview then show.
 */
export function EditorPane({ chapterId, markdown, parsed, onChange }: Props) {
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
        <span className="hint">{view === "visual" ? "edits are saved as Markdown" : "temporary view"}</span>
      </header>
      {/* Both stay mounted so switching tabs keeps the editor's content and undo history. */}
      <div className="editor-body" hidden={view !== "visual"}>
        <VisualEditor chapterId={chapterId} markdown={markdown} parsed={parsed} onChange={onChange} />
      </div>
      <textarea hidden={view !== "markdown"} value={markdown} onChange={(e) => onChange(e.target.value, chapterId)} spellCheck={false} aria-label="Chapter text" />
    </section>
  );
}
