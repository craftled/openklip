"use client";

import type { Audio, CutSnap } from "@engine/edl";
import { useState } from "react";
import {
  CommitNumberInput,
  firstSliderValue,
  THIN_SLIDER,
} from "@/components/slider-primitives";
import { Field, FieldLabel } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

// One labeled slider + number-input row, dragging updates local state only
// and persists on release (the filter-controls / music-controls precedent).
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
    <Field className="grid h-7 grid-cols-[5.5rem_1fr_4rem] items-center gap-2.5">
      <FieldLabel className="text-muted-foreground text-xs">{label}</FieldLabel>
      <Slider
        className={THIN_SLIDER}
        disabled={disabled}
        max={max}
        min={min}
        onValueChange={(v) => setDraft(firstSliderValue(v))}
        onValueCommitted={(v) => {
          setDraft(null);
          onCommit(firstSliderValue(v));
        }}
        step={step}
        value={[draft ?? value]}
      />
      <CommitNumberInput
        disabled={disabled}
        max={max}
        min={min}
        onCommit={onCommit}
        step={step}
        value={draft ?? value}
      />
    </Field>
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
    <div className="flex items-center justify-between gap-2">
      <FieldLabel className="text-xs" htmlFor={htmlId}>
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
  ducking?: Partial<Audio["ducking"]>;
  loudness?: Partial<Audio["loudness"]>;
  voiceHighpass?: Partial<Audio["voiceHighpass"]>;
}

export interface AudioControlsProps {
  /** Disable every control while a save is in flight (CleanupPanel parity). */
  applying?: boolean;
  audio: Audio;
  onPatchAudio: (patch: AudioPatch) => void;
  onPatchSnap: (patch: Partial<CutSnap>) => void;
  snap: CutSnap;
}

// Presentational export audio quality controls for the Config panel: ducking,
// loudness normalization, voice highpass, and cut-snap, each a toggle plus
// its numeric fields (hidden while the toggle is off) and a one-line honest
// caption. All state and behavior live in the caller (app.tsx), matching the
// music-controls.tsx split. Bounds mirror src/edl.ts's AudioSchema/CutSnapSchema
// and are re-clamped server-side by setAudio/setCutSnap regardless of what a
// slider allows here.
export function AudioControls({
  applying = false,
  audio,
  onPatchAudio,
  onPatchSnap,
  snap,
}: AudioControlsProps) {
  return (
    <div className="flex flex-col gap-4" data-audio-section>
      <div className="flex flex-col gap-2" data-audio-duck>
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
        <p className="text-muted-foreground text-xs leading-relaxed">
          Ducking lowers music under speech on export; preview audio is
          unprocessed.
        </p>
      </div>

      <div className="flex flex-col gap-2" data-audio-loudness>
        <ToggleRow
          checked={audio.loudness.enabled}
          disabled={applying}
          htmlId="audio-loudness-enabled"
          label="Loudness normalization"
          onCheckedChange={(enabled) => onPatchAudio({ loudness: { enabled } })}
        />
        {audio.loudness.enabled ? (
          <ControlRow
            disabled={applying}
            label="Target (LUFS)"
            max={-10}
            min={-30}
            onCommit={(n) => onPatchAudio({ loudness: { targetLufs: n } })}
            step={1}
            value={audio.loudness.targetLufs}
          />
        ) : null}
        <p className="text-muted-foreground text-xs leading-relaxed">
          Applied at export; preview audio is unprocessed.
        </p>
      </div>

      <div className="flex flex-col gap-2" data-audio-highpass>
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
        <p className="text-muted-foreground text-xs leading-relaxed">
          Applied at export; preview audio is unprocessed.
        </p>
      </div>

      <div className="flex flex-col gap-2" data-audio-snap>
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
        <p className="text-muted-foreground text-xs leading-relaxed">
          Snap moves cut edges to nearby silence; crossfade smooths cut seams
          and reuses a few milliseconds of the removed audio.
        </p>
      </div>
    </div>
  );
}
