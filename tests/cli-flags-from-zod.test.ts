import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import {
  camelToKebab,
  flagSpecsFromZodObject,
  parseFlagsWithZodSchema,
  usageFlagsFromSpecs,
} from "../src/cli-flags-from-zod.ts";
import { getAction } from "../src/registry.ts";

test("camelToKebab converts maxShiftMs", () => {
  assert.equal(camelToKebab("maxShiftMs"), "max-shift-ms");
  assert.equal(camelToKebab("padMs"), "pad-ms");
});

test("flagSpecsFromZodObject derives cuts-snap fields with renames", () => {
  const action = getAction("cuts-snap");
  assert.ok(action);
  const specs = flagSpecsFromZodObject(action.schema, {
    renames: { maxShiftMs: "max-shift", crossfadeMs: "crossfade" },
    booleanOnOffKeys: ["enabled"],
  });
  const byKey = Object.fromEntries(specs.map((s) => [s.key, s]));
  assert.equal(byKey.enabled?.kind, "boolean");
  assert.equal(byKey.enabled?.onOff, true);
  assert.equal(byKey.mode?.kind, "enum");
  assert.deepEqual(byKey.mode?.enumValues, ["off", "vad"]);
  assert.equal(byKey.maxShiftMs?.flag, "max-shift");
  assert.equal(byKey.crossfadeMs?.flag, "crossfade");
});

test("parseFlagsWithZodSchema validates enum and maps renames", () => {
  const action = getAction("cuts-snap");
  assert.ok(action);
  const opts = {
    renames: { maxShiftMs: "max-shift", crossfadeMs: "crossfade" },
    booleanOnOffKeys: ["enabled"] as const,
  };
  assert.deepEqual(
    parseFlagsWithZodSchema(
      action.schema,
      ["--on", "--mode", "vad", "--max-shift", "40", "--crossfade", "12"],
      opts
    ),
    { enabled: true, mode: "vad", maxShiftMs: 40, crossfadeMs: 12 }
  );
  assert.deepEqual(parseFlagsWithZodSchema(action.schema, ["--off"], opts), {
    enabled: false,
  });
  assert.throws(
    () => parseFlagsWithZodSchema(action.schema, ["--mode", "nope"], opts),
    /off, vad|one of/
  );
});

test("parseFlagsWithZodSchema empty flags yields empty object", () => {
  const action = getAction("cuts-snap");
  assert.ok(action);
  assert.deepEqual(parseFlagsWithZodSchema(action.schema, []), {});
});

test("parseFlagsWithZodSchema pad-like single number field", () => {
  const schema = z.object({ padMs: z.number() });
  // Positional pad is not flag-based; flags path for optional numeric:
  const partial = z.object({ padMs: z.number().optional() });
  assert.deepEqual(parseFlagsWithZodSchema(partial, ["--pad-ms", "80"]), {
    padMs: 80,
  });
  assert.throws(() => parseFlagsWithZodSchema(schema.partial(), ["--pad-ms"]));
});

test("usageFlagsFromSpecs includes on/off and enum", () => {
  const schema = z.object({
    enabled: z.boolean().optional(),
    mode: z.enum(["off", "vad"]).optional(),
  });
  const specs = flagSpecsFromZodObject(schema, {
    booleanOnOffKeys: ["enabled"],
  });
  const usage = usageFlagsFromSpecs(specs);
  assert.match(usage, /--on\|--off/);
  assert.match(usage, /--mode off\|vad/);
});
