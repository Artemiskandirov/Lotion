"use client";

import { useMemo, useState } from "react";
import type { AssetRequest, FeasibilityReport, AnimationPlan, LottieDocument } from "@lotion/shared";

const sampleAsset: AssetRequest = {
  asset: {
    id: "sample-chest",
    name: "Сундук с наградой",
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
    whatIsIt: "сундук с наградой",
    whereUsed: "детская обучающая игра",
    desiredAction: "открыться после выполненного задания",
    mood: "игровое",
    prompt: "Сделай ощущение, будто ребёнок получил приз."
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

    if (!response.ok) throw new Error(`Запрос не прошёл: ${response.status}`);
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
            <p className="eyebrow">Lotion</p>
            <h1>Проверка анимации</h1>
            <p className="summary">Опиши смысл asset-а, а Lotion оценит, подходит ли он для Lottie.</p>
          </div>

          <label>
            Что это?
            <input
              value={intent.whatIsIt ?? ""}
              onChange={(event) => setIntent({ ...intent, whatIsIt: event.target.value })}
            />
          </label>

          <label>
            Где используется?
            <input
              value={intent.whereUsed ?? ""}
              onChange={(event) => setIntent({ ...intent, whereUsed: event.target.value })}
            />
          </label>

          <label>
            Что должно произойти?
            <input
              value={intent.desiredAction ?? ""}
              onChange={(event) => setIntent({ ...intent, desiredAction: event.target.value })}
            />
          </label>

          <label>
            Настроение
            <input
              value={intent.mood ?? ""}
              onChange={(event) => setIntent({ ...intent, mood: event.target.value })}
            />
          </label>

          <label>
            Дополнительное описание
            <textarea
              value={intent.prompt ?? ""}
              rows={4}
              onChange={(event) => setIntent({ ...intent, prompt: event.target.value })}
            />
          </label>

          <div className="button-row">
            <button onClick={runCheck} disabled={loading !== null}>
              {loading === "check" ? "Проверяю..." : "Проверить"}
            </button>
            <button className="secondary" onClick={generate} disabled={loading !== null}>
              {loading === "generate" ? "Генерирую..." : "Сгенерировать"}
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
                  <h2>Можно анимировать</h2>
                  <ul>{report.canAnimate.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
                <div>
                  <h2>Что важно учесть</h2>
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
              <strong>Пример asset-а</strong>
              <span>Сундук с отдельными слоями body, lid, lock, highlights и stars.</span>
            </div>
          )}

          {generated ? (
            <div className="output">
              <h2>План анимации</h2>
              <pre>{JSON.stringify(generated.plan, null, 2)}</pre>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
