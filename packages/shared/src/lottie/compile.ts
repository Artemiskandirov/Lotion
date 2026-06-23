import type { AssetLayer, AssetSnapshot } from "../types/asset";
import type { AnimationPlan, LottieDocument, MotionStep } from "../types/motion";

const frameRate = 60;

type TransformSample = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
};

type LottieKey = {
  t: number;
  s: number[];
};

function msToFrame(ms: number): number {
  return Math.round((ms / 1000) * frameRate);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeSize(value: number): number {
  return Math.max(1, Math.round(Number.isFinite(value) ? value : 1));
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

function hexToColor(hex: string | undefined, fallback: [number, number, number, number]): [number, number, number, number] {
  if (!hex || !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) return fallback;
  const red = Number.parseInt(hex.slice(1, 3), 16) / 255;
  const green = Number.parseInt(hex.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const alpha = hex.length === 9 ? Number.parseInt(hex.slice(7, 9), 16) / 255 : 1;
  return [red, green, blue, alpha];
}

function flattenLayers(layers: AssetLayer[]): AssetLayer[] {
  return layers.flatMap((layer) => [layer, ...flattenLayers(layer.children ?? [])]);
}

function canRenderAsShape(layer: AssetLayer): boolean {
  if (layer.visible === false) return false;
  if (!layer.width || !layer.height) return false;
  return layer.shapeKind === "RECTANGLE" || layer.shapeKind === "ELLIPSE";
}

function shapeLayers(asset?: AssetSnapshot): AssetLayer[] {
  if (!asset) return [];
  return flattenLayers(asset.layers).filter(canRenderAsShape);
}

function localProgress(step: MotionStep, frame: number): number | undefined {
  const start = msToFrame(step.start);
  const end = msToFrame(step.start + step.duration);
  if (frame < start || frame > end) return undefined;
  return clamp((frame - start) / Math.max(1, end - start), 0, 1);
}

function sampleAtFrame(plan: AnimationPlan, frame: number): TransformSample {
  const sample: TransformSample = {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 100
  };

  for (const step of plan.animationPlan) {
    const progress = localProgress(step, frame);
    if (progress === undefined) continue;

    const wave = Math.sin(progress * Math.PI);

    if (step.action === "float_y" || step.action === "soft_bounce") {
      sample.y -= wave * Math.max(12, plan.height * (step.action === "soft_bounce" ? 0.34 : 0.24));
    }
    if (step.action === "shake_x") {
      sample.x += Math.sin(progress * Math.PI * 8) * Math.max(6, plan.width * 0.1) * (1 - progress * 0.35);
    }
    if (step.action === "shake_rotate") {
      sample.rotation += Math.sin(progress * Math.PI * 6) * 8 * (1 - progress * 0.2);
    }
    if (step.action === "scale_pop" || step.action === "pulse" || step.action === "button_press") {
      const amount = step.action === "button_press" ? -0.08 : 0.14;
      sample.scaleX *= 1 + wave * amount;
      sample.scaleY *= 1 + wave * amount;
    }
    if (step.action === "squash_stretch") {
      sample.scaleX *= 1 + wave * 0.18;
      sample.scaleY *= 1 - wave * 0.13;
    }
    if (step.action === "rotate_open") sample.rotation -= wave * 18;
    if (step.action === "fly_to_target") {
      sample.x += progress * plan.width * 0.34;
      sample.y -= progress * plan.height * 0.28;
    }
    if (step.action === "fade_in") sample.opacity *= Math.max(0.2, progress);
    if (step.action === "fade_out") sample.opacity *= Math.max(0.2, 1 - progress);
    if (step.action === "shine_sweep" || step.action === "pulse_glow") sample.scaleX *= 1 + wave * 0.05;
  }

  return sample;
}

function keyframeFrames(plan: AnimationPlan): number[] {
  const frames = new Set<number>([0, msToFrame(plan.durationMs)]);

  for (const step of plan.animationPlan) {
    const start = msToFrame(step.start);
    const end = msToFrame(step.start + step.duration);
    frames.add(start);
    frames.add(Math.round((start + end) / 2));
    frames.add(end);
  }

  return Array.from(frames).sort((a, b) => a - b);
}

function animatedKeys(plan: AnimationPlan, read: (sample: TransformSample) => number[]): LottieKey[] {
  return keyframeFrames(plan).map((frame) => ({
    t: frame,
    s: read(sampleAtFrame(plan, frame))
  }));
}

function positionKeys(plan: AnimationPlan, centerX: number, centerY: number): LottieKey[] {
  return animatedKeys(plan, (sample) => [centerX + sample.x, centerY + sample.y, 0]);
}

function scaleKeys(plan: AnimationPlan): LottieKey[] {
  return animatedKeys(plan, (sample) => [sample.scaleX * 100, sample.scaleY * 100, 100]);
}

function rotationKeys(plan: AnimationPlan): LottieKey[] {
  return animatedKeys(plan, (sample) => [sample.rotation]);
}

function opacityKeys(plan: AnimationPlan, baseOpacity = 100): LottieKey[] {
  return animatedKeys(plan, (sample) => [(sample.opacity / 100) * baseOpacity]);
}

function baseTransform(plan: AnimationPlan, centerX: number, centerY: number, baseOpacity = 100) {
  return {
    o: { a: 1, k: opacityKeys(plan, baseOpacity) },
    r: { a: 1, k: rotationKeys(plan) },
    p: { a: 1, k: positionKeys(plan, centerX, centerY) },
    a: { a: 0, k: [0, 0, 0] },
    s: { a: 1, k: scaleKeys(plan) }
  };
}

function shapeItem(layer: AssetLayer) {
  const width = safeSize(layer.width ?? 1);
  const height = safeSize(layer.height ?? 1);

  if (layer.shapeKind === "ELLIPSE") {
    return {
      ty: "el",
      p: { a: 0, k: [0, 0] },
      s: { a: 0, k: [width, height] },
      nm: "ellipse"
    };
  }

  return {
    ty: "rc",
    p: { a: 0, k: [0, 0] },
    s: { a: 0, k: [width, height] },
    r: { a: 0, k: layer.cornerRadius ?? 0 },
    nm: "rectangle"
  };
}

function primitiveShapeLayer(plan: AnimationPlan, layer: AssetLayer, index: number) {
  const width = safeSize(layer.width ?? 1);
  const height = safeSize(layer.height ?? 1);
  const x = layer.x ?? 0;
  const y = layer.y ?? 0;
  const fill = hexToColor(layer.fillColors?.[0], [0.24, 0.42, 0.94, 1]);
  const stroke = hexToColor(layer.strokeColors?.[0], [0.12, 0.12, 0.12, 1]);
  const hasStroke = Boolean(layer.strokeColors?.length && layer.strokeWeight);

  return {
    ddd: 0,
    ind: index,
    ty: 4,
    nm: layer.name,
    sr: 1,
    ks: baseTransform(plan, x + width / 2, y + height / 2, (layer.opacity ?? 1) * 100),
    ao: 0,
    shapes: [
      {
        ty: "gr",
        nm: layer.name,
        it: [
          shapeItem(layer),
          {
            ty: "fl",
            c: { a: 0, k: fill },
            o: { a: 0, k: fill[3] * 100 },
            nm: "fill"
          },
          ...(hasStroke
            ? [
                {
                  ty: "st",
                  c: { a: 0, k: stroke },
                  o: { a: 0, k: stroke[3] * 100 },
                  w: { a: 0, k: layer.strokeWeight ?? 1 },
                  lc: 2,
                  lj: 2,
                  nm: "stroke"
                }
              ]
            : []),
          {
            ty: "tr",
            p: { a: 0, k: [0, 0] },
            a: { a: 0, k: [0, 0] },
            s: { a: 0, k: [100, 100] },
            r: { a: 0, k: layer.rotation ?? 0 },
            o: { a: 0, k: 100 }
          }
        ]
      }
    ],
    ip: 0,
    op: msToFrame(plan.durationMs),
    st: 0,
    bm: 0
  };
}

function svgImageLayer(plan: AnimationPlan, index: number) {
  const width = safeSize(plan.width);
  const height = safeSize(plan.height);

  return {
    ddd: 0,
    ind: index,
    ty: 2,
    nm: `${plan.assetType} / ${plan.scenario}`,
    refId: "asset_svg",
    sr: 1,
    ks: {
      ...baseTransform(plan, width / 2, height / 2),
      a: { a: 0, k: [width / 2, height / 2, 0] }
    },
    ao: 0,
    ip: 0,
    op: msToFrame(plan.durationMs),
    st: 0,
    bm: 0
  };
}

function particleSteps(plan: AnimationPlan): MotionStep[] {
  return plan.animationPlan.filter((step) => ["burst_particles", "sparkle_burst", "coin_burst"].includes(step.action));
}

function shineSteps(plan: AnimationPlan): MotionStep[] {
  return plan.animationPlan.filter((step) => step.action === "shine_sweep" || step.action === "pulse_glow");
}

function particleLayer(plan: AnimationPlan, step: MotionStep, index: number, particleIndex: number) {
  const start = msToFrame(step.start);
  const end = msToFrame(step.start + step.duration);
  const angle = (Math.PI * 2 * particleIndex) / 8;
  const radius = Math.max(plan.width, plan.height) * 0.32;
  const center = [plan.width / 2, plan.height / 2, 0];
  const target = [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius, 0];
  const color = step.action === "coin_burst" ? [1, 0.82, 0.18, 1] : [1, 0.36, 0.42, 1];

  return {
    ddd: 0,
    ind: index,
    ty: 4,
    nm: `${step.action} ${particleIndex + 1}`,
    sr: 1,
    ks: {
      o: { a: 1, k: [{ t: start, s: [0] }, { t: start + 4, s: [100] }, { t: end, s: [0] }] },
      r: { a: 0, k: 0 },
      p: { a: 1, k: [{ t: start, s: center }, { t: end, s: target }] },
      a: { a: 0, k: [0, 0, 0] },
      s: { a: 1, k: [{ t: start, s: [60, 60, 100] }, { t: end, s: [0, 0, 100] }] }
    },
    ao: 0,
    shapes: [
      {
        ty: "gr",
        nm: "particle",
        it: [
          { ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [8, 8] }, nm: "dot" },
          { ty: "fl", c: { a: 0, k: color }, o: { a: 0, k: 100 }, nm: "fill" },
          { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }
        ]
      }
    ],
    ip: start,
    op: end,
    st: 0,
    bm: 0
  };
}

function generatedEffectLayers(plan: AnimationPlan, startIndex: number) {
  const layers: unknown[] = [];
  let index = startIndex;

  for (const step of shineSteps(plan)) {
    const start = msToFrame(step.start);
    const end = msToFrame(step.start + step.duration);
    const isGlow = step.action === "pulse_glow";
    layers.push({
      ddd: 0,
      ind: index,
      ty: 4,
      nm: step.action,
      sr: 1,
      ks: {
        o: { a: 1, k: [{ t: start, s: [0] }, { t: Math.round((start + end) / 2), s: [isGlow ? 28 : 48] }, { t: end, s: [0] }] },
        r: { a: 0, k: isGlow ? 0 : -18 },
        p: {
          a: 1,
          k: isGlow
            ? [{ t: start, s: [plan.width / 2, plan.height / 2, 0] }, { t: end, s: [plan.width / 2, plan.height / 2, 0] }]
            : [{ t: start, s: [-plan.width * 0.2, plan.height / 2, 0] }, { t: end, s: [plan.width * 1.2, plan.height / 2, 0] }]
        },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 1, k: [{ t: start, s: [80, 80, 100] }, { t: end, s: isGlow ? [126, 126, 100] : [100, 100, 100] }] }
      },
      ao: 0,
      shapes: [
        {
          ty: "gr",
          nm: step.action,
          it: [
            isGlow
              ? { ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [plan.width * 1.05, plan.height * 1.05] }, nm: "glow" }
              : { ty: "rc", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [Math.max(12, plan.width * 0.16), plan.height * 1.3] }, r: { a: 0, k: 999 }, nm: "shine" },
            { ty: "fl", c: { a: 0, k: isGlow ? [0.4, 0.78, 1, 1] : [1, 1, 1, 1] }, o: { a: 0, k: 100 }, nm: "fill" },
            { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }
          ]
        }
      ],
      ip: start,
      op: end,
      st: 0,
      bm: isGlow ? 1 : 2
    });
    index += 1;
  }

  for (const step of particleSteps(plan)) {
    for (let particleIndex = 0; particleIndex < 8; particleIndex += 1) {
      layers.push(particleLayer(plan, step, index, particleIndex));
      index += 1;
    }
  }

  return layers;
}

