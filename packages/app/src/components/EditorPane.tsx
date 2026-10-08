interface Props {
  markdown: string;
  onChange: (markdown: string) => void;
}

/** Placeholder: a plain text box. The Tiptap editor replaces it in T1.2. */
export function EditorPane({ markdown, onChange }: Props) {
  return (
    <section className="pane editor" aria-label="Editor">
      <header>
        <h2>Editor</h2>
        <span className="hint">placeholder</span>
      </header>
      <textarea value={markdown} onChange={(e) => onChange(e.target.value)} spellCheck={false} aria-label="Chapter text" />
    </section>
  );
}
