/**
 * Writes plain data as the YAML subset the spec allows (section 4.1): block mappings and sequences, scalars,
 * block scalars for multi-line text. Every string that could be read back as something else (a number, `null`,
 * a date, text with `: `) is double-quoted, so reading the output returns exactly the same data.
 */

type Data = null | boolean | number | string | Data[] | { [key: string]: Data | undefined };

const KEY = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const NUMBERISH = /^[-+]?(\d[\d_,]*\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const WORDS = /^(null|true|false|yes|no|on|off|y|n|~)$/i;

export function yamlMapping(data: { [key: string]: Data | undefined }, indent = 0): string[] {
  return Object.entries(data).flatMap(([key, value]) => (value === undefined ? [] : entry(`${" ".repeat(indent)}${keyText(key)}:`, value, indent)));
}

const keyText = (key: string) => (KEY.test(key) ? key : JSON.stringify(key));

/** Lines for `${head}` followed by a value; `head` is `key:` or `-`, indented already. */
function entry(head: string, value: Data, indent: number): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${head} []`];
    return [head, ...sequence(value, indent + 2)];
  }
  if (value !== null && typeof value === "object") {
    if (Object.keys(value).length === 0) return [`${head} {}`];
    return [head, ...yamlMapping(value, indent + 2)];
  }
  if (typeof value === "string" && blockScalar(value)) {
    const [header, ...lines] = blockScalar(value)!;
    return [`${head} ${header}`, ...lines.map((l) => (l === "" ? "" : `${" ".repeat(indent + 2)}${l}`))];
  }
  return [`${head} ${scalar(value)}`];
}

function sequence(items: Data[], indent: number): string[] {
  const pad = " ".repeat(indent);
  return items.flatMap((item) => {
    if (item !== null && typeof item === "object" && !Array.isArray(item) && Object.keys(item).length > 0) {
      // `- key: value` with the other keys lined up under the first one.
      const [first, ...rest] = yamlMapping(item, indent + 2);
      return [`${pad}- ${first!.slice(indent + 2)}`, ...rest];
    }
    return entry(`${pad}-`, item, indent);
  });
}

function scalar(value: null | boolean | number | string): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : JSON.stringify(String(value));
  return plainSafe(value) ? value : JSON.stringify(value);
}

function plainSafe(s: string): boolean {
  if (s === "" || s !== s.trim() || /[\x00-\x1f\x7f\u2028\u2029]/.test(s)) return false;
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(s) && !/^-[^\s-]/.test(s)) return false; // indicators; "-x" is fine
  if (/: |:$| #/.test(s)) return false;
  if (WORDS.test(s) || NUMBERISH.test(s) || /^0[xob]/i.test(s) || /^[-+]?\.(inf|nan)$/i.test(s)) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return false; // would be read as a date
  return true;
}

/** `|` form for multi-line text, or null when quoting is safer. Returns the header and the lines. */
function blockScalar(s: string): [string, ...string[]] | null {
  if (!s.includes("\n") || /[\r\x00-\x08\x0b-\x1f\x7f\u2028\u2029]/.test(s) || /^[ \n\t]/.test(s) || /\n\n+$/.test(s)) return null;
  const keep = s.endsWith("\n");
  const lines = (keep ? s.slice(0, -1) : s).split("\n");
  if (lines.some((l) => /^\s+$/.test(l) && l !== "")) return null; // whitespace-only lines
  return [keep ? "|" : "|-", ...lines];
}
