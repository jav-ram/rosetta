import type { Document } from "@rosetta/contracts";
import { createEditor, createToolbar, fromAst, type Editor } from "@rosetta/editor";
import { useEffect, useRef } from "react";

/** Mounts the framework-free Tiptap editor and its toolbar. React only provides the two containers. */
export function VisualEditor({ ast }: { ast: Document | null }) {
  const toolbarHost = useRef<HTMLDivElement>(null);
  const editorHost = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const astRef = useRef(ast);
  astRef.current = ast;

  useEffect(() => {
    const editor = createEditor({ element: editorHost.current!, content: astRef.current ? fromAst(astRef.current).doc : "" });
    const toolbar = createToolbar(editor);
    toolbarHost.current!.append(toolbar.element);
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
      toolbar.destroy();
      editor.destroy();
    };
  }, []);

  // A new parse result replaces the document. Saving edits back to Markdown comes in T1.4, so edits made here are not kept yet.
  useEffect(() => {
    if (!ast || !editorRef.current) return;
    try {
      editorRef.current.commands.setContent(fromAst(ast).doc, { emitUpdate: false });
    } catch (e) {
      console.error("Could not load the chapter into the editor", e);
    }
  }, [ast]);

  return (
    <>
      <div ref={toolbarHost} />
      <div ref={editorHost} className="visual-editor" />
    </>
  );
}
