import assetRef from "../schemas/asset-ref.schema.json" with { type: "json" };
import ast from "../schemas/ast.schema.json" with { type: "json" };
import chapter from "../schemas/chapter.schema.json" with { type: "json" };
import componentDefinition from "../schemas/component-definition.schema.json" with { type: "json" };
import manifest from "../schemas/manifest.schema.json" with { type: "json" };
import position from "../schemas/position.schema.json" with { type: "json" };
import projectSummary from "../schemas/project-summary.schema.json" with { type: "json" };
import theme from "../schemas/theme.schema.json" with { type: "json" };
import warning from "../schemas/warning.schema.json" with { type: "json" };

/** The JSON Schemas, keyed by file name (which is also how they `$ref` each other). */
export const schemas = {
  "asset-ref.schema.json": assetRef,
  "ast.schema.json": ast,
  "chapter.schema.json": chapter,
  "component-definition.schema.json": componentDefinition,
  "manifest.schema.json": manifest,
  "position.schema.json": position,
  "project-summary.schema.json": projectSummary,
  "theme.schema.json": theme,
  "warning.schema.json": warning,
} as const;
