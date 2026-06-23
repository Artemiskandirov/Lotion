import { NextResponse } from "next/server";
import { normalizeAssetRequest } from "@lotion/shared";

export async function readAssetRequest(request: Request) {
  const body = await request.json().catch(() => ({}));
  return normalizeAssetRequest(body);
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function methodNotAllowed() {
  return json({ error: "Method not allowed" }, 405);
}
