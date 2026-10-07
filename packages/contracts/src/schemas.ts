import ast from "../schemas/ast.schema.json" with { type: "json" };
import componentDefinition from "../schemas/component-definition.schema.json" with { type: "json" };
import position from "../schemas/position.schema.json" with { type: "json" };
import warning from "../schemas/warning.schema.json" with { type: "json" };

/** The JSON Schemas, keyed by file name (which is also how they `$ref` each other). */
export const schemas = {
  "ast.schema.json": ast,
  "component-definition.schema.json": componentDefinition,
  "position.schema.json": position,
  "warning.schema.json": warning,
} as const;
