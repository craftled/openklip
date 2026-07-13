"use client";

import type { Cam, CamRole } from "@engine/cams";
import { useEffect, useRef, useState } from "react";
import { MediaAudioVisualizerWave } from "@/components/media-audio-visualizer-wave";
import { Button } from "@/components/ui/button";
import { IconSwap } from "@/components/ui/icon-swap";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { indexClassForCam } from "@/lib/cam-colors";
import { camProxyUrl } from "@/lib/cam-media";
import { Pause, Play } from "@/lib/icon";
import { cn } from "@/lib/utils";
import { CONFIG_COMPACT_INPUT_CLASS } from "./config/config-section";

export interface CamRowViewProps {
  cam: Cam;
  cams: Cam[];
  index: number;
  onNameChange: (camId: string, name: string) => void;
  onOffsetChange: (camId: string, offsetMs: number) => void;
  onRoleChange: (camId: string, role: CamRole) => void;
  onToggleAudio: (camId: string) => void;
  playing: boolean;
  slug: string;
}

export function CamRowView({
  cam,
  cams,
  index,
  onNameChange,
  onOffsetChange,
  onRoleChange,
  onToggleAudio,
  playing,
  slug,
}: CamRowViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [nameDraft, setNameDraft] = useState(cam.name);
  const [offsetDraft, setOffsetDraft] = useState(String(cam.offsetMs));
  const proxyUrl = camProxyUrl(slug, cam.id);

  useEffect(() => {
    setNameDraft(cam.name);
  }, [cam.name]);

  useEffect(() => {
    setOffsetDraft(String(cam.offsetMs));
  }, [cam.offsetMs]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (playing) {
      video.muted = false;
      void video.play().catch(() => {
        // preview may fail when the proxy is absent in dev fixtures
      });
      // Stop audio when the row unmounts mid-playback (tab/panel switch).
      return () => {
        video.pause();
      };
    }
    video.pause();
    video.currentTime = 0;
  }, [playing]);

  return (
    <tr className="border-b last:border-b-0" data-cam-row>
      <td className="py-1 pr-1 align-middle">
        <span
          className={cn(
            "inline-flex size-5 items-center justify-center rounded-sm font-medium text-[10px] tabular-nums",
            indexClassForCam(cam, cams)
          )}
        >
          {cam.role === "wide" ? "W" : index + 1}
        </span>
      </td>
      <td className="min-w-0 py-1 pr-1 align-middle">
        <Input
          className={cn(CONFIG_COMPACT_INPUT_CLASS, "w-full min-w-0")}
          data-cam-name={cam.id}
          onBlur={() => {
            const trimmed = nameDraft.trim();
            if (trimmed && trimmed !== cam.name) {
              onNameChange(cam.id, trimmed);
            }
          }}
          onChange={(e) => {
            // Local draft only while typing; persistence happens on blur to
            // avoid a server write per keystroke.
            setNameDraft(e.target.value);
          }}
          value={nameDraft}
        />
      </td>
      <td className="py-1 pr-1 align-middle">
        <div className="relative h-10 w-16 overflow-hidden rounded-md border bg-black">
          <video
            className="size-full object-cover"
            muted
            playsInline
            preload="metadata"
            src={proxyUrl}
          />
        </div>
      </td>
      <td className="py-1 pr-1 align-middle">
        <div className="flex items-center gap-1">
          <Button
            aria-label={
              playing ? `Pause ${cam.name} audio` : `Play ${cam.name} audio`
            }
            onClick={() => onToggleAudio(cam.id)}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <IconSwap activeKey={playing}>
              {playing ? <Pause /> : <Play />}
            </IconSwap>
          </Button>
          <div className="h-6 w-16 overflow-hidden">
            {playing ? (
              <MediaAudioVisualizerWave
                active={playing}
                className="h-full w-full"
                lineWidth={1.5}
                mediaRef={videoRef}
                size="sm"
                state="speaking"
              />
            ) : (
              <div
                aria-hidden="true"
                className="h-full w-full rounded-sm bg-muted/60"
              />
            )}
          </div>
          {/* biome-ignore lint/a11y/useMediaCaption: cam row audio preview */}
          <video
            className="hidden"
            playsInline
            preload="metadata"
            ref={videoRef}
            src={proxyUrl}
          />
        </div>
      </td>
      <td className="py-1 pr-1 align-middle">
        <Select
          onValueChange={(value) => onRoleChange(cam.id, value as CamRole)}
          value={cam.role}
        >
          <SelectTrigger
            className="h-7! w-[5.5rem] rounded-md! px-2! py-0! text-[0.8rem]!"
            size="sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="speaker">Speaker</SelectItem>
            <SelectItem value="wide">Wide</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="py-1 align-middle">
        <Input
          className={cn(CONFIG_COMPACT_INPUT_CLASS, "w-[4.5rem] tabular-nums")}
          data-cam-offset={cam.id}
          inputMode="numeric"
          onBlur={() => {
            const parsed = Number.parseInt(offsetDraft, 10);
            if (Number.isFinite(parsed) && parsed !== cam.offsetMs) {
              onOffsetChange(cam.id, parsed);
            } else {
              setOffsetDraft(String(cam.offsetMs));
            }
          }}
          onChange={(e) => {
            setOffsetDraft(e.target.value);
          }}
          title="Sync offset in milliseconds (negative values allowed)"
          type="text"
          value={offsetDraft}
        />
      </td>
    </tr>
  );
}
