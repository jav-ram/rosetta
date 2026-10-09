import { createEditor, createToolbar } from "@rosetta/editor";
import { useEffect, useRef } from "react";
import { starterHtml } from "../starter";

/** Mounts the framework-free Tiptap editor and its toolbar. React only provides the two containers. */
export function VisualEditor() {
  const toolbarHost = useRef<HTMLDivElement>(null);
  const editorHost = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const editor = createEditor({ element: editorHost.current!, content: starterHtml });
    const toolbar = createToolbar(editor);
    toolbarHost.current!.append(toolbar.element);
    return () => {
      toolbar.destroy();
      editor.destroy();
    };
  }, []);

  return (
    <>
      <div ref={toolbarHost} />
      <div ref={editorHost} className="visual-editor" />
    </>
  );
}
