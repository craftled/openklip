/**
 * Derive CLI flag parsing from registry Zod object schemas (CRAFT-6168).
 * MCP already uses the same schemas; this closes CLI/MCP drift for flag shapes.
 * Nested objects flatten to leaf flags (e.g. ducking.enabled → --duck).
 */
import { z } from "zod";

export type CliFlagKind = "boolean" | "number" | "string" | "enum";

export interface CliFlagSpec {
  /** Extra flag names without -- (e.g. temperature for --temp). */
  aliases?: string[];
  enumValues?: string[];
  /** Primary flag without leading dashes (e.g. max-shift). */
  flag: string;
  /**
   * Dotted path used for renames/aliases lookup
   * (e.g. "ducking.enabled", "maxShiftMs").
   */
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
  /** Nested path segments into the action input object. */
  path: string[];
  /**
   * Boolean takes an explicit value: on|off, or on|off|inherit when nullable.
   * Used by cleanup-config category toggles and audio --duck on|off.
   */
  valueBoolean?: boolean;
}

export interface ParseFlagsFromSchemaOptions {
  /**
   * Extra flag names per schema key (dotted path or top-level key).
   * Example: { temperature: ["temperature"] } or { "ducking.enabled": [] }
   */
  aliases?: Record<string, readonly string[]>;
  /** Schema keys (dotted) that use --on/--off for boolean true/false. */
  booleanOnOffKeys?: readonly string[];
  /**
   * Boolean keys (dotted) that take an explicit on|off (or on|off|inherit if
   * nullable) value instead of presence flags.
   */
  booleanValueKeys?: readonly string[];
  /**
   * Flag tokens to ignore (e.g. --json for print mode).
   * Matched as full tokens including the -- prefix.
   */
  ignoreFlags?: readonly string[];
  /**
   * Map schema keys (dotted path or leaf name) to flag names (without --).
   * Example: { maxShiftMs: "max-shift", "ducking.enabled": "duck" }
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

function isZodObject(type: z.ZodType): type is z.ZodObject<z.ZodRawShape> {
  const { base } = unwrapZod(type);
  return (
    base instanceof z.ZodObject ||
    (base as { def?: { type?: string } }).def?.type === "object"
  );
}

function objectShape(type: z.ZodType): z.ZodRawShape {
  const { base } = unwrapZod(type);
  if (base instanceof z.ZodObject) {
    return base.shape;
  }
  const shape = (base as { shape?: z.ZodRawShape }).shape;
  if (shape) {
    return shape;
  }
  throw new Error("expected Zod object shape");
}

function classifyLeaf(type: z.ZodType): {
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

function resolveFlagName(
  pathKey: string,
  leaf: string,
  renames: Record<string, string>
): string {
  return renames[pathKey] ?? renames[leaf] ?? camelToKebab(leaf);
}

/**
 * Build flag specs from a Zod object schema (registry action input).
 * Nested objects are flattened to leaf flags.
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

  const walk = (shape: z.ZodRawShape, path: string[]) => {
    for (const [leaf, field] of Object.entries(shape)) {
      const nextPath = [...path, leaf];
      const pathKey = nextPath.join(".");
      if (isZodObject(field as z.ZodType)) {
        walk(objectShape(field as z.ZodType), nextPath);
        continue;
      }
      const { kind, enumValues, optional, nullable } = classifyLeaf(
        field as z.ZodType
      );
      const flag = resolveFlagName(pathKey, leaf, renames);
      const extra = aliases[pathKey] ?? aliases[leaf] ?? [];
      const isValueBool =
        kind === "boolean" &&
        (valueBools.has(pathKey) || valueBools.has(leaf) || nullable);
      const isOnOff =
        kind === "boolean" && (onOff.has(pathKey) || onOff.has(leaf));
      specs.push({
        key: pathKey,
        path: nextPath,
        flag,
        kind,
        optional,
        nullable,
        ...(enumValues ? { enumValues } : {}),
        ...(isOnOff ? { onOff: true } : {}),
        ...(isValueBool && !isOnOff ? { valueBoolean: true } : {}),
        ...(extra.length > 0 ? { aliases: [...extra] } : {}),
      });
    }
  };

  walk(schema.shape, []);
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

function setPath(
  obj: Record<string, unknown>,
  path: readonly string[],
  value: unknown
): void {
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const p = path[i];
    const next = cur[p];
    if (next === undefined || next === null || typeof next !== "object") {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[path[path.length - 1]] = value;
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
      setPath(raw, onOffSpec.path, tok === "--on");
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
      setPath(raw, spec.path, false);
      i += 1;
      continue;
    }
    const spec = byFlag.get(body);
    if (!spec) {
      throw new Error(`unknown flag ${tok}`);
    }
    if (spec.kind === "boolean" && !spec.valueBoolean) {
      setPath(raw, spec.path, true);
      i += 1;
      continue;
    }
    const value = flags[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${tok} requires a value`);
    }
    if (spec.kind === "boolean" && spec.valueBoolean) {
      setPath(raw, spec.path, parseBooleanValue(value, tok, spec.nullable));
    } else if (spec.kind === "number") {
      if (spec.nullable && value.toLowerCase() === "inherit") {
        setPath(raw, spec.path, null);
      } else {
        const n = Number(value);
        if (!Number.isFinite(n)) {
          throw new Error(
            spec.nullable
              ? `${tok} must be a number or inherit`
              : `${tok} must be a number`
          );
        }
        setPath(raw, spec.path, n);
      }
    } else if (spec.kind === "enum") {
      if (spec.enumValues && !spec.enumValues.includes(value)) {
        throw new Error(
          `${tok} must be one of ${spec.enumValues.join(", ")} (got ${value})`
        );
      }
      setPath(raw, spec.path, value);
    } else {
      setPath(raw, spec.path, value);
    }
    i += 2;
  }

  // Deep-partial: top-level .partial() keeps nested objects strict about
  // unknown keys but leaves nested fields optional when the nested schema
  // marks them optional (registry shapes do).
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

/** Shared renames for openklip audio <slug> flags. */
export const AUDIO_CLI_FLAG_OPTS: ParseFlagsFromSchemaOptions = {
  renames: {
    "ducking.enabled": "duck",
    "ducking.amountDb": "duck-amount",
    "ducking.attackMs": "duck-attack",
    "ducking.releaseMs": "duck-release",
    "loudness.enabled": "loudness",
    "loudness.targetLufs": "loudness-target",
    "loudness.mode": "loudness-mode",
    "noiseReduction.enabled": "noise-reduction",
    "noiseReduction.nr": "noise-strength",
    "voiceHighpass.enabled": "highpass",
    "voiceHighpass.hz": "highpass-hz",
    "deEsser.enabled": "deess",
    "deEsser.intensity": "deess-intensity",
  },
  booleanValueKeys: [
    "ducking.enabled",
    "loudness.enabled",
    "noiseReduction.enabled",
    "voiceHighpass.enabled",
    "deEsser.enabled",
  ],
};

/** Shared renames for openklip export-set flags. */
export const EXPORT_SET_CLI_FLAG_OPTS: ParseFlagsFromSchemaOptions = {
  renames: {
    cropMode: "crop-mode",
    "crop.focusX": "crop-focus-x",
    "crop.focusY": "crop-focus-y",
    "crop.scale": "crop-scale",
    "splitVertical.ratio": "split-ratio",
    "splitVertical.speakerPosition": "split-speaker",
  },
};
