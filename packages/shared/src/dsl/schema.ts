export type SpringEasing = {
  kind: "spring";
  stiffness: number;
  damping: number;
  mass?: number;
};

export type AnticipationEasing = {
  kind: "anticipation";
  pullback: number;
};

export type OvershootEasing = {
  kind: "overshoot";
  amount: number;
};

export type CubicEasing = {
  kind: "cubic";
  in: [number, number];
  out: [number, number];
};

export type LinearEasing = {
  kind: "linear";
};

export type Easing =
  | SpringEasing
  | AnticipationEasing
  | OvershootEasing
  | CubicEasing
  | LinearEasing;

export type Keyframe = {
  t: number;
  tx?: number;
  ty?: number;
  sx?: number;
  sy?: number;
  rot?: number;
  op?: number;
  morphTo?: string;
  ease?: Easing;
};

export type SecondaryMotion = {
  delay: number;
  damping: number;
};

export type Track = {
  layerRef: string;
  anchor?: [number, number];
  keyframes: Keyframe[];
  secondary?: SecondaryMotion;
};

export type LayerOp =
  | { op: "group"; ids: string[]; name: string }
  | { op: "rename"; id: string; name: string }
  | { op: "isolate"; id: string };

export type StoryboardDSL = {
  durationMs: number;
  fps: 30 | 60;
  loop: true;
  layerOps?: LayerOp[];
  tracks: Track[];
  rationale?: string;
};

export type StoryboardPlanResult = {
  dsl: StoryboardDSL;
  rationale?: string;
};

const easingKinds = new Set(["spring", "anticipation", "overshoot", "cubic", "linear"]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPair(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && isFiniteNumber(value[0]) && isFiniteNumber(value[1]);
}

function validateEasing(value: unknown): Easing {
  if (!value || typeof value !== "object") return { kind: "linear" };
  const raw = value as Record<string, unknown>;
  if (typeof raw.kind !== "string" || !easingKinds.has(raw.kind)) return { kind: "linear" };

  if (raw.kind === "spring") {
    return {
      kind: "spring",
      stiffness: isFiniteNumber(raw.stiffness) ? Math.max(1, Math.min(800, raw.stiffness)) : 180,
      damping: isFiniteNumber(raw.damping) ? Math.max(0.1, Math.min(60, raw.damping)) : 14,
      mass: isFiniteNumber(raw.mass) ? Math.max(0.1, Math.min(10, raw.mass)) : 1
    };
  }
  if (raw.kind === "anticipation") {
    return { kind: "anticipation", pullback: isFiniteNumber(raw.pullback) ? Math.max(0.02, Math.min(0.25, raw.pullback)) : 0.1 };
  }
  if (raw.kind === "overshoot") {
    return { kind: "overshoot", amount: isFiniteNumber(raw.amount) ? Math.max(0.02, Math.min(0.6, raw.amount)) : 0.15 };
  }
  if (raw.kind === "cubic") {
    return {
      kind: "cubic",
      in: isPair(raw.in) ? raw.in : [0.33, 0],
      out: isPair(raw.out) ? raw.out : [0.66, 1]
    };
  }
  return { kind: "linear" };
}

function validateKeyframe(value: unknown): Keyframe | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!isFiniteNumber(raw.t)) return null;
  const t = Math.max(0, Math.min(1, raw.t));

  const kf: Keyframe = { t };
  if (isFiniteNumber(raw.tx)) kf.tx = raw.tx;
  if (isFiniteNumber(raw.ty)) kf.ty = raw.ty;
  if (isFiniteNumber(raw.sx)) kf.sx = Math.max(-3, Math.min(5, raw.sx));
  if (isFiniteNumber(raw.sy)) kf.sy = Math.max(-3, Math.min(5, raw.sy));
  if (isFiniteNumber(raw.rot)) kf.rot = raw.rot;
  if (isFiniteNumber(raw.op)) kf.op = Math.max(0, Math.min(1, raw.op));
  if (typeof raw.morphTo === "string" && raw.morphTo.trim()) kf.morphTo = raw.morphTo.trim();
  if (raw.ease) kf.ease = validateEasing(raw.ease);
  return kf;
}

