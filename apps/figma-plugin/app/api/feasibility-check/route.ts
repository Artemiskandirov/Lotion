import { runFeasibilityCheck } from "@lotion/shared";
import { json, options, readAssetRequest } from "../../../lib/api";

export const OPTIONS = options;

export async function POST(request: Request) {
  const assetRequest = await readAssetRequest(request);
  return json(runFeasibilityCheck(assetRequest));
}
