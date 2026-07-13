"use client";

import type { MulticamProvenance } from "@engine/cam-mix";
import type { Cam, CamRole } from "@engine/cams";
import type { Project } from "@engine/edl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CamMixTimeline } from "@/components/cam-mix-timeline";
import { CamRowView } from "@/components/cam-row";
import { Button } from "@/components/ui/button";
import { IconLoader } from "@/lib/icon";
import { cn } from "@/lib/utils";
import {
  camMixAction,
  camSetAction,
  listCamsAction,
} from "../../app/actions.ts";

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

export interface CamSwitchPanelViewProps {
  cams: Cam[];
  loadingCams: boolean;
  mixError: string | null;
  mixing: boolean;
  mode: CamSwitchMode;
  multicam: MulticamProvenance | null;
  onCamNameChange: (camId: string, name: string) => void;
  onCamRoleChange: (camId: string, role: CamRole) => void;
  onModeChange: (mode: CamSwitchMode) => void;
  onRemix: () => void;
  onToggleCamAudio: (camId: string) => void;
  playingCamId: string | null;
  slug: string;
}

export function CamSwitchPanelView({
  cams,
  loadingCams,
  mixError,
  mixing,
  mode,
  multicam,
  onCamNameChange,
  onCamRoleChange,
  onModeChange,
  onRemix,
  onToggleCamAudio,
  playingCamId,
  slug,
}: CamSwitchPanelViewProps) {
  const canRemix = speakerCount(cams) >= 2;
  const showTimeline = mode === "auto" && (multicam?.plan.length ?? 0) > 0;
  const speakerCams = cams.filter((cam) => cam.role === "speaker");

  return (
    <div className="flex flex-col gap-2" data-cam-switch-panel>
      <div
        aria-label="Cam switch mode"
        className="flex flex-col gap-1.5"
        data-cam-mode-picker
        role="radiogroup"
      >
        {MODE_OPTIONS.map((option) => (
          <div className="flex flex-col gap-1.5" key={option.id}>
            <ModeCard
              active={mode === option.id}
              description={option.description}
              id={option.id}
              label={option.label}
              onSelect={onModeChange}
            />
            {option.id === "auto" && showTimeline && multicam ? (
              <CamMixTimeline cams={cams} plan={multicam.plan} />
            ) : null}
          </div>
        ))}
      </div>

      {loadingCams ? (
        <p className="text-muted-foreground text-xs">Loading cameras…</p>
      ) : cams.length === 0 ? (
        <p className="text-muted-foreground text-xs" data-cam-empty>
          No cameras ingested yet. Ingest cams with `openklip cam-add`.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[20rem] text-xs">
            <thead>
              <tr className="border-b bg-muted/30 text-muted-foreground">
                <th className="px-1 py-1 text-left font-medium">#</th>
                <th className="px-1 py-1 text-left font-medium">Name</th>
                <th className="px-1 py-1 text-left font-medium">Preview</th>
                <th className="px-1 py-1 text-left font-medium">Audio</th>
                <th className="px-1 py-1 text-left font-medium">Role</th>
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
  const [multicam, setMulticam] = useState<MulticamProvenance | null>(
    multicamProp ?? null
  );
  const [mixing, setMixing] = useState(false);
  const [mixError, setMixError] = useState<string | null>(null);
  const [playingCamId, setPlayingCamId] = useState<string | null>(null);

  useEffect(() => {
    setMode(multicamProp?.mode ?? "follow");
    setMulticam(multicamProp ?? null);
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

  const onCamNameChange = useCallback(
    (camId: string, name: string) => {
      setCams((prev) =>
        prev.map((cam) => (cam.id === camId ? { ...cam, name } : cam))
      );
      void camSetAction(slug, camId, { name }).then((result) => {
        if (!result.ok) {
          setMixError(result.error);
          void listCamsAction(slug).then((reload) => {
            if (reload.ok) {
              setCams(reload.data.cams);
            }
          });
        }
      });
    },
    [slug]
  );

  const onCamRoleChange = useCallback(
    (camId: string, role: CamRole) => {
      setCams((prev) =>
        prev.map((cam) => (cam.id === camId ? { ...cam, role } : cam))
      );
      void camSetAction(slug, camId, { role }).then((result) => {
        if (!result.ok) {
          setMixError(result.error);
          void listCamsAction(slug).then((reload) => {
            if (reload.ok) {
              setCams(reload.data.cams);
            }
          });
        }
      });
    },
    [slug]
  );

  const onToggleCamAudio = useCallback((camId: string) => {
    setPlayingCamId((current) => (current === camId ? null : camId));
  }, []);

  const onRemix = useCallback(async () => {
    setMixing(true);
    setMixError(null);
    try {
      const result = await camMixAction(slug, { mode });
      if (!result.ok) {
        setMixError(result.error);
        return;
      }
      const remixed = result.data.project as Project & {
        multicam?: MulticamProvenance | null;
      };
      setMulticam(remixed.multicam ?? null);
      onRemixed?.(remixed);
      router.refresh();
    } finally {
      setMixing(false);
    }
  }, [mode, onRemixed, router, slug]);

  if (!(visible || loadingCams)) {
    return null;
  }

  return (
    <CamSwitchPanelView
      cams={cams}
      loadingCams={loadingCams}
      mixError={mixError}
      mixing={mixing}
      mode={mode}
      multicam={multicam}
      onCamNameChange={onCamNameChange}
      onCamRoleChange={onCamRoleChange}
      onModeChange={setMode}
      onRemix={() => void onRemix()}
      onToggleCamAudio={onToggleCamAudio}
      playingCamId={playingCamId}
      slug={slug}
    />
  );
}
