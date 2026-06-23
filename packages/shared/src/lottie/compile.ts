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

    if (step.action === "float_y") sample.y -= wave * Math.max(12, plan.height * 0.28);
    if (step.action === "shake_x") sample.x += Math.sin(progress * Math.PI * 8) * Math.max(6, plan.width * 0.1) * (1 - progress * 0.35);
    if (step.action === "scale_pop" || step.action === "pulse") {
      sample.scaleX *= 1 + wave * 0.16;
      sample.scaleY *= 1 - wave * 0.1;
    }
    if (step.action === "rotate_open") sample.rotation -= wave * 16;
    if (step.action === "fly_to_target") {
      sample.x += progress * plan.width * 0.34;
      sample.y -= progress * plan.height * 0.28;
    }
    if (step.action === "fade_in") sample.opacity *= Math.max(0.2, progress);
    if (step.action === "fade_out") sample.opacity *= Math.max(0.2, 1 - progress);
    if (step.action === "burst_particles" || step.action === "shine_sweep") sample.scaleX *= 1 + wave * 0.05;
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

function positionKeys(plan: AnimationPlan) {
  const centerX = safeSize(plan.width) / 2;
  const centerY = safeSize(plan.height) / 2;

  return keyframeFrames(plan).map((frame) => {
    const sample = sampleAtFrame(plan, frame);
    return {
      t: frame,
      s: [centerX + sample.x, centerY + sample.y, 0]
    };
  });
}

function scaleKeys(plan: AnimationPlan) {
  return keyframeFrames(plan).map((frame) => {
    const sample = sampleAtFrame(plan, frame);
    return {
      t: frame,
      s: [sample.scaleX * 100, sample.scaleY * 100, 100]
    };
  });
}

function rotationKeys(plan: AnimationPlan) {
  return keyframeFrames(plan).map((frame) => {
    const sample = sampleAtFrame(plan, frame);
    return {
      t: frame,
      s: [sample.rotation]
    };
  });
}

function opacityKeys(plan: AnimationPlan) {
  return keyframeFrames(plan).map((frame) => {
    const sample = sampleAtFrame(plan, frame);
    return {
      t: frame,
      s: [sample.opacity]
    };
  });
}

function svgImageLayer(plan: AnimationPlan) {
  const width = safeSize(plan.width);
  const height = safeSize(plan.height);

  return {
    ddd: 0,
    ind: 1,
    ty: 2,
    nm: `${plan.assetType} / ${plan.scenario}`,
    refId: "asset_svg",
    sr: 1,
    ks: {
      o: { a: 1, k: opacityKeys(plan) },
      r: { a: 1, k: rotationKeys(plan) },
      p: { a: 1, k: positionKeys(plan) },
      a: { a: 0, k: [width / 2, height / 2, 0] },
      s: { a: 1, k: scaleKeys(plan) }
    },
    ao: 0,
    ip: 0,
    op: msToFrame(plan.durationMs),
    st: 0,
    bm: 0
  };
}

function placeholderShapeLayer(plan: AnimationPlan) {
  const width = safeSize(plan.width);
  const height = safeSize(plan.height);

  return {
    ddd: 0,
    ind: 1,
    ty: 4,
    nm: `${plan.assetType} / ${plan.scenario} placeholder`,
    sr: 1,
    ks: {
      o: { a: 1, k: opacityKeys(plan) },
      r: { a: 1, k: rotationKeys(plan) },
      p: { a: 1, k: positionKeys(plan) },
      a: { a: 0, k: [0, 0, 0] },
      s: { a: 1, k: scaleKeys(plan) }
    },
    ao: 0,
    shapes: [
      {
        ty: "gr",
        nm: "fallback bounds",
        it: [
          {
            ty: "rc",
            p: { a: 0, k: [0, 0] },
            s: { a: 0, k: [Math.max(24, width * 0.72), Math.max(24, height * 0.54)] },
            r: { a: 0, k: 12 },
            nm: "fallback rectangle"
          },
          {
            ty: "fl",
            c: { a: 0, k: [0.24, 0.42, 0.94, 1] },
            o: { a: 0, k: 96 },
            nm: "fill"
          },
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
    op: msToFrame(plan.durationMs),
    st: 0,
    bm: 0
  };
}

export function compilePlanToLottie(plan: AnimationPlan, svg?: string): LottieDocument {
  const width = safeSize(plan.width);
  const height = safeSize(plan.height);
  const op = msToFrame(plan.durationMs);
  const hasSvg = typeof svg === "string" && svg.trim().length > 0;

  return {
    v: "5.12.2",
    fr: frameRate,
    ip: 0,
    op,
    w: width,
    h: height,
    nm: `${plan.assetType} / ${plan.scenario}`,
    ddd: 0,
    assets: hasSvg
      ? [
          {
            id: "asset_svg",
            w: width,
            h: height,
            u: "",
            p: svgToDataUri(svg),
            e: 1
          }
        ]
      : [],
    layers: [hasSvg ? svgImageLayer(plan) : placeholderShapeLayer(plan)]
  };
}
