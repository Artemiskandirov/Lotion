import type { AssetIntent, AssetLayer, AssetRequest, LayerStats } from "../types/asset";

const partKeywords: Record<string, string[]> = {
  lid: ["lid", "cover", "top", "крыш"],
  body: ["body", "base", "case", "корпус"],
  lock: ["lock", "keyhole", "зам", "ключ"],
  eyes: ["eye", "eyes", "глаз"],
  head: ["head", "face", "голов", "лицо"],
  arm: ["arm", "hand", "рук"],
  coin: ["coin", "монет"],
  star: ["star", "spark", "звезд", "искра"],
  check: ["check", "tick", "success", "галоч"],
  warning: ["warn", "alert", "error", "ошиб", "вним"],
  progress: ["progress", "bar", "meter", "прогресс"],
  highlight: ["highlight", "shine", "glow", "свет", "блик"]
};

function walk(layer: AssetLayer, depth: number, stats: LayerStats): void {
  stats.totalLayers += 1;
  stats.maxDepth = Math.max(stats.maxDepth, depth);

  if (layer.type === "group" || layer.type === "frame" || layer.type === "component") stats.groups += 1;
  if (layer.type === "vector") stats.vectors += 1;
  if (layer.type === "shape") stats.shapes += 1;
  if (layer.type === "text") stats.text += 1;
  if (layer.type === "image") stats.images += 1;

  const name = layer.name.toLowerCase();
  for (const [part, keywords] of Object.entries(partKeywords)) {
    if (keywords.some((keyword) => name.includes(keyword)) && !stats.namedParts.includes(part)) {
      stats.namedParts.push(part);
    }
  }

  layer.children?.forEach((child) => walk(child, depth + 1, stats));
}

export function getLayerStats(layers: AssetLayer[]): LayerStats {
  const stats: LayerStats = {
    totalLayers: 0,
    groups: 0,
    vectors: 0,
    shapes: 0,
    text: 0,
    images: 0,
    maxDepth: 0,
    namedParts: []
  };

  layers.forEach((layer) => walk(layer, 1, stats));
  return stats;
}

export function flattenLayers(layers: AssetLayer[]): AssetLayer[] {
  return layers.flatMap((layer) => [layer, ...flattenLayers(layer.children ?? [])]);
}

export function detectParts(request: AssetRequest): Record<string, string> {
  const parts: Record<string, string> = {};

  for (const layer of flattenLayers(request.asset.layers)) {
    const name = layer.name.toLowerCase();
    for (const [part, keywords] of Object.entries(partKeywords)) {
      if (!parts[part] && keywords.some((keyword) => name.includes(keyword))) {
        parts[part] = layer.name;
      }
    }
  }

  return parts;
}

export function inferAssetType(intent: AssetIntent, assetName: string): string {
  const text = [
    intent.whatIsIt,
    intent.whereUsed,
    intent.desiredAction,
    intent.mood,
    intent.prompt,
    assetName
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/(chest|сундук|treasure)/.test(text)) return "chest";
  if (/(coin|монет|currency)/.test(text)) return "coin";
  if (/(star|звезд|rare|spark)/.test(text)) return "star";
  if (/(lock|unlock|зам|разблок)/.test(text)) return "lock";
  if (/(gift|present|подар)/.test(text)) return "gift";
  if (/(badge|achievement|ачив|награ)/.test(text)) return "badge";
  if (/(button|cta|кноп)/.test(text)) return "button";
  if (/(check|success|done|галоч|успех)/.test(text)) return "checkmark";
  if (/(warn|error|alert|ошиб|вним)/.test(text)) return "warning";
  if (/(progress|loading|bar|прогресс|загруз)/.test(text)) return "progress";
  if (/(cat|dog|character|person|child|кот|персонаж|ребен|человек)/.test(text)) {
    return "character";
  }

  return "ui_asset";
}
