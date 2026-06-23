import { NextResponse } from "next/server";
import { normalizeAssetRequest } from "@lotion/shared";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export async function readAssetRequest(request: Request) {
  const body = await request.json().catch(() => ({}));
  return normalizeAssetRequest(body);
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: corsHeaders });
}

export function options() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders
  });
}

export function methodNotAllowed() {
  return json({ error: "Method not allowed" }, 405);
}
