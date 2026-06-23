import { detectParts, getLayerStats, inferAssetType } from "./asset-analysis";
import { motionRecipes } from "../motion-recipes/recipes";
import type { AssetRequest } from "../types/asset";
import type { FeasibilityLevel, FeasibilityReport, ScoreRow } from "../types/motion";

function includesIntent(request: AssetRequest, pattern: RegExp): boolean {
  const text = Object.values(request.intent).filter(Boolean).join(" ").toLowerCase();
  return pattern.test(text);
}

function scoreToLevel(score: number, characterRisk: boolean): FeasibilityLevel {
  if (characterRisk && score < 55) return "red";
  if (score >= 75) return "green";
  if (score >= 55) return "yellow";
  if (score >= 35) return "orange";
  return "red";
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

export function runFeasibilityCheck(request: AssetRequest): FeasibilityReport {
  const stats = getLayerStats(request.asset.layers);
  const detectedParts = detectParts(request);
  const assetType = inferAssetType(request.intent, request.asset.name);
  const detectedPartCount = Object.keys(detectedParts).length;

  const singleComplexPath = stats.totalLayers <= 2 && stats.vectors + stats.shapes >= 1;
  const tooComplex = stats.totalLayers > 90 || stats.maxDepth > 8;
  const characterRisk =
    assetType === "character" ||
    includesIntent(request, /(eat|sleep|run|walk|yawn|pose|mimic|есть|спать|бег|зев|мимик)/);

  let score = 48;
  score += Math.min(22, detectedPartCount * 5);
  score += Math.min(14, stats.groups * 2);
  score += stats.totalLayers >= 3 ? 8 : 0;
  score += stats.text === 0 && stats.images === 0 ? 8 : -8;
  score += singleComplexPath ? -28 : 0;
  score += tooComplex ? -14 : 0;
  score += characterRisk ? -28 : 0;
  score += includesIntent(request, /(reward|collect|unlock|success|error|attention|награ|получ|успех|ошиб|разблок)/)
    ? 8
    : 0;
  score = Math.max(10, Math.min(96, Math.round(score)));

  const level = scoreToLevel(score, characterRisk);
  const recommendedFormat =
    level === "red" && characterRisk ? "sprite-sheet" : level === "red" ? "rive" : "lottie";

  const canAnimate = unique([
    stats.totalLayers > 0 ? "whole asset transform" : "simple placeholder transform",
    detectedParts.lid ? "lid opening" : "",
    detectedParts.lock ? "lock pop or unlock motion" : "",
    detectedParts.eyes ? "blink" : "",
    detectedParts.star || detectedParts.highlight ? "sparkle and shine accents" : "",
    assetType === "progress" ? "progress fill" : ""
  ].filter(Boolean));

  const cannotAnimate = unique([
    singleComplexPath ? "separate part movement without splitting the vector" : "",
    characterRisk ? "natural pose changes, eating, yawning, or complex acting in Lottie" : "",
    !detectedParts.lid && /(chest|gift)/.test(assetType) ? "open/close movement for a separate lid" : "",
    stats.images > 0 ? "precise vector morphing of raster images" : ""
  ].filter(Boolean));

  const fixes = unique([
    singleComplexPath ? "Split the SVG into named parts such as body, lid, lock, eyes, and highlights." : "",
    detectedPartCount === 0 ? "Rename meaningful layers so the planner can target them safely." : "",
    tooComplex ? "Simplify nested groups and merge decorative details that do not need to move." : "",
    characterRisk ? "Use Rive or a sprite sheet for full character acting; keep Lottie for idle/blink/breathing." : ""
  ].filter(Boolean));

  const recommendedScenarios = suggestScenarioIds(request, assetType).slice(0, 3);
  const title =
    level === "green"
      ? `${score}/100 - хорошо подходит`
      : level === "yellow"
        ? `${score}/100 - можно, но с ограничениями`
        : level === "orange"
          ? `${score}/100 - сначала подготовить`
          : `${score}/100 - лучше не Lottie`;

  const scorecard: ScoreRow[] = [
    {
      label: "Layer separation",
      value: detectedPartCount >= 3 ? "Good" : singleComplexPath ? "Poor" : "Limited",
      status: detectedPartCount >= 3 ? "good" : singleComplexPath ? "poor" : "limited"
    },
    {
      label: "Lottie compatibility",
      value: recommendedFormat === "lottie" ? "Good" : "Risky",
      status: recommendedFormat === "lottie" ? "good" : "needs-work"
    },
    {
      label: "Part animation",
      value: detectedPartCount > 0 ? "Available" : "Whole asset only",
      status: detectedPartCount > 0 ? "good" : "limited"
    },
    {
      label: "Artifact risk",
      value: singleComplexPath || tooComplex ? "High" : "Low",
      status: singleComplexPath || tooComplex ? "needs-work" : "good"
    },
    {
      label: "Complexity",
      value: tooComplex || characterRisk ? "High" : stats.totalLayers > 20 ? "Medium" : "Low",
      status: tooComplex || characterRisk ? "needs-work" : "good"
    }
  ];

  return {
    score,
    level,
    title,
    summary: buildSummary(level, assetType, detectedPartCount, singleComplexPath, characterRisk),
    assetType,
    recommendedFormat,
    detectedParts,
    canAnimate,
    cannotAnimate,
    recommendedScenarios,
    fixes,
    scorecard,
    actions: buildActions(level, fixes.length > 0)
  };
}

export function suggestScenarioIds(request: AssetRequest, assetType?: string): string[] {
  const type = assetType ?? inferAssetType(request.intent, request.asset.name);
  const text = Object.values(request.intent).filter(Boolean).join(" ").toLowerCase();
  const scored = motionRecipes.map((recipe) => {
    let score = recipe.assetTypes.includes(type) ? 4 : recipe.assetTypes.includes("ui_asset") ? 1 : 0;
    score += recipe.intents.filter((intent) => text.includes(intent)).length * 3;
    return { recipe, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score > 0)
    .map((item) => item.recipe.id);
}

function buildSummary(
  level: FeasibilityLevel,
  assetType: string,
  detectedPartCount: number,
  singleComplexPath: boolean,
  characterRisk: boolean
): string {
  if (level === "green") {
    return `This looks like a ${assetType} asset with enough separated structure for a strong Lottie animation.`;
  }
  if (level === "yellow") {
    return `This can work as Lottie, but the safest version should animate only the parts that are clearly separated.`;
  }
  if (characterRisk) {
    return "This asks for character acting or pose changes, which is usually better as Rive or a sprite sheet.";
  }
  if (singleComplexPath || detectedPartCount === 0) {
    return "The asset is mostly a single combined vector, so a good part-based animation needs layer preparation first.";
  }
  return "The asset needs cleanup before a high-quality Lottie result, but a simple whole-object animation is possible.";
}

function buildActions(level: FeasibilityLevel, hasFixes: boolean): string[] {
  if (level === "green") return ["Generate animation", "Show moving parts", "Make 3 variants"];
  if (level === "yellow") return ["Generate safe animation", "Show moving parts", "Make 3 variants"];
  if (level === "orange") {
    return hasFixes
      ? ["Prepare layers", "Show what to fix", "Animate as single object"]
      : ["Try auto-split", "Animate as single object"];
  }
  return ["Use sprite approach", "Create simple Lottie fallback", "Show what to fix"];
}
