import type { AnimationPlan, LottieDocument, MotionStep } from "../types/motion";

const frameRate = 60;

function msToFrame(ms: number): number {
  return Math.round((ms / 1000) * frameRate);
}

function positionKeys(step: MotionStep, width: number, height: number) {
  const start = msToFrame(step.start);
  const end = msToFrame(step.start + step.duration);
  const center = [width / 2, height / 2, 0];

  if (step.action === "shake_x") {
    return [
      { t: start, s: center },
      { t: start + 4, s: [center[0] - 8, center[1], 0] },
      { t: start + 8, s: [center[0] + 8, center[1], 0] },
      { t: start + 12, s: [center[0] - 5, center[1], 0] },
      { t: end, s: center }
    ];
  }

  if (step.action === "float_y") {
    return [
      { t: start, s: center },
      { t: Math.round((start + end) / 2), s: [center[0], center[1] - 10, 0] },
      { t: end, s: center }
    ];
  }

  if (step.action === "fly_to_target") {
    return [
      { t: start, s: center },
      { t: end, s: [width * 0.85, height * 0.18, 0] }
    ];
  }

  return [{ t: 0, s: center }];
}

function scaleKeys(step: MotionStep) {
  const start = msToFrame(step.start);
  const end = msToFrame(step.start + step.duration);

  if (step.action === "scale_pop" || step.action === "pulse") {
    return [
      { t: start, s: [0, 0, 100] },
      { t: Math.round((start + end) / 2), s: [118, 118, 100] },
      { t: end, s: [100, 100, 100] }
    ];
  }

  if (step.action === "stagger_appear") {
    return [
      { t: start, s: [0, 100, 100] },
      { t: end, s: [100, 100, 100] }
    ];
  }

  return [{ t: 0, s: [100, 100, 100] }];
}

function opacityKeys(step: MotionStep) {
  const start = msToFrame(step.start);
  const end = msToFrame(step.start + step.duration);

  if (["fade_in", "shine_sweep", "burst_particles", "draw_stroke"].includes(step.action)) {
    return [
      { t: start, s: [0] },
      { t: Math.round((start + end) / 2), s: [100] },
      { t: end, s: [0] }
    ];
  }

  return [{ t: 0, s: [100] }];
}

function rotationKeys(step: MotionStep) {
  const start = msToFrame(step.start);
  const end = msToFrame(step.start + step.duration);

  if (step.action === "rotate_open") {
    return [
      { t: start, s: [0] },
      { t: end, s: [-34] }
    ];
  }

  return [{ t: 0, s: [0] }];
}

function shapeLayer(step: MotionStep, index: number, width: number, height: number) {
  const layerWidth = Math.max(24, Math.min(width * 0.72, width - 24));
  const layerHeight = Math.max(24, Math.min(height * 0.54, height - 24));
  const isAccent = ["shine_sweep", "burst_particles", "draw_stroke"].includes(step.action);

  return {
    ddd: 0,
    ind: index,
    ty: 4,
    nm: `${step.target} / ${step.action}`,
    sr: 1,
    ks: {
      o: { a: 1, k: opacityKeys(step) },
      r: { a: 1, k: rotationKeys(step) },
      p: { a: 1, k: positionKeys(step, width, height) },
      a: { a: 0, k: [0, 0, 0] },
      s: { a: 1, k: scaleKeys(step) }
    },
    ao: 0,
    shapes: [
      {
        ty: "gr",
        nm: "placeholder vector",
        it: [
          {
            ty: "rc",
            p: { a: 0, k: [0, 0] },
            s: { a: 0, k: [isAccent ? layerWidth * 0.38 : layerWidth, isAccent ? 8 : layerHeight] },
            r: { a: 0, k: 12 },
            nm: "animated part bounds"
          },
          {
            ty: "fl",
            c: { a: 0, k: isAccent ? [1, 0.86, 0.24, 1] : [0.24, 0.42, 0.94, 1] },
            o: { a: 0, k: isAccent ? 80 : 96 },
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
    op: msToFrame(step.start + step.duration + 300),
    st: 0,
    bm: 0
  };
}

export function compilePlanToLottie(plan: AnimationPlan): LottieDocument {
  const op = msToFrame(plan.durationMs);

  return {
    v: "5.12.2",
    fr: frameRate,
    ip: 0,
    op,
    w: Math.round(plan.width),
    h: Math.round(plan.height),
    nm: `${plan.assetType} / ${plan.scenario}`,
    ddd: 0,
    assets: [],
    layers: plan.animationPlan.map((step, index) =>
      shapeLayer(step, index + 1, plan.width, plan.height)
    )
  };
}
