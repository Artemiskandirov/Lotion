import { generateMotionPlan, normalizeAssetRequest } from "@lotion/shared";
import { json } from "../../../lib/api";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const bodyRecord = typeof body === "object" && body ? (body as Record<string, unknown>) : {};
  const assetRequest = normalizeAssetRequest(bodyRecord);
  const scenarioId = typeof bodyRecord.scenarioId === "string" ? bodyRecord.scenarioId : undefined;

  return json(generateMotionPlan(assetRequest, scenarioId));
}
