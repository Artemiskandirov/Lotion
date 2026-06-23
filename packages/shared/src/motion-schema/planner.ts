import { detectParts, inferAssetType } from "./asset-analysis";
import { runFeasibilityCheck, suggestScenarioIds } from "./feasibility";
import { getRecipe } from "../motion-recipes/recipes";
import type { AssetRequest } from "../types/asset";
import type { AnimationPlan, MotionStep } from "../types/motion";

const fallbackTargets: Record<string, string> = {
  body: "asset",
  lid: "asset",
  lock: "asset",
  highlight: "asset",
  star: "asset",
  coin: "asset",
  check: "asset",
  progress: "asset"
};

export function generateMotionPlan(request: AssetRequest, scenarioId?: string): AnimationPlan {
  const report = runFeasibilityCheck(request);
  const detectedParts = detectParts(request);
  const assetType = inferAssetType(request.intent, request.asset.name);
  const scenario = scenarioId ?? suggestScenarioIds(request, assetType)[0] ?? "attention_float";
  const recipe = getRecipe(scenario) ?? getRecipe("attention_float");
  const steps = (recipe?.steps ?? []).map((step): MotionStep => {
    const layerName = detectedParts[step.target] ?? fallbackTargets[step.target] ?? "asset";
    return {
      ...step,
      target: layerName
    };
  });

  const durationMs = Math.max(900, ...steps.map((step) => step.start + step.duration + 120));

  return {
    assetType,
    feasibility: report.level,
    score: report.score,
    format: report.recommendedFormat,
    scenario: recipe?.id ?? "attention_float",
    detectedParts,
    durationMs,
    width: request.asset.width,
    height: request.asset.height,
    animationPlan: steps,
    notes: [
      report.summary,
      ...report.cannotAnimate.map((item) => `Limitation: ${item}`),
      ...report.fixes.map((item) => `Fix: ${item}`)
    ]
  };
}
