"use client";

import { type CSSProperties, type Ref, useEffect, useRef } from "react";
import * as THREE from "three";

/* ==========================================================================
 * Symbols Effect: GPU halftone that rebuilds a photo or video out of little
 * marks. The frame is pixelated into cells; each cell's luminance is bucketed
 * into one of four brightness bands; and that band's symbol glyph (tiled once
 * per cell) is stamped, tinted with the band's colour over a white ground.
 * ======================================================================== */

type GlyphDraw = (ctx: CanvasRenderingContext2D) => void;
const C = 16;

/** Avoid double-encoding preset URLs that already contain %20. */
export function mediaUrl(url: string): string {
  if (url.startsWith("blob:")) {
    return url;
  }
  try {
    return encodeURI(decodeURI(url));
  } catch {
    return encodeURI(url);
  }
}

export const GLYPHS: { name: string; draw: GlyphDraw }[] = [
  { name: "empty", draw: () => undefined },
  {
    name: "dot",
    draw: (ctx) => {
      ctx.beginPath();
      ctx.arc(C, C, 5, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    name: "ring",
    draw: (ctx) => {
      ctx.beginPath();
      ctx.arc(C, C, 9, 0, Math.PI * 2);
      ctx.arc(C, C, 5.5, 0, Math.PI * 2, true);
      ctx.fill("evenodd");
    },
  },
  {
    name: "square",
    draw: (ctx) => {
      ctx.fillRect(C - 7, C - 7, 14, 14);
    },
  },
  {
    name: "frame",
    draw: (ctx) => {
      ctx.beginPath();
      ctx.rect(C - 9, C - 9, 18, 18);
      ctx.rect(C - 5, C - 5, 10, 10);
      ctx.fill("evenodd");
    },
  },
  {
    name: "diagonal",
    draw: (ctx) => {
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(6, 26);
      ctx.lineTo(26, 6);
      ctx.stroke();
    },
  },
  {
    name: "cross",
    draw: (ctx) => {
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(7, 7);
      ctx.lineTo(25, 25);
      ctx.moveTo(25, 7);
      ctx.lineTo(7, 25);
      ctx.stroke();
    },
  },
  {
    name: "plus",
    draw: (ctx) => {
      ctx.fillRect(C - 2.5, 5, 5, 22);
      ctx.fillRect(5, C - 2.5, 22, 5);
    },
  },
  {
    name: "chevron",
    draw: (ctx) => {
      ctx.lineWidth = 5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(8, 10);
      ctx.lineTo(C, 22);
      ctx.lineTo(24, 10);
      ctx.stroke();
    },
  },
  {
    name: "triangle",
    draw: (ctx) => {
      ctx.beginPath();
      ctx.moveTo(C, 6);
      ctx.lineTo(26, 25);
      ctx.lineTo(6, 25);
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    name: "diamond",
    draw: (ctx) => {
      ctx.beginPath();
      ctx.moveTo(C, 5);
      ctx.lineTo(27, C);
      ctx.lineTo(C, 27);
      ctx.lineTo(5, C);
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    name: "bars",
    draw: (ctx) => {
      ctx.fillRect(7, 6, 4, 20);
      ctx.fillRect(14, 6, 4, 20);
      ctx.fillRect(21, 6, 4, 20);
    },
  },
  {
    name: "hexagon",
    draw: (ctx) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const x = C + Math.cos(a) * 11;
        const y = C + Math.sin(a) * 11;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    name: "star",
    draw: (ctx) => {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 12 : 5;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const x = C + Math.cos(a) * r;
        const y = C + Math.sin(a) * r;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    name: "heart",
    draw: (ctx) => {
      ctx.beginPath();
      ctx.moveTo(16, 26);
      ctx.bezierCurveTo(2, 16, 6, 6, 16, 12);
      ctx.bezierCurveTo(26, 6, 30, 16, 16, 26);
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    name: "drop",
    draw: (ctx) => {
      ctx.beginPath();
      ctx.moveTo(16, 5);
      ctx.bezierCurveTo(24, 15, 26, 20, 16, 27);
      ctx.bezierCurveTo(6, 20, 8, 15, 16, 5);
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    name: "flower",
    draw: (ctx) => {
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        ctx.beginPath();
        ctx.ellipse(
          C + Math.cos(a) * 7,
          C + Math.sin(a) * 7,
          4.5,
          4.5,
          0,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    },
  },
  {
    name: "asterisk",
    draw: (ctx) => {
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      for (let i = 0; i < 3; i++) {
        const a = (Math.PI / 3) * i;
        ctx.beginPath();
        ctx.moveTo(C - Math.cos(a) * 11, C - Math.sin(a) * 11);
        ctx.lineTo(C + Math.cos(a) * 11, C + Math.sin(a) * 11);
        ctx.stroke();
      }
    },
  },
  {
    name: "spark",
    draw: (ctx) => {
      ctx.beginPath();
      const pts = [
        [16, 3],
        [19, 13],
        [29, 16],
        [19, 19],
        [16, 29],
        [13, 19],
        [3, 16],
        [13, 13],
      ] as const;
      for (const [i, [x, y]] of pts.entries()) {
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    name: "pentagon",
    draw: (ctx) => {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = ((Math.PI * 2) / 5) * i - Math.PI / 2;
        const x = C + Math.cos(a) * 11;
        const y = C + Math.sin(a) * 11;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    name: "donut",
    draw: (ctx) => {
      ctx.beginPath();
      ctx.arc(C, C, 11, 0, Math.PI * 2);
      ctx.arc(C, C, 4, 0, Math.PI * 2, true);
      ctx.fill("evenodd");
    },
  },
  {
    name: "halfmoon",
    draw: (ctx) => {
      ctx.beginPath();
      ctx.arc(C, C, 11, 0, Math.PI * 2);
      ctx.arc(C + 6, C - 3, 10, 0, Math.PI * 2, true);
      ctx.fill("evenodd");
    },
  },
  {
    name: "arrow",
    draw: (ctx) => {
      ctx.lineWidth = 4;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(7, 16);
      ctx.lineTo(23, 16);
      ctx.moveTo(16, 9);
      ctx.lineTo(23, 16);
      ctx.lineTo(16, 23);
      ctx.stroke();
    },
  },
  {
    name: "wave",
    draw: (ctx) => {
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(5, 16);
      ctx.quadraticCurveTo(11, 7, 16, 16);
      ctx.quadraticCurveTo(21, 25, 27, 16);
      ctx.stroke();
    },
  },
];

export function glyphCanvas(index: number, size = 64): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  ctx.clearRect(0, 0, size, size);
  const glyph = GLYPHS[index];
  if (glyph) {
    ctx.save();
    ctx.scale(size / 32, size / 32);
    ctx.fillStyle = "#000";
    ctx.strokeStyle = "#000";
    glyph.draw(ctx);
    ctx.restore();
  }
  return canvas;
}

const VERT = /* glsl */ `
precision highp float;
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform sampler2D src;
uniform vec2 resolution;
uniform vec2 srcScale;
uniform float zoom;
uniform vec3 bgColor;
uniform float cell;

uniform vec3 bandColor[4];
uniform vec3 bandColorB[4];
uniform float bandLo[4];
uniform float bandHi[4];
uniform sampler2D glyph[4];
uniform sampler2D glyphB[4];
uniform float morphT;

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec2 cover(vec2 uv) {
  return (uv - 0.5) * srcScale / zoom + 0.5;
}

vec2 cellUV(vec2 step) {
  return floor(vUv / step) * step + step * 0.5;
}

vec4 sampleGlyph(int i, vec2 uv) {
  if (i == 0) return texture2D(glyph[0], uv);
  if (i == 1) return texture2D(glyph[1], uv);
  if (i == 2) return texture2D(glyph[2], uv);
  return texture2D(glyph[3], uv);
}
vec4 sampleGlyphB(int i, vec2 uv) {
  if (i == 0) return texture2D(glyphB[0], uv);
  if (i == 1) return texture2D(glyphB[1], uv);
  if (i == 2) return texture2D(glyphB[2], uv);
  return texture2D(glyphB[3], uv);
}

void main() {
  vec3 paper = vec3(1.0);
  vec2 step = vec2(cell) / resolution;

  vec2 suv = cover(cellUV(step));
  vec2 inset = 1.0 / resolution;
  if (suv.x < inset.x || suv.x > 1.0 - inset.x ||
      suv.y < inset.y || suv.y > 1.0 - inset.y) {
    gl_FragColor = vec4(bgColor, 1.0);
    return;
  }
  float l = lum(texture2D(src, suv).rgb);

  gl_FragColor = vec4(paper, 1.0);
  for (int i = 0; i < 4; i++) {
    if (l >= bandLo[i] && l <= bandHi[i]) {
      vec2 gUv = mod(vUv / step, vec2(1.0));
      vec4 gA = sampleGlyph(i, gUv);
      vec4 gB = sampleGlyphB(i, gUv);
      float a = mix(gB.a, gA.a, morphT);
      vec3 gcol = mix(gB.rgb, gA.rgb, morphT);
      vec3 col = mix(bandColorB[i], bandColor[i], morphT);
      vec3 sym = mix(paper, gcol, a);
      float k = smoothstep(0.0, 1.0, lum(sym));
      gl_FragColor = vec4(mix(col, paper, k), 1.0);
    }
  }
}
`;

export interface SymbolsLook {
  colors: string[];
  glyphs: number[];
  zoom?: number;
}

export interface SymbolsParams {
  bandColors: string[];
  bandGlyphs: number[];
  bandStops: number[];
  bg?: string;
  cell: number;
  zoom?: number;
}

interface PooledVideo {
  aspect: number;
  ready: boolean;
  tex: THREE.VideoTexture;
  video: HTMLVideoElement;
}

export class SymbolsRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private uniforms: Record<string, { value: unknown }>;
  private canvas: HTMLCanvasElement;
  private srcAspect = 1;
  private video: HTMLVideoElement | null = null;
  private raf = 0;
  private playing = false;
  private pool = new Map<string, PooledVideo>();
  private curUrl: string | null = null;
  private pendingSwap = false;
  private glyphIdx: number[];
  private reqCell: number;
  private morphRaf = 0;

  constructor(canvas: HTMLCanvasElement, params: SymbolsParams) {
    this.glyphIdx = [...params.bandGlyphs];
    this.reqCell = params.cell;
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(new THREE.Color(params.bg ?? "#ffffff"), 1);

    const placeholder = (() => {
      const placeholderCanvas = document.createElement("canvas");
      placeholderCanvas.width = placeholderCanvas.height = 4;
      const ctx = placeholderCanvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#9a9a9a";
        ctx.fillRect(0, 0, 4, 4);
      }
      return new THREE.CanvasTexture(placeholderCanvas);
    })();

    const glyphs = params.bandGlyphs.map((index) => this.makeGlyph(index));
    const colors = params.bandColors.map((hex) => new THREE.Color(hex));

    this.uniforms = {
      src: { value: placeholder },
      resolution: { value: new THREE.Vector2(1, 1) },
      srcScale: { value: new THREE.Vector2(1, 1) },
      zoom: { value: params.zoom ?? 1 },
      bgColor: { value: new THREE.Color(params.bg ?? "#ffffff") },
      cell: { value: params.cell },
      bandColor: { value: colors },
      bandColorB: { value: colors.map((color) => color.clone()) },
      bandLo: {
        value: [
          params.bandStops[0],
          params.bandStops[1],
          params.bandStops[2],
          params.bandStops[3],
        ],
      },
      bandHi: {
        value: [
          params.bandStops[1],
          params.bandStops[2],
          params.bandStops[3],
          params.bandStops[4],
        ],
      },
      glyph: { value: glyphs },
      glyphB: {
        value: params.bandGlyphs.map((index) => this.makeGlyph(index)),
      },
      morphT: { value: 1 },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.scene.add(this.quad);
    this.resize();
    this.render();
  }

  private makeGlyph(index: number) {
    const texture = new THREE.CanvasTexture(glyphCanvas(index));
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  render = () => {
    this.renderer.render(this.scene, this.camera);
  };

  resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    this.renderer.setSize(width, height, false);
    (this.uniforms.resolution.value as THREE.Vector2).set(width, height);
    this.applyCell();
    this.fit();
    this.render();
  };

  private applyCell() {
    const width = Math.max(1, this.canvas.getBoundingClientRect().width);
    this.uniforms.cell.value = Math.max(2, this.reqCell * (width / 600));
  }

  private fit() {
    this.quad.scale.set(1, 1, 1);
    const rect = this.canvas.getBoundingClientRect();
    const canvasAspect = rect.width / Math.max(1, rect.height);
    let scaleX = 1;
    let scaleY = 1;
    if (this.srcAspect > canvasAspect) {
      scaleX = canvasAspect / this.srcAspect;
    } else {
      scaleY = this.srcAspect / canvasAspect;
    }
    (this.uniforms.srcScale.value as THREE.Vector2).set(scaleX, scaleY);
  }

  private morphing() {
    return (this.uniforms.morphT.value as number) < 1;
  }

  setCellStops(cell: number, stops: number[]) {
    this.reqCell = cell;
    this.applyCell();
    this.uniforms.bandLo.value = [stops[0], stops[1], stops[2], stops[3]];
    this.uniforms.bandHi.value = [stops[1], stops[2], stops[3], stops[4]];
    this.render();
  }

  setZoom(value: number) {
    if (this.pendingSwap) {
      return;
    }
    this.uniforms.zoom.value = value;
    this.render();
  }

  private commitZoom(value: number) {
    this.uniforms.zoom.value = value;
  }

  setBg(hex: string) {
    (this.uniforms.bgColor.value as THREE.Color).set(hex);
    this.renderer.setClearColor(hex, 1);
    this.render();
  }

  setColors(hexes: string[]) {
    if (this.morphing() || this.pendingSwap) {
      return;
    }
    (this.uniforms.bandColor.value as THREE.Color[]).forEach((color, index) => {
      color.set(hexes[index]);
    });
    (this.uniforms.bandColorB.value as THREE.Color[]).forEach(
      (color, index) => {
        color.set(hexes[index]);
      }
    );
    this.uniforms.morphT.value = 1;
    this.render();
  }

  private setLook(colors: string[], glyphs: number[]) {
    cancelAnimationFrame(this.morphRaf);
    const glyphA = this.uniforms.glyph.value as THREE.Texture[];
    const glyphB = this.uniforms.glyphB.value as THREE.Texture[];
    const colorA = this.uniforms.bandColor.value as THREE.Color[];
    const colorB = this.uniforms.bandColorB.value as THREE.Color[];
    for (let index = 0; index < 4; index++) {
      glyphA[index].dispose();
      glyphB[index].dispose();
      glyphA[index] = this.makeGlyph(glyphs[index]);
      glyphB[index] = this.makeGlyph(glyphs[index]);
      colorA[index].set(colors[index]);
      colorB[index].set(colors[index]);
    }
    this.glyphIdx = [...glyphs];
    this.uniforms.morphT.value = 1;
    this.render();
  }

  setGlyph(band: number, glyph: number) {
    if (this.pendingSwap) {
      return;
    }
    this.glyphIdx[band] = glyph;
    const glyphA = this.uniforms.glyph.value as THREE.Texture[];
    const glyphB = this.uniforms.glyphB.value as THREE.Texture[];
    glyphA[band].dispose();
    glyphB[band].dispose();
    glyphA[band] = this.makeGlyph(glyph);
    glyphB[band] = this.makeGlyph(glyph);
    this.render();
  }

  morphTo(colors: string[], glyphs: number[], duration = 700) {
    cancelAnimationFrame(this.morphRaf);
    const glyphA = this.uniforms.glyph.value as THREE.Texture[];
    const glyphB = this.uniforms.glyphB.value as THREE.Texture[];
    const colorA = this.uniforms.bandColor.value as THREE.Color[];
    const colorB = this.uniforms.bandColorB.value as THREE.Color[];
    for (let index = 0; index < 4; index++) {
      glyphB[index].dispose();
      glyphB[index] = this.makeGlyph(this.glyphIdx[index]);
      colorB[index].copy(colorA[index]);
      glyphA[index].dispose();
      glyphA[index] = this.makeGlyph(glyphs[index]);
      colorA[index].set(colors[index]);
    }
    this.glyphIdx = [...glyphs];
    const startedAt = performance.now();
    const tick = () => {
      const elapsed = Math.min(1, (performance.now() - startedAt) / duration);
      this.uniforms.morphT.value =
        elapsed >= 1
          ? 1
          : 1 - Math.exp(-7.5 * elapsed) * Math.cos(5.2 * elapsed);
      this.render();
      if (elapsed < 1) {
        this.morphRaf = requestAnimationFrame(tick);
      } else {
        this.uniforms.morphT.value = 1;
      }
    };
    this.uniforms.morphT.value = 0;
    this.morphRaf = requestAnimationFrame(tick);
  }

  private ensurePooled(url: string): PooledVideo {
    const hit = this.pool.get(url);
    if (hit) {
      return hit;
    }
    const video = document.createElement("video");
    video.src = mediaUrl(url);
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    const entry: PooledVideo = { video, tex: texture, aspect: 1, ready: false };
    video.addEventListener("loadeddata", () => {
      entry.aspect = video.videoWidth / video.videoHeight || 1;
      entry.ready = true;
    });
    video.load();
    this.pool.set(url, entry);
    return entry;
  }

  preload(urls: string[]) {
    for (const url of urls) {
      this.ensurePooled(url);
    }
  }

  setImage(url: string, look?: SymbolsLook) {
    this.curUrl = url;
    if (look) {
      this.pendingSwap = true;
    }
    const safe = mediaUrl(url);
    new THREE.TextureLoader().load(safe, (texture) => {
      if (this.curUrl !== url) {
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      this.pendingSwap = false;
      if (look) {
        this.setLook(look.colors, look.glyphs);
        if (look.zoom !== undefined) {
          this.commitZoom(look.zoom);
        }
      }
      this.video?.pause();
      this.stopLoop();
      this.uniforms.src.value = texture;
      this.srcAspect = texture.image.width / texture.image.height;
      this.video = null;
      this.fit();
      this.render();
    });
  }

  setVideo(url: string, look?: SymbolsLook) {
    this.curUrl = url;
    if (look) {
      this.pendingSwap = true;
    }
    const entry = this.ensurePooled(url);
    const swap = () => {
      if (this.curUrl !== url) {
        return;
      }
      if (this.video && this.video !== entry.video) {
        this.video.pause();
      }
      this.pendingSwap = false;
      if (look) {
        this.setLook(look.colors, look.glyphs);
        if (look.zoom !== undefined) {
          this.commitZoom(look.zoom);
        }
      }
      this.uniforms.src.value = entry.tex;
      this.video = entry.video;
      this.srcAspect = entry.aspect;
      this.fit();
      this.startLoop();
      this.render();
    };
    const armed = () => {
      if (this.curUrl !== url) {
        return;
      }
      const startedAt = performance.now();
      const onFrame = () => {
        if (this.curUrl !== url) {
          return;
        }
        const wait = Math.max(0, 100 - (performance.now() - startedAt));
        window.setTimeout(swap, wait);
      };
      const video = entry.video as HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: () => void) => void;
      };
      if (typeof video.requestVideoFrameCallback === "function") {
        video.requestVideoFrameCallback(onFrame);
      } else {
        window.setTimeout(swap, 100);
      }
      this.startLoop();
    };
    entry.video
      .play()
      .then(armed)
      .catch(() => swap());
  }

  hasVideo() {
    return !!this.video;
  }

  setPaused(paused: boolean) {
    if (!this.video) {
      return;
    }
    if (paused) {
      this.video.pause();
      this.stopLoop();
      this.render();
    } else {
      this.video.play().catch(() => undefined);
      this.startLoop();
    }
  }

  private loop = () => {
    if (!this.playing) {
      return;
    }
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };

  private startLoop() {
    if (this.playing) {
      return;
    }
    this.playing = true;
    this.raf = requestAnimationFrame(this.loop);
  }

  private stopLoop() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
  }

  dispose() {
    this.stopLoop();
    cancelAnimationFrame(this.morphRaf);
    for (const { video, tex } of this.pool.values()) {
      video.pause();
      video.src = "";
      video.load();
      tex.dispose();
    }
    this.pool.clear();
    this.video = null;
    for (const texture of this.uniforms.glyph.value as THREE.Texture[]) {
      texture.dispose();
    }
    for (const texture of this.uniforms.glyphB.value as THREE.Texture[]) {
      texture.dispose();
    }
    this.quad.material.dispose();
    this.quad.geometry.dispose();
    this.renderer.dispose();
  }
}

const DEFAULT_COLORS = ["#241452", "#6d3bf5", "#a9c2ff", "#ffffff"];
const DEFAULT_STOPS = [0, 0.25, 0.5, 0.75, 1];
const DEFAULT_GLYPHS = [4, 2, 1, 0];

export interface SymbolsEffectProps {
  bandColors?: string[];
  bandGlyphs?: number[];
  bandStops?: number[];
  bg?: string;
  cell?: number;
  className?: string;
  paused?: boolean;
  preloadSrcs?: string[];
  src: string;
  srcType?: "auto" | "video" | "image";
  style?: CSSProperties;
  zoom?: number;
}

const isVideoUrl = (url: string) =>
  /\.(mp4|webm|mov|ogv|m4v)(\?|#|$)/i.test(url);

export function SymbolsEffect({
  src,
  srcType = "auto",
  preloadSrcs,
  cell = 8,
  zoom = 1,
  bg = "#ffffff",
  bandColors = DEFAULT_COLORS,
  bandStops = DEFAULT_STOPS,
  bandGlyphs = DEFAULT_GLYPHS,
  paused = false,
  className,
  style,
  ref,
}: SymbolsEffectProps & { ref?: Ref<HTMLCanvasElement> }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fxRef = useRef<SymbolsRenderer | null>(null);
  const lookRef = useRef({ bandColors, bandGlyphs, zoom });
  lookRef.current = { bandColors, bandGlyphs, zoom };
  const setRef = (element: HTMLCanvasElement | null) => {
    canvasRef.current = element;
    if (typeof ref === "function") {
      ref(element);
    } else if (ref) {
      ref.current = element;
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const fx = new SymbolsRenderer(canvas, {
      cell,
      zoom,
      bg,
      bandColors,
      bandStops,
      bandGlyphs,
    });
    fxRef.current = fx;
    const observer = new ResizeObserver(() => {
      fx.resize();
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      fx.dispose();
      fxRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (preloadSrcs?.length) {
      fxRef.current?.preload(preloadSrcs);
    }
  }, [preloadSrcs]);

  useEffect(() => {
    const fx = fxRef.current;
    if (!fx) {
      return;
    }
    const look = {
      colors: lookRef.current.bandColors,
      glyphs: lookRef.current.bandGlyphs,
      zoom: lookRef.current.zoom,
    };
    const video =
      srcType === "video" || (srcType === "auto" && isVideoUrl(src));
    if (video) {
      fx.setVideo(src, look);
    } else {
      fx.setImage(src, look);
    }
  }, [src, srcType]);

  useEffect(() => {
    fxRef.current?.setCellStops(cell, bandStops);
  }, [cell, bandStops]);
  useEffect(() => {
    fxRef.current?.setZoom(zoom);
  }, [zoom]);
  useEffect(() => {
    fxRef.current?.setBg(bg);
  }, [bg]);
  useEffect(() => {
    fxRef.current?.setColors(bandColors);
  }, [bandColors]);
  useEffect(() => {
    for (const [index, glyph] of bandGlyphs.entries()) {
      fxRef.current?.setGlyph(index, glyph);
    }
  }, [bandGlyphs]);
  useEffect(() => {
    fxRef.current?.setPaused(paused);
  }, [paused]);

  return (
    <canvas
      className={className}
      ref={setRef}
      style={{ display: "block", width: "100%", height: "100%", ...style }}
    />
  );
}

export default SymbolsEffect;
