/**
 * Derive CLI flag parsing from registry Zod object schemas (CRAFT-6168).
 * MCP already uses the same schemas; this closes CLI/MCP drift for flag shapes.
 */
import { z } from "zod";

export type CliFlagKind = "boolean" | "number" | "string" | "enum";

export interface CliFlagSpec {
  /** Extra flag names without -- (e.g. temperature for --temp). */
  aliases?: string[];
  enumValues?: string[];
  /** Primary flag without leading dashes (e.g. max-shift). */
  flag: string;
  /** CamelCase schema key (e.g. maxShiftMs). */
  key: string;
  kind: CliFlagKind;
  /** Null is allowed (optional nullable fields). */
  nullable: boolean;
  /**
   * When true, booleans accept --on / --off instead of --flag / --no-flag
   * (used by cuts-snap `enabled`).
   */
  onOff?: boolean;
  optional: boolean;
  /**
   * Boolean takes an explicit value: on|off, or on|off|inherit when nullable.
   * Used by cleanup-config category toggles.
   */
  valueBoolean?: boolean;
}

export interface ParseFlagsFromSchemaOptions {
  /**
   * Extra flag names per schema key (without --).
   * Example: { temperature: ["temperature"], brightness: ["brightness"] }
   * when primary renames are temp / bright.
   */
  aliases?: Record<string, readonly string[]>;
  /** Schema keys that use --on/--off for boolean true/false. */
  booleanOnOffKeys?: readonly string[];
  /**
   * Boolean keys that take an explicit on|off (or on|off|inherit if nullable)
   * value instead of presence flags.
   */
  booleanValueKeys?: readonly string[];
  /**
   * Flag tokens to ignore (e.g. --json for print mode).
   * Matched as full tokens including the -- prefix.
   */
  ignoreFlags?: readonly string[];
  /**
   * Map schema keys to flag names (without --).
   * Example: { maxShiftMs: "max-shift", crossfadeMs: "crossfade" }
   */
  renames?: Record<string, string>;
}

export function camelToKebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

function unwrapZod(type: z.ZodType): {
  base: z.ZodType;
  optional: boolean;
  nullable: boolean;
} {
  let base: z.ZodType = type;
  let optional = false;
  let nullable = false;
  for (let i = 0; i < 8; i++) {
    const def = (base as { def?: { type?: string; innerType?: z.ZodType } })
      .def;
    if (!def?.type) {
      break;
    }
    if (def.type === "optional") {
      optional = true;
      base = def.innerType as z.ZodType;
      continue;
    }
    if (def.type === "nullable") {
      nullable = true;
      base = def.innerType as z.ZodType;
      continue;
    }
    break;
  }
  return { base, optional, nullable };
}

function classifyZod(type: z.ZodType): {
  kind: CliFlagKind;
  enumValues?: string[];
  nullable: boolean;
  optional: boolean;
} {
  const { base, optional, nullable } = unwrapZod(type);
  const def = (
    base as { def?: { type?: string; entries?: Record<string, string> } }
  ).def;
  const t = def?.type ?? (base as { type?: string }).type;
  if (t === "boolean") {
    return { kind: "boolean", optional, nullable };
  }
  if (t === "number") {
    return { kind: "number", optional, nullable };
  }
  if (t === "enum") {
    const entries = def?.entries ?? {};
    const enumValues = Object.values(entries).map(String);
    return { kind: "enum", enumValues, optional, nullable };
  }
  if (t === "string") {
    return { kind: "string", optional, nullable };
  }
  return { kind: "string", optional, nullable };
}

/**
 * Build flag specs from a Zod object schema (registry action input).
 */
export function flagSpecsFromZodObject(
  schema: z.ZodObject<z.ZodRawShape>,
  options: ParseFlagsFromSchemaOptions = {}
): CliFlagSpec[] {
  const renames = options.renames ?? {};
  const aliases = options.aliases ?? {};
  const onOff = new Set(options.booleanOnOffKeys ?? []);
  const valueBools = new Set(options.booleanValueKeys ?? []);
  const specs: CliFlagSpec[] = [];
  for (const [key, field] of Object.entries(schema.shape)) {
    const { kind, enumValues, optional, nullable } = classifyZod(
      field as z.ZodType
    );
    const flag = renames[key] ?? camelToKebab(key);
    const extra = aliases[key] ?? [];
    const isValueBool = kind === "boolean" && (valueBools.has(key) || nullable);
    specs.push({
      key,
      flag,
      kind,
      optional,
      nullable,
      ...(enumValues ? { enumValues } : {}),
      ...(kind === "boolean" && onOff.has(key) ? { onOff: true } : {}),
      ...(isValueBool && !onOff.has(key) ? { valueBoolean: true } : {}),
      ...(extra.length > 0 ? { aliases: [...extra] } : {}),
    });
  }
  return specs;
}

