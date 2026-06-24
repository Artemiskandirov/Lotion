import type { AssetLayer, AssetSnapshot } from "../types/asset";
import type { LottieDocument } from "../types/motion";
import type { Keyframe, StoryboardDSL, Track } from "../dsl/schema";
import { applyDisneyPrinciples, bezierForEasing, deriveSecondaryTrack } from "../physics/disney";
import { svgPathToLottieShape, type LottieBezier } from "./svg-path";

const FALLBACK_W = 256;
const FALLBACK_H = 256;

type CompileContext = {
  dsl: StoryboardDSL;
  asset: AssetSnapshot;
  width: number;
  height: number;
  totalFrames: number;
};

function msToFrame(t01: number, ctx: CompileContext): number {
  return Math.round(t01 * ctx.totalFrames);
}

function findLayer(asset: AssetSnapshot, ref: string): AssetLayer | undefined {
  const stack: AssetLayer[] = [...asset.layers];
  while (stack.length) {
    const layer = stack.pop()!;
    if (layer.id === ref || layer.name === ref) return layer;
    if (layer.children) stack.push(...layer.children);
  }
  return undefined;
}

function safe(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bezierBetween(prev: Keyframe, next: Keyframe) {
  const out = bezierForEasing(prev.ease);
  const incoming = bezierForEasing(next.ease);
  return {
    i: { x: [incoming.i[0]], y: [incoming.i[1]] },
    o: { x: [out.o[0]], y: [out.o[1]] }
  };
}

function buildScalarKeys(
  keyframes: Keyframe[],
  prop: keyof Keyframe,
  ctx: CompileContext,
  fallback: number,
  multiplier = 1
) {
  const usable = keyframes.filter((kf) => typeof (kf as Record<string, unknown>)[prop] === "number");
  if (usable.length === 0) return { a: 0, k: [fallback] };

  const k = usable.map((kf, idx) => {
    const next = usable[idx + 1] ?? kf;
    const value = ((kf as Record<string, unknown>)[prop] as number) * multiplier;
    const item: Record<string, unknown> = {
      t: msToFrame(kf.t, ctx),
      s: [value]
    };
    if (next !== kf) {
      const handles = bezierBetween(kf, next);
      item.i = handles.i;
      item.o = handles.o;
    }
    return item;
  });
  return { a: 1, k };
}

function buildPositionKeys(
  track: Track,
  ctx: CompileContext,
  centerX: number,
  centerY: number
) {
  const usable = track.keyframes.filter(
    (kf) => typeof kf.tx === "number" || typeof kf.ty === "number"
  );
  if (usable.length === 0) return { a: 0, k: [centerX, centerY, 0] };

  const k = usable.map((kf, idx) => {
    const next = usable[idx + 1] ?? kf;
    const x = centerX + (kf.tx ?? 0);
    const y = centerY + (kf.ty ?? 0);
    const item: Record<string, unknown> = {
      t: msToFrame(kf.t, ctx),
      s: [x, y, 0]
    };
    if (next !== kf) {
      const handles = bezierBetween(kf, next);
      item.i = { x: [handles.i.x[0], handles.i.x[0]], y: [handles.i.y[0], handles.i.y[0]] };
      item.o = { x: [handles.o.x[0], handles.o.x[0]], y: [handles.o.y[0], handles.o.y[0]] };
    }
    return item;
  });
  return { a: 1, k };
}

function buildScaleKeys(track: Track, ctx: CompileContext) {
  const usable = track.keyframes.filter(
    (kf) => typeof kf.sx === "number" || typeof kf.sy === "number"
  );
  if (usable.length === 0) return { a: 0, k: [100, 100, 100] };

  const k = usable.map((kf, idx) => {
    const next = usable[idx + 1] ?? kf;
    const sx = (kf.sx ?? 1) * 100;
    const sy = (kf.sy ?? kf.sx ?? 1) * 100;
    const item: Record<string, unknown> = {
      t: msToFrame(kf.t, ctx),
      s: [sx, sy, 100]
    };
    if (next !== kf) {
      const handles = bezierBetween(kf, next);
      item.i = { x: [handles.i.x[0], handles.i.x[0]], y: [handles.i.y[0], handles.i.y[0]] };
      item.o = { x: [handles.o.x[0], handles.o.x[0]], y: [handles.o.y[0], handles.o.y[0]] };
    }
    return item;
  });
  return { a: 1, k };
}

function buildOpacityKeys(track: Track, ctx: CompileContext) {
  return buildScalarKeys(track.keyframes, "op", ctx, 100, 100);
}

function buildRotationKeys(track: Track, ctx: CompileContext) {
  return buildScalarKeys(track.keyframes, "rot", ctx, 0, 1);
}

function svgToDataUri(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.slice(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

function morphKeyframes(keyframes: Keyframe[], ctx: CompileContext): { hasMorph: boolean; shapeKeys: unknown } {
  const morphs = keyframes.filter((kf) => typeof kf.morphTo === "string");
  if (morphs.length < 1) return { hasMorph: false, shapeKeys: null };

  const baseShape: LottieBezier = svgPathToLottieShape(morphs[0].morphTo!);
  const k = morphs.map((kf, idx) => {
    const next = morphs[idx + 1] ?? kf;
    const shape = svgPathToLottieShape(kf.morphTo!);
    const item: Record<string, unknown> = {
      t: msToFrame(kf.t, ctx),
      s: [shape]
    };
    if (next !== kf) {
      const handles = bezierBetween(kf, next);
      item.i = handles.i;
      item.o = handles.o;
    }
    return item;
  });

  void baseShape;
  return { hasMorph: true, shapeKeys: { a: 1, k } };
}

function buildAssetTransform(track: Track, ctx: CompileContext, layer: AssetLayer | undefined) {
  const width = safe(layer?.width, ctx.width);
  const height = safe(layer?.height, ctx.height);
  const x = safe(layer?.x, 0);
  const y = safe(layer?.y, 0);
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  return {
    o: buildOpacityKeys(track, ctx),
    r: buildRotationKeys(track, ctx),
    p: buildPositionKeys(track, ctx, centerX, centerY),
    a: { a: 0, k: [centerX, centerY, 0] },
    s: buildScaleKeys(track, ctx)
  };
}

function svgImageLayerForTrack(track: Track, index: number, ctx: CompileContext) {
  const layer = findLayer(ctx.asset, track.layerRef);
  return {
    ddd: 0,
    ind: index,
    ty: 2,
    nm: track.layerRef,
    refId: "asset_svg",
    sr: 1,
    ks: buildAssetTransform(track, ctx, layer),
    ao: 0,
    ip: 0,
    op: ctx.totalFrames,
    st: 0,
    bm: 0
  };
}

function morphShapeLayerForTrack(track: Track, index: number, ctx: CompileContext, shapeKeys: unknown) {
  const layer = findLayer(ctx.asset, track.layerRef);
  const fillHex = layer?.fillColors?.[0] ?? "#3d6bf0";
  const rgb = hexToRgb(fillHex);
  return {
    ddd: 0,
    ind: index,
    ty: 4,
    nm: `${track.layerRef} morph`,
    sr: 1,
    ks: buildAssetTransform(track, ctx, layer),
    ao: 0,
    shapes: [
      {
        ty: "gr",
        nm: track.layerRef,
        it: [
          { ty: "sh", ks: shapeKeys, nm: "morph-path" },
          { ty: "fl", c: { a: 0, k: [rgb[0], rgb[1], rgb[2], 1] }, o: { a: 0, k: 100 }, nm: "fill" },
          {
            ty: "tr",
            p: { a: 0, k: [0, 0] },
            a: { a: 0, k: [0, 0] },
            s: { a: 0, k: [100, 100] },
            r: { a: 0, k: 0 },
            o: { a: 0, k: 100 }
          }
        ]
      }
    ],
    ip: 0,
    op: ctx.totalFrames,
    st: 0,
    bm: 0
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})/i.exec(hex);
  if (!match) return [0.24, 0.42, 0.94];
  const value = match[1];
  return [
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255
  ];
}

export function compileFromDSL(dsl: StoryboardDSL, asset: AssetSnapshot): LottieDocument {
  const width = Math.max(1, Math.round(asset.width ?? FALLBACK_W));
  const height = Math.max(1, Math.round(asset.height ?? FALLBACK_H));
  const totalFrames = Math.round((dsl.durationMs / 1000) * dsl.fps);

  const ctx: CompileContext = { dsl, asset, width, height, totalFrames };

  const expandedTracks: Track[] = [];
  for (const track of dsl.tracks) {
    expandedTracks.push(applyDisneyPrinciples(track, dsl.durationMs, dsl.fps));
    if (track.secondary) {
      const child = deriveSecondaryTrack(track, `${track.layerRef}__secondary`);
      if (child) expandedTracks.push(applyDisneyPrinciples(child, dsl.durationMs, dsl.fps));
    }
  }

  const layers: unknown[] = [];
  let index = 1;
  let usesSvgAsset = false;

  for (const track of expandedTracks) {
    const morph = morphKeyframes(track.keyframes, ctx);
    if (morph.hasMorph) {
      layers.push(morphShapeLayerForTrack(track, index, ctx, morph.shapeKeys));
    } else {
      layers.push(svgImageLayerForTrack(track, index, ctx));
      usesSvgAsset = true;
    }
    index += 1;
  }

  return {
    v: "5.12.2",
    fr: dsl.fps,
    ip: 0,
    op: totalFrames,
    w: width,
    h: height,
    nm: `${asset.name} / storyboard`,
    ddd: 0,
    assets: usesSvgAsset && asset.svg
      ? [
          {
            id: "asset_svg",
            w: width,
            h: height,
            u: "",
            p: svgToDataUri(asset.svg),
            e: 1
          }
        ]
      : [],
    layers
  };
}
