"use client";

import { useMemo, useState } from "react";
import type { AssetRequest, FeasibilityReport, AnimationPlan, LottieDocument } from "@lotion/shared";
import "./styles.css";

const sampleAsset: AssetRequest = {
  asset: {
    id: "sample-chest",
    name: "Reward chest",
    type: "group",
    width: 320,
    height: 240,
    layers: [
      { id: "body", name: "body", type: "group", width: 260, height: 140 },
      { id: "lid", name: "lid", type: "group", width: 260, height: 72 },
      { id: "lock", name: "lock", type: "vector", width: 38, height: 46 },
      { id: "highlight", name: "highlights", type: "group", width: 220, height: 80 },
      { id: "sparkles", name: "stars", type: "group", width: 280, height: 120 }
    ]
  },
  intent: {
    whatIsIt: "reward chest",
    whereUsed: "kids learning game",
    desiredAction: "open after completing a task",
    mood: "playful",
    prompt: "Make it feel like the child received a prize."
  }
};

type LottieResponse = {
  plan: AnimationPlan;
  lottie: LottieDocument;
};

export default function Home() {
  const [intent, setIntent] = useState(sampleAsset.intent);
  const [report, setReport] = useState<FeasibilityReport | null>(null);
  const [generated, setGenerated] = useState<LottieResponse | null>(null);
  const [loading, setLoading] = useState<"check" | "generate" | null>(null);

  const requestBody = useMemo<AssetRequest>(
    () => ({
      ...sampleAsset,
      intent
    }),
    [intent]
  );

  async function post<T>(url: string, body: unknown): Promise<T> {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return response.json() as Promise<T>;
  }

  async function runCheck() {
    setLoading("check");
    setGenerated(null);
    try {
      setReport(await post<FeasibilityReport>("/api/feasibility-check", requestBody));
    } finally {
      setLoading(null);
    }
  }

  async function generate() {
    setLoading("generate");
    try {
      setGenerated(await post<LottieResponse>("/api/generate-lottie", requestBody));
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="shell">
      <section className="workspace">
        <div className="panel input-panel">
          <div>
            <p className="eyebrow">Motion Feasibility Check</p>
            <h1>Can this be animated?</h1>
          </div>

          <label>
            What is it?
            <input
              value={intent.whatIsIt ?? ""}
              onChange={(event) => setIntent({ ...intent, whatIsIt: event.target.value })}
            />
          </label>

          <label>
            Where is it used?
            <input
              value={intent.whereUsed ?? ""}
              onChange={(event) => setIntent({ ...intent, whereUsed: event.target.value })}
            />
          </label>

          <label>
            What should happen?
            <input
              value={intent.desiredAction ?? ""}
              onChange={(event) => setIntent({ ...intent, desiredAction: event.target.value })}
            />
          </label>

          <label>
            Mood
            <input
              value={intent.mood ?? ""}
              onChange={(event) => setIntent({ ...intent, mood: event.target.value })}
            />
          </label>

          <label>
            Prompt
            <textarea
              value={intent.prompt ?? ""}
              rows={4}
              onChange={(event) => setIntent({ ...intent, prompt: event.target.value })}
            />
          </label>

          <div className="button-row">
            <button onClick={runCheck} disabled={loading !== null}>
              {loading === "check" ? "Checking..." : "Check feasibility"}
            </button>
            <button className="secondary" onClick={generate} disabled={loading !== null}>
              {loading === "generate" ? "Generating..." : "Generate Lottie"}
            </button>
          </div>
        </div>

        <div className="panel result-panel">
          {report ? (
            <>
              <div className={`score ${report.level}`}>
                <span>{report.title}</span>
                <strong>{report.assetType}</strong>
              </div>
              <p className="summary">{report.summary}</p>
              <div className="scorecard">
                {report.scorecard.map((row) => (
                  <div key={row.label}>
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </div>
                ))}
              </div>
              <div className="columns">
                <div>
                  <h2>Can animate</h2>
                  <ul>{report.canAnimate.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
                <div>
                  <h2>Needs care</h2>
                  <ul>{[...report.cannotAnimate, ...report.fixes].map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              </div>
              <div className="actions">
                {report.actions.map((action) => (
                  <span key={action}>{action}</span>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <strong>Sample asset</strong>
              <span>Reward chest with body, lid, lock, highlights, and stars.</span>
            </div>
          )}

          {generated ? (
            <div className="output">
              <h2>Motion plan</h2>
              <pre>{JSON.stringify(generated.plan, null, 2)}</pre>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
