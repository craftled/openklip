"use client";

import type { Audio, CutSnap } from "@engine/edl";
import { useState } from "react";
import { ElasticSlider } from "@/components/elastic-slider";
import { formatDotDecimal } from "@/components/slider-primitives";
import { Field, FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

// One labeled slider row. Dragging updates local state only and persists on
// release, so one drag creates one project mutation instead of dozens.
function ControlRow({
  disabled = false,
  label,
  max,
  min,
  onCommit,
  step,
  value,
}: {
  disabled?: boolean;
  label: string;
  max: number;
  min: number;
  onCommit: (n: number) => void;
  step: number;
  value: number;
}) {
  const [draft, setDraft] = useState<number | null>(null);
  return (
    <ElasticSlider
      disabled={disabled}
      formatValue={formatDotDecimal}
      label={label}
      max={max}
      min={min}
      onValueChange={setDraft}
      onValueCommit={(nextValue) => {
        setDraft(null);
        onCommit(nextValue);
      }}
      step={step}
      value={draft ?? value}
    />
  );
}

function ToggleRow({
  checked,
  disabled = false,
  htmlId,
  label,
  onCheckedChange,
  snapToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  htmlId: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
  snapToggle?: boolean;
}) {
  return (
    <div className="flex min-h-6 items-center justify-between gap-1.5">
      <FieldLabel className="text-[0.75rem]" htmlFor={htmlId}>
        {label}
      </FieldLabel>
      {snapToggle ? (
        <Switch
          checked={checked}
          data-snap-toggle=""
          disabled={disabled}
          id={htmlId}
          onCheckedChange={onCheckedChange}
          size="sm"
        />
      ) : (
        <Switch
          checked={checked}
          disabled={disabled}
          id={htmlId}
          onCheckedChange={onCheckedChange}
          size="sm"
        />
      )}
    </div>
  );
}

export interface AudioPatch {
  deEsser?: Partial<Audio["deEsser"]>;
  ducking?: Partial<Audio["ducking"]>;
  loudness?: Partial<Audio["loudness"]>;
  noiseReduction?: Partial<Audio["noiseReduction"]>;
  voiceHighpass?: Partial<Audio["voiceHighpass"]>;
}

export interface AudioMeasureView {
  integratedLufs: number;
  lra: number;
  source: "export" | "proxy";
  truePeakDbtp: number;
}

export interface AudioControlsProps {
  /** Disable every control while a save is in flight (CleanupPanel parity). */
  applying?: boolean;
  audio: Audio;
  measure?: AudioMeasureView | null;
  measuring?: boolean;
  onMeasure?: () => void;
  onPatchAudio: (patch: AudioPatch) => void;
  onPatchSnap: (patch: Partial<CutSnap>) => void;
  snap: CutSnap;
}

// Presentational export audio quality controls for the Config panel: ducking,
// loudness normalization, voice highpass, de-essing, and cut-snap, each a
// toggle plus
// its numeric fields (hidden while the toggle is off) and a one-line honest
// caption. All state and behavior live in the caller (app.tsx), matching the
// music-controls.tsx split. Bounds mirror src/edl.ts's AudioSchema/CutSnapSchema
// and are re-clamped server-side by setAudio/setCutSnap regardless of what a
// slider allows here.
export function AudioControls({
  applying = false,
  audio,
  measure = null,
  measuring = false,
  onMeasure,
  onPatchAudio,
  onPatchSnap,
  snap,
}: AudioControlsProps) {
  return (
    <div className="flex flex-col gap-2.5" data-audio-section>
      <div className="flex flex-col gap-1.5" data-audio-duck>
        <ToggleRow
          checked={audio.ducking.enabled}
          disabled={applying}
          htmlId="audio-duck-enabled"
          label="Duck music under speech"
          onCheckedChange={(enabled) => onPatchAudio({ ducking: { enabled } })}
        />
        {audio.ducking.enabled ? (
          <>
            <ControlRow
              disabled={applying}
              label="Amount (dB)"
              max={30}
              min={1}
              onCommit={(n) => onPatchAudio({ ducking: { amountDb: n } })}
              step={1}
              value={audio.ducking.amountDb}
            />
            <ControlRow
              disabled={applying}
              label="Attack (ms)"
              max={500}
              min={1}
              onCommit={(n) => onPatchAudio({ ducking: { attackMs: n } })}
              step={1}
              value={audio.ducking.attackMs}
            />
            <ControlRow
              disabled={applying}
              label="Release (ms)"
              max={2000}
              min={20}
              onCommit={(n) => onPatchAudio({ ducking: { releaseMs: n } })}
              step={10}
              value={audio.ducking.releaseMs}
            />
          </>
        ) : null}
        <p className="text-muted-foreground text-xs leading-snug">
          Ducking lowers music under speech on export; preview audio is
          unprocessed.
        </p>
      </div>

      <div className="flex flex-col gap-1.5" data-audio-loudness>
        <ToggleRow
          checked={audio.loudness.enabled}
          disabled={applying}
          htmlId="audio-loudness-enabled"
          label="Loudness normalization"
          onCheckedChange={(enabled) => onPatchAudio({ loudness: { enabled } })}
        />
        {audio.loudness.enabled ? (
          <>
            <ControlRow
              disabled={applying}
              label="Target (LUFS)"
              max={-10}
              min={-30}
              onCommit={(n) => onPatchAudio({ loudness: { targetLufs: n } })}
              step={1}
              value={audio.loudness.targetLufs}
            />
            <Field className="grid h-7 grid-cols-[5.25rem_1fr] items-center gap-1.5">
              <FieldLabel className="text-muted-foreground text-xs">
                Loudness mode
              </FieldLabel>
              <Select
                onValueChange={(value) => {
                  if (value === "single" || value === "two-pass") {
                    onPatchAudio({
                      loudness: { mode: value },
                    });
                  }
                }}
                value={audio.loudness.mode ?? "single"}
              >
                <SelectTrigger
                  className="h-7! w-full rounded-md! px-2! py-0! text-[0.8rem]!"
                  disabled={applying}
                  size="sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="single">Single pass</SelectItem>
                    <SelectItem value="two-pass">Two pass (exact)</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </>
        ) : null}
        <p className="text-muted-foreground text-xs leading-snug">
          Applied at export; preview audio is unprocessed.
        </p>
      </div>

      <div className="flex flex-col gap-1.5" data-audio-noise>
        <ToggleRow
          checked={audio.noiseReduction.enabled}
          disabled={applying}
          htmlId="audio-noise-enabled"
          label="Noise reduction"
          onCheckedChange={(enabled) =>
            onPatchAudio({ noiseReduction: { enabled } })
          }
        />
        {audio.noiseReduction.enabled ? (
          <ControlRow
            disabled={applying}
            label="Strength"
            max={97}
            min={1}
            onCommit={(n) => onPatchAudio({ noiseReduction: { nr: n } })}
            step={1}
            value={audio.noiseReduction.nr}
          />
        ) : null}
        <p className="text-muted-foreground text-xs leading-snug">
          Light afftdn cleanup on the voice bus at export only.
        </p>
      </div>

      <div className="flex flex-col gap-1.5" data-audio-highpass>
        <ToggleRow
          checked={audio.voiceHighpass.enabled}
          disabled={applying}
          htmlId="audio-highpass-enabled"
          label="Voice highpass"
          onCheckedChange={(enabled) =>
            onPatchAudio({ voiceHighpass: { enabled } })
          }
        />
        {audio.voiceHighpass.enabled ? (
          <ControlRow
            disabled={applying}
            label="Cutoff (Hz)"
            max={200}
            min={40}
            onCommit={(n) => onPatchAudio({ voiceHighpass: { hz: n } })}
            step={5}
            value={audio.voiceHighpass.hz}
          />
        ) : null}
        <p className="text-muted-foreground text-xs leading-snug">
          Applied at export; preview audio is unprocessed.
        </p>
      </div>

      <div className="flex flex-col gap-1.5" data-audio-deess>
        <ToggleRow
          checked={audio.deEsser.enabled}
          disabled={applying}
          htmlId="audio-deess-enabled"
          label="De-essing"
          onCheckedChange={(enabled) => onPatchAudio({ deEsser: { enabled } })}
        />
        {audio.deEsser.enabled ? (
          <ControlRow
            disabled={applying}
            label="Intensity"
            max={1}
            min={0}
            onCommit={(n) => onPatchAudio({ deEsser: { intensity: n } })}
            step={0.05}
            value={audio.deEsser.intensity}
          />
        ) : null}
        <p className="text-muted-foreground text-xs leading-snug">
          Tames harsh sibilants ("s", "sh" sounds) on the voice bus at export
          only.
        </p>
      </div>

      <div className="flex flex-col gap-1.5" data-audio-snap>
        <ToggleRow
          checked={snap.enabled}
          disabled={applying}
          htmlId="audio-snap-enabled"
          label="Snap cuts to silence"
          onCheckedChange={(enabled) =>
            onPatchSnap({ enabled, mode: enabled ? "vad" : "off" })
          }
          snapToggle
        />
        {snap.enabled ? (
          <>
            <ControlRow
              disabled={applying}
              label="Max shift (ms)"
              max={500}
              min={0}
              onCommit={(n) => onPatchSnap({ maxShiftMs: n })}
              step={5}
              value={snap.maxShiftMs}
            />
            <ControlRow
              disabled={applying}
              label="Crossfade (ms)"
              max={100}
              min={0}
              onCommit={(n) => onPatchSnap({ crossfadeMs: n })}
              step={1}
              value={snap.crossfadeMs}
            />
          </>
        ) : null}
        <p className="text-muted-foreground text-xs leading-snug">
          Snap moves cut edges to nearby silence; crossfade smooths cut seams
          and reuses a few milliseconds of the removed audio.
        </p>
      </div>

      {onMeasure ? (
        <div className="flex flex-col gap-1.5" data-audio-measure>
          <Button
            data-audio-measure-run
            disabled={applying || measuring}
            onClick={onMeasure}
            size="sm"
            variant="outline"
          >
            {measuring ? "Measuring loudness…" : "Measure loudness"}
          </Button>
          {measure ? (
            <p
              className="text-muted-foreground text-xs leading-snug tabular-nums"
              data-audio-measure-result
            >
              {measure.integratedLufs.toFixed(1)} LUFS integrated (
              {measure.source}), {measure.truePeakDbtp.toFixed(1)} dBTP peak,{" "}
              {measure.lra.toFixed(1)} LU LRA
            </p>
          ) : (
            <p className="text-muted-foreground text-xs leading-snug">
              Read-only LUFS from the latest export or ingest proxy. Export
              loudness settings above are not applied until you render.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
