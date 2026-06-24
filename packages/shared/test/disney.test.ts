import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyAnticipation,
  applyOvershoot,
  expandEasing,
  springSamples
} from "../src/physics/disney.ts";
import { validateStoryboardDSL } from "../src/dsl/schema.ts";
import { compileFromDSL } from "../src/lottie/dsl-compile.ts";

test("spring samples converge to target", () => {
  const samples = springSamples({ kind: "spring", stiffness: 180, damping: 14, mass: 1 }, 0, 100, 1000, 60);
  assert.ok(samples.length >= 4);
  assert.equal(samples[0].t, 0);
  assert.equal(samples[samples.length - 1].t, 1);
  const last = samples[samples.length - 1].value;
  assert.ok(Math.abs(last - 100) < 20, `expected near 100, got ${last}`);
});

test("applyAnticipation inserts a pre-keyframe", () => {
  const kfs = [
    { t: 0, ty: 0 },
    { t: 1, ty: -50 }
  ];
  const result = applyAnticipation(kfs, 0.1);
  assert.equal(result.length, 3);
  assert.ok(result[1].t > 0 && result[1].t < 1);
  assert.ok((result[1].ty ?? 0) > 0, "anticipation must move opposite");
});

test("applyOvershoot exceeds target then settles", () => {
  const kfs = [
    { t: 0, sx: 1 },
    { t: 1, sx: 1.2 }
  ];
  const result = applyOvershoot(kfs, 0.15);
  assert.ok(result.length >= 3);
  const overshoot = result.find((kf) => typeof kf.sx === "number" && kf.sx > 1.2);
  assert.ok(overshoot, "must contain a keyframe above target");
  assert.ok((overshoot!.sx ?? 0) <= 1.5, "overshoot should be bounded");
});

test("expandEasing fills spring segments with intermediate keyframes", () => {
  const kfs = [
    { t: 0, tx: 0 },
    { t: 1, tx: 100, ease: { kind: "spring" as const, stiffness: 180, damping: 14, mass: 1 } }
  ];
  const expanded = expandEasing(kfs, 1000, 60);
  assert.ok(expanded.length > 2, `expected expansion, got ${expanded.length}`);
});

test("validateStoryboardDSL rejects garbage", () => {
  assert.equal(validateStoryboardDSL(null), null);
  assert.equal(validateStoryboardDSL({}), null);
  assert.equal(validateStoryboardDSL({ tracks: [] }), null);
});

test("validateStoryboardDSL normalizes valid input", () => {
  const dsl = validateStoryboardDSL({
    durationMs: 2000,
    fps: 60,
    loop: true,
    tracks: [
      {
        layerRef: "asset",
        keyframes: [
          { t: 0, tx: 0 },
          { t: 1, tx: 50, ease: { kind: "spring", stiffness: 200, damping: 12 } }
        ]
      }
    ]
  });
  assert.ok(dsl);
  assert.equal(dsl!.tracks.length, 1);
  assert.equal(dsl!.tracks[0].keyframes.length, 2);
});

test("compileFromDSL produces valid Lottie skeleton", () => {
  const lottie = compileFromDSL(
    {
      durationMs: 1000,
      fps: 60,
      loop: true,
      tracks: [
        {
          layerRef: "asset",
          keyframes: [
            { t: 0, sx: 1, sy: 1 },
            { t: 0.5, sx: 1.15, sy: 0.88 },
            { t: 1, sx: 1, sy: 1 }
          ]
        }
      ]
    },
    { id: "asset", name: "asset", type: "vector", width: 256, height: 256, layers: [], svg: "<svg></svg>" }
  );
  assert.equal(lottie.v, "5.12.2");
  assert.equal(lottie.fr, 60);
  assert.equal(lottie.op, 60);
  assert.ok(lottie.layers.length >= 1);
});

test("compileFromDSL handles morph keyframes", () => {
  const lottie = compileFromDSL(
    {
      durationMs: 1000,
      fps: 60,
      loop: true,
      tracks: [
        {
          layerRef: "asset",
          keyframes: [
            { t: 0, morphTo: "M0 0 L100 0 L100 100 L0 100 Z" },
            { t: 1, morphTo: "M0 0 C50 -20 100 0 100 100 L0 100 Z" }
          ]
        }
      ]
    },
    { id: "asset", name: "asset", type: "vector", width: 100, height: 100, layers: [] }
  );
  const layer = lottie.layers[0] as { ty: number; shapes?: unknown[] };
  assert.equal(layer.ty, 4);
  assert.ok(Array.isArray(layer.shapes));
});
