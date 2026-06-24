import type { AssetRequest, Keyframe, LayerOp, StoryboardDSL, Track } from "@lotion/shared";
import { detectParts } from "@lotion/shared";

type Verb =
  | "bounce"
  | "pulse"
  | "shake"
  | "rotate"
  | "spin"
  | "fade-in"
  | "fade-out"
  | "pop"
  | "drift"
  | "swing"
  | "wave"
  | "drop"
  | "zoom"
  | "wobble";

const verbTable: Record<Verb, RegExp> = {
  bounce: /(bounce|bouncing|bouncy|\bhop\b|прыг|подпрыг|скач)/i,
  pulse: /(pulse|pulsate|pulsing|\bbeat\b|пульс|бьется|сердц)/i,
  shake: /(shake|shaking|tremor|тряс|дрож)/i,
  rotate: /(rotate|rotating|\bturn\b|поворот|вращ)/i,
  spin: /(\bspin\b|spinning|whirl|крут)/i,
  "fade-in": /(fade.?in|appear|появля|проявля)/i,
  "fade-out": /(fade.?out|disappear|исчез|раствор)/i,
  pop: /(\bpop\b|burst|popping|лопн|взрыв)/i,
  drift: /(drift|float|drifting|плыв|парит)/i,
  swing: /(swing|swinging|качан|качал|качае)/i,
  wave: /(wave|waving|волн|махан)/i,
  drop: /(\bdrop\b|\bfall\b|drops|паден|падает|падай|роняй)/i,
  zoom: /(zoom|zooming|approach|приближ|увелич)/i,
  wobble: /(wobble|wobbling|колеб|шата)/i
};

function countMatches(prompt: string, re: RegExp): number {
  const m = prompt.match(new RegExp(re.source, re.flags.replace("g", "") + "g"));
  return m ? m.length : 0;
}

function detectVerbs(prompt: string): Verb[] {
  const found: Verb[] = [];
  for (const [verb, re] of Object.entries(verbTable) as [Verb, RegExp][]) {
    if (re.test(prompt)) found.push(verb);
  }
  return found;
}

function detectRepeat(prompt: string): number {
  if (/(twice|дважды|два раза)/i.test(prompt)) return 2;
  if (/(thrice|three times|трижды|три раза)/i.test(prompt)) return 3;
  return 1;
}

function detectSpeed(prompt: string): "slow" | "fast" | "normal" {
  if (/(slow|slowly|медленн|тих)/i.test(prompt)) return "slow";
  if (/(fast|quick|quickly|быстр|резк)/i.test(prompt)) return "fast";
  return "normal";
}

function amp(height: number, frac: number, minPx = 12): number {
  return Math.max(minPx, height * frac);
}

function bounceKeyframes(height: number, speed: "slow" | "fast" | "normal"): Keyframe[] {
  const stiff = speed === "fast" ? 280 : speed === "slow" ? 140 : 220;
  const damp = speed === "fast" ? 9 : speed === "slow" ? 16 : 11;
  const lift = amp(height, 0.28);
  return [
    { t: 0, sx: 1, sy: 1, ty: 0, ease: { kind: "anticipation", pullback: 0.12 } },
    { t: 0.16, sx: 1.18, sy: 0.84, ty: 4 },
    { t: 0.42, sx: 0.92, sy: 1.1, ty: -lift, ease: { kind: "spring", stiffness: stiff, damping: damp, mass: 1 } },
    { t: 0.66, sx: 1.12, sy: 0.92, ty: 8, ease: { kind: "overshoot", amount: 0.18 } },
    { t: 0.84, sx: 0.97, sy: 1.04, ty: -4 },
    { t: 1, sx: 1, sy: 1, ty: 0 }
  ];
}

