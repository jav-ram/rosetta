import { createEditor, createToolbar, fromAst, toMarkdown, type Editor } from "@rosetta/editor";
import { useEffect, useRef } from "react";
import type { Parsed } from "../useParsed";

const SAVE_DELAY_MS = 250;

interface Props {
  chapterId: string;
  /** The chapter's Markdown: the source of truth. */
  markdown: string;
  parsed: Parsed;
  onChange: (markdown: string, chapterId: string) => void;
}

/**
 * Mounts the framework-free Tiptap editor and its toolbar; React only provides the two containers.
 *
 * The chapter's Markdown is the source of truth. A parse of it is loaded into the editor, and edits are written
 * back as Markdown a moment after the last keystroke. A parse of Markdown the editor wrote itself is not loaded
 * again (that would move the cursor); a parse of any other Markdown (another chapter, the Markdown tab) is.
 */
export function VisualEditor({ chapterId, markdown, parsed, onChange }: Props) {
  const toolbarHost = useRef<HTMLDivElement>(null);
  const editorHost = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  /** What the editor currently shows, and where it came from. */
  const shown = useRef<{ markdown: string | null; chapterId: string | null; frontMatterRaw?: string }>({ markdown: null, chapterId: null });
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const save = () => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = null;
    const editor = editorRef.current;
    const { chapterId: id, frontMatterRaw } = shown.current;
    if (!editor || id === null) return;
    try {
      const saved = toMarkdown(editor.getJSON(), { frontMatterRaw });
      shown.current.markdown = saved;
      onChangeRef.current(saved, id);
    } catch (e) {
      console.error("Could not save the chapter", e);
    }
  };

  useEffect(() => {
    const editor = createEditor({
      element: editorHost.current!,
      onUpdate: () => {
        if (pending.current) clearTimeout(pending.current);
        pending.current = setTimeout(save, SAVE_DELAY_MS);
      },
    });
    const toolbar = createToolbar(editor);
    toolbarHost.current!.append(toolbar.element);
    editorRef.current = editor;
    return () => {
      if (pending.current) save();
      editorRef.current = null;
      toolbar.destroy();
      editor.destroy();
    };
    // `save` only reads refs, so it is not a dependency.
  }, []);

  // Leaving a chapter: write its pending edits to it, and keep the editor still until the new chapter is loaded.
  useEffect(() => {
    if (shown.current.chapterId !== null && shown.current.chapterId !== chapterId) {
      if (pending.current) save();
      editorRef.current?.setEditable(false);
    }
    // `save` only reads refs, so it is not a dependency.
  }, [chapterId]);

  // Load a parse of the current Markdown, unless the editor already shows it.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || parsed.state !== "ready" || parsed.markdown !== markdown || shown.current.markdown === markdown) return;
    try {
      const loaded = fromAst(parsed.ast);
      editor.commands.setContent(loaded.doc, { emitUpdate: false });
      editor.setEditable(true);
      shown.current = { markdown, chapterId, frontMatterRaw: loaded.frontMatterRaw };
    } catch (e) {
      console.error("Could not load the chapter into the editor", e);
    }
  }, [parsed, markdown, chapterId]);

  return (
    <>
      <div ref={toolbarHost} />
      <div ref={editorHost} className="visual-editor" />
    </>
  );
}
