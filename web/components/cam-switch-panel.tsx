"use client";

import type { MulticamProvenance } from "@engine/cam-mix";
import {
  type CamSwitchSettings,
  DEFAULT_CAM_SWITCH_SETTINGS,
} from "@engine/cam-plan";
import type { Cam, CamRole } from "@engine/cams";
import type { Project } from "@engine/edl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CamMixTimeline } from "@/components/cam-mix-timeline";
import { CamOverrideForm } from "@/components/cam-override-form";
import { CamRowView } from "@/components/cam-row";
import { CONFIG_COMPACT_INPUT_CLASS } from "@/components/config/config-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ingestCamFromVideo } from "@/lib/cam-create";
import { IconLoader, Upload } from "@/lib/icon";
import { selectDroppedVideo } from "@/lib/project-intake";
import { cn } from "@/lib/utils";
import {
  camMixAction,
  camOverrideAction,
  camSetAction,
  listCamsAction,
} from "../../app/actions.ts";
import { SUPPORTED_VIDEO_ACCEPT } from "../../src/video-formats.ts";

type CamSwitchMode = "follow" | "auto";

const MODE_OPTIONS: {
  description: string;
  id: CamSwitchMode;
  label: string;
}[] = [
  {
    id: "follow",
    label: "Follow speaker",
    description: "Switches to a speaker's camera when they talk.",
  },
  {
    id: "auto",
    label: "Auto scene mix",
    description:
      "Mixes speaker angles, reactions, and wide shots based on the conversation.",
  },
];

const MAX_CAMS = 8;

function speakerCount(cams: Cam[]): number {
  return cams.filter((cam) => cam.role === "speaker").length;
}

function ModeCard({
  active,
  description,
  id,
  label,
  onSelect,
}: {
  active: boolean;
  description: string;
  id: CamSwitchMode;
  label: string;
  onSelect: (mode: CamSwitchMode) => void;
}) {
  return (
    <label
      className={cn(
        "flex w-full cursor-pointer flex-col gap-0.5 rounded-md border px-2 py-1.5 text-left transition-colors hover:bg-muted/50",
        active && "border-primary bg-muted/60 ring-1 ring-primary/25"
      )}
      data-cam-mode={id}
    >
      <input
        checked={active}
        className="sr-only"
        name="cam-switch-mode"
        onChange={() => onSelect(id)}
        type="radio"
        value={id}
      />
      <span className="font-medium text-xs">{label}</span>
      <span className="text-muted-foreground text-xs">{description}</span>
    </label>
  );
}

function GuardrailField({
  disabled,
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
  onCommit: (value: number) => void;
  step: number;
  value: number;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[0.7rem] text-muted-foreground">{label}</span>
      <Input
        className={cn(CONFIG_COMPACT_INPUT_CLASS, "tabular-nums")}
        disabled={disabled}
        inputMode="numeric"
        onBlur={() => {
          const parsed = Number(draft);
          if (Number.isFinite(parsed)) {
            const clamped = Math.min(max, Math.max(min, parsed));
            onCommit(clamped);
            setDraft(String(clamped));
          } else {
            setDraft(String(value));
          }
        }}
        onChange={(e) => {
          setDraft(e.target.value);
        }}
        step={step}
        type="number"
        value={draft}
      />
    </label>
  );
}

function AddCamControl({
  busy,
  error,
  name,
  onFile,
  onNameChange,
  onRoleChange,
  progressMessage,
  role,
}: {
  busy: boolean;
  error: string | null;
  name: string;
  onFile: (file: File) => void;
  onNameChange: (value: string) => void;
  onRoleChange: (role: CamRole) => void;
  progressMessage: string | null;
  role: CamRole;
}) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-md border border-dashed p-1.5"
      data-cam-add
    >
      <div className="flex items-center gap-1.5">
        <label
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-xs hover:bg-muted/50",
            busy && "pointer-events-none opacity-60"
          )}
        >
          {busy ? (
            <IconLoader
              aria-hidden
              className="size-3.5 shrink-0 animate-spin"
            />
          ) : (
            <Upload aria-hidden className="size-3.5 shrink-0" />
          )}
          <span>
            {busy ? (progressMessage ?? "Ingesting camera…") : "Add camera"}
          </span>
          <input
            accept={SUPPORTED_VIDEO_ACCEPT}
            className="hidden"
            data-cam-add-file
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) {
                onFile(file);
              }
            }}
            type="file"
          />
        </label>
        <Input
          className="h-7! min-w-0 flex-1 rounded-md! px-2! py-1! text-[0.8rem]!"
          data-cam-add-name
          disabled={busy}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Name (optional)"
          type="text"
          value={name}
        />
        <Select
          disabled={busy}
          onValueChange={(value) => onRoleChange(value as CamRole)}
          value={role}
        >
          <SelectTrigger
            className="h-7! w-[5.5rem] rounded-md! px-2! py-0! text-[0.8rem]!"
            data-cam-add-role
            size="sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="speaker">Speaker</SelectItem>
            <SelectItem value="wide">Wide</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

