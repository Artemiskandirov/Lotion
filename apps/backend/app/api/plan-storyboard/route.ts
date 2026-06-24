import { normalizeAssetRequest } from "@lotion/shared";
import { planStoryboard } from "../../../lib/ai-storyboard";
import { json, options } from "../../../lib/api";

export const OPTIONS = options;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const assetRequest = normalizeAssetRequest(body);
  const dsl = await planStoryboard(assetRequest);
  return json({ dsl, layerOps: dsl.layerOps ?? [], rationale: dsl.rationale ?? "" });
}
