export const name = "@rosetta/editor";
export { createEditor, type EditorOptions } from "./editor";
export { standardExtensions } from "./extensions";
export { createToolbar, type ToolbarOptions } from "./toolbar";
export type { Editor } from "@tiptap/core";
export { fromAst, type LoadedDocument } from "./load";
export { Directive } from "./directive";
export { toMarkdown, type SaveOptions } from "./save";
export { yamlMapping } from "./yaml";
