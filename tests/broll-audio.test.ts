import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BROLL_AUDIO_MODE_IDS,
  buildBrollAudioChain,
  buildBrollAudioFilterGraph,
  buildBrollAudioMixParts,
  normalizeBrollAudioMode,
} from "../src/broll-audio.ts";
import { SAMPLE_RATE, sec } from "../src/edl.ts";

test("normalizeBrollAudioMode defaults to silent", () => {
  assert.equal(normalizeBrollAudioMode(undefined), "silent");
  assert.equal(normalizeBrollAudioMode("mix"), "mix");
});

test("BROLL_AUDIO_MODE_IDS lists every supported mode", () => {
  assert.deepEqual(BROLL_AUDIO_MODE_IDS, [
    "silent",
    "broll",
    "mix",
    "duck-voice",
    "duck-broll",
  ]);
});

test("buildBrollAudioChain trims, resamples, and delays to the output window", () => {
  const chain = buildBrollAudioChain({
    inputIndex: 2,
    label: "ba2",
    outEnd: 4,
    outStart: 1,
    srcInSec: 0.5,
  });
  assert.equal(
    chain,
    `[2:a]aresample=${SAMPLE_RATE},atrim=start=${sec(0.5)}:duration=${sec(3)},asetpts=PTS-STARTPTS,adelay=1000:all=1[ba2]`
  );
});

test("buildBrollAudioFilterGraph skips silent placements", () => {
  const graph = buildBrollAudioFilterGraph([
    {
      audioMode: "silent",
      inputIndex: 1,
      outEnd: 3,
      outStart: 0,
      srcInSec: 0,
    },
    {
      audioMode: "mix",
      inputIndex: 2,
      outEnd: 5,
      outStart: 2,
      srcInSec: 0.25,
    },
  ]);
  assert.equal(graph.filterParts.length, 1);
  assert.deepEqual(graph.mixInputLabels, ["ba2"]);
  assert.equal(graph.replaceWindows.length, 0);
  assert.equal(graph.duckVoice, false);
  assert.equal(graph.duckBroll, false);
});

test("buildBrollAudioFilterGraph tracks broll-only replace windows", () => {
  const graph = buildBrollAudioFilterGraph([
    {
      audioMode: "broll",
      inputIndex: 1,
      outEnd: 3,
      outStart: 1,
      srcInSec: 0,
    },
  ]);
  assert.deepEqual(graph.replaceWindows, [{ outStart: 1, outEnd: 3 }]);
});

test("buildBrollAudioMixParts mixes voice with b-roll audio", () => {
  const parts = buildBrollAudioMixParts("avoice", {
    duckBroll: false,
    duckVoice: false,
    filterParts: [],
    mixInputLabels: ["ba1"],
    replaceWindows: [],
  });
  assert.deepEqual(parts, [
    "[avoice][ba1]amix=inputs=2:duration=first:normalize=0[abmix]",
  ]);
});

test("buildBrollAudioMixParts ducks b-roll under voice", () => {
  const parts = buildBrollAudioMixParts("avoice", {
    duckBroll: true,
    duckVoice: false,
    filterParts: [],
    mixInputLabels: ["ba1"],
    replaceWindows: [],
  });
  assert.deepEqual(parts, [
    "[avoice]asplit=2[avmain][avsc]",
    "[ba1][avsc]sidechaincompress=threshold=0.02:ratio=8:attack=25:release=250:makeup=1[baduck]",
    "[avmain][baduck]amix=inputs=2:duration=first:normalize=0[abmix]",
  ]);
});

test("buildBrollAudioMixParts ducks voice under b-roll", () => {
  const parts = buildBrollAudioMixParts("avoice", {
    duckBroll: false,
    duckVoice: true,
    filterParts: [],
    mixInputLabels: ["ba1"],
    replaceWindows: [],
  });
  assert.deepEqual(parts, [
    "[ba1]asplit=2[bmain][bsc]",
    "[avoice][bsc]sidechaincompress=threshold=0.02:ratio=8:attack=25:release=250:makeup=1[vduck]",
    "[bmain][vduck]amix=inputs=2:duration=first:normalize=0[abmix]",
  ]);
});

test("buildBrollAudioMixParts mutes voice during broll-only windows", () => {
  const parts = buildBrollAudioMixParts("avoice", {
    duckBroll: false,
    duckVoice: false,
    filterParts: [],
    mixInputLabels: ["ba1"],
    replaceWindows: [{ outStart: 2, outEnd: 4 }],
  });
  assert.deepEqual(parts, [
    `[avoice]volume=volume=0:enable='between(t,${sec(2)},${sec(4)})'[avmuted0]`,
    "[avmuted0][ba1]amix=inputs=2:duration=first:normalize=0[abmix]",
  ]);
});