function buildContentLayers(plan: AnimationPlan, asset?: AssetSnapshot) {
  const primitives = shapeLayers(asset);
  if (primitives.length > 0 && primitives.length <= 24) {
    return primitives.map((layer, index) => primitiveShapeLayer(plan, layer, index + 1));
  }

  if (asset?.svg?.trim()) {
    return [svgImageLayer(plan, 1)];
  }

  return [
    primitiveShapeLayer(
      plan,
      {
        id: "fallback",
        name: "Fallback shape",
        type: "shape",
        shapeKind: "RECTANGLE",
        width: Math.max(24, plan.width * 0.72),
        height: Math.max(24, plan.height * 0.54),
        x: plan.width * 0.14,
        y: plan.height * 0.23,
        fillColors: ["#3d6bf0"],
        cornerRadius: 12
      },
      1
    )
  ];
}

export function compilePlanToLottie(plan: AnimationPlan, asset?: AssetSnapshot): LottieDocument {
  const width = safeSize(plan.width);
  const height = safeSize(plan.height);
  const op = msToFrame(plan.durationMs);
  const contentLayers = buildContentLayers(plan, asset);
  const effects = generatedEffectLayers(plan, contentLayers.length + 1);
  const usesSvgAsset = contentLayers.some((layer) => typeof layer === "object" && layer && (layer as { ty?: unknown }).ty === 2);

  return {
    v: "5.12.2",
    fr: frameRate,
    ip: 0,
    op,
    w: width,
    h: height,
    nm: `${plan.assetType} / ${plan.scenario}`,
    ddd: 0,
    assets: usesSvgAsset && asset?.svg
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
    layers: [...effects, ...contentLayers]
  };
}
