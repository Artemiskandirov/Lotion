import type { AssetLayer, AssetRequest, StoryboardDSL } from "@lotion/shared";
import { storyboardJSONSchema, validateStoryboardDSL } from "@lotion/shared";
import { openAIConfig } from "./openai";
import { deterministicPlan } from "./deterministic-planner";

const aiTimeoutMs = 14000;

const systemPrompt = `Ты — старший motion-designer Disney/Pixar-уровня. Получаешь иконку из Figma, prompt пользователя и базовый детерминированный план движения как hint.
Верни ТОЛЬКО StoryboardDSL JSON по схеме (без обёрток, без комментариев). Используй hint как ориентир, но улучшай: добавляй более точные spring stiffness/damping, anticipation, overshoot, secondary motion на дочерние слои если есть.

12 принципов Диснея:
1. squash & stretch — масса сохраняется: при удлинении (sy>1) сжимай по другой оси (sx<1).
2. anticipation — перед сильным движением небольшое контр-движение (ease.kind="anticipation").
3. follow-through / overshoot — после остановки лёгкий пере-ход за цель (ease.kind="overshoot").
4. ease in / out — никогда не линейные движения, кроме намеренной механики.
5. secondary motion — производные слои двигаются с задержкой через track.secondary.
6. exaggeration — амплитуда должна читаться.
7. arcs — для траекторий промежуточные tx/ty.
8. timing — 200-500мс на ключевые движения.

Правила:
- t (время) 0..1; первый keyframe t=0, последний t=1.
- Анимация ВСЕГДА залупливается: последнее = первое (loop:true).
- Максимум 8 keyframe на трек, максимум 5 треков.
- Если в иконке есть отделимые части (lid, body, lock, eye) — раздели через layerOps.isolate и анимируй отдельно.
- spring stiffness 120-300, damping 8-20, mass 0.5-2.
- morphTo указывай ТОЛЬКО если форма явно меняется.`;

function layerPaths(layer: AssetLayer, prefix = ""): string[] {
  const path = prefix ? `${prefix}/${layer.name}` : layer.name;
  const result: string[] = [];
  result.push(`${path}#${layer.id} [${layer.type}/${layer.shapeKind ?? "?"}] ${Math.round(layer.width ?? 0)}x${Math.round(layer.height ?? 0)} @${Math.round(layer.x ?? 0)},${Math.round(layer.y ?? 0)}`);
  for (const child of layer.children ?? []) {
    result.push(...layerPaths(child, path));
  }
  return result;
}

function compactSvg(svg: string | undefined): string | undefined {
  if (!svg) return undefined;
  const paths = Array.from(svg.matchAll(/<path[^>]*\sd="([^"]+)"/g)).map((m) => m[1]);
  return paths.length ? paths.slice(0, 6).join(" | ") : undefined;
}

function extractOutputText(data: Record<string, unknown>): string | undefined {
  if (typeof data.output_text === "string") return data.output_text;
  if (Array.isArray(data.output)) {
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
  }
  if (Array.isArray((data as { choices?: unknown }).choices)) {
    const choices = (data as { choices: Array<{ message?: { content?: unknown } }> }).choices;
    const content = choices[0]?.message?.content;
    if (typeof content === "string") return content;
  }
  return undefined;
}

function clampDurationMs(value: number, fallback: number): number {
  const duration = Number.isFinite(value) ? value : fallback;
  return Math.max(500, Math.min(5000, Math.round(duration)));
}

export async function planStoryboard(request: AssetRequest): Promise<StoryboardDSL> {
  const durationMs = clampDurationMs((request.intent.durationSec ?? 2) * 1000, 2000);
  const base = deterministicPlan(request);

  if (!openAIConfig.apiKey) return base;

  const userPayload = {
    prompt: request.intent.prompt ?? "",
    durationMs,
    asset: {
      name: request.asset.name,
      type: request.asset.type,
      width: request.asset.width,
      height: request.asset.height
    },
    layers: request.asset.layers.flatMap((layer) => layerPaths(layer)).slice(0, 24),
    pathData: compactSvg(request.asset.svg),
    deterministicHint: base
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), aiTimeoutMs);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${openAIConfig.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: openAIConfig.model,
        reasoning: { effort: "low" },
        input: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [{ type: "input_text", text: JSON.stringify(userPayload, null, 2) }]
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "lotion_storyboard",
            strict: false,
            schema: storyboardJSONSchema
          }
        }
      })
    });

    if (!response.ok) return base;

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const text = extractOutputText(data);
    if (!text) return base;

    const parsed = JSON.parse(text);
    const validated = validateStoryboardDSL(parsed);
    if (!validated) return base;

    return {
      ...validated,
      durationMs: clampDurationMs(validated.durationMs, durationMs),
      rationale: validated.rationale ?? `AI (${openAIConfig.model})`
    };
  } catch {
    return base;
  } finally {
    clearTimeout(timeout);
  }
}
