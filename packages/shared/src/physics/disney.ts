import type { Easing, Keyframe, SpringEasing, Track } from "../dsl/schema";

export type ScalarKey = { t: number; value: number };

const TWO_PI = Math.PI * 2;

export function springSamples(
  spring: SpringEasing,
  fromVal: number,
  toVal: number,
  durationMs: number,
  fps: number
): ScalarKey[] {
  const mass = spring.mass ?? 1;
  const stiffness = spring.stiffness;
  const damping = spring.damping;

  const omega0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const delta = toVal - fromVal;

  const totalSeconds = durationMs / 1000;
  const samples = Math.max(4, Math.min(12, Math.round(totalSeconds * fps * 0.25)));
  const result: ScalarKey[] = [];

  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const tSec = t * totalSeconds;
    let envelope: number;

    if (zeta < 1) {
      const omegaD = omega0 * Math.sqrt(1 - zeta * zeta);
      envelope =
        1 -
        Math.exp(-zeta * omega0 * tSec) *
          (Math.cos(omegaD * tSec) + ((zeta * omega0) / omegaD) * Math.sin(omegaD * tSec));
    } else if (zeta === 1) {
      envelope = 1 - Math.exp(-omega0 * tSec) * (1 + omega0 * tSec);
    } else {
      const omegaD = omega0 * Math.sqrt(zeta * zeta - 1);
      envelope =
        1 -
        Math.exp(-zeta * omega0 * tSec) *
          (Math.cosh(omegaD * tSec) + ((zeta * omega0) / omegaD) * Math.sinh(omegaD * tSec));
    }

    result.push({ t, value: fromVal + delta * envelope });
  }
  return result;
}

export function applyAnticipation(keyframes: Keyframe[], pullback: number): Keyframe[] {
  if (keyframes.length < 2) return keyframes;
  const first = keyframes[0];
  const second = keyframes[1];
  const tAnticipation = Math.max(0, first.t + (second.t - first.t) * 0.18);

  const anticipationKf: Keyframe = { t: tAnticipation, ease: { kind: "cubic", in: [0.4, 0], out: [0.7, 0.2] } };

  if (typeof first.tx === "number" && typeof second.tx === "number") {
    const direction = Math.sign(second.tx - first.tx) || 1;
    anticipationKf.tx = first.tx - direction * pullback * Math.abs(second.tx - first.tx);
  }
  if (typeof first.ty === "number" && typeof second.ty === "number") {
    const direction = Math.sign(second.ty - first.ty) || 1;
    anticipationKf.ty = first.ty - direction * pullback * Math.abs(second.ty - first.ty);
  }
  if (typeof first.sx === "number") {
    anticipationKf.sx = first.sx * (1 - pullback * 0.5);
  }
  if (typeof first.sy === "number") {
    anticipationKf.sy = first.sy * (1 + pullback * 0.5);
  }
  if (typeof first.rot === "number" && typeof second.rot === "number") {
    const direction = Math.sign(second.rot - first.rot) || 1;
    anticipationKf.rot = first.rot - direction * pullback * Math.abs(second.rot - first.rot);
  }

  return [first, anticipationKf, ...keyframes.slice(1)];
}

export function applyOvershoot(keyframes: Keyframe[], amount: number): Keyframe[] {
  if (keyframes.length < 2) return keyframes;
  const last = keyframes[keyframes.length - 1];
  const prev = keyframes[keyframes.length - 2];
  const tOvershoot = Math.min(1, last.t + (last.t - prev.t) * 0.25);

  if (tOvershoot >= 1) {
    const tBefore = last.t - (last.t - prev.t) * 0.25;
    const overshootKf: Keyframe = { t: tBefore, ease: { kind: "cubic", in: [0.2, 0.8], out: [0.7, 1] } };
    overshootKf.tx = overshoot(prev.tx, last.tx, amount);
    overshootKf.ty = overshoot(prev.ty, last.ty, amount);
    overshootKf.sx = overshoot(prev.sx, last.sx, amount);
    overshootKf.sy = overshoot(prev.sy, last.sy, amount);
    overshootKf.rot = overshoot(prev.rot, last.rot, amount);
    return [...keyframes.slice(0, -1), overshootKf, last];
  }

  const overshootKf: Keyframe = { t: tOvershoot, ease: { kind: "cubic", in: [0.2, 0.8], out: [0.7, 1] } };
  overshootKf.tx = overshoot(prev.tx, last.tx, amount);
  overshootKf.ty = overshoot(prev.ty, last.ty, amount);
  overshootKf.sx = overshoot(prev.sx, last.sx, amount);
  overshootKf.sy = overshoot(prev.sy, last.sy, amount);
  overshootKf.rot = overshoot(prev.rot, last.rot, amount);

  const settled: Keyframe = { ...last, t: 1 };
  return [...keyframes, overshootKf, settled];
}

function overshoot(from: number | undefined, to: number | undefined, amount: number): number | undefined {
  if (typeof from !== "number" || typeof to !== "number") return undefined;
  return to + (to - from) * amount;
}

