import type { AssetLayer, AssetLayerType, AssetRequest, AssetSnapshot } from "../types/asset";

const layerTypeValues: AssetLayerType[] = [
  "frame",
  "group",
  "component",
  "instance",
  "vector",
  "shape",
  "text",
  "image",
  "unknown"
];

const layerTypes = new Set<AssetLayerType>(layerTypeValues);

function isAssetLayerType(value: unknown): value is AssetLayerType {
  return typeof value === "string" && layerTypes.has(value as AssetLayerType);
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toDurationSec(value: unknown): number | undefined {
  const duration = toNumber(value, NaN);
  if (!Number.isFinite(duration)) return undefined;
  return Math.max(0.5, Math.min(5, duration));
}

function toStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

function normalizeLayer(input: unknown, index: number): AssetLayer {
  const raw = typeof input === "object" && input ? (input as Record<string, unknown>) : {};
  const type: AssetLayerType = isAssetLayerType(raw.type) ? raw.type : "unknown";
  const children = Array.isArray(raw.children)
    ? raw.children.map((child, childIndex) => normalizeLayer(child, childIndex))
    : undefined;

  return {
    id: typeof raw.id === "string" ? raw.id : `layer-${index}`,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : `Layer ${index + 1}`,
    type,
    shapeKind: typeof raw.shapeKind === "string" ? raw.shapeKind : undefined,
    visible: typeof raw.visible === "boolean" ? raw.visible : true,
    opacity: toNumber(raw.opacity, 1),
    rotation: toNumber(raw.rotation),
    width: toNumber(raw.width),
    height: toNumber(raw.height),
    x: toNumber(raw.x),
    y: toNumber(raw.y),
    fills: toStrings(raw.fills),
    strokes: toStrings(raw.strokes),
    fillColors: toStrings(raw.fillColors),
    strokeColors: toStrings(raw.strokeColors),
    strokeWeight: toNumber(raw.strokeWeight),
    cornerRadius: toNumber(raw.cornerRadius),
    children
  };
}

export function normalizeAssetRequest(input: unknown): AssetRequest {
  const raw = typeof input === "object" && input ? (input as Record<string, unknown>) : {};
  const assetRaw =
    typeof raw.asset === "object" && raw.asset ? (raw.asset as Record<string, unknown>) : {};
  const intentRaw =
    typeof raw.intent === "object" && raw.intent ? (raw.intent as Record<string, unknown>) : {};

  const asset: AssetSnapshot = {
    id: typeof assetRaw.id === "string" ? assetRaw.id : "selected-asset",
    name: typeof assetRaw.name === "string" && assetRaw.name.trim() ? assetRaw.name : "Selected asset",
    type: isAssetLayerType(assetRaw.type) ? assetRaw.type : "unknown",
    width: Math.max(1, toNumber(assetRaw.width, 256)),
    height: Math.max(1, toNumber(assetRaw.height, 256)),
    layers: Array.isArray(assetRaw.layers)
      ? assetRaw.layers.map((layer, index) => normalizeLayer(layer, index))
      : [],
    svg: typeof assetRaw.svg === "string" ? assetRaw.svg : undefined
  };

  return {
    asset,
    intent: {
      whatIsIt: typeof intentRaw.whatIsIt === "string" ? intentRaw.whatIsIt : undefined,
      whereUsed: typeof intentRaw.whereUsed === "string" ? intentRaw.whereUsed : undefined,
      desiredAction:
        typeof intentRaw.desiredAction === "string" ? intentRaw.desiredAction : undefined,
      mood: typeof intentRaw.mood === "string" ? intentRaw.mood : undefined,
      prompt: typeof intentRaw.prompt === "string" ? intentRaw.prompt : undefined,
      durationSec: toDurationSec(intentRaw.durationSec)
    }
  };
}