function pulseKeyframes(times: number, speed: "slow" | "fast" | "normal"): Keyframe[] {
  const amplitude = speed === "fast" ? 0.22 : speed === "slow" ? 0.1 : 0.16;
  const kfs: Keyframe[] = [];
  const cycle = 1 / times;
  for (let i = 0; i < times; i += 1) {
    const base = i * cycle;
    kfs.push({ t: base, sx: 1, sy: 1, ease: { kind: "anticipation", pullback: 0.08 } });
    kfs.push({ t: base + cycle * 0.4, sx: 1 + amplitude, sy: 1 + amplitude, ease: { kind: "overshoot", amount: 0.12 } });
    kfs.push({ t: base + cycle * 0.7, sx: 1 - amplitude * 0.35, sy: 1 - amplitude * 0.35 });
  }
  kfs.push({ t: 1, sx: 1, sy: 1 });
  return kfs;
}

function shakeKeyframes(width: number, speed: "slow" | "fast" | "normal"): Keyframe[] {
  const cycles = speed === "fast" ? 8 : speed === "slow" ? 4 : 6;
  const peak = amp(width, 0.08, 6);
  const kfs: Keyframe[] = [{ t: 0, tx: 0 }];
  for (let i = 1; i <= cycles; i += 1) {
    const t = i / (cycles + 1);
    const decay = 1 - (i / (cycles + 1)) * 0.4;
    kfs.push({ t, tx: (i % 2 === 0 ? -1 : 1) * peak * decay });
  }
  kfs.push({ t: 1, tx: 0 });
  return kfs;
}

function rotateKeyframes(speed: "slow" | "fast" | "normal", full = true): Keyframe[] {
  const rot = full ? 360 : 180;
  const ease = speed === "fast"
    ? { kind: "cubic" as const, in: [0.2, 0] as [number, number], out: [0.4, 1] as [number, number] }
    : { kind: "linear" as const };
  return [
    { t: 0, rot: 0, ease },
    { t: 1, rot }
  ];
}

function fadeInKeyframes(): Keyframe[] {
  return [
    { t: 0, op: 0, sx: 0.92, sy: 0.92, ease: { kind: "cubic", in: [0.2, 0], out: [0.4, 1] } },
    { t: 0.7, op: 1, sx: 1.02, sy: 1.02, ease: { kind: "overshoot", amount: 0.12 } },
    { t: 1, op: 1, sx: 1, sy: 1 }
  ];
}

function fadeOutKeyframes(): Keyframe[] {
  return [
    { t: 0, op: 1, sx: 1, sy: 1 },
    { t: 0.6, op: 0.5, sx: 0.97, sy: 0.97 },
    { t: 1, op: 0, sx: 0.9, sy: 0.9 }
  ];
}

function popKeyframes(): Keyframe[] {
  return [
    { t: 0, sx: 0, sy: 0, op: 0 },
    { t: 0.12, sx: 0.6, sy: 0.6, op: 0.6, ease: { kind: "anticipation", pullback: 0.1 } },
    { t: 0.5, sx: 1.18, sy: 1.18, op: 1, ease: { kind: "spring", stiffness: 240, damping: 11, mass: 1 } },
    { t: 0.78, sx: 0.95, sy: 0.95, op: 1, ease: { kind: "overshoot", amount: 0.14 } },
    { t: 1, sx: 1, sy: 1, op: 1 }
  ];
}

function driftKeyframes(height: number): Keyframe[] {
  const lift = amp(height, 0.12);
  return [
    { t: 0, ty: 0, ease: { kind: "cubic", in: [0.4, 0], out: [0.6, 1] } },
    { t: 0.5, ty: -lift, ease: { kind: "cubic", in: [0.4, 0], out: [0.6, 1] } },
    { t: 1, ty: 0 }
  ];
}

function swingKeyframes(speed: "slow" | "fast" | "normal"): Keyframe[] {
  const peak = speed === "fast" ? 22 : speed === "slow" ? 10 : 16;
  return [
    { t: 0, rot: 0 },
    { t: 0.25, rot: peak, ease: { kind: "cubic", in: [0.4, 0], out: [0.6, 1] } },
    { t: 0.5, rot: 0 },
    { t: 0.75, rot: -peak, ease: { kind: "cubic", in: [0.4, 0], out: [0.6, 1] } },
    { t: 1, rot: 0 }
  ];
}

