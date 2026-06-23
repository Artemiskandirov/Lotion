import { json, options } from "../../../lib/api";

export const OPTIONS = options;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const lottie = typeof body.lottie === "object" && body.lottie ? (body.lottie as Record<string, unknown>) : body;
  const errors: string[] = [];

  if (lottie.v === undefined) errors.push("Missing Lottie version");
  if (typeof lottie.w !== "number" || lottie.w <= 0) errors.push("Width must be a positive number");
  if (typeof lottie.h !== "number" || lottie.h <= 0) errors.push("Height must be a positive number");
  if (!Array.isArray(lottie.layers)) errors.push("Layers must be an array");
  if (typeof lottie.op !== "number" || lottie.op <= 0) errors.push("Out point must be a positive number");

  return json({
    valid: errors.length === 0,
    errors
  });
}
