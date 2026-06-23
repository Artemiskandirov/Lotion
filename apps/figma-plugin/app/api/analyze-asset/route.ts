import { detectParts, getLayerStats, inferAssetType } from "@lotion/shared";
import { json, options, readAssetRequest } from "../../../lib/api";

export const OPTIONS = options;

export async function POST(request: Request) {
  const assetRequest = await readAssetRequest(request);
  const stats = getLayerStats(assetRequest.asset.layers);
  const detectedParts = detectParts(assetRequest);
  const assetType = inferAssetType(assetRequest.intent, assetRequest.asset.name);

  return json({
    assetType,
    stats,
    detectedParts,
    dimensions: {
      width: assetRequest.asset.width,
      height: assetRequest.asset.height
    }
  });
}
