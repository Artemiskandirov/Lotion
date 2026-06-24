import { compileFromDSL, normalizeAssetRequest, validateStoryboardDSL } from "@lotion/shared";
import { json, options } from "../../../lib/api";

export const OPTIONS = options;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const bodyRecord = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const dsl = validateStoryboardDSL(bodyRecord.dsl);
  if (!dsl) {
    return json({ error: "Invalid DSL" }, 400);
  }
  const assetRequest = normalizeAssetRequest({ asset: bodyRecord.asset, intent: {} });
  const lottie = compileFromDSL(dsl, assetRequest.asset);
  return json({ lottie });
}