function waveKeyframes(height: number): Keyframe[] {
  const lift = amp(height, 0.18);
  const kfs: Keyframe[] = [];
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    kfs.push({ t, ty: -Math.sin(t * Math.PI * 2) * lift });
  }
  return kfs;
}

function dropKeyframes(height: number): Keyframe[] {
  const fall = amp(height, 0.6, 40);
  return [
    { t: 0, ty: -fall, op: 0.4, sx: 1, sy: 1, ease: { kind: "cubic", in: [0.5, 0], out: [0.8, 1] } },
    { t: 0.55, ty: 0, op: 1, sx: 1.16, sy: 0.84, ease: { kind: "spring", stiffness: 260, damping: 10, mass: 1 } },
    { t: 0.78, ty: -fall * 0.15, sx: 0.94, sy: 1.08, ease: { kind: "overshoot", amount: 0.16 } },
    { t: 1, ty: 0, sx: 1, sy: 1 }
  ];
}

function zoomKeyframes(): Keyframe[] {
  return [
    { t: 0, sx: 0.7, sy: 0.7, op: 0, ease: { kind: "cubic", in: [0.2, 0], out: [0.4, 1] } },
    { t: 0.7, sx: 1.06, sy: 1.06, op: 1, ease: { kind: "overshoot", amount: 0.1 } },
    { t: 1, sx: 1, sy: 1, op: 1 }
  ];
}

function wobbleKeyframes(): Keyframe[] {
  return [
    { t: 0, rot: 0 },
    { t: 0.2, rot: 8 },
    { t: 0.4, rot: -7 },
    { t: 0.6, rot: 5 },
    { t: 0.8, rot: -3 },
    { t: 1, rot: 0 }
  ];
}

function defaultGentlePulse(): Keyframe[] {
  return [
    { t: 0, sx: 1, sy: 1, ease: { kind: "anticipation", pullback: 0.08 } },
    { t: 0.35, sx: 1.08, sy: 0.96, ease: { kind: "spring", stiffness: 180, damping: 14, mass: 1 } },
    { t: 0.7, sx: 0.97, sy: 1.03, ease: { kind: "overshoot", amount: 0.12 } },
    { t: 1, sx: 1, sy: 1 }
  ];
}

function keyframesForVerb(
  verb: Verb,
  prompt: string,
  width: number,
  height: number,
  speed: "slow" | "fast" | "normal"
): Keyframe[] {
  switch (verb) {
    case "bounce":
      return bounceKeyframes(height, speed);
    case "pulse":
      return pulseKeyframes(detectRepeat(prompt), speed);
    case "shake":
      return shakeKeyframes(width, speed);
    case "rotate":
      return rotateKeyframes(speed, true);
    case "spin":
      return rotateKeyframes("fast", true);
    case "fade-in":
      return fadeInKeyframes();
    case "fade-out":
      return fadeOutKeyframes();
    case "pop":
      return popKeyframes();
    case "drift":
      return driftKeyframes(height);
    case "swing":
      return swingKeyframes(speed);
    case "wave":
      return waveKeyframes(height);
    case "drop":
      return dropKeyframes(height);
    case "zoom":
      return zoomKeyframes();
    case "wobble":
      return wobbleKeyframes();
  }
}

function mergeKeyframes(a: Keyframe[], b: Keyframe[]): Keyframe[] {
  const map = new Map<number, Keyframe>();
  const keyOf = (t: number) => Math.round(t * 1000) / 1000;
  for (const kf of a) map.set(keyOf(kf.t), { ...kf });
  for (const kf of b) {
    const k = keyOf(kf.t);
    const prev = map.get(k);
    if (prev) map.set(k, { ...prev, ...kf });
    else map.set(k, { ...kf });
  }
  return Array.from(map.values()).sort((x, y) => x.t - y.t);
}

function clampDurationMs(value: number, fallback: number): number {
  const duration = Number.isFinite(value) ? value : fallback;
  return Math.max(500, Math.min(5000, Math.round(duration)));
}

