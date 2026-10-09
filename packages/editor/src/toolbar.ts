import type { Editor } from "@tiptap/core";

export interface ToolbarOptions {
  /** Asks for a URL (links and images). Resolve with `null` to cancel. Defaults to `window.prompt`. */
  askUrl?: (message: string, current?: string) => string | null | Promise<string | null>;
}

interface Button {
  id: string;
  label: string;
  title: string;
  run: (editor: Editor, ask: NonNullable<ToolbarOptions["askUrl"]>) => void | Promise<void>;
  /** The node or mark name (and attributes) that makes the button look pressed. */
  active?: [name: string, attrs?: Record<string, unknown>];
  /** Disabled unless this returns true. */
  can?: (editor: Editor) => boolean;
  /** Only shown while the cursor is in a table. */
  inTable?: boolean;
}

const chain = (e: Editor) => e.chain().focus();

const buttons: (Button | "|")[] = [
  { id: "undo", label: "↶", title: "Undo (Mod-Z)", run: (e) => void chain(e).undo().run(), can: (e) => e.can().undo() },
  { id: "redo", label: "↷", title: "Redo (Mod-Shift-Z)", run: (e) => void chain(e).redo().run(), can: (e) => e.can().redo() },
  "|",
  { id: "paragraph", label: "¶", title: "Paragraph (Mod-Alt-0)", run: (e) => void chain(e).setParagraph().run(), active: ["paragraph"] },
  ...([1, 2, 3] as const).map<Button>((level) => ({
    id: `h${level}`,
    label: `H${level}`,
    title: `Heading ${level} (Mod-Alt-${level})`,
    run: (e) => void chain(e).toggleHeading({ level }).run(),
    active: ["heading", { level }],
  })),
  "|",
  { id: "bold", label: "B", title: "Bold (Mod-B)", run: (e) => void chain(e).toggleBold().run(), active: ["bold"] },
  { id: "italic", label: "I", title: "Italic (Mod-I)", run: (e) => void chain(e).toggleItalic().run(), active: ["italic"] },
  { id: "strike", label: "S", title: "Strikethrough (Mod-Shift-S)", run: (e) => void chain(e).toggleStrike().run(), active: ["strike"] },
  { id: "code", label: "</>", title: "Inline code (Mod-E)", run: (e) => void chain(e).toggleCode().run(), active: ["code"] },
  {
    id: "link",
    label: "Link",
    title: "Link (Mod-K)",
    active: ["link"],
    async run(e, ask) {
      const url = await ask("Link address (empty removes the link)", e.getAttributes("link").href);
      if (url === null) return;
      if (url.trim() === "") void chain(e).extendMarkRange("link").unsetLink().run();
      else void chain(e).extendMarkRange("link").setLink({ href: url.trim() }).run();
    },
  },
  "|",
  { id: "bulletList", label: "• List", title: "Bullet list (Mod-Shift-8)", run: (e) => void chain(e).toggleBulletList().run(), active: ["bulletList"] },
  { id: "orderedList", label: "1. List", title: "Numbered list (Mod-Shift-7)", run: (e) => void chain(e).toggleOrderedList().run(), active: ["orderedList"] },
  { id: "blockquote", label: "❝", title: "Quote (Mod-Shift-B)", run: (e) => void chain(e).toggleBlockquote().run(), active: ["blockquote"] },
  { id: "codeBlock", label: "Code block", title: "Code block (Mod-Alt-C)", run: (e) => void chain(e).toggleCodeBlock().run(), active: ["codeBlock"] },
  { id: "rule", label: "―", title: "Horizontal rule", run: (e) => void chain(e).setHorizontalRule().run() },
  "|",
  {
    id: "image",
    label: "Image",
    title: "Image",
    async run(e, ask) {
      const src = await ask("Image address");
      if (src?.trim()) void chain(e).setImage({ src: src.trim(), alt: "" }).run();
    },
  },
  { id: "table", label: "Table", title: "Insert table", run: (e) => void chain(e).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), can: (e) => e.can().insertTable() },
  { id: "addRow", label: "+Row", title: "Add row below", inTable: true, run: (e) => void chain(e).addRowAfter().run(), can: (e) => e.can().addRowAfter() },
  { id: "addColumn", label: "+Col", title: "Add column after", inTable: true, run: (e) => void chain(e).addColumnAfter().run(), can: (e) => e.can().addColumnAfter() },
  { id: "deleteRow", label: "−Row", title: "Delete row", inTable: true, run: (e) => void chain(e).deleteRow().run(), can: (e) => e.can().deleteRow() },
  { id: "deleteColumn", label: "−Col", title: "Delete column", inTable: true, run: (e) => void chain(e).deleteColumn().run(), can: (e) => e.can().deleteColumn() },
  { id: "deleteTable", label: "−Table", title: "Delete table", inTable: true, run: (e) => void chain(e).deleteTable().run(), can: (e) => e.can().deleteTable() },
];

/** Builds the toolbar. Mount `element` anywhere; call `destroy` when the editor goes away. */
export function createToolbar(editor: Editor, options: ToolbarOptions = {}): { element: HTMLElement; destroy: () => void } {
  const ask = options.askUrl ?? ((message, current) => window.prompt(message, current ?? ""));
  const doc = editor.view.dom.ownerDocument;
  const element = doc.createElement("div");
  element.className = "rosetta-toolbar";
  element.setAttribute("role", "toolbar");
  element.setAttribute("aria-label", "Formatting");

  const entries: { button: Button; el: HTMLButtonElement }[] = [];
  for (const b of buttons) {
    if (b === "|") {
      const sep = doc.createElement("span");
      sep.className = "rosetta-toolbar-separator";
      sep.setAttribute("role", "separator");
      element.append(sep);
      continue;
    }
    const el = doc.createElement("button");
    el.type = "button";
    el.textContent = b.label;
    el.title = b.title;
    el.setAttribute("aria-label", b.title.replace(/ \(.*\)$/, ""));
    el.dataset.command = b.id;
    // Keep the selection in the document when the button is pressed.
    el.addEventListener("mousedown", (e) => e.preventDefault());
    el.addEventListener("click", () => void b.run(editor, ask));
    element.append(el);
    entries.push({ button: b, el });
  }

  const refresh = () => {
    const inTable = editor.isActive("table");
    for (const { button, el } of entries) {
      el.hidden = !!button.inTable && !inTable;
      el.disabled = !editor.isEditable || (button.can ? !button.can(editor) : false);
      if (button.active) el.setAttribute("aria-pressed", String(editor.isActive(...button.active)));
    }
  };
  refresh();
  editor.on("transaction", refresh);

  return {
    element,
    destroy: () => {
      editor.off("transaction", refresh);
      element.remove();
    },
  };
}
