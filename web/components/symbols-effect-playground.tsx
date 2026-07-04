"use client";

import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { GLYPHS, SymbolsEffect } from "@/components/ui/symbols-effect";
import {
  isImagePreset,
  SYMBOLS_EFFECT_PRESETS,
  videoPreloadSrcs,
} from "@/lib/symbols-effect-presets";

const DEFAULT_PRESET = SYMBOLS_EFFECT_PRESETS[0];

const DEFAULT_STOPS = [0, 0.25, 0.5, 0.75, 1];
const GLYPH_OPTIONS = GLYPHS.map((glyph, index) => ({
  id: String(index),
  label: glyph.name,
}));
const SWATCHES = [
  "#ffffff",
  "#d8d8d8",
  "#9b9b9b",
  "#1b1b1b",
  "#0b1733",
  "#e88f00",
  "#2ee06a",
  "#3b82f6",
  "#a855f7",
  "#f7d8e3",
];

const STYLE = `
.symbols-playground{--text-primary:#1b1b1b;--text-secondary:#6b6b6b;--text-tertiary:#b5b5b5;--text-body:#2f2f2f;--border-ring:rgba(0,0,0,0.1);--border-line:#f0f0f0;--bg-page:#fcfcfc;--bg-hover:#f7f7f7;--bg-surface:#fff;--ease-out:cubic-bezier(.215,.61,.355,1);--ease-expo:cubic-bezier(.16,1,.3,1)}
@keyframes swirl-pop{0%{opacity:0;transform:translateY(-4px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
.hue-track::before{content:"";position:absolute;inset:0;border-radius:9999px;background:linear-gradient(90deg,red 0%,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,red 100%)}
.swirl-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;background:transparent;border:none;width:16px;height:16px}
.swirl-range::-moz-range-thumb{background:transparent;border:none;width:16px;height:16px}
.swirl-range::-webkit-slider-runnable-track{background:transparent}
.swirl-range::-moz-range-track{background:transparent}
`;

function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const drag = useRef<{ x: number; moved: boolean } | null>(null);
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  const quant = (next: number) =>
    Number.parseFloat(
      Math.min(Math.max(Math.round(next / step) * step, min), max).toPrecision(
        12
      )
    );
  const fromX = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect) {
      return value;
    }
    return quant(min + ((clientX - rect.left) / rect.width) * (max - min));
  };
  const release = (event: ReactPointerEvent) => {
    if (!drag.current) {
      return;
    }
    if (!drag.current.moved) {
      onChange(fromX(event.clientX));
    }
    drag.current = null;
    setActive(false);
  };

  return (
    <label className="flex min-w-[9rem] flex-1 flex-col">
      <div
        aria-label={label}
        aria-valuemax={max}
        aria-valuemin={min}
        aria-valuenow={value}
        className="relative flex h-8 w-full cursor-pointer touch-none select-none items-center overflow-hidden rounded-lg border border-[var(--border-line)] bg-[var(--bg-page)] outline-none ring-[var(--border-ring)] focus-visible:ring-1"
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
            event.preventDefault();
            onChange(quant(value - step));
          } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            event.preventDefault();
            onChange(quant(value + step));
          }
        }}
        onPointerCancel={release}
        onPointerDown={(event) => {
          (event.target as Element).setPointerCapture?.(event.pointerId);
          drag.current = { x: event.clientX, moved: false };
          setActive(true);
        }}
        onPointerMove={(event) => {
          if (!(active && drag.current)) {
            return;
          }
          if (Math.abs(event.clientX - drag.current.x) > 3) {
            drag.current.moved = true;
          }
          onChange(fromX(event.clientX));
        }}
        onPointerUp={release}
        ref={track}
        role="slider"
        tabIndex={0}
      >
        <span
          className="pointer-events-none absolute inset-y-0 left-0 bg-[var(--bg-hover)]"
          style={{ width: `${pct}%` }}
        />
        <span
          className={`pointer-events-none absolute top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-[var(--text-primary)] transition-opacity duration-150 ${active ? "opacity-90" : "opacity-40"}`}
          style={{ left: `max(3px, calc(${pct}% - 1.5px))` }}
        />
        <span className="pointer-events-none relative z-10 pl-3 text-[12px] text-[var(--text-secondary)]">
          {label}
        </span>
        <span className="pointer-events-none relative z-10 mr-3 ml-auto text-[12px] text-[var(--text-secondary)] tabular-nums">
          {format ? format(value) : value.toFixed(2)}
        </span>
      </div>
    </label>
  );
}

