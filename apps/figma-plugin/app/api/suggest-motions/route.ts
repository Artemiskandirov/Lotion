import { motionRecipes, runFeasibilityCheck, suggestScenarioIds } from "@lotion/shared";
import { json, options, readAssetRequest } from "../../../lib/api";

export const OPTIONS = options;

export async function POST(request: Request) {
  const assetRequest = await readAssetRequest(request);
  const report = runFeasibilityCheck(assetRequest);
  const ids = suggestScenarioIds(assetRequest, report.assetType);
  const recipes = ids
    .map((id) => motionRecipes.find((recipe) => recipe.id === id))
    .filter(Boolean);

  return json({
    assetType: report.assetType,
    recommendedScenarios: recipes,
    fallbackScenarios: motionRecipes.filter((recipe) => !ids.includes(recipe.id)).slice(0, 3)
  });
}
