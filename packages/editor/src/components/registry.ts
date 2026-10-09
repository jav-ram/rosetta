import type { ComponentDefinition } from "@rosetta/contracts";

export type Definition = ComponentDefinition;

/** Field definitions nest (lists, objects); the generated type only goes one level, so this one is used for the form. */
export interface FieldDef {
  name: string;
  type: "string" | "number" | "boolean" | "enum" | "list" | "object";
  required?: boolean;
  default?: unknown;
  plain?: boolean;
  values?: string[];
  items?: FieldDef;
  fields?: FieldDef[];
  description?: string;
}

/** Components the editor knows how to edit, looked up by name. Definitions are data: nothing here names a component. */
export interface Registry {
  get(name: string): Definition | undefined;
  all(): Definition[];
}

export function createRegistry(definitions: Definition[] = []): Registry {
  const byName = new Map(definitions.map((d) => [d.name, d]));
  return { get: (name) => byName.get(name), all: () => [...byName.values()] };
}

/** What the editor shows for a component that gets a form: its fields and attributes. */
export const fieldsOf = (def: Definition): FieldDef[] => (def.fields ?? []) as unknown as FieldDef[];

/** The starting value for a new component or list item: declared defaults, and empty containers for what is nested. */
export function defaultValue(field: FieldDef): unknown {
  if (field.default !== undefined) return structuredClone(field.default);
  switch (field.type) {
    case "object":
      return defaults(field.fields ?? []);
    case "list":
      return [];
    case "boolean":
      return false;
    case "number":
      return 0;
    case "enum":
      return field.values?.[0] ?? "";
    default:
      return "";
  }
}

/** Default values for the fields that have one; others are left out so nothing invalid is invented. */
export function defaults(fields: FieldDef[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) if (f.default !== undefined) out[f.name] = structuredClone(f.default);
  return out;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
