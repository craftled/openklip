"use client";

import type { Keyframe } from "@engine/keyframes";
import { authorDisplayLabel } from "@engine/provenance-display";
import type { ReactNode } from "react";
import {
  CONFIG_COMPACT_INPUT_CLASS,
  CONFIG_COMPACT_SELECT_TRIGGER_CLASS,
  CONFIG_COMPACT_TEXTAREA_CLASS,
  PropRow,
  Section,
  SliderRow,
  ZOOM_PRESETS,
} from "@/components/config/config-section";
import type { TimelineClipKind } from "@/components/edit-timeline";
import type { GraphicItem } from "@/components/graphic-overlay";
import { OverlaySortable } from "@/components/overlay-sortable";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Film, ImageIcon, Plus, Trash2, Type, ZoomIn } from "@/lib/icon";
import {
  addKeyframe,
  clampKeyframeSampleOffset,
  defaultKeyframeValue,
  formatKeyframeProperty,
  KEYFRAME_EASINGS,
  KEYFRAME_PROPERTIES,
  keyframeValueBounds,
  removeKeyframeAt,
  updateKeyframeAt,
} from "@/lib/keyframe-ui";
import { firstToggleValue } from "@/lib/toggle-value";
import { cn } from "@/lib/utils";

interface ZoomItem {
  authoredBy?: string;
  endSample: number;
  id: string;
  rampSec: number;
  scale: number;
  startSample: number;
}

function overlayProvenanceNote(
  authoredBy: string | undefined,
  show: boolean
): ReactNode {
  if (!(show && authoredBy)) {
    return null;
  }
  return (
    <p className="text-muted-foreground text-xs">
      Edited by {authorDisplayLabel(authoredBy)}
    </p>
  );
}

interface TitleItem {
  authoredBy?: string;
  endSample: number;
  id: string;
  position: "callout" | "center" | "divider" | "hero" | "lower" | "quote";
  startSample: number;
  text: string;
}

interface BrollItem {
  assetId: string;
  audioMode?: "broll" | "duck-broll" | "duck-voice" | "mix" | "silent";
  authoredBy?: string;
  display?: "cover" | "pip" | "split";
  endSample: number;
  id: string;
  srcInSample: number;
  startSample: number;
}

interface StillItem {
  assetId: string;
  authoredBy?: string;
  endSample: number;
  focusX: number;
  focusY: number;
  id: string;
  scale: number;
  startSample: number;
}

export interface ConfigEditTabProps {
  addBroll: () => void;
  addStill: () => void;
  addTitle: () => void;
  addZoom: () => void;
  assetName: (assetId: string) => string;
  brollAssets: { id: string; name: string }[];
  chosenAsset: string;
  chosenStillAsset: string;
  clearSelection: () => void;
  fmtTime: (sec: number) => string;
  graphicPlayheadOffset: number | null;
  hasOverlayInspector: boolean;
  newKeyframeProperty: Keyframe["property"];
  onChosenAssetChange: (assetId: string) => void;
  onChosenStillAssetChange: (assetId: string) => void;
  onNewKeyframePropertyChange: (property: Keyframe["property"]) => void;
  onTitlePosChange: (position: "lower" | "center" | "hero") => void;
  onTitleTextChange: (text: string) => void;
  presetOf: (zoom: ZoomItem) => string;
  projectBroll: BrollItem[];
  provenanceDisplay: boolean;
  removeSelected: () => void;
  reorderBrollOrder: (orderedIds: string[]) => void;
  sampleRate: number;
  selBroll: BrollItem | null;
  selectedId: string | undefined;
  selGraphic: GraphicItem | null;
  selGraphicKeyframes: Keyframe[];
  selGraphicValidation: { success: boolean; issues: string[] } | null;
  selRange: readonly [number, number] | null;
  selStill: StillItem | null;
  selTitle: TitleItem | null;
  selZoom: ZoomItem | null;
  setSelected: (selected: { kind: TimelineClipKind; id: string }) => void;
  stillAssets: { id: string; name: string }[];
  titlePos: "lower" | "center" | "hero";
  titleText: string;
  updateBroll: (id: string, patch: Partial<BrollItem>) => void;
  updateGraphic: (id: string, patch: { keyframes: Keyframe[] }) => void;
  updateStill: (id: string, patch: Partial<StillItem>) => void;
  updateTitle: (id: string, patch: Partial<TitleItem>) => void;
  updateZoom: (id: string, patch: Partial<ZoomItem>) => void;
}

