import m1 from "../definitions/m1-components.json" with { type: "json" };
import type { ComponentDefinition } from "./generated/types";

/**
 * Temporary definitions of the M1 components (statblock, readaloud, sidebar, pagebreak).
 * System plugins replace them in M6.
 */
export const m1Components: ComponentDefinition[] = m1 as ComponentDefinition[];
