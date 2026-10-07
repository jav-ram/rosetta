import Ajv2020 from "ajv/dist/2020.js";
import { schemas } from "./schemas";
import type { ComponentDefinition, Document, Warning } from "./generated/types";

export interface ValidationResult {
  valid: boolean;
  /** Human-readable messages, empty when valid. */
  errors: string[];
}

const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
for (const [key, schema] of Object.entries(schemas)) ajv.addSchema(schema, key);

function validator(key: keyof typeof schemas) {
  const validate = ajv.getSchema(key);
  if (!validate) throw new Error(`schema not found: ${key}`);
  return (value: unknown): ValidationResult => {
    const valid = validate(value) as boolean;
    return {
      valid,
      errors: valid ? [] : (validate.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`),
    };
  };
}

export const validateDocument = validator("ast.schema.json") as (value: unknown) => ValidationResult;
export const validateComponentDefinition = validator("component-definition.schema.json") as (
  value: unknown,
) => ValidationResult;
export const validateWarning = validator("warning.schema.json") as (value: unknown) => ValidationResult;

/** Type guards for callers that want narrowing after a successful validation. */
export const isDocument = (v: unknown): v is Document => validateDocument(v).valid;
export const isComponentDefinition = (v: unknown): v is ComponentDefinition => validateComponentDefinition(v).valid;
export const isWarning = (v: unknown): v is Warning => validateWarning(v).valid;
