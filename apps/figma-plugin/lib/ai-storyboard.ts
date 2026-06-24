import type { AssetLayer, AssetRequest, StoryboardDSL } from "@lotion/shared";
import { storyboardJSONSchema, validateStoryboardDSL } from "@lotion/shared";
import { openAIConfig } from "./openai";

const aiTimeoutMs = 14000;

const systemPrompt = `Ты — старший motion-designer Disney/Pixar-уровня. Получаешь иконку из Figma и prompt пользователя.
Верни ТОЛЬКО StoryboardDSL JSON по схеме (без обёрток, без комментариев).

12 принципов Диснея, которыми руководствуйся:
1. squash & stretch — масса сохраняется: при удлинении (sy>1) сжимай по другой оси (sx<1).
2. anticipation — перед сильным движением небольшое контр-движение (ease.kind="anticipation").
3. follow-through / overshoot — после остановки лёгкий пере-ход за цель (ease.kind="overshoot").
4. ease in / out — никогда не линейные движения, кроме намеренной механики.
5. secondary motion — производные слои (волосы, цепочки) двигаются с задержкой через track.secondary.
6. exaggeration — амплитуда движения должна читаться: scale 1.0 → 1.18 заметнее чем 1.05.
7. arcs — для траекторий используй промежуточные tx/ty, а не прямую линию.
8. timing — длительность ключевых движений 200-500мс; промежуточные пружинки укладываются в общий durationMs.

Правила вывода:
- t (время) нормализовано 0..1; первый keyframe всегда t=0, последний всегда t=1.
- Анимация ВСЕГДА залупливается: последнее состояние = первое состояние (loop:true).
- Максимум 8 keyframe на трек, максимум 5 треков.
- Если иконка одна, делай один трек на root.
- Если в иконке есть отделимые части (lid, body, lock, eye) — раздели через layerOps и анимируй отдельно.
- Для spring используй stiffness 120-300, damping 8-20, mass 0.5-2.
- morphTo указывай ТОЛЬКО если форма явно меняется (открывается/закрывается); это SVG path d=.

Stiffness/damping cheat sheet:
- bouncy ball: stiffness 240, damping 9, mass 1
- soft pop: stiffness 180, damping 14, mass 1
- heavy settle: stiffness 120, damping 18, mass 2.5`;

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

function fallbackDSL(request: AssetRequest, durationMs: number): StoryboardDSL {
  const ref = request.asset.name || request.asset.id || "asset";
  return {
    durationMs,
    fps: 60,
    loop: true,
    tracks: [
      {
        layerRef: ref,
        keyframes: [
          { t: 0, sx: 1, sy: 1, ty: 0, ease: { kind: "anticipation", pullback: 0.12 } },
          { t: 0.18, sx: 1.15, sy: 0.88, ty: 4 },
          { t: 0.42, sx: 0.94, sy: 1.08, ty: -Math.max(20, request.asset.height * 0.22), ease: { kind: "spring", stiffness: 220, damping: 12, mass: 1 } },
          { t: 0.72, sx: 1.08, sy: 0.94, ty: 0, ease: { kind: "overshoot", amount: 0.18 } },
          { t: 1, sx: 1, sy: 1, ty: 0 }
        ]
      }
    ],
    rationale: "Fallback DSL: bouncy ball с anticipation и overshoot."
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

function clampDurationMs(value: number, fallback: number): number {
  const duration = Number.isFinite(value) ? value : fallback;
  return Math.max(500, Math.min(5000, Math.round(duration)));
}

export async function planStoryboardWithAI(request: AssetRequest): Promise<StoryboardDSL> {
  const durationMs = clampDurationMs((request.intent.durationSec ?? 2) * 1000, 2000);

  if (!openAIConfig.apiKey) {
    return fallbackDSL(request, durationMs);
  }

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
    pathData: compactSvg(request.asset.svg)
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

    if (!response.ok) return fallbackDSL(request, durationMs);

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const text = extractOutputText(data);
    if (!text) return fallbackDSL(request, durationMs);

    const parsed = JSON.parse(text);
    const validated = validateStoryboardDSL(parsed);
    if (!validated) return fallbackDSL(request, durationMs);

    return { ...validated, durationMs: clampDurationMs(validated.durationMs, durationMs) };
  } catch (error) {
    return fallbackDSL(request, durationMs);
  } finally {
    clearTimeout(timeout);
  }
}
