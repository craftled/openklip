import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import {
  AUDIO_CLI_FLAG_OPTS,
  camelToKebab,
  EXPORT_SET_CLI_FLAG_OPTS,
  flagSpecsFromZodObject,
  overlayAddFlagOpts,
  overlaySetFlagOpts,
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

test("parseFlagsWithZodSchema nests audio flags under ducking/deEsser", () => {
  const action = getAction("audio");
  assert.ok(action);
  assert.deepEqual(
    parseFlagsWithZodSchema(
      action.schema as z.ZodObject<z.ZodRawShape>,
      [
        "--duck",
        "on",
        "--duck-amount",
        "8",
        "--deess",
        "on",
        "--deess-intensity",
        "0.7",
        "--loudness-mode",
        "two-pass",
      ],
      AUDIO_CLI_FLAG_OPTS
    ),
    {
      ducking: { enabled: true, amountDb: 8 },
      deEsser: { enabled: true, intensity: 0.7 },
      loudness: { mode: "two-pass" },
    }
  );
  assert.throws(
    () =>
      parseFlagsWithZodSchema(
        action.schema as z.ZodObject<z.ZodRawShape>,
        ["--deess", "maybe"],
        AUDIO_CLI_FLAG_OPTS
      ),
    /on or off/
  );
});

test("parseFlagsWithZodSchema nests export-set crop and split flags", () => {
  const action = getAction("export-set");
  assert.ok(action);
  assert.deepEqual(
    parseFlagsWithZodSchema(
      action.schema as z.ZodObject<z.ZodRawShape>,
      [
        "--aspect",
        "9:16",
        "--crop-mode",
        "manual",
        "--crop-focus-x",
        "0.4",
        "--crop-focus-y",
        "0.6",
        "--crop-scale",
        "1.2",
        "--layout",
        "split-vertical",
        "--split-ratio",
        "0.5",
        "--split-speaker",
        "top",
      ],
      EXPORT_SET_CLI_FLAG_OPTS
    ),
    {
      aspect: "9:16",
      cropMode: "manual",
      crop: { focusX: 0.4, focusY: 0.6, scale: 1.2 },
      layout: "split-vertical",
      splitVertical: { ratio: 0.5, speakerPosition: "top" },
    }
  );
});

test("parseFlagsWithZodSchema positionals for broll-set and music-add", () => {
  const setAction = getAction("broll-set");
  assert.ok(setAction);
  assert.deepEqual(
    parseFlagsWithZodSchema(
      setAction.schema as z.ZodObject<z.ZodRawShape>,
      ["b1", "--from", "1.5", "--to", "3", "--display", "pip"],
      overlaySetFlagOpts()
    ),
    { id: "b1", fromSec: 1.5, toSec: 3, display: "pip" }
  );

  const addAction = getAction("music-add");
  assert.ok(addAction);
  assert.deepEqual(
    parseFlagsWithZodSchema(
      addAction.schema as z.ZodObject<z.ZodRawShape>,
      ["m1", "0", "10", "--gain", "0.3", "--mode", "loop"],
      overlayAddFlagOpts([
        { key: "assetId" },
        { key: "fromSec", kind: "number" },
        { key: "toSec", kind: "number" },
      ])
    ),
    {
      assetId: "m1",
      fromSec: 0,
      toSec: 10,
      gain: 0.3,
      mode: "loop",
    }
  );
});

test("parseFlagsWithZodSchema positionals on-off and rest text", () => {
  const captions = getAction("captions");
  assert.ok(captions);
  assert.deepEqual(
    parseFlagsWithZodSchema(
      captions.schema as z.ZodObject<z.ZodRawShape>,
      ["off"],
      { positionals: [{ key: "enabled", kind: "on-off" }] }
    ),
    { enabled: false }
  );

  const wordText = getAction("word-text");
  assert.ok(wordText);
  assert.deepEqual(
    parseFlagsWithZodSchema(
      wordText.schema as z.ZodObject<z.ZodRawShape>,
      ["w3", "hello", "world"],
      {
        positionals: [{ key: "id" }, { key: "text", rest: true }],
      }
    ),
    { id: "w3", text: "hello world" }
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
