import { Editor, createDocument, type Content } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
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

/**
 * Replaces the document with the cursor in the last text block, as one step that undo does not reach (undoing a
 * load would empty the document). Without a cursor in text, ProseMirror selects a component at the very start,
 * which would open its form as soon as a chapter is loaded. An empty paragraph is added at the end when the
 * document does not end in text, so there is somewhere for the cursor; it is not saved.
 */
export function setDocument(editor: Editor, content: Content): void {
  const { state, view } = editor;
  const incoming = createDocument(content, state.schema);
  let tr = state.tr.replaceWith(0, state.doc.content.size, incoming.content);
  if (!tr.doc.lastChild?.isTextblock) tr = tr.insert(tr.doc.content.size, state.schema.nodes.paragraph!.create());
  tr = tr.setSelection(TextSelection.near(tr.doc.resolve(tr.doc.content.size), -1)).setMeta("addToHistory", false).setMeta("preventUpdate", true);
  view.dispatch(tr);
}