export function ConfigEditTab({
  addBroll,
  addStill,
  addTitle,
  addZoom,
  assetName,
  brollAssets,
  chosenAsset,
  chosenStillAsset,
  clearSelection,
  fmtTime,
  graphicPlayheadOffset,
  hasOverlayInspector,
  newKeyframeProperty,
  onChosenAssetChange,
  onChosenStillAssetChange,
  onNewKeyframePropertyChange,
  onTitlePosChange,
  onTitleTextChange,
  presetOf,
  projectBroll,
  provenanceDisplay,
  removeSelected,
  reorderBrollOrder,
  sampleRate,
  selBroll,
  selGraphic,
  selGraphicKeyframes,
  selGraphicValidation,
  selRange,
  selStill,
  selTitle,
  selZoom,
  selectedId,
  setSelected,
  stillAssets,
  titlePos,
  titleText,
  updateBroll,
  updateGraphic,
  updateStill,
  updateTitle,
  updateZoom,
}: ConfigEditTabProps) {
  const fmt = fmtTime;
  const sr = sampleRate;
  const selected = selectedId ? { id: selectedId } : null;
  const clearSel = clearSelection;
  const setChosenAsset = onChosenAssetChange;
  const setChosenStillAsset = onChosenStillAssetChange;
  const setTitlePos = onTitlePosChange;
  const setTitleText = onTitleTextChange;
  const setNewKeyframeProperty = onNewKeyframePropertyChange;
  const project = { broll: projectBroll };

  return (
    <>
      {hasOverlayInspector ? (
        <>
          {selZoom && (
            <>
              <Section defaultOpen title="Parameters">
                {overlayProvenanceNote(selZoom.authoredBy, provenanceDisplay)}
                <SliderRow
                  formatValue={(value) => `${value.toFixed(2)}×`}
                  label="Scale"
                  max={3}
                  min={1}
                  onValueChange={(value) =>
                    updateZoom(selZoom.id, { scale: value })
                  }
                  step={0.05}
                  value={selZoom.scale}
                />
                <SliderRow
                  formatValue={(value) => `${value.toFixed(1)}s`}
                  label="Ramp"
                  max={5}
                  min={0}
                  onValueChange={(value) =>
                    updateZoom(selZoom.id, { rampSec: value })
                  }
                  step={0.1}
                  value={selZoom.rampSec}
                />
              </Section>
              <Section title="Preset">
                <ToggleGroup
                  className="w-full"
                  onValueChange={(value) => {
                    const preset = firstToggleValue(value);
                    if (preset && ZOOM_PRESETS[preset]) {
                      updateZoom(selZoom.id, ZOOM_PRESETS[preset]);
                    }
                  }}
                  size="sm"
                  spacing={0}
                  value={[presetOf(selZoom)].filter(Boolean)}
                  variant="outline"
                >
                  {Object.keys(ZOOM_PRESETS).map((k) => (
                    <ToggleGroupItem className="flex-1" key={k} value={k}>
                      {k}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Section>
            </>
          )}

          {selTitle && (
            <Section defaultOpen title="Title">
              {overlayProvenanceNote(selTitle.authoredBy, provenanceDisplay)}
              {selTitle.position === "hero" ? (
                <Textarea
                  className={CONFIG_COMPACT_TEXTAREA_CLASS}
                  onChange={(e) =>
                    updateTitle(selTitle.id, {
                      text: e.target.value,
                    })
                  }
                  placeholder={"Headline\nSubtitle (optional second line)"}
                  rows={3}
                  value={selTitle.text}
                />
              ) : (
                <Input
                  className={CONFIG_COMPACT_INPUT_CLASS}
                  onChange={(e) =>
                    updateTitle(selTitle.id, {
                      text: e.target.value,
                    })
                  }
                  placeholder="Title text"
                  value={selTitle.text}
                />
              )}
              <div className="mt-2">
                <Select
                  onValueChange={(v) => {
                    if (v) {
                      updateTitle(selTitle.id, {
                        position: v as "lower" | "center" | "hero",
                      });
                    }
                  }}
                  value={selTitle.position}
                >
                  <SelectTrigger
                    className={cn(
                      "w-full",
                      CONFIG_COMPACT_SELECT_TRIGGER_CLASS
                    )}
                    size="sm"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="lower">Lower third</SelectItem>
                      <SelectItem value="center">Centered</SelectItem>
                      <SelectItem value="hero">Hero card</SelectItem>
                      <SelectItem value="quote">Quote card</SelectItem>
                      <SelectItem value="divider">Section divider</SelectItem>
                      <SelectItem value="callout">Callout label</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </Section>
          )}

          {selBroll && brollAssets.length > 0 && (
            <>
              <Section defaultOpen title="Display">
                <ToggleGroup
                  className="w-full"
                  onValueChange={(value) => {
                    const mode = firstToggleValue(value);
                    if (
                      mode === "cover" ||
                      mode === "pip" ||
                      mode === "split"
                    ) {
                      updateBroll(selBroll.id, { display: mode });
                    }
                  }}
                  size="sm"
                  spacing={0}
                  value={[selBroll.display ?? "cover"]}
                  variant="outline"
                >
                  <ToggleGroupItem className="flex-1" value="cover">
                    Cover
                  </ToggleGroupItem>
                  <ToggleGroupItem className="flex-1" value="pip">
                    PiP
                  </ToggleGroupItem>
                  <ToggleGroupItem className="flex-1" value="split">
                    Split
                  </ToggleGroupItem>
                </ToggleGroup>
              </Section>
              <Section title="Audio">
                <Select
                  onValueChange={(v) => {
                    if (
                      v === "silent" ||
                      v === "broll" ||
                      v === "mix" ||
                      v === "duck-voice" ||
                      v === "duck-broll"
                    ) {
                      updateBroll(selBroll.id, { audioMode: v });
                    }
                  }}
                  value={selBroll.audioMode ?? "silent"}
                >
                  <SelectTrigger
                    className={cn(
                      "w-full",
                      CONFIG_COMPACT_SELECT_TRIGGER_CLASS
                    )}
                    size="sm"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="silent">
                        Silent (voice only)
                      </SelectItem>
                      <SelectItem value="broll">B-roll audio only</SelectItem>
                      <SelectItem value="mix">Mix with voice</SelectItem>
                      <SelectItem value="duck-voice">
                        Duck voice under b-roll
                      </SelectItem>
                      <SelectItem value="duck-broll">
                        Duck b-roll under voice
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Section>
              <Section defaultOpen title="Source">
                <Select
                  onValueChange={(v) =>
                    v &&
                    updateBroll(selBroll.id, {
                      assetId: v,
                    })
                  }
                  value={selBroll.assetId}
                >
                  <SelectTrigger
                    className={cn(
                      "w-full",
                      CONFIG_COMPACT_SELECT_TRIGGER_CLASS
                    )}
                    size="sm"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {brollAssets.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {(project.broll ?? []).length > 1 && (
                  <div className="mt-3">
                    <span className="text-muted-foreground text-xs">
                      Paint order : drag to restack
                    </span>
                    <div className="mt-1.5">
                      <OverlaySortable
                        onReorder={reorderBrollOrder}
                        onSelect={(id) =>
                          setSelected({
                            kind: "broll",
                            id,
                          })
                        }
                        rows={(project.broll ?? []).map((b) => ({
                          id: b.id,
                          label:
                            provenanceDisplay && b.authoredBy
                              ? `${assetName(b.assetId)} · ${authorDisplayLabel(b.authoredBy)}`
                              : assetName(b.assetId),
                        }))}
                        selectedId={selected?.id}
                      />
                    </div>
                  </div>
                )}
              </Section>
            </>
          )}

          {selStill && stillAssets.length > 0 && (
            <>
              <Section title="Source">
                {overlayProvenanceNote(selStill.authoredBy, provenanceDisplay)}
                <Select
                  onValueChange={(v) =>
                    v &&
                    updateStill(selStill.id, {
                      assetId: v,
                    })
                  }
                  value={selStill.assetId}
                >
                  <SelectTrigger
                    className={cn(
                      "w-full",
                      CONFIG_COMPACT_SELECT_TRIGGER_CLASS
                    )}
                    size="sm"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {stillAssets.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Section>
              <Section title="Ken Burns">
                <SliderRow
                  formatValue={(value) => `${value.toFixed(2)}×`}
                  label="Scale"
                  max={3}
                  min={1}
                  onValueChange={(value) =>
                    updateStill(selStill.id, { scale: value })
                  }
                  step={0.05}
                  value={selStill.scale}
                />
              </Section>
            </>
          )}

          {selGraphic && (
            <Section defaultOpen title="Graphic">
              <PropRow
                label={
                  selGraphic.type === "json-render" ? "Catalog" : "Template"
                }
                value={
                  selGraphic.type === "json-render"
                    ? (selGraphic.catalog ?? "product-announcement")
                    : selGraphic.template
                }
              >
                <span className="truncate text-muted-foreground text-xs">
                  {selGraphic.type === "json-render"
                    ? "JSON graphic"
                    : "Template graphic"}
                </span>
              </PropRow>
              {selGraphic.type === "json-render" && (
                <PropRow
                  label="Validation"
                  value={selGraphicValidation?.success ? "Valid" : "Invalid"}
                >
                  <span className="truncate text-muted-foreground text-xs">
                    {selGraphicValidation?.success
                      ? "Ready to export"
                      : (selGraphicValidation?.issues[0] ?? "Invalid spec")}
                  </span>
                </PropRow>
              )}
            </Section>
          )}

          {selGraphic && (
            <Section title="Keyframes">
              {selGraphicKeyframes.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  No keyframes yet. Scrub the playhead inside this graphic and
                  add one below. For build timing (stagger, entrance duration),
                  use graphic-set params inDurFrames and staggerFrames via CLI
                  or MCP.
                </p>
              ) : (
                selGraphicKeyframes.map((kf, index) => {
                  const bounds = keyframeValueBounds(kf.property);
                  return (
                    <div
                      className="space-y-1.5 rounded-md border border-border/60 bg-muted/30 p-1.5"
                      key={`${kf.sampleOffset}-${kf.property}-${index}`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-medium text-xs">
                          {formatKeyframeProperty(kf.property)}
                        </span>
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {fmt(kf.sampleOffset / sr)} in clip
                        </span>
                        <Button
                          aria-label={`Remove keyframe ${formatKeyframeProperty(kf.property)}`}
                          className="size-6! shrink-0"
                          onClick={() =>
                            updateGraphic(selGraphic.id, {
                              keyframes: removeKeyframeAt(
                                selGraphicKeyframes,
                                index
                              ),
                            })
                          }
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      <SliderRow
                        formatValue={(value) =>
                          kf.property === "scale"
                            ? `${value.toFixed(2)}×`
                            : value.toFixed(2)
                        }
                        label="Value"
                        max={bounds.max}
                        min={bounds.min}
                        onValueChange={(value) =>
                          updateGraphic(selGraphic.id, {
                            keyframes: updateKeyframeAt(
                              selGraphicKeyframes,
                              index,
                              { value }
                            ),
                          })
                        }
                        step={bounds.step}
                        value={kf.value}
                      />
                      <Field className="grid h-7 grid-cols-[4.25rem_1fr] items-center gap-1.5">
                        <FieldLabel className="text-muted-foreground text-xs">
                          Easing
                        </FieldLabel>
                        <Select
                          onValueChange={(v) => {
                            if (
                              typeof v === "string" &&
                              (KEYFRAME_EASINGS as string[]).includes(v)
                            ) {
                              const easing = v as Keyframe["easing"];
                              updateGraphic(selGraphic.id, {
                                keyframes: updateKeyframeAt(
                                  selGraphicKeyframes,
                                  index,
                                  { easing }
                                ),
                              });
                            }
                          }}
                          value={kf.easing}
                        >
                          <SelectTrigger
                            className={cn(
                              "w-full",
                              CONFIG_COMPACT_SELECT_TRIGGER_CLASS
                            )}
                            size="sm"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {KEYFRAME_EASINGS.map((easing) => (
                                <SelectItem key={easing} value={easing}>
                                  {easing}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                  );
                })
              )}
              <div className="mt-1 flex gap-1.5">
                <Select
                  onValueChange={(v) => {
                    if (
                      v === "opacity" ||
                      v === "scale" ||
                      v === "x" ||
                      v === "y"
                    ) {
                      setNewKeyframeProperty(v);
                    }
                  }}
                  value={newKeyframeProperty}
                >
                  <SelectTrigger
                    className={cn(
                      "flex-1",
                      CONFIG_COMPACT_SELECT_TRIGGER_CLASS
                    )}
                    size="sm"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {KEYFRAME_PROPERTIES.map((property) => (
                        <SelectItem key={property} value={property}>
                          {formatKeyframeProperty(property)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button
                  disabled={graphicPlayheadOffset === null}
                  onClick={() => {
                    if (!selGraphic || graphicPlayheadOffset === null) {
                      return;
                    }
                    const clipLength =
                      selGraphic.endSample - selGraphic.startSample;
                    const sampleOffset = clampKeyframeSampleOffset(
                      graphicPlayheadOffset,
                      clipLength
                    );
                    updateGraphic(selGraphic.id, {
                      keyframes: addKeyframe(selGraphicKeyframes, {
                        sampleOffset,
                        property: newKeyframeProperty,
                        value: defaultKeyframeValue(newKeyframeProperty),
                        easing: "linear",
                      }),
                    });
                  }}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  <Plus data-icon="inline-start" />
                  At playhead
                </Button>
              </div>
            </Section>
          )}

          <div className="p-2">
            <Button
              className="w-full"
              onClick={removeSelected}
              size="sm"
              variant="destructive"
            >
              <Trash2 data-icon="inline-start" /> Remove effect
            </Button>
          </div>
        </>
      ) : null}
      {selRange && !hasOverlayInspector ? (
        <>
          <Section defaultOpen title="Add effect">
            <Button
              className="w-full justify-start"
              onClick={addZoom}
              size="sm"
              variant="secondary"
            >
              <ZoomIn data-icon="inline-start" /> Push in
            </Button>
            <div className="mt-1.5 flex gap-1.5">
              <Select
                onValueChange={(value) => {
                  if (value) {
                    setChosenAsset(value);
                  }
                }}
                value={chosenAsset}
              >
                <SelectTrigger
                  className={cn("flex-1", CONFIG_COMPACT_SELECT_TRIGGER_CLASS)}
                  disabled={brollAssets.length === 0}
                  size="sm"
                >
                  <SelectValue placeholder="No b-roll" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {brollAssets.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                aria-label="Add b-roll"
                disabled={brollAssets.length === 0}
                onClick={addBroll}
                size="icon-sm"
                variant="secondary"
              >
                <Film />
              </Button>
            </div>
            <div className="mt-1.5 flex gap-1.5">
              <Select
                onValueChange={(value) => {
                  if (value) {
                    setChosenStillAsset(value);
                  }
                }}
                value={chosenStillAsset}
              >
                <SelectTrigger
                  className={cn("flex-1", CONFIG_COMPACT_SELECT_TRIGGER_CLASS)}
                  disabled={stillAssets.length === 0}
                  size="sm"
                >
                  <SelectValue placeholder="No still" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {stillAssets.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                aria-label="Add still"
                disabled={stillAssets.length === 0}
                onClick={addStill}
                size="icon-sm"
                variant="secondary"
              >
                <ImageIcon />
              </Button>
            </div>
          </Section>
          <Section title="Title">
            {titlePos === "hero" ? (
              <Textarea
                className={CONFIG_COMPACT_TEXTAREA_CLASS}
                onChange={(e) => setTitleText(e.target.value)}
                placeholder={"Headline\nSubtitle (optional second line)"}
                rows={3}
                value={titleText}
              />
            ) : (
              <Input
                className={CONFIG_COMPACT_INPUT_CLASS}
                onChange={(e) => setTitleText(e.target.value)}
                placeholder="Title text"
                value={titleText}
              />
            )}
            <div className="mt-1.5 flex gap-1.5">
              <Select
                onValueChange={(v) => {
                  if (v) {
                    setTitlePos(v as "lower" | "center" | "hero");
                  }
                }}
                value={titlePos}
              >
                <SelectTrigger
                  className={cn("flex-1", CONFIG_COMPACT_SELECT_TRIGGER_CLASS)}
                  size="sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="lower">Lower third</SelectItem>
                    <SelectItem value="center">Centered</SelectItem>
                    <SelectItem value="hero">Hero card</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                aria-label="Add title"
                disabled={!titleText.trim()}
                onClick={addTitle}
                size="icon-sm"
                variant="secondary"
              >
                <Type />
              </Button>
            </div>
          </Section>
          <div className="p-2">
            <Button
              className="text-muted-foreground"
              onClick={clearSel}
              size="sm"
              variant="ghost"
            >
              Clear selection
            </Button>
          </div>
        </>
      ) : null}
      {hasOverlayInspector || selRange ? null : (
        <p className="px-3 py-4 text-muted-foreground text-xs leading-relaxed">
          Select words in the transcript or an overlay on the timeline to edit
          here.
        </p>
      )}
    </>
  );
}
