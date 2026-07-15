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

test("parseFlagsWithZodSchema motion renames", () => {
  const action = getAction("motion");
  assert.ok(action);
  const opts = {
    renames: {
      fadeMs: "fade",
      heroFadeMs: "hero-fade",
      slideFrac: "slide",
    },
  };
  assert.deepEqual(
    parseFlagsWithZodSchema(
      action.schema as z.ZodObject<z.ZodRawShape>,
      [
        "--speed",
        "1.4",
        "--fade",
        "100",
        "--hero-fade",
        "200",
        "--slide",
        "0.1",
      ],
      opts
    ),
    { speed: 1.4, fadeMs: 100, heroFadeMs: 200, slideFrac: 0.1 }
  );
});

test("parseFlagsWithZodSchema look-color aliases and reset", () => {
  const action = getAction("look-color");
  assert.ok(action);
  const opts = {
    renames: {
      temperature: "temp",
      brightness: "bright",
      saturation: "sat",
    },
    aliases: {
      temperature: ["temperature"],
      brightness: ["brightness"],
      saturation: ["saturation"],
    },
  };
  assert.deepEqual(
    parseFlagsWithZodSchema(
      action.schema as z.ZodObject<z.ZodRawShape>,
      ["--temperature", "0.2", "--sat", "1.1"],
      opts
    ),
    { temperature: 0.2, saturation: 1.1 }
  );
  assert.deepEqual(
    parseFlagsWithZodSchema(
      action.schema as z.ZodObject<z.ZodRawShape>,
      ["--reset"],
      opts
    ),
    { reset: true }
  );
});

test("parseFlagsWithZodSchema cleanup-config nullable inherit and toggles", () => {
  const action = getAction("cleanup-config");
  assert.ok(action);
  const opts = {
    renames: { minSec: "min-sec", keepPadSec: "keep-pad-sec" },
    ignoreFlags: ["--json"],
  };
  assert.deepEqual(
    parseFlagsWithZodSchema(
      action.schema as z.ZodObject<z.ZodRawShape>,
      [
        "--min-sec",
        "1.5",
        "--keep-pad-sec",
        "inherit",
        "--hedging",
        "off",
        "--repeat",
        "on",
        "--json",
      ],
      opts
    ),
    {
      minSec: 1.5,
      keepPadSec: null,
      hedging: false,
      repeat: true,
    }
  );
});