function hexToHsl(hex: string): [number, number, number] {
  let text = hex.replace("#", "").trim();
  if (text.length === 3) {
    text = text
      .split("")
      .map((char) => char + char)
      .join("");
  }
  const r = Number.parseInt(text.slice(0, 2), 16) / 255;
  const g = Number.parseInt(text.slice(2, 4), 16) / 255;
  const b = Number.parseInt(text.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  let saturation = 0;
  let hue = 0;
  if (max !== min) {
    const delta = max - min;
    saturation =
      lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    hue =
      (max === r
        ? (g - b) / delta + 6 * Number(g < b)
        : max === g
          ? (b - r) / delta + 2
          : (r - g) / delta + 4) * 60;
  }
  return [
    Math.round(hue),
    Math.round(100 * saturation),
    Math.round(100 * lightness),
  ];
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const sat = saturation / 100;
  const light = lightness / 100;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) =>
    Math.round(
      255 *
        (light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))
    )
      .toString(16)
      .padStart(2, "0");
  return `#${f(0)}${f(8)}${f(4)}`;
}

function ColorControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const [hue, saturation, lightness] = hexToHsl(value);
  const [hex, setHex] = useState(value);
  useEffect(() => {
    setHex(value);
  }, [value]);
  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative flex w-full min-w-0" ref={root}>
      <button
        aria-expanded={open}
        aria-label={`${label}: ${value}`}
        className={`group flex h-8 w-full min-w-0 items-center gap-1.5 rounded-lg border border-[var(--border-line)] bg-[var(--bg-page)] px-2.5 transition-colors duration-150 ease-[var(--ease-out)] hover:border-[var(--border-ring)] ${label ? "" : "justify-center"}`}
        onClick={() => {
          setOpen((current) => !current);
        }}
        type="button"
      >
        {label ? (
          <span className="truncate text-[12px] text-[var(--text-tertiary)]">
            {label}
          </span>
        ) : null}
        <span
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 rounded-[5px] border border-[var(--border-ring)] transition-transform duration-150 ease-[var(--ease-out)] group-active:scale-[0.96] ${label ? "ml-auto" : ""}`}
          style={{ backgroundColor: value }}
        />
      </button>
      {open ? (
        <div
          className="absolute top-full left-0 z-50 mt-2 flex w-56 flex-col gap-3 rounded-xl border border-[var(--border-ring)] bg-[var(--bg-surface)] p-3 shadow-[0_1px_2px_rgba(17,24,39,0.06),0_8px_24px_rgba(17,24,39,0.08)]"
          style={{ animation: "swirl-pop 0.16s var(--ease-expo)" }}
        >
          <span className="hue-track relative flex h-4 items-center">
            <span
              className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"
              style={{
                left: `${(hue / 360) * 100}%`,
                backgroundColor: value,
              }}
            />
            <input
              aria-label={`${label} hue`}
              className="swirl-range relative z-10 h-4 w-full cursor-pointer appearance-none bg-transparent"
              max={360}
              min={0}
              onChange={(event) => {
                onChange(
                  hslToHex(
                    Number(event.target.value),
                    saturation || 70,
                    lightness || 50
                  )
                );
              }}
              step={1}
              type="range"
              value={hue}
            />
          </span>
          <input
            aria-label={`${label} hex`}
            className="w-full rounded-md border border-[var(--border-line)] bg-[var(--bg-page)] px-2 py-1 font-mono text-[12px] text-[var(--text-body)] lowercase outline-none transition-colors duration-150 focus:border-[var(--border-ring)]"
            onBlur={() => {
              setHex(value);
            }}
            onChange={(event) => {
              setHex(event.target.value);
              const text = event.target.value.trim();
              if (/^#?[0-9a-fA-F]{6}$/.test(text)) {
                onChange(`#${text.replace(/^#?/, "").toLowerCase()}`);
              }
            }}
            spellCheck={false}
            type="text"
            value={hex}
          />
          <div className="grid grid-cols-5 gap-1.5">
            {SWATCHES.map((color) => (
              <button
                aria-label={color}
                className={`h-6 w-full rounded-md border transition-transform duration-150 ease-[var(--ease-out)] active:scale-[0.96] ${color.toLowerCase() === value.toLowerCase() ? "border-[var(--text-primary)]" : "border-[var(--border-ring)]"}`}
                key={color}
                onClick={() => {
                  onChange(color);
                }}
                style={{ backgroundColor: color }}
                type="button"
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Select({
  options,
  activeId,
  onPick,
  ariaLabel,
}: {
  options: { id: string; label: string }[];
  activeId: string;
  onPick: (id: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = options.find((option) => option.id === activeId);
  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative flex shrink-0" ref={root}>
      <button
        aria-expanded={open}
        aria-label={ariaLabel}
        className="flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-[var(--border-line)] bg-[var(--bg-page)] pr-2.5 pl-3 text-[12px] text-[var(--text-primary)] transition-colors duration-150 ease-[var(--ease-out)] hover:border-[var(--border-ring)]"
        onClick={() => {
          setOpen((current) => !current);
        }}
        role="combobox"
        type="button"
      >
        <span className="whitespace-nowrap">{current?.label ?? "Select"}</span>
        <svg
          aria-hidden="true"
          className={`shrink-0 text-[var(--text-tertiary)] transition-transform duration-150 ease-[var(--ease-out)] ${open ? "rotate-180" : ""}`}
          height="10"
          viewBox="0 0 10 10"
          width="10"
        >
          <path
            d="M2 3.5 5 6.5 8 3.5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.3"
          />
        </svg>
      </button>
      {open ? (
        <div
          className="absolute top-full right-0 z-50 mt-2 flex max-h-64 w-40 flex-col gap-0.5 overflow-y-auto rounded-xl border border-[var(--border-ring)] bg-[var(--bg-surface)] p-1 shadow-[0_1px_2px_rgba(17,24,39,0.06),0_8px_24px_rgba(17,24,39,0.08)]"
          role="listbox"
          style={{ animation: "swirl-pop 0.16s var(--ease-expo)" }}
        >
          {options.map((option) => {
            const selected = option.id === activeId;
            return (
              <button
                aria-selected={selected}
                className={`rounded-md px-2.5 py-1.5 text-left text-[12px] transition-colors duration-150 ease-[var(--ease-out)] ${selected ? "bg-[var(--bg-page)] text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:bg-[var(--bg-page)] hover:text-[var(--text-primary)]"}`}
                key={option.id}
                onClick={() => {
                  onPick(option.id);
                  setOpen(false);
                }}
                role="option"
                type="button"
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function GhostButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className="inline-flex h-7 shrink-0 items-center self-start rounded-lg border border-[var(--border-line)] bg-[var(--bg-surface)] px-3 font-medium text-[12px] text-[var(--text-secondary)] transition-colors duration-150 ease-[var(--ease-out)] hover:border-[var(--border-ring)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] active:scale-[0.98]"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

export default function SymbolsEffectPlayground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("dark");
    return () => {
      document.documentElement.classList.remove("dark");
    };
  }, []);

  const [presetIndex, setPresetIndex] = useState(0);
  const [src, setSrc] = useState(DEFAULT_PRESET.video);
  const [srcType, setSrcType] = useState<"auto" | "image" | "video">(() =>
    isImagePreset(DEFAULT_PRESET) ? "image" : "video"
  );
  const [cell, setCell] = useState(8);
  const [colors, setColors] = useState(DEFAULT_PRESET.colors);
  const [stops, setStops] = useState(DEFAULT_STOPS);
  const [glyphs, setGlyphs] = useState(DEFAULT_PRESET.glyphs);
  const [zoom, setZoom] = useState(DEFAULT_PRESET.zoom ?? 1);
  const [bg, setBg] = useState("#ffffff");
  const [playing, setPlaying] = useState(true);
  const [recording, setRecording] = useState(false);
  const activePreset = SYMBOLS_EFFECT_PRESETS[presetIndex] ?? DEFAULT_PRESET;

  const remixPreset = () => {
    const nextIndex = (presetIndex + 1) % SYMBOLS_EFFECT_PRESETS.length;
    const preset = SYMBOLS_EFFECT_PRESETS[nextIndex];
    setPresetIndex(nextIndex);
    setColors(preset.colors);
    setGlyphs(preset.glyphs);
    setZoom(preset.zoom ?? 1);
    setSrc(preset.video);
    setSrcType(isImagePreset(preset) ? "image" : "video");
    setPlaying(true);
  };

  const download = (blob: Blob, name: string) => {
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = name;
    anchor.click();
    setTimeout(() => {
      URL.revokeObjectURL(anchor.href);
    }, 2000);
  };

  const savePNG = () => {
    canvasRef.current?.toBlob(
      (blob) => blob && download(blob, `sandbox-${Date.now()}.png`),
      "image/png"
    );
  };

  const toggleRecord = () => {
    if (recRef.current?.state === "recording") {
      recRef.current.stop();
      recRef.current = null;
      setRecording(false);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const stream = canvas.captureStream(30);
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 8e6,
    });
    recorder.ondataavailable = (event) => {
      if (event.data.size) {
        chunks.push(event.data);
      }
    };
    recorder.onstop = () => {
      download(
        new Blob(chunks, { type: "video/webm" }),
        `sandbox-${Date.now()}.webm`
      );
    };
    recRef.current = recorder;
    recorder.start();
    setRecording(true);
  };

  return (
    <>
      <style>{STYLE}</style>
      <div className="symbols-playground flex min-h-screen w-full justify-center bg-background px-8 py-10 font-sans text-[var(--text-primary)]">
        <section className="flex w-full min-w-0 max-w-[656px] flex-col gap-3 self-start">
          <div className="flex flex-col">
            <div className="relative z-10 flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-[var(--border-line)] bg-white">
              <SymbolsEffect
                bandColors={colors}
                bandGlyphs={glyphs}
                bandStops={stops}
                bg={bg}
                cell={cell}
                className="h-full w-full"
                paused={!playing}
                preloadSrcs={videoPreloadSrcs()}
                ref={canvasRef}
                src={src}
                srcType={srcType}
                zoom={zoom}
              />
              {recording ? (
                <span className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-1 font-medium text-[11px] text-white">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  REC
                </span>
              ) : null}
            </div>

            <div className="-mt-5 flex flex-col gap-4 rounded-b-xl border border-[var(--border-line)] border-t-0 bg-[var(--bg-surface)] p-4 pt-8">
              <p className="text-[12px] text-[var(--text-secondary)]">
                Preset:{" "}
                <span className="font-medium text-[var(--text-primary)]">
                  {activePreset.name}
                </span>
              </p>
              <Slider
                format={(value) => `${value}px`}
                label="Cell size"
                max={40}
                min={2}
                onChange={setCell}
                step={1}
                value={cell}
              />
              <Slider
                format={(value) => `${value.toFixed(2)}×`}
                label="Zoom"
                max={2.5}
                min={0.4}
                onChange={setZoom}
                step={0.01}
                value={zoom}
              />
              <ColorControl label="Background" onChange={setBg} value={bg} />

              <div className="flex flex-col gap-2.5">
                <span className="text-[12px] text-[var(--text-tertiary)]">
                  Bands (dark to light)
                </span>
                {[0, 1, 2, 3].map((index) => (
                  <div className="flex items-center gap-1.5" key={index}>
                    <span className="w-[18px] shrink-0 text-[12px] text-[var(--text-secondary)] tabular-nums">
                      {index + 1}
                    </span>
                    <span className="w-9 shrink-0">
                      <ColorControl
                        label=""
                        onChange={(value) => {
                          setColors((current) =>
                            current.map((color, bandIndex) =>
                              bandIndex === index ? value : color
                            )
                          );
                        }}
                        value={colors[index]}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <Select
                        activeId={String(glyphs[index])}
                        ariaLabel={`Band ${index + 1} symbol`}
                        onPick={(id) => {
                          setGlyphs((current) =>
                            current.map((glyph, bandIndex) =>
                              bandIndex === index ? Number(id) : glyph
                            )
                          );
                        }}
                        options={GLYPH_OPTIONS}
                      />
                    </span>
                    <span className="w-[52px] shrink-0 text-right text-[11px] text-[var(--text-tertiary)] tabular-nums">
                      {Math.round(100 * stops[index])}–
                      {Math.round(100 * stops[index + 1])}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2 border-[var(--border-line)] border-t pt-4">
                <span className="text-[12px] text-[var(--text-tertiary)]">
                  Thresholds
                </span>
                {[1, 2, 3].map((index) => (
                  <Slider
                    format={(value) => `${Math.round(100 * value)}%`}
                    key={index}
                    label={`Edge ${index}`}
                    max={1}
                    min={0}
                    onChange={(value) => {
                      setStops((current) =>
                        current.map((stop, stopIndex) =>
                          stopIndex === index ? value : stop
                        )
                      );
                    }}
                    step={0.01}
                    value={stops[index]}
                  />
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 border-[var(--border-line)] border-t pt-4">
                <GhostButton onClick={remixPreset}>Remix</GhostButton>
                <GhostButton
                  onClick={() => {
                    setPlaying((current) => !current);
                  }}
                >
                  {playing ? "Pause" : "Play"}
                </GhostButton>
                <GhostButton onClick={savePNG}>Save PNG</GhostButton>
                <GhostButton onClick={toggleRecord}>
                  {recording ? "Stop" : "Record"}
                </GhostButton>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
