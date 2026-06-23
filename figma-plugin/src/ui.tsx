import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AssetIntent, FeasibilityReport, AnimationPlan, LottieDocument } from "@lotion/shared";
import "./ui.css";

const backendUrl = "https://lotion-figma-plugin.vercel.app";

type PluginMessage =
  | { type: "result"; requestType: "check-feasibility"; result: FeasibilityReport }
  | { type: "result"; requestType: "generate-lottie"; result: { plan: AnimationPlan; lottie: LottieDocument } }
  | { type: "error"; message: string };

const assetLabels: Record<string, string> = {
  chest: "сундук",
  coin: "монета",
  star: "звезда",
  lock: "замок",
  gift: "подарок",
  badge: "бейдж",
  button: "кнопка",
  checkmark: "галочка",
  warning: "предупреждение",
  progress: "прогресс",
  character: "персонаж",
  ui_asset: "UI-asset"
};

const scenarioLabels: Record<string, string> = {
  reward_reveal: "Появление награды",
  coin_collect: "Сбор монеты",
  unlock_success: "Разблокировка",
  success_pop: "Успешное действие",
  error_shake: "Ошибка",
  attention_float: "Привлечение внимания",
  progress_fill: "Заполнение прогресса"
};

function App() {
  const [intent, setIntent] = useState<AssetIntent>({
    whatIsIt: "",
    whereUsed: "",
    desiredAction: "",
    mood: "",
    prompt: ""
  });
  const [report, setReport] = useState<FeasibilityReport | null>(null);
  const [plan, setPlan] = useState<AnimationPlan | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState<"check-feasibility" | "generate-lottie" | null>(null);

  useEffect(() => {
    window.onmessage = (event: MessageEvent<{ pluginMessage: PluginMessage }>) => {
      const message = event.data.pluginMessage;
      if (!message) return;

      setLoading(null);
      if (message.type === "error") {
        setError(`Не получилось выполнить запрос. ${message.message}`);
        return;
      }

      setError("");
      if (message.requestType === "check-feasibility") {
        setReport(message.result);
        setPlan(null);
      } else {
        setPlan(message.result.plan);
      }
    };
  }, []);

  function send(type: "check-feasibility" | "generate-lottie") {
    setLoading(type);
    setError("");
    setReport(null);
    setPlan(null);
    parent.postMessage(
      {
        pluginMessage: {
          type,
          backendUrl,
          intent
        }
      },
      "*"
    );
  }

  function setMood(mood: string) {
    setIntent({ ...intent, mood });
  }

  return (
    <main>
      <header>
        <p className="eyebrow">Lotion</p>
        <h1>Проверка анимации</h1>
        <p className="intro">Выдели один объект в Figma, опиши смысл, а Lotion скажет, насколько он подходит для Lottie.</p>
      </header>

      <div className="status">
        <span className="status-dot" />
        <span>Backend: lotion-figma-plugin.vercel.app</span>
      </div>

      <section className="form">
        <label>
          Что это?
          <input
            placeholder="Например: сундук, монета, замок"
            value={intent.whatIsIt}
            onChange={(event) => setIntent({ ...intent, whatIsIt: event.target.value })}
          />
        </label>

        <label>
          Где используется?
          <input
            placeholder="Например: детская игра, onboarding, paywall"
            value={intent.whereUsed}
            onChange={(event) => setIntent({ ...intent, whereUsed: event.target.value })}
          />
        </label>

        <label>
          Что должно произойти?
          <input
            placeholder="Например: открыться, начислиться, привлечь внимание"
            value={intent.desiredAction}
            onChange={(event) => setIntent({ ...intent, desiredAction: event.target.value })}
          />
        </label>

        <label>
          Настроение
          <input
            placeholder="Например: мягкое, весёлое, премиальное"
            value={intent.mood}
            onChange={(event) => setIntent({ ...intent, mood: event.target.value })}
          />
        </label>

        <div className="mood-row">
          {["мягкое", "игровое", "премиальное"].map((mood) => (
            <button key={mood} className={`mood ${intent.mood === mood ? "active" : ""}`} onClick={() => setMood(mood)}>
              {mood === "премиальное" ? "Премиум" : mood[0].toUpperCase() + mood.slice(1)}
            </button>
          ))}
        </div>

        <label>
          Дополнительное описание
          <textarea
            placeholder="Например: ребёнок получил приз после задания"
            value={intent.prompt}
            rows={3}
            onChange={(event) => setIntent({ ...intent, prompt: event.target.value })}
          />
        </label>
      </section>

      <div className="buttons">
        <button onClick={() => send("check-feasibility")} disabled={loading !== null}>
          {loading === "check-feasibility" ? "Проверяю..." : "Проверить"}
        </button>
        <button className="secondary" onClick={() => send("generate-lottie")} disabled={loading !== null}>
          {loading === "generate-lottie" ? "Генерирую..." : "Сгенерировать"}
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {report ? (
        <section className={`report ${report.level}`}>
          <div className="score">
            <strong>{report.title}</strong>
            <span className={`badge ${report.level}`}>{assetLabels[report.assetType] ?? report.assetType}</span>
          </div>
          <p className="summary">{report.summary}</p>
          <div>
            <p className="section-title">Можно анимировать</p>
            <ul>{report.canAnimate.slice(0, 4).map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div>
            <p className="section-title">Что важно учесть</p>
            <ul>{(report.fixes.length ? report.fixes : ["Явных проблем не найдено."]).slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div className="actions">
            {report.actions.map((action) => (
              <span key={action}>{action}</span>
            ))}
          </div>
        </section>
      ) : null}

      {plan ? (
        <section className="plan">
          <strong>{scenarioLabels[plan.scenario] ?? plan.scenario}</strong>
          <span>{plan.animationPlan.length} шагов / {plan.durationMs} мс</span>
        </section>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
