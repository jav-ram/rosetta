import { Editor, type Content } from "@tiptap/core";
import { standardExtensions, type ComponentOptions } from "./extensions";

export interface EditorOptions extends ComponentOptions {
  /** The element the editable document is mounted in. */
  element: HTMLElement;
  /** HTML or a Tiptap JSON document. */
  content?: Content;
  onUpdate?: (editor: Editor) => void;
}

/** Creates the editor. It is plain Tiptap core: no UI framework. */
export function createEditor({ element, content = "", onUpdate, components, renderComponent }: EditorOptions): Editor {
  return new Editor({
    element,
    content,
    extensions: standardExtensions({ components, renderComponent }),
    editorProps: { attributes: { class: "rosetta-editor", role: "textbox", "aria-multiline": "true", "aria-label": "Chapter text" } },
    onUpdate: ({ editor }) => onUpdate?.(editor),
  });
}
