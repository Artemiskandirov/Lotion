import type { AnimationPlan, AssetRequest, MotionAction, MotionStep } from "@lotion/shared";
import { openAIConfig } from "./openai";

const motionActions: MotionAction[] = [
  "scale_pop",
  "rotate_open",
  "shake_x",
  "float_y",
  "fade_in",
  "fade_out",
  "burst_particles",
  "shine_sweep",
  "fly_to_target",
  "stagger_appear",
  "draw_stroke",
  "pulse"
];

const scenarios = [
  "reward_reveal",
  "coin_collect",
  "unlock_success",
  "success_pop",
  "error_shake",
  "attention_float",
  "spring_bounce",
  "progress_fill"
];

const jsonSchema = {
  type: "object",
  properties: {
    scenario: { type: "string", enum: scenarios },
    durationMs: { type: "number" },
    steps: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "object",
        properties: {
          target: { type: "string" },
          action: { type: "string", enum: motionActions },
          start: { type: "number" },
          duration: { type: "number" },
          easing: { type: "string", enum: ["linear", "ease-out", "ease-in-out", "spring"] }
        },
        required: ["target", "action", "start", "duration", "easing"],
        additionalProperties: false
      }
    },
    notes: {
      type: "array",
      maxItems: 5,
      items: { type: "string" }
    }
  },
  required: ["scenario", "durationMs", "steps", "notes"],
  additionalProperties: false
};

function clampDurationMs(value: number, fallback: number): number {
  const duration = Number.isFinite(value) ? value : fallback;
  return Math.max(500, Math.min(5000, Math.round(duration)));
}

function normalizeStep(step: MotionStep, durationMs: number): MotionStep {
  const action = motionActions.includes(step.action) ? step.action : "float_y";
  const start = Math.max(0, Math.min(durationMs - 120, Math.round(step.start || 0)));
  const stepDuration = Math.max(120, Math.min(durationMs - start, Math.round(step.duration || durationMs * 0.7)));

  return {
    target: typeof step.target === "string" && step.target.trim() ? step.target : "asset",
    action,
    start,
    duration: stepDuration,
    easing: step.easing ?? "ease-in-out"
  };
}

function extractOutputText(data: Record<string, unknown>): string | undefined {
  if (typeof data.output_text === "string") return data.output_text;
  if (!Array.isArray(data.output)) return undefined;

  for (const item of data.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") return text;
    }
  }

  return undefined;
}

export async function planMotionWithAI(request: AssetRequest, fallbackPlan: AnimationPlan): Promise<AnimationPlan> {
  if (!openAIConfig.apiKey) {
    return {
      ...fallbackPlan,
      notes: ["AI не подключён: OPENAI_API_KEY не задан.", ...fallbackPlan.notes]
    };
  }

  const requestedDurationMs = clampDurationMs((request.intent.durationSec ?? fallbackPlan.durationMs / 1000) * 1000, fallbackPlan.durationMs);
  const userPayload = {
    prompt: request.intent.prompt || "",
    durationMs: requestedDurationMs,
    asset: {
      name: request.asset.name,
      type: request.asset.type,
      width: request.asset.width,
      height: request.asset.height,
      layerCount: request.asset.layers.length,
      svgBytes: request.asset.svg?.length ?? 0
    },
    fallbackPlan
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAIConfig.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: openAIConfig.model,
      reasoning: { effort: "low" },
      input: [
        {
          role: "system",
          content:
            "Ты motion designer для Figma-to-Lottie продукта. Верни короткий безопасный motion plan. Учитывай prompt, слойность asset-а и durationMs. Если prompt про мячик, прыжок, пружинку, squash/stretch или сжатие перед прыжком, выбирай scenario spring_bounce. Не обещай настоящий vector morphing, если asset один shape/vector; имитируй squash/stretch через scale/float/pulse. Все timings должны быть внутри durationMs."
        },
        {
          role: "user",
          content: [{ type: "input_text", text: JSON.stringify(userPayload, null, 2) }]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "lotion_motion_plan",
          strict: true,
          schema: jsonSchema
        }
      }
    })
  });

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    return {
      ...fallbackPlan,
      notes: [`AI fallback: OpenAI ${response.status}.`, ...fallbackPlan.notes]
    };
  }

  const text = extractOutputText(data);
  if (!text) {
    return {
      ...fallbackPlan,
      notes: ["AI fallback: пустой ответ OpenAI.", ...fallbackPlan.notes]
    };
  }

  try {
    const parsed = JSON.parse(text) as {
      scenario?: string;
      durationMs?: number;
      steps?: MotionStep[];
      notes?: string[];
    };
    const durationMs = clampDurationMs(parsed.durationMs ?? requestedDurationMs, requestedDurationMs);
    const steps = Array.isArray(parsed.steps)
      ? parsed.steps.map((step) => normalizeStep(step, durationMs))
      : fallbackPlan.animationPlan;

    return {
      ...fallbackPlan,
      scenario: typeof parsed.scenario === "string" && scenarios.includes(parsed.scenario) ? parsed.scenario : fallbackPlan.scenario,
      durationMs,
      animationPlan: steps.length ? steps : fallbackPlan.animationPlan,
      notes: [
        "AI motion plan: gpt-5.5.",
        ...(Array.isArray(parsed.notes) ? parsed.notes.filter((note): note is string => typeof note === "string") : []),
        ...fallbackPlan.notes
      ].slice(0, 8)
    };
  } catch (error) {
    return {
      ...fallbackPlan,
      notes: ["AI fallback: OpenAI вернул невалидный JSON.", ...fallbackPlan.notes]
    };
  }
}
