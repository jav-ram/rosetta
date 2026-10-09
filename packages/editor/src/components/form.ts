import { defaultValue, deepEqual, fieldsOf, type Definition, type FieldDef } from "./registry";

export interface FormValue {
  attributes: Record<string, string>;
  /** Only for data components. */
  fields: Record<string, unknown>;
}

export interface Form {
  element: HTMLElement;
  /** True when the form already shows this value (so an update caused by the form itself can be ignored). */
  shows(value: FormValue): boolean;
  /** Shows another value, rebuilding the form. */
  set(value: FormValue): void;
}

type Setter = (value: unknown) => void;

/**
 * Builds the form for a component from its definition: one control per attribute and per field.
 * string -> text box (a text area unless `plain`), number, boolean -> checkbox, enum -> select,
 * list -> repeatable group, object -> group. `onChange` gets the whole new value after every edit;
 * empty values are left out.
 */
export function createForm(def: Definition, initial: FormValue, onChange: (value: FormValue) => void): Form {
  const doc = document;
  const element = doc.createElement("form");
  element.className = "rosetta-form";
  element.addEventListener("submit", (e) => e.preventDefault());
  let model: FormValue = clone(initial);

  const emit = () => onChange(ordered(prune(model), def));

  function build() {
    element.replaceChildren();
    const attributes = def.attributes ?? [];
    if (attributes.length) {
      const group = section("Attributes");
      for (const a of attributes) {
        const field: FieldDef = { name: a.name, type: a.type, required: a.required, values: a.values, description: a.description, plain: true };
        // Attribute values are strings in the document ("true", "12"), whatever the type says.
        const current = model.attributes[a.name];
        const typed = a.type === "boolean" ? current === "true" : a.type === "number" ? (current === undefined ? undefined : Number(current)) : current;
        group.append(
          control(field, typed, (v) => {
            if (v === undefined || v === "" || v === false) delete model.attributes[a.name];
            else model.attributes[a.name] = String(v);
            emit();
          }),
        );
      }
      element.append(group);
    }
    const fields = fieldsOf(def);
    if (fields.length) {
      const group = section("Fields");
      for (const f of fields) {
        group.append(
          control(f, model.fields[f.name], (v) => {
            model.fields[f.name] = v;
            emit();
          }),
        );
      }
      element.append(group);
    }
  }

  function section(title: string): HTMLElement {
    const el = doc.createElement("fieldset");
    el.className = "rosetta-form-section";
    const legend = doc.createElement("legend");
    legend.textContent = title;
    el.append(legend);
    return el;
  }

  /** One labelled control. `set` receives the new value, or undefined when the control was emptied. */
  function control(field: FieldDef, value: unknown, set: Setter): HTMLElement {
    const wrap = doc.createElement("div");
    wrap.className = `rosetta-form-field rosetta-form-${field.type}`;
    wrap.dataset.field = field.name;
    const label = doc.createElement("label");
    label.textContent = field.name + (field.required ? " *" : "");
    if (field.description) label.title = field.description;

    switch (field.type) {
      case "list": {
        const items = Array.isArray(value) ? (value as unknown[]) : [];
        const list = doc.createElement("div");
        list.className = "rosetta-form-list";
        items.forEach((item, i) => {
          const row = doc.createElement("div");
          row.className = "rosetta-form-item";
          row.append(
            control({ ...(field.items ?? { type: "string" }), name: `${field.name} ${i + 1}` } as FieldDef, item, (v) => {
              items[i] = v;
              set(items);
            }),
          );
          row.append(button("Remove", `Remove ${field.name} ${i + 1}`, () => {
            items.splice(i, 1);
            set(items);
            build();
          }));
          list.append(row);
        });
        list.append(
          button("Add", `Add ${field.name}`, () => {
            items.push(field.items ? defaultValue(field.items) : "");
            set(items);
            build();
          }),
        );
        wrap.append(label, list);
        return wrap;
      }
      case "object": {
        const members = { ...((value as Record<string, unknown> | undefined) ?? {}) };
        const group = doc.createElement("div");
        group.className = "rosetta-form-object";
        for (const sub of field.fields ?? []) {
          group.append(
            control(sub, members[sub.name], (v) => {
              members[sub.name] = v;
              set(members);
            }),
          );
        }
        wrap.append(label, group);
        return wrap;
      }
      case "boolean": {
        const input = doc.createElement("input");
        input.type = "checkbox";
        input.checked = value === true;
        input.id = uid();
        label.htmlFor = input.id;
        input.addEventListener("change", () => set(input.checked));
        wrap.append(input, label);
        return wrap;
      }
      case "enum": {
        const select = doc.createElement("select");
        select.id = uid();
        label.htmlFor = select.id;
        if (!field.required) select.append(option("", ""));
        for (const v of field.values ?? []) select.append(option(v, v));
        select.value = typeof value === "string" ? value : "";
        select.addEventListener("change", () => set(select.value === "" ? undefined : select.value));
        wrap.append(label, select);
        return wrap;
      }
      case "number": {
        const input = doc.createElement("input");
        input.type = "number";
        input.id = uid();
        label.htmlFor = input.id;
        input.value = typeof value === "number" ? String(value) : "";
        input.addEventListener("input", () => set(input.value === "" || Number.isNaN(Number(input.value)) ? undefined : Number(input.value)));
        wrap.append(label, input);
        return wrap;
      }
      default: {
        // A plain string is one line; otherwise it is Markdown and may take several.
        const input = field.plain || field.type === undefined ? doc.createElement("input") : doc.createElement("textarea");
        if (input instanceof HTMLInputElement) input.type = "text";
        else input.rows = 3;
        input.id = uid();
        label.htmlFor = input.id;
        input.value = typeof value === "string" ? value : "";
        input.addEventListener("input", () => set(input.value === "" ? undefined : input.value));
        wrap.append(label, input);
        return wrap;
      }
    }
  }

  build();
  return {
    element,
    shows: (value) => deepEqual(prune(model), prune(clone(value))),
    set(value) {
      model = clone(value);
      build();
    },
  };
}