export function deterministicPlan(request: AssetRequest): StoryboardDSL {
  const prompt = (request.intent.prompt ?? "").trim();
  const durationMs = clampDurationMs((request.intent.durationSec ?? 2) * 1000, 2000);
  const width = request.asset.width || 256;
  const height = request.asset.height || 256;
  const rootRef = request.asset.layers[0]?.id ?? request.asset.id ?? "root";

  const verbs = detectVerbs(prompt);
  const speed = detectSpeed(prompt);
  const parts = detectParts(request);

  let keyframes: Keyframe[];
  let summaryVerbs: string[];

  if (verbs.length === 0) {
    keyframes = defaultGentlePulse();
    summaryVerbs = ["gentle-pulse"];
  } else {
    keyframes = verbs
      .map((verb) => keyframesForVerb(verb, prompt, width, height, speed))
      .reduce((acc, kfs) => mergeKeyframes(acc, kfs));
    summaryVerbs = verbs;
  }

  const tracks: Track[] = [{ layerRef: rootRef, keyframes }];
  const layerOps: LayerOp[] = [];

  const partTrack = buildPartTrack(prompt, parts, request, width, height);
  if (partTrack) {
    layerOps.push({ op: "isolate", id: partTrack.layerRef });
    tracks.push(partTrack);
    summaryVerbs.push(`secondary:${partTrack.layerRef}`);
  }

  const rationale = `deterministic: ${summaryVerbs.join(" + ")} (${speed})`;

  return {
    durationMs,
    fps: 60,
    loop: true,
    layerOps: layerOps.length ? layerOps : undefined,
    tracks,
    rationale
  };
}

function buildPartTrack(
  prompt: string,
  parts: Record<string, string>,
  request: AssetRequest,
  _width: number,
  height: number
): Track | null {
  const partMentions: Array<{ part: string; layerName: string; re: RegExp }> = [
    { part: "lid", layerName: parts.lid ?? "", re: /(lid|cover|top|крыш)/i },
    { part: "eyes", layerName: parts.eyes ?? "", re: /(eye|глаз)/i },
    { part: "arm", layerName: parts.arm ?? "", re: /(arm|hand|рук)/i },
    { part: "lock", layerName: parts.lock ?? "", re: /(lock|ключ|зам)/i },
    { part: "head", layerName: parts.head ?? "", re: /(head|голов|лицо)/i }
  ];

  for (const mention of partMentions) {
    if (!mention.layerName) continue;
    if (!mention.re.test(prompt)) continue;
    const layer = findLayerByName(request, mention.layerName);
    if (!layer) continue;

    if (mention.part === "lid") {
      return {
        layerRef: layer.id,
        keyframes: [
          { t: 0, rot: 0, ty: 0 },
          { t: 0.4, rot: -28, ty: -amp(height, 0.06, 4), ease: { kind: "spring", stiffness: 200, damping: 12 } },
          { t: 0.7, rot: -22, ease: { kind: "overshoot", amount: 0.1 } },
          { t: 1, rot: 0, ty: 0 }
        ],
        secondary: { delay: 0.06, damping: 0.4 }
      };
    }
    if (mention.part === "eyes" || mention.part === "head") {
      return {
        layerRef: layer.id,
        keyframes: [
          { t: 0, sx: 1, sy: 1 },
          { t: 0.3, sx: 1.12, sy: 1.12, ease: { kind: "spring", stiffness: 220, damping: 12 } },
          { t: 0.7, sx: 0.94, sy: 0.94 },
          { t: 1, sx: 1, sy: 1 }
        ]
      };
    }
    return {
      layerRef: layer.id,
      keyframes: [
        { t: 0, rot: 0 },
        { t: 0.5, rot: 18, ease: { kind: "spring", stiffness: 180, damping: 13 } },
        { t: 1, rot: 0 }
      ],
      secondary: { delay: 0.05, damping: 0.5 }
    };
  }
  return null;
}

function findLayerByName(request: AssetRequest, name: string): { id: string } | undefined {
  const stack = [...request.asset.layers];
  while (stack.length) {
    const layer = stack.pop()!;
    if (layer.name === name) return layer;
    if (layer.children) stack.push(...layer.children);
  }
  return undefined;
}