export function applySecondary(parentKeyframes: Keyframe[], delay: number, damping: number): Keyframe[] {
  return parentKeyframes.map((kf) => {
    const shifted: Keyframe = { ...kf, t: Math.max(0, Math.min(1, kf.t + delay)) };
    if (typeof shifted.tx === "number") shifted.tx *= 1 - damping * 0.3;
    if (typeof shifted.ty === "number") shifted.ty *= 1 - damping * 0.3;
    if (typeof shifted.rot === "number") shifted.rot *= 1 + damping * 0.5;
    return shifted;
  });
}

export function expandEasing(keyframes: Keyframe[], durationMs: number, fps: number): Keyframe[] {
  let out: Keyframe[] = keyframes;

  let i = 0;
  while (i < out.length - 1) {
    const a = out[i];
    const b = out[i + 1];
    const ease = b.ease;

    if (ease?.kind === "spring") {
      const segmentMs = (b.t - a.t) * durationMs;
      const inserted: Keyframe[] = [];
      const props: Array<keyof Keyframe> = ["tx", "ty", "sx", "sy", "rot", "op"];
      const sampleMap = new Map<number, Keyframe>();

      for (const prop of props) {
        const fromVal = (a as Record<string, unknown>)[prop];
        const toVal = (b as Record<string, unknown>)[prop];
        if (typeof fromVal !== "number" || typeof toVal !== "number") continue;
        const samples = springSamples(ease, fromVal, toVal, segmentMs, fps);
        for (const s of samples) {
          const tAbs = a.t + (b.t - a.t) * s.t;
          const existing = sampleMap.get(tAbs) ?? { t: tAbs };
          (existing as Record<string, unknown>)[prop] = s.value;
          sampleMap.set(tAbs, existing);
        }
      }

      if (sampleMap.size > 0) {
        for (const [, kf] of [...sampleMap.entries()].sort((x, y) => x[0] - y[0])) {
          if (kf.t === a.t || kf.t === b.t) continue;
          inserted.push(kf);
        }
      }

      out = [...out.slice(0, i + 1), ...inserted, ...out.slice(i + 1)];
      i += inserted.length + 1;
      continue;
    }

    i += 1;
  }

  return out;
}

export function bezierForEasing(ease: Easing | undefined): { i: [number, number]; o: [number, number] } {
  if (!ease) return { i: [0.42, 0], o: [0.58, 1] };
  if (ease.kind === "cubic") return { i: ease.in, o: ease.out };
  if (ease.kind === "linear") return { i: [0, 0], o: [1, 1] };
  if (ease.kind === "spring") return { i: [0.2, 0], o: [0.4, 1] };
  if (ease.kind === "anticipation") return { i: [0.4, 0], o: [0.7, 0.2] };
  if (ease.kind === "overshoot") return { i: [0.2, 0.8], o: [0.7, 1] };
  return { i: [0.42, 0], o: [0.58, 1] };
}

export function applyDisneyPrinciples(track: Track, durationMs: number, fps: number): Track {
  let keyframes = track.keyframes;

  for (let i = 0; i < keyframes.length; i += 1) {
    const kf = keyframes[i];
    if (kf.ease?.kind === "anticipation" && i === 0) {
      keyframes = applyAnticipation(keyframes, kf.ease.pullback);
    }
    if (kf.ease?.kind === "overshoot" && i === keyframes.length - 1) {
      keyframes = applyOvershoot(keyframes, kf.ease.amount);
    }
  }

  keyframes = expandEasing(keyframes, durationMs, fps);
  return { ...track, keyframes };
}

export function deriveSecondaryTrack(parent: Track, childRef: string): Track | null {
  if (!parent.secondary) return null;
  return {
    layerRef: childRef,
    anchor: parent.anchor,
    keyframes: applySecondary(parent.keyframes, parent.secondary.delay, parent.secondary.damping)
  };
}

export function sampleScalarAt(keyframes: Keyframe[], prop: keyof Keyframe, t: number, fallback: number): number {
  const filtered = keyframes.filter((kf) => typeof (kf as Record<string, unknown>)[prop] === "number");
  if (filtered.length === 0) return fallback;
  if (t <= filtered[0].t) return (filtered[0] as Record<string, unknown>)[prop] as number;
  if (t >= filtered[filtered.length - 1].t) return (filtered[filtered.length - 1] as Record<string, unknown>)[prop] as number;
  for (let i = 0; i < filtered.length - 1; i += 1) {
    const a = filtered[i];
    const b = filtered[i + 1];
    if (t >= a.t && t <= b.t) {
      const ratio = (t - a.t) / (b.t - a.t || 1);
      const va = (a as Record<string, unknown>)[prop] as number;
      const vb = (b as Record<string, unknown>)[prop] as number;
      return va + (vb - va) * ratio;
    }
  }
  return fallback;
}

void TWO_PI;