export function usageFlagsFromSpecs(specs: readonly CliFlagSpec[]): string {
  const parts: string[] = [];
  for (const s of specs) {
    if (s.kind === "boolean" && s.onOff) {
      parts.push("[--on|--off]");
      continue;
    }
    if (s.kind === "boolean" && s.valueBoolean) {
      const vals = s.nullable ? "on|off|inherit" : "on|off";
      parts.push(`[--${s.flag} ${vals}]`);
      continue;
    }
    if (s.kind === "boolean") {
      parts.push(`[--${s.flag}|--no-${s.flag}]`);
      continue;
    }
    if (s.kind === "enum" && s.enumValues) {
      parts.push(`[--${s.flag} ${s.enumValues.join("|")}]`);
      continue;
    }
    if (s.kind === "number" && s.nullable) {
      parts.push(`[--${s.flag} <n|inherit>]`);
      continue;
    }
    parts.push(`[--${s.flag} <${s.kind === "number" ? "n" : "value"}>]`);
  }
  return parts.join(" ");
}

function indexSpecsByFlag(
  specs: readonly CliFlagSpec[]
): Map<string, CliFlagSpec> {
  const byFlag = new Map<string, CliFlagSpec>();
  for (const s of specs) {
    byFlag.set(s.flag, s);
    for (const a of s.aliases ?? []) {
      byFlag.set(a, s);
    }
  }
  return byFlag;
}

function parseBooleanValue(
  value: string,
  flag: string,
  nullable: boolean
): boolean | null {
  const mode = value.toLowerCase();
  if (mode === "on") {
    return true;
  }
  if (mode === "off") {
    return false;
  }
  if (nullable && mode === "inherit") {
    return null;
  }
  throw new Error(
    nullable
      ? `${flag} must be on, off, or inherit`
      : `${flag} must be on or off`
  );
}

/**
 * Parse argv flag tokens (no positional args) into a partial input object,
 * then validate with the Zod schema.
 */
export function parseFlagsWithZodSchema(
  schema: z.ZodObject<z.ZodRawShape>,
  flags: readonly string[],
  options: ParseFlagsFromSchemaOptions = {}
): Record<string, unknown> {
  const specs = flagSpecsFromZodObject(schema, options);
  const byFlag = indexSpecsByFlag(specs);
  const ignore = new Set(options.ignoreFlags ?? []);
  const raw: Record<string, unknown> = {};

  let i = 0;
  while (i < flags.length) {
    const tok = flags[i];
    if (ignore.has(tok)) {
      i += 1;
      continue;
    }
    if (tok === "--on" || tok === "--off") {
      const onOffSpec = specs.find((s) => s.onOff);
      if (!onOffSpec) {
        throw new Error(`unexpected flag ${tok}`);
      }
      raw[onOffSpec.key] = tok === "--on";
      i += 1;
      continue;
    }
    if (!tok.startsWith("--")) {
      throw new Error(`unexpected argument ${tok} (expected a --flag)`);
    }
    const body = tok.slice(2);
    if (body.startsWith("no-")) {
      const flag = body.slice(3);
      const spec = byFlag.get(flag);
      if (spec?.kind !== "boolean" || spec.onOff || spec.valueBoolean) {
        throw new Error(`unknown flag ${tok}`);
      }
      raw[spec.key] = false;
      i += 1;
      continue;
    }
    const spec = byFlag.get(body);
    if (!spec) {
      throw new Error(`unknown flag ${tok}`);
    }
    if (spec.kind === "boolean" && !spec.valueBoolean) {
      raw[spec.key] = true;
      i += 1;
      continue;
    }
    const value = flags[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${tok} requires a value`);
    }
    if (spec.kind === "boolean" && spec.valueBoolean) {
      raw[spec.key] = parseBooleanValue(value, tok, spec.nullable);
    } else if (spec.kind === "number") {
      if (spec.nullable && value.toLowerCase() === "inherit") {
        raw[spec.key] = null;
      } else {
        const n = Number(value);
        if (!Number.isFinite(n)) {
          throw new Error(
            spec.nullable
              ? `${tok} must be a number or inherit`
              : `${tok} must be a number`
          );
        }
        raw[spec.key] = n;
      }
    } else if (spec.kind === "enum") {
      if (spec.enumValues && !spec.enumValues.includes(value)) {
        throw new Error(
          `${tok} must be one of ${spec.enumValues.join(", ")} (got ${value})`
        );
      }
      raw[spec.key] = value;
    } else {
      raw[spec.key] = value;
    }
    i += 2;
  }

  const partial = schema.partial();
  const parsed = partial.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((iss) => {
        const path = iss.path.join(".");
        return path ? `${path}: ${iss.message}` : iss.message;
      })
      .join("; ");
    throw new Error(detail || "invalid flags");
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data as Record<string, unknown>)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

/** Assert registry action schema is a Zod object (flag derivation requires .shape). */
export function asZodObject(
  schema: z.ZodType,
  actionName: string
): z.ZodObject<z.ZodRawShape> {
  if (!(schema instanceof z.ZodObject)) {
    throw new Error(
      `action "${actionName}" schema is not a Zod object; cannot derive CLI flags`
    );
  }
  return schema as z.ZodObject<z.ZodRawShape>;
}

/**
 * Parse flags for a named registry action (CLI surface).
 * Throws if the action is missing or not a Zod object schema.
 */
export function parseRegistryActionFlags(
  action: { name: string; schema: z.ZodType },
  flags: readonly string[],
  options: ParseFlagsFromSchemaOptions = {}
): Record<string, unknown> {
  return parseFlagsWithZodSchema(
    asZodObject(action.schema, action.name),
    flags,
    options
  );
}