let counter = 0;
const uid = () => `rosetta-form-${++counter}`;

function button(text: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  b.setAttribute("aria-label", label);
  b.addEventListener("click", onClick);
  return b;
}

function option(value: string, text: string): HTMLOptionElement {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = text;
  return o;
}

const clone = (v: FormValue): FormValue => ({ attributes: { ...v.attributes }, fields: structuredClone(v.fields ?? {}) });

/** Puts every group of fields in the order of the definition (the order authors expect), keeping any others after them. */
function ordered(v: FormValue, def: Definition): FormValue {
  return { attributes: v.attributes, fields: orderFields(v.fields, fieldsOf(def)) };
}

function orderFields(values: Record<string, unknown>, fields: FieldDef[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (f.name in values) out[f.name] = orderValue(values[f.name], f);
  for (const k of Object.keys(values)) if (!(k in out)) out[k] = values[k];
  return out;
}

function orderValue(value: unknown, field: FieldDef): unknown {
  if (field.type === "object" && value && typeof value === "object") return orderFields(value as Record<string, unknown>, field.fields ?? []);
  if (field.type === "list" && Array.isArray(value) && field.items) return value.map((item) => orderValue(item, field.items!));
  return value;
}

/** Drops what is empty: undefined values, empty lists and empty groups. */
function prune(v: FormValue): FormValue {
  return { attributes: { ...v.attributes }, fields: (pruneValue(v.fields) as Record<string, unknown>) ?? {} };
}

function pruneValue(v: unknown): unknown {
  if (Array.isArray(v)) {
    const items = v.map(pruneValue).filter((x) => x !== undefined);
    return items.length ? items : undefined;
  }
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      const p = pruneValue(x);
      if (p !== undefined) out[k] = p;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return v;
}
