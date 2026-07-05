export type ConfigInspectorIconId =
  | "captions"
  | "clock"
  | "film"
  | "image"
  | "scan"
  | "sparkles"
  | "type"
  | "volume"
  | "zoom";

export interface ConfigInspectorMetaRow {
  icon: ConfigInspectorIconId;
  label: string;
  value: string;
}

export interface ConfigInspectorSummary {
  badge: string;
  icon: ConfigInspectorIconId;
  label: string;
  meta: ConfigInspectorMetaRow[];
}

interface InspectorZoom {
  rampSec: number;
  scale: number;
  startSample: number;
}

interface InspectorTitle {
  position: string;
  startSample: number;
}

interface InspectorBroll {
  assetId: string;
  audioMode?: string;
  display?: string;
  startSample: number;
}

interface InspectorStill {
  assetId: string;
  scale: number;
  startSample: number;
}

interface InspectorGraphic {
  catalog?: string;
  startSample: number;
  template: string;
  type: "html" | "json-render";
  validation?: { success: boolean; issues: string[] } | null;
}

interface BuildConfigInspectorSummaryInput {
  assetName: (assetId: string) => string;
  fmtTime: (sec: number) => string;
  graphicLabel: string;
  sampleRate: number;
  selBroll: InspectorBroll | null;
  selGraphic: InspectorGraphic | null;
  selRange: readonly [number, number] | null;
  selStill: InspectorStill | null;
  selTitle: InspectorTitle | null;
  selZoom: InspectorZoom | null;
  wordStartSample: number | null;
}

function brollAudioLabel(audioMode: string | undefined): string {
  switch (audioMode) {
    case "broll":
      return "B-roll only";
    case "mix":
      return "Mix";
    case "duck-voice":
      return "Duck voice";
    case "duck-broll":
      return "Duck b-roll";
    default:
      return "Silent";
  }
}

function brollDisplayLabel(display: string | undefined): string {
  if (display === "pip") {
    return "PiP";
  }
  if (display === "split") {
    return "Split";
  }
  return "Cover";
}

export function buildConfigInspectorSummary(
  input: BuildConfigInspectorSummaryInput
): ConfigInspectorSummary | null {
  const {
    assetName,
    fmtTime,
    graphicLabel,
    sampleRate,
    selBroll,
    selGraphic,
    selRange,
    selStill,
    selTitle,
    selZoom,
    wordStartSample,
  } = input;

  if (selZoom) {
    return {
      icon: "zoom",
      label: "Push-in",
      badge: fmtTime(selZoom.startSample / sampleRate),
      meta: [
        {
          icon: "zoom",
          label: "Scale",
          value: `${selZoom.scale.toFixed(2)}x`,
        },
        {
          icon: "clock",
          label: "Ramp",
          value: `${selZoom.rampSec.toFixed(1)}s`,
        },
      ],
    };
  }

  if (selTitle) {
    return {
      icon: "type",
      label: "Title card",
      badge: fmtTime(selTitle.startSample / sampleRate),
      meta: [
        { icon: "type", label: "Position", value: selTitle.position },
        {
          icon: "clock",
          label: "Starts",
          value: fmtTime(selTitle.startSample / sampleRate),
        },
      ],
    };
  }

  if (selBroll) {
    return {
      icon: "film",
      label: "B-roll",
      badge: fmtTime(selBroll.startSample / sampleRate),
      meta: [
        { icon: "film", label: "Source", value: assetName(selBroll.assetId) },
        {
          icon: "scan",
          label: "Display",
          value: brollDisplayLabel(selBroll.display),
        },
        {
          icon: "volume",
          label: "Audio",
          value: brollAudioLabel(selBroll.audioMode),
        },
        {
          icon: "clock",
          label: "Starts",
          value: fmtTime(selBroll.startSample / sampleRate),
        },
      ],
    };
  }

  if (selStill) {
    return {
      icon: "image",
      label: "Still",
      badge: fmtTime(selStill.startSample / sampleRate),
      meta: [
        {
          icon: "image",
          label: "Source",
          value: assetName(selStill.assetId),
        },
        {
          icon: "zoom",
          label: "Scale",
          value: `${selStill.scale.toFixed(2)}x`,
        },
        {
          icon: "clock",
          label: "Starts",
          value: fmtTime(selStill.startSample / sampleRate),
        },
      ],
    };
  }

  if (selGraphic) {
    return {
      icon: "sparkles",
      label: graphicLabel,
      badge: fmtTime(selGraphic.startSample / sampleRate),
      meta: [
        {
          icon: "sparkles",
          label: selGraphic.type === "json-render" ? "Catalog" : "Template",
          value:
            selGraphic.type === "json-render"
              ? (selGraphic.catalog ?? "product-announcement")
              : selGraphic.template,
        },
        {
          icon: "clock",
          label: "Starts",
          value: fmtTime(selGraphic.startSample / sampleRate),
        },
        {
          icon: "captions",
          label: "Validation",
          value: selGraphic.validation
            ? selGraphic.validation.success
              ? "Valid"
              : "Invalid"
            : "Template",
        },
      ],
    };
  }

  if (selRange) {
    const wordCount = selRange[1] - selRange[0] + 1;
    return {
      icon: "sparkles",
      label: "Selection",
      badge: String(wordCount),
      meta: [
        { icon: "sparkles", label: "Words", value: String(wordCount) },
        {
          icon: "clock",
          label: "Start",
          value:
            wordStartSample === null
              ? "—"
              : fmtTime(wordStartSample / sampleRate),
        },
      ],
    };
  }

  return null;
}
