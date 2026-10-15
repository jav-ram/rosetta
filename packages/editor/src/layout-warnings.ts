import { Extension, type Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/** A problem the preview found with the layout of one component. */
export interface LayoutWarning {
  /** Which component: its position among all components of the chapter, in document order (the first is 0). */
  index: number;
  message: string;
}

const key = new PluginKey<DecorationSet>("rosettaLayoutWarnings");

const isComponent = (node: PMNode) => node.type.name === "directive" || node.type.name === "directiveLeaf";

function decorations(doc: PMNode, warnings: LayoutWarning[]): DecorationSet {
  const byIndex = new Map(warnings.map((w) => [w.index, w.message]));
  const found: Decoration[] = [];
  let index = 0;
  doc.descendants((node, pos) => {
    if (!isComponent(node)) return;
    const message = byIndex.get(index++);
    if (message !== undefined) found.push(Decoration.node(pos, pos + node.nodeSize, { "data-layout-warning": message, class: "has-layout-warning" }));
  });
  return DecorationSet.create(doc, found);
}

/**
 * Marks components with a warning from the preview (`data-layout-warning` and the class `has-layout-warning` on the
 * component's frame; the app styles it). The marks follow their component while the text is edited around it. They are not
 * part of the document and are never saved.
 */
export const LayoutWarnings = Extension.create({
  name: "layoutWarnings",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const next = tr.getMeta(key) as LayoutWarning[] | undefined;
            return next ? decorations(tr.doc, next) : set.map(tr.mapping, tr.doc);
          },
        },
        props: { decorations: (state) => key.getState(state) },
      }),
    ];
  },
});

/** Replaces the warnings shown on the components. An empty list clears them. */
export function setLayoutWarnings(editor: Editor, warnings: LayoutWarning[]): void {
  editor.view.dispatch(editor.state.tr.setMeta(key, warnings).setMeta("addToHistory", false).setMeta("preventUpdate", true));
}
