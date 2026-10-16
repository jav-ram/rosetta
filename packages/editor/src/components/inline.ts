import { defaultValue, fieldsOf, type Definition, type FieldDef } from "./registry";

/**
 * Editing a data component where it is shown. The parser renders the component (the app's renderer, so the markup and the
 * theme are the preview's); the editor then swaps each value in that HTML for a control that looks the same (an input
 * that takes the value's font, color and size), so the component does not change shape between reading and editing.
 * It follows the component's definition: any data component gets it, with no code of its own.
 */

export type Fields = Record<string, unknown>;

export interface InlineOptions {
  def: Definition;
  /** The parser's HTML for the component rendered from `skeleton(...)`: every field is present, so every value has a place. */
  html: string;
  /** The values. The editor changes this object as the person types. */
  fields: Fields;
  /** After every edit. */
  onEdit(fields: Fields): void;
  /** An item was added to or removed from a list: the structure changed, so the caller renders it again (`skeleton`) and calls `createInline` again. */
  onStructure(fields: Fields, focusPath?: string): void;
  /** The path of the control to focus when it is ready (after an item was added). */
  focusPath?: string;
}

export interface Inline {
  element: HTMLElement;
}

/** A value that stands in for an empty one, so the parser renders a place for it. The control that replaces it shows the real (empty) value. */
const sentinel = (f: FieldDef): unknown => {
  switch (f.type) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "enum":
      return f.values?.[0] ?? "x";
    case "list":
      return [fillOne(f.items ?? { name: "item", type: "string" }, undefined)];
    case "object":
      return fillFields(f.fields ?? [], {});
    default:
      return "x";
  }
};

function fillOne(f: FieldDef, value: unknown): unknown {
  if (f.type === "object") return fillFields(f.fields ?? [], (value as Fields | undefined) ?? {});
  if (f.type === "list") return Array.isArray(value) && value.length ? value.map((v) => fillOne(f.items ?? { name: "item", type: "string" }, v)) : sentinel(f);
  return value === undefined || value === "" || value === null ? sentinel(f) : value;
}

function fillFields(defs: FieldDef[], values: Fields): Fields {
  const out: Fields = {};
  for (const f of defs) out[f.name] = fillOne(f, values[f.name]);
  return out;
}

/** The values to render so that every field of the definition is in the HTML: what is empty gets a stand-in value. */
export const skeleton = (def: Definition, fields: Fields): Fields => fillFields(fieldsOf(def), fields);

const children = (el: Element, selector: string) => [...el.children].filter((c) => c.matches(selector));

