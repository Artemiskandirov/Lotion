import { runFeasibilityCheck } from "@lotion/shared";
import { json, readAssetRequest } from "../../../lib/api";

export async function POST(request: Request) {
  const assetRequest = await readAssetRequest(request);
  return json(runFeasibilityCheck(assetRequest));
}
