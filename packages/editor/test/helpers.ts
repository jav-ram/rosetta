import type { Editor } from "@tiptap/core";
import { createEditor, createToolbar } from "../src/index";

export function setup(content = "") {
  const host = document.createElement("div");
  document.body.append(host);
  const editor = createEditor({ element: host, content });
  const toolbar = createToolbar(editor, { askUrl: (message) => (message.startsWith("Image") ? "https://example.com/a.png" : "https://example.com") });
  document.body.prepend(toolbar.element);
  return { editor, toolbar, // The editor keeps an empty paragraph at the end (so you can type after a table or code block); ignore it.
    html: () => editor.getHTML().replace(/(<p><\/p>)+$/, ""), cleanup: () => (toolbar.destroy(), editor.destroy(), host.remove()) };
}

export const click = (command: string) => {
  const el = document.querySelector<HTMLButtonElement>(`.rosetta-toolbar [data-command="${command}"]`);
  if (!el) throw new Error(`no toolbar button ${command}`);
  el.click();
  return new Promise((r) => setTimeout(r)); // some buttons are asynchronous
};

/** Types text the way a keyboard does, so Markdown shortcuts (input rules) fire. */
export function type(editor: Editor, text: string) {
  const { view } = editor;
  for (const ch of text) {
    const { from, to } = view.state.selection;
    if (!view.someProp("handleTextInput", (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)))) view.dispatch(view.state.tr.insertText(ch, from, to));
  }
}

/** Presses a shortcut, e.g. press(editor, "b", { ctrl: true }). */
export function press(editor: Editor, key: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}) {
  editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift, altKey: !!mods.alt, bubbles: true, cancelable: true }));
}
