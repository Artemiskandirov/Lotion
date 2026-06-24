"use client";

import { useState } from "react";
import type { AssetRequest, LottieDocument, StoryboardDSL } from "@lotion/shared";

const sampleAsset: AssetRequest = {
  asset: {
    id: "sample-lock",
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
  intent: { prompt: "подпрыгни, крышка слегка открывается", durationSec: 2 }
};

type PlanResponse = { dsl: StoryboardDSL; layerOps: unknown[]; rationale: string };
type CompileResponse = { lottie: LottieDocument };

export default function Home() {
  const [prompt, setPrompt] = useState(sampleAsset.intent.prompt ?? "");
  const [dsl, setDsl] = useState<StoryboardDSL | null>(null);
  const [rationale, setRationale] = useState("");
  const [lottie, setLottie] = useState<LottieDocument | null>(null);
  const [loading, setLoading] = useState<"plan" | "compile" | null>(null);
  const [error, setError] = useState("");

  async function plan() {
    setLoading("plan");
    setError("");
    setLottie(null);
    try {
      const res = await fetch("/api/plan-storyboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...sampleAsset, intent: { ...sampleAsset.intent, prompt } })
      });
      if (!res.ok) throw new Error(`plan failed: ${res.status}`);
      const data = (await res.json()) as PlanResponse;
      setDsl(data.dsl);
      setRationale(data.rationale);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setLoading(null);
    }
  }

  async function compile() {
    if (!dsl) return;
    setLoading("compile");
    setError("");
    try {
      const res = await fetch("/api/compile-lottie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dsl, asset: sampleAsset.asset })
      });
      if (!res.ok) throw new Error(`compile failed: ${res.status}`);
      const data = (await res.json()) as CompileResponse;
      setLottie(data.lottie);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="shell">
      <section className="workspace">
        <div className="panel input-panel">
          <p className="eyebrow">Lotion · Backend smoke test</p>
          <h1>plan-storyboard / compile-lottie</h1>
          <p className="summary">
            Бэкенд для Figma-плагина Lotion. Эта страница — быстрая проверка обоих endpoint'ов на
            фиктивном asset-е (lock с lid и body). Реальный flow живёт в плагине.
          </p>
          <label>
            Prompt
            <textarea rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </label>
          <div className="button-row">
            <button onClick={plan} disabled={loading !== null}>
              {loading === "plan" ? "Планирую..." : "POST /api/plan-storyboard"}
            </button>
            <button className="secondary" onClick={compile} disabled={loading !== null || !dsl}>
              {loading === "compile" ? "Собираю..." : "POST /api/compile-lottie"}
            </button>
          </div>
          {error ? <p style={{ color: "salmon" }}>{error}</p> : null}
        </div>

        <div className="panel result-panel">
          {dsl ? (
            <>
              <h2>DSL</h2>
              <p className="summary">{rationale}</p>
              <pre>{JSON.stringify(dsl, null, 2)}</pre>
            </>
          ) : (
            <div className="empty-state">
              <strong>DSL появится тут</strong>
              <span>Нажми «POST /api/plan-storyboard».</span>
            </div>
          )}
          {lottie ? (
            <>
              <h2>Lottie · {lottie.layers.length} слоёв · {(lottie.op / lottie.fr).toFixed(2)}s</h2>
              <pre style={{ maxHeight: 320, overflow: "auto" }}>{JSON.stringify(lottie, null, 2)}</pre>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