export interface CamSwitchPanelViewProps {
  addCamBusy: boolean;
  addCamError: string | null;
  addCamName: string;
  addCamProgress: string | null;
  addCamRole: CamRole;
  cams: Cam[];
  loadingCams: boolean;
  mixError: string | null;
  mixing: boolean;
  mode: CamSwitchMode;
  multicam: MulticamProvenance | null;
  onAddCamFile: (file: File) => void;
  onAddCamNameChange: (value: string) => void;
  onAddCamRoleChange: (role: CamRole) => void;
  onCamNameChange: (camId: string, name: string) => void;
  onCamOffsetChange: (camId: string, offsetMs: number) => void;
  onCamOverride: (fromSec: number, toSec: number, shot: string) => void;
  onCamRoleChange: (camId: string, role: CamRole) => void;
  onModeChange: (mode: CamSwitchMode) => void;
  onRemix: () => void;
  onSettingsChange: (patch: Partial<CamSwitchSettings>) => void;
  onToggleCamAudio: (camId: string) => void;
  playingCamId: string | null;
  settings: CamSwitchSettings;
  slug: string;
}

export function CamSwitchPanelView({
  addCamBusy,
  addCamError,
  addCamName,
  addCamProgress,
  addCamRole,
  cams,
  loadingCams,
  mixError,
  mixing,
  mode,
  multicam,
  onAddCamFile,
  onAddCamNameChange,
  onAddCamRoleChange,
  onCamNameChange,
  onCamOffsetChange,
  onCamOverride,
  onCamRoleChange,
  onModeChange,
  onRemix,
  onSettingsChange,
  onToggleCamAudio,
  playingCamId,
  settings,
  slug,
}: CamSwitchPanelViewProps) {
  const canRemix = speakerCount(cams) >= 2;
  const showTimeline = (multicam?.plan.length ?? 0) > 0;
  const showOverride = Boolean(multicam) && cams.length > 0;
  const speakerCams = cams.filter((cam) => cam.role === "speaker");
  const atCamLimit = cams.length >= MAX_CAMS;

  return (
    <div className="flex flex-col gap-2" data-cam-switch-panel>
      <AddCamControl
        busy={addCamBusy || atCamLimit}
        error={
          atCamLimit && !addCamBusy
            ? `Camera limit reached (max ${MAX_CAMS}).`
            : addCamError
        }
        name={addCamName}
        onFile={onAddCamFile}
        onNameChange={onAddCamNameChange}
        onRoleChange={onAddCamRoleChange}
        progressMessage={addCamProgress}
        role={addCamRole}
      />

      <div
        className="flex flex-col gap-1.5 rounded-md border p-1.5"
        data-cam-guardrails
      >
        <span className="font-medium text-xs">Mix guardrails</span>
        <div className="grid grid-cols-2 gap-1.5">
          <GuardrailField
            disabled={mixing}
            label="Min shot (ms)"
            max={60_000}
            min={100}
            onCommit={(value) => onSettingsChange({ minShotMs: value })}
            step={100}
            value={settings.minShotMs}
          />
          <GuardrailField
            disabled={mixing}
            label="Max shot (ms)"
            max={120_000}
            min={1000}
            onCommit={(value) => onSettingsChange({ maxShotMs: value })}
            step={500}
            value={settings.maxShotMs}
          />
          <GuardrailField
            disabled={mixing}
            label="Interjection (ms)"
            max={5000}
            min={100}
            onCommit={(value) => onSettingsChange({ interjectionMs: value })}
            step={50}
            value={settings.interjectionMs}
          />
          <GuardrailField
            disabled={mixing}
            label="Lead (ms)"
            max={2000}
            min={0}
            onCommit={(value) => onSettingsChange({ leadMs: value })}
            step={50}
            value={settings.leadMs}
          />
        </div>
        <label className="flex flex-col gap-0.5">
          <span className="text-[0.7rem] text-muted-foreground">
            Wide shots
          </span>
          <Select
            disabled={mixing}
            onValueChange={(value) =>
              onSettingsChange({ wide: value as CamSwitchSettings["wide"] })
            }
            value={settings.wide}
          >
            <SelectTrigger
              className="h-7! w-full rounded-md! px-2! py-0! text-[0.8rem]!"
              data-cam-wide
              size="sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (synthetic wide)</SelectItem>
              <SelectItem value="off">Off</SelectItem>
            </SelectContent>
          </Select>
        </label>
      </div>

      <div
        aria-label="Cam switch mode"
        className="flex flex-col gap-1.5"
        data-cam-mode-picker
        role="radiogroup"
      >
        {MODE_OPTIONS.map((option) => (
          <ModeCard
            active={mode === option.id}
            description={option.description}
            id={option.id}
            key={option.id}
            label={option.label}
            onSelect={onModeChange}
          />
        ))}
      </div>

      {showTimeline && multicam ? (
        <CamMixTimeline cams={cams} plan={multicam.plan} />
      ) : null}

      {showOverride ? (
        <CamOverrideForm
          cams={cams}
          disabled={mixing}
          onSubmit={onCamOverride}
        />
      ) : null}

      {loadingCams ? (
        <p className="text-muted-foreground text-xs">Loading cameras…</p>
      ) : cams.length === 0 ? (
        <p className="text-muted-foreground text-xs" data-cam-empty>
          No cameras ingested yet. Add a camera file above.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[24rem] text-xs">
            <thead>
              <tr className="border-b bg-muted/30 text-muted-foreground">
                <th className="px-1 py-1 text-left font-medium">#</th>
                <th className="px-1 py-1 text-left font-medium">Name</th>
                <th className="px-1 py-1 text-left font-medium">Preview</th>
                <th className="px-1 py-1 text-left font-medium">Audio</th>
                <th className="px-1 py-1 text-left font-medium">Role</th>
                <th className="px-1 py-1 text-left font-medium">Offset ms</th>
              </tr>
            </thead>
            <tbody>
              {cams.map((cam) => (
                <CamRowView
                  cam={cam}
                  cams={cams}
                  index={cam.role === "wide" ? 0 : speakerCams.indexOf(cam)}
                  key={cam.id}
                  onNameChange={onCamNameChange}
                  onOffsetChange={onCamOffsetChange}
                  onRoleChange={onCamRoleChange}
                  onToggleAudio={onToggleCamAudio}
                  playing={playingCamId === cam.id}
                  slug={slug}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mixError ? <p className="text-destructive text-xs">{mixError}</p> : null}

      <Button
        data-cam-remix
        disabled={!canRemix || mixing}
        onClick={onRemix}
        size="sm"
        type="button"
        variant="secondary"
      >
        {mixing ? (
          <>
            <IconLoader aria-hidden className="size-3.5 animate-spin" />
            Re-mixing…
          </>
        ) : (
          "Re-mix"
        )}
      </Button>
    </div>
  );
}

export interface CamSwitchPanelProps {
  multicam?: MulticamProvenance | null;
  onRemixed?: (project: Project) => void;
  slug: string;
}

type RemixedProject = Project & { multicam?: MulticamProvenance | null };

function projectFromMixResult(data: { project: Project }): RemixedProject {
  return data.project as RemixedProject;
}

export function CamSwitchPanel({
  multicam: multicamProp,
  onRemixed,
  slug,
}: CamSwitchPanelProps) {
  const router = useRouter();
  const [cams, setCams] = useState<Cam[]>([]);
  const [loadingCams, setLoadingCams] = useState(true);
  const [visible, setVisible] = useState(Boolean(multicamProp));
  const [mode, setMode] = useState<CamSwitchMode>(
    multicamProp?.mode ?? "follow"
  );
  const [settings, setSettings] = useState<CamSwitchSettings>(
    multicamProp?.settings ?? DEFAULT_CAM_SWITCH_SETTINGS
  );
  const [multicam, setMulticam] = useState<MulticamProvenance | null>(
    multicamProp ?? null
  );
  const [mixing, setMixing] = useState(false);
  const [mixError, setMixError] = useState<string | null>(null);
  const [playingCamId, setPlayingCamId] = useState<string | null>(null);
  const [addCamBusy, setAddCamBusy] = useState(false);
  const [addCamProgress, setAddCamProgress] = useState<string | null>(null);
  const [addCamError, setAddCamError] = useState<string | null>(null);
  const [addCamName, setAddCamName] = useState("");
  const [addCamRole, setAddCamRole] = useState<CamRole>("speaker");

  useEffect(() => {
    setMode(multicamProp?.mode ?? "follow");
    setMulticam(multicamProp ?? null);
    if (multicamProp?.settings) {
      setSettings(multicamProp.settings);
    }
    if (multicamProp) {
      setVisible(true);
    }
  }, [multicamProp]);

  useEffect(() => {
    let cancelled = false;
    setLoadingCams(true);
    void listCamsAction(slug).then((result) => {
      if (cancelled) {
        return;
      }
      setLoadingCams(false);
      if (result.ok) {
        setCams(result.data.cams);
        if (result.data.cams.length > 0) {
          setVisible(true);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const reloadCams = useCallback(async () => {
    const result = await listCamsAction(slug);
    if (result.ok) {
      setCams(result.data.cams);
      setVisible(true);
    }
  }, [slug]);

  const onAddCamFile = useCallback(
    (file: File) => {
      const picked = selectDroppedVideo([file]);
      if ("error" in picked) {
        setAddCamError(picked.error);
        return;
      }
      setAddCamError(null);
      setAddCamProgress(null);
      setAddCamBusy(true);
      void ingestCamFromVideo(
        slug,
        picked.file,
        {
          name: addCamName.trim() || undefined,
          role: addCamRole,
        },
        (progress) => {
          setAddCamProgress(progress.message);
        }
      )
        .then(async () => {
          setAddCamName("");
          await reloadCams();
        })
        .catch((e: unknown) => {
          setAddCamError((e as Error).message);
        })
        .finally(() => {
          setAddCamBusy(false);
          setAddCamProgress(null);
        });
    },
    [addCamName, addCamRole, reloadCams, slug]
  );

  const onCamNameChange = useCallback(
    (camId: string, name: string) => {
      setCams((prev) =>
        prev.map((cam) => (cam.id === camId ? { ...cam, name } : cam))
      );
      void camSetAction(slug, camId, { name }).then((result) => {
        if (!result.ok) {
          setMixError(result.error);
          void reloadCams();
        }
      });
    },
    [reloadCams, slug]
  );

  const onCamRoleChange = useCallback(
    (camId: string, role: CamRole) => {
      setCams((prev) =>
        prev.map((cam) => (cam.id === camId ? { ...cam, role } : cam))
      );
      void camSetAction(slug, camId, { role }).then((result) => {
        if (!result.ok) {
          setMixError(result.error);
          void reloadCams();
        }
      });
    },
    [reloadCams, slug]
  );

  const onCamOffsetChange = useCallback(
    (camId: string, offsetMs: number) => {
      setCams((prev) =>
        prev.map((cam) => (cam.id === camId ? { ...cam, offsetMs } : cam))
      );
      void camSetAction(slug, camId, { offsetMs }).then((result) => {
        if (!result.ok) {
          setMixError(result.error);
          void reloadCams();
        }
      });
    },
    [reloadCams, slug]
  );

  const onToggleCamAudio = useCallback((camId: string) => {
    setPlayingCamId((current) => (current === camId ? null : camId));
  }, []);

  const onSettingsChange = useCallback((patch: Partial<CamSwitchSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const applyRemixedProject = useCallback(
    (project: RemixedProject) => {
      setMulticam(project.multicam ?? null);
      if (project.multicam?.settings) {
        setSettings(project.multicam.settings);
      }
      onRemixed?.(project);
      router.refresh();
    },
    [onRemixed, router]
  );

  const withMixing = useCallback(
    async (
      run: () => Promise<
        { ok: true; data: { project: Project } } | { ok: false; error: string }
      >
    ) => {
      setMixing(true);
      setMixError(null);
      try {
        const result = await run();
        if (!result.ok) {
          setMixError(result.error);
          return;
        }
        applyRemixedProject(projectFromMixResult(result.data));
      } finally {
        setMixing(false);
      }
    },
    [applyRemixedProject]
  );

  const onRemix = useCallback(() => {
    void withMixing(() => camMixAction(slug, { mode, settings }));
  }, [mode, settings, slug, withMixing]);

  const onCamOverride = useCallback(
    (fromSec: number, toSec: number, shot: string) => {
      void withMixing(() => camOverrideAction(slug, { fromSec, toSec, shot }));
    },
    [slug, withMixing]
  );

  if (!(visible || loadingCams)) {
    return null;
  }

  return (
    <CamSwitchPanelView
      addCamBusy={addCamBusy}
      addCamError={addCamError}
      addCamName={addCamName}
      addCamProgress={addCamProgress}
      addCamRole={addCamRole}
      cams={cams}
      loadingCams={loadingCams}
      mixError={mixError}
      mixing={mixing}
      mode={mode}
      multicam={multicam}
      onAddCamFile={onAddCamFile}
      onAddCamNameChange={setAddCamName}
      onAddCamRoleChange={setAddCamRole}
      onCamNameChange={onCamNameChange}
      onCamOffsetChange={onCamOffsetChange}
      onCamOverride={onCamOverride}
      onCamRoleChange={onCamRoleChange}
      onModeChange={setMode}
      onRemix={onRemix}
      onSettingsChange={onSettingsChange}
      onToggleCamAudio={onToggleCamAudio}
      playingCamId={playingCamId}
      settings={settings}
      slug={slug}
    />
  );
}