function validateLayerOp(value: unknown): LayerOp | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.op === "group" && Array.isArray(raw.ids) && raw.ids.every((id) => typeof id === "string") && typeof raw.name === "string") {
    return { op: "group", ids: raw.ids as string[], name: raw.name };
  }
  if (raw.op === "rename" && typeof raw.id === "string" && typeof raw.name === "string") {
    return { op: "rename", id: raw.id, name: raw.name };
  }
  if (raw.op === "isolate" && typeof raw.id === "string") {
    return { op: "isolate", id: raw.id };
  }
  return null;
}

function validateTrack(value: unknown): Track | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.layerRef !== "string" || !raw.layerRef.trim()) return null;
  if (!Array.isArray(raw.keyframes) || raw.keyframes.length === 0) return null;
  const keyframes = raw.keyframes.map(validateKeyframe).filter((kf): kf is Keyframe => kf !== null);
  if (keyframes.length === 0) return null;
  keyframes.sort((a, b) => a.t - b.t);

  const track: Track = { layerRef: raw.layerRef, keyframes };
  if (isPair(raw.anchor)) track.anchor = raw.anchor;
  if (raw.secondary && typeof raw.secondary === "object") {
    const sec = raw.secondary as Record<string, unknown>;
    if (isFiniteNumber(sec.delay) && isFiniteNumber(sec.damping)) {
      track.secondary = {
        delay: Math.max(0, Math.min(0.5, sec.delay)),
        damping: Math.max(0, Math.min(1, sec.damping))
      };
    }
  }
  return track;
}

export function validateStoryboardDSL(input: unknown): StoryboardDSL | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;

  const duration = isFiniteNumber(raw.durationMs) ? raw.durationMs : 2000;
  const fps = raw.fps === 30 ? 30 : 60;

  const tracksRaw = Array.isArray(raw.tracks) ? raw.tracks : [];
  const tracks = tracksRaw.map(validateTrack).filter((t): t is Track => t !== null);
  if (tracks.length === 0) return null;

  const layerOpsRaw = Array.isArray(raw.layerOps) ? raw.layerOps : [];
  const layerOps = layerOpsRaw.map(validateLayerOp).filter((o): o is LayerOp => o !== null);

  return {
    durationMs: Math.max(500, Math.min(5000, Math.round(duration))),
    fps,
    loop: true,
    layerOps: layerOps.length ? layerOps : undefined,
    tracks,
    rationale: typeof raw.rationale === "string" ? raw.rationale : undefined
  };
}

export const storyboardJSONSchema = {
  type: "object",
  properties: {
    durationMs: { type: "number" },
    fps: { type: "number", enum: [30, 60] },
    loop: { type: "boolean" },
    rationale: { type: "string" },
    layerOps: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          op: { type: "string", enum: ["group", "rename", "isolate"] },
          ids: { type: "array", items: { type: "string" } },
          id: { type: "string" },
          name: { type: "string" }
        },
        required: ["op"],
        additionalProperties: false
      }
    },
    tracks: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        properties: {
          layerRef: { type: "string" },
          anchor: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
          secondary: {
            type: "object",
            properties: {
              delay: { type: "number" },
              damping: { type: "number" }
            },
            required: ["delay", "damping"],
            additionalProperties: false
          },
          keyframes: {
            type: "array",
            minItems: 2,
            maxItems: 8,
            items: {
              type: "object",
              properties: {
                t: { type: "number" },
                tx: { type: "number" },
                ty: { type: "number" },
                sx: { type: "number" },
                sy: { type: "number" },
                rot: { type: "number" },
                op: { type: "number" },
                morphTo: { type: "string" },
                ease: {
                  type: "object",
                  properties: {
                    kind: { type: "string", enum: ["spring", "anticipation", "overshoot", "cubic", "linear"] },
                    stiffness: { type: "number" },
                    damping: { type: "number" },
                    mass: { type: "number" },
                    pullback: { type: "number" },
                    amount: { type: "number" },
                    in: { type: "array", items: { type: "number" } },
                    out: { type: "array", items: { type: "number" } }
                  },
                  required: ["kind"],
                  additionalProperties: false
                }
              },
              required: ["t"],
              additionalProperties: false
            }
          }
        },
        required: ["layerRef", "keyframes"],
        additionalProperties: false
      }
    }
  },
  required: ["durationMs", "fps", "loop", "tracks"],
  additionalProperties: false
} as const;
