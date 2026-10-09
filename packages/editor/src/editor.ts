import { Editor, type Content } from "@tiptap/core";
import { standardExtensions } from "./extensions";

export interface EditorOptions {
  /** The element the editable document is mounted in. */
  element: HTMLElement;
  /** HTML or a Tiptap JSON document. */
  content?: Content;
  onUpdate?: (editor: Editor) => void;
}

/** Creates the editor. It is plain Tiptap core: no UI framework. */
export function createEditor({ element, content = "", onUpdate }: EditorOptions): Editor {
  return new Editor({
    element,
    content,
    extensions: standardExtensions(),
    editorProps: { attributes: { class: "rosetta-editor", role: "textbox", "aria-multiline": "true", "aria-label": "Chapter text" } },
    onUpdate: ({ editor }) => onUpdate?.(editor),
  });
}
