import { test } from "node:test";
import assert from "node:assert/strict";
import type { AssetRequest } from "@lotion/shared";
import { deterministicPlan } from "./deterministic-planner";

function makeRequest(prompt: string, durationSec = 2): AssetRequest {
  return {
    asset: {
      id: "asset-1",
      name: "lock",
      type: "frame",
      width: 120,
      height: 160,
      layers: [
        {
          id: "root",
          name: "lock",
          type: "frame",
          children: [
            { id: "lid-1", name: "lid", type: "vector", width: 120, height: 40, x: 0, y: 0 },
            { id: "body-1", name: "body", type: "vector", width: 120, height: 120, x: 0, y: 40 }
          ]
        }
      ]
    },
    intent: { prompt, durationSec }
  };
}

function trackSignature(plan: ReturnType<typeof deterministicPlan>): string {
  return plan.tracks
    .map((t) => `${t.layerRef}:${t.keyframes.map((kf) => `${kf.t.toFixed(2)}|${Object.keys(kf).sort().join(",")}`).join(";")}`)
    .join("||");
}

test("different prompts produce different DSLs", () => {
  const bounce = deterministicPlan(makeRequest("bounce hard"));
  const rotate = deterministicPlan(makeRequest("rotate slowly"));
  const pulse = deterministicPlan(makeRequest("pulse twice"));

  assert.notEqual(trackSignature(bounce), trackSignature(rotate));
  assert.notEqual(trackSignature(rotate), trackSignature(pulse));
  assert.notEqual(trackSignature(bounce), trackSignature(pulse));
});

test("keyframe times are normalized to [0,1] and ordered", () => {
  const plan = deterministicPlan(makeRequest("bounce and shake"));
  for (const track of plan.tracks) {
    for (let i = 0; i < track.keyframes.length; i += 1) {
      const t = track.keyframes[i].t;
      assert.ok(t >= 0 && t <= 1, `keyframe t=${t} out of [0,1]`);
      if (i > 0) assert.ok(t >= track.keyframes[i - 1].t, "keyframes must be sorted");
    }
  }
});

test("ty amplitude scales with asset height", () => {
  const tall = deterministicPlan(makeRequest("bounce"));
  const tallMaxTy = Math.max(...tall.tracks[0].keyframes.map((kf) => Math.abs(kf.ty ?? 0)));

  const shortReq = makeRequest("bounce");
  shortReq.asset.height = 40;
  const short = deterministicPlan(shortReq);
  const shortMaxTy = Math.max(...short.tracks[0].keyframes.map((kf) => Math.abs(kf.ty ?? 0)));

  assert.ok(tallMaxTy > shortMaxTy, `expected tall ty (${tallMaxTy}) > short ty (${shortMaxTy})`);
});

test("part mention adds isolate layerOp and secondary track", () => {
  const plan = deterministicPlan(makeRequest("крышка открывается, замок раскрывается"));
  assert.ok(plan.layerOps?.some((op) => op.op === "isolate"), "should isolate the lid layer");
  assert.ok(plan.tracks.length >= 2, "should add a second track for the part");
});

test("default fallback when no verb matches", () => {
  const plan = deterministicPlan(makeRequest("просто что-нибудь"));
  assert.ok(plan.rationale?.includes("gentle-pulse"), "should fall back to gentle pulse");
  assert.equal(plan.tracks.length, 1);
});

test("clamps duration to [500, 5000]", () => {
  assert.equal(deterministicPlan(makeRequest("bounce", 0.1)).durationMs, 500);
  assert.equal(deterministicPlan(makeRequest("bounce", 99)).durationMs, 5000);
});
