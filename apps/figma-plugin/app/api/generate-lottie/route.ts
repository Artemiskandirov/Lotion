import { compilePlanToLottie, generateMotionPlan, normalizeAssetRequest } from "@lotion/shared";
import { planMotionWithAI } from "../../../lib/ai-motion";
import { json, options } from "../../../lib/api";

export const OPTIONS = options;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const bodyRecord = typeof body === "object" && body ? (body as Record<string, unknown>) : {};
  const assetRequest = normalizeAssetRequest(bodyRecord);
  const scenarioId = typeof bodyRecord.scenarioId === "string" ? bodyRecord.scenarioId : undefined;
  const fallbackPlan = generateMotionPlan(assetRequest, scenarioId);
  const plan = await planMotionWithAI(assetRequest, fallbackPlan);
  const lottie = compilePlanToLottie(plan);

  return json({ plan, lottie });
}