/** Binds the controls to the values. Returns null when the HTML is not shaped as the parser's data components are. */
export function createInline(options: InlineOptions): Inline | null {
  const { def, fields: model, onEdit, onStructure } = options;
  const host = document.createElement("div");
  host.className = "rosetta-inline";
  host.innerHTML = options.html;
  const root = host.querySelector(":scope > [data-component] > dl.rosetta-fields");
  if (!root) return null;
  const edited = () => onEdit(model);
  let ok = true;

  function bindObject(dl: Element, defs: FieldDef[], obj: Fields, path: string) {
    for (const f of defs) {
      const row = children(dl, ".rosetta-field").find((r) => (r as HTMLElement).dataset.field === f.name);
      const dd = row && children(row, "dd")[0];
      if (!dd) {
        ok = false;
        return;
      }
      bindValue(dd, f, obj, f.name, `${path}${f.name}`);
    }
  }

  /** Where a value lives: `holder[key]`. */
  function bindValue(dd: Element, f: FieldDef, holder: Fields | unknown[], key: string | number, path: string) {
    const h = holder as Record<string | number, unknown>;
    if (f.type === "list") {
      const list = children(dd, "ul.rosetta-list")[0];
      if (!list) return void (ok = false);
      if (!Array.isArray(h[key])) h[key] = [];
      const items = h[key] as unknown[];
      const itemDef: FieldDef = f.items ?? { name: "item", type: "string" };
      const lis = children(list, "li");
      lis.slice(items.length).forEach((li) => li.remove()); // the stand-in item of an empty list
      items.forEach((_, i) => {
        const li = lis[i];
        if (!li) return void (ok = false);
        if (itemDef.type === "object") {
          const dl = children(li, "dl.rosetta-fields")[0];
          if (!dl) return void (ok = false);
          if (typeof items[i] !== "object" || items[i] === null) items[i] = {};
          bindObject(dl, itemDef.fields ?? [], items[i] as Fields, `${path}.${i}.`);
        } else {
          li.replaceChildren(control(itemDef, items, i, `${path}.${i}`));
        }
        li.classList.add("rosetta-inline-item");
        li.append(button("×", `Remove ${f.name} ${i + 1}`, "rosetta-inline-remove", () => {
          items.splice(i, 1);
          onEdit(model);
          onStructure(model);
        }));
      });
      dd.append(
        button(`+ ${f.name}`, `Add ${f.name}`, "rosetta-inline-add", () => {
          items.push(f.items ? defaultValue(f.items) : "");
          onEdit(model);
          onStructure(model, `${path}.${items.length - 1}`);
        }),
      );
      return;
    }
    if (f.type === "object") {
      const dl = children(dd, "dl.rosetta-fields")[0];
      if (!dl) return void (ok = false);
      if (typeof h[key] !== "object" || h[key] === null) h[key] = {};
      bindObject(dl, f.fields ?? [], h[key] as Fields, `${path}.`);
      return;
    }
    dd.replaceChildren(control(f, holder, key, path));
  }

  /** One control for a scalar, in place of the rendered value. */
  function control(f: FieldDef, holder: Fields | unknown[], key: string | number, path: string): HTMLElement {
    const h = holder as Record<string | number, unknown>;
    const set = (v: unknown) => {
      h[key] = v;
      edited();
    };
    const value = h[key];
    let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (f.type === "boolean") {
      input = document.createElement("input");
      input.type = "checkbox";
      input.checked = value === true;
      input.addEventListener("change", () => set((input as HTMLInputElement).checked));
    } else if (f.type === "enum") {
      const select = document.createElement("select");
      if (!f.required) select.append(new Option("", ""));
      for (const v of f.values ?? []) select.append(new Option(v, v));
      select.value = typeof value === "string" ? value : "";
      select.addEventListener("change", () => set(select.value === "" ? undefined : select.value));
      input = select;
    } else if (f.type === "number") {
      input = document.createElement("input");
      input.type = "number";
      input.value = typeof value === "number" ? String(value) : "";
      input.addEventListener("input", () => set(input.value === "" || Number.isNaN(Number(input.value)) ? undefined : Number(input.value)));
    } else {
      // A plain string is one line; otherwise it is Markdown and may take several.
      const one = f.plain || f.type === undefined;
      input = one ? document.createElement("input") : document.createElement("textarea");
      if (input instanceof HTMLInputElement) input.type = "text";
      else input.rows = 1;
      input.value = typeof value === "string" ? value : "";
      input.addEventListener("input", () => set(input.value === "" ? undefined : input.value));
    }
    input.className = "rosetta-inline-control";
    input.dataset.path = path;
    input.setAttribute("aria-label", path.replace(/\./g, " "));
    if (f.description) input.title = f.description;
    if (!(input instanceof HTMLSelectElement) && !(input instanceof HTMLInputElement && input.type === "checkbox")) input.placeholder = f.name;
    if (f.required) {
      // A required value that is empty is marked, as the preview says "Missing required field".
      const mark = () => input.classList.toggle("is-missing", input.value === "");
      input.addEventListener("input", mark);
      mark();
    }
    return input;
  }

  bindObject(root, fieldsOf(def), model, "");
  if (!ok) return null;
  if (options.focusPath !== undefined) {
    const target = [...host.querySelectorAll<HTMLElement>("[data-path]")].find((e) => e.dataset.path!.startsWith(options.focusPath!));
    queueMicrotask(() => target?.focus());
  }
  return { element: host };
}

function button(text: string, label: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.textContent = text;
  b.setAttribute("aria-label", label);
  b.addEventListener("click", onClick);
  return b;
}
