import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AssetIntent, FeasibilityReport, AnimationPlan, LottieDocument } from "@lotion/shared";
import "./ui.css";

const backendUrl = "https://lotion-figma-plugin.vercel.app";

type PluginMessage =
  | { type: "result"; requestType: "check-feasibility"; result: FeasibilityReport }
  | { type: "result"; requestType: "generate-lottie"; result: { plan: AnimationPlan; lottie: LottieDocument } }
  | { type: "error"; message: string }
  | { type: "log-entry"; entry: LogEntry }
  | { type: "log-snapshot"; logs: LogEntry[] };

type LogEntry = {
  id: number;
  time: string;
  level: "info" | "warn" | "error";
  source: "ui" | "plugin";
  message: string;
  data?: unknown;
};

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
  const [activeTab, setActiveTab] = useState<"check" | "logs">("check");
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: Date.now(),
      time: new Date().toISOString(),
      level: "info",
      source: "ui",
      message: "UI загружен",
      data: { backendUrl }
    }
  ]);

  useEffect(() => {
    window.onmessage = (event: MessageEvent<{ pluginMessage: PluginMessage }>) => {
      const message = event.data.pluginMessage;
      if (!message) return;

      if (message.type === "log-entry") {
        setLogs((current) => [...current, message.entry].slice(-220));
        return;
      }

      if (message.type === "log-snapshot") {
        setLogs((current) => [...current.filter((entry) => entry.source === "ui"), ...message.logs].slice(-220));
        return;
      }

      setLoading(null);
      if (message.type === "error") {
        addUiLog("error", "UI получил ошибку", { message: message.message });
        setError(`Не получилось выполнить запрос. ${message.message}`);
        setActiveTab("logs");
        return;
      }

      setError("");
      if (message.requestType === "check-feasibility") {
        addUiLog("info", "UI получил отчёт проверки", { level: message.result.level, score: message.result.score });
        setReport(message.result);
        setPlan(null);
      } else {
        addUiLog("info", "UI получил план генерации", {
          scenario: message.result.plan.scenario,
          durationMs: message.result.plan.durationMs
        });
        setPlan(message.result.plan);
      }
    };

    parent.postMessage({ pluginMessage: { type: "request-logs" } }, "*");
  }, []);

  function addUiLog(level: LogEntry["level"], message: string, data?: unknown) {
    setLogs((current) => [
      ...current,
      {
        id: Date.now() + Math.random(),
        time: new Date().toISOString(),
        level,
        source: "ui",
        message,
        data
      }
    ].slice(-220));
  }

  function send(type: "check-feasibility" | "generate-lottie") {
    setLoading(type);
    setError("");
    setReport(null);
    setPlan(null);
    addUiLog("info", "UI отправил команду в plugin thread", { type, backendUrl, intent });
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
    addUiLog("info", "Выбрано настроение", { mood });
  }

  function clearLogs() {
    setLogs([]);
    parent.postMessage({ pluginMessage: { type: "clear-logs" } }, "*");
  }

  function formatLogData(data: unknown) {
    if (data === undefined) return "";
    try {
      return JSON.stringify(data, null, 2);
    } catch (error) {
      return String(data);
    }
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

      <nav className="tabs">
        <button className={activeTab === "check" ? "active" : ""} onClick={() => setActiveTab("check")}>
          Проверка
        </button>
        <button className={activeTab === "logs" ? "active" : ""} onClick={() => setActiveTab("logs")}>
          Логи
        </button>
      </nav>

      {activeTab === "check" ? (
        <>
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
        </>
      ) : (
        <section className="logs-panel">
          <div className="logs-head">
            <strong>Логи</strong>
            <button onClick={clearLogs}>Очистить</button>
          </div>
          <div className="logs-list">
            {logs.length ? logs.map((entry) => (
              <article key={entry.id} className={`log ${entry.level}`}>
                <div>
                  <span>{new Date(entry.time).toLocaleTimeString("ru-RU")}</span>
                  <strong>{entry.source}</strong>
                  <em>{entry.level}</em>
                </div>
                <p>{entry.message}</p>
                {entry.data !== undefined ? <pre>{formatLogData(entry.data)}</pre> : null}
              </article>
            )) : <p className="empty-log">Логов пока нет.</p>}
          </div>
        </section>
      )}

      {activeTab === "check" && report ? (
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

      {activeTab === "check" && plan ? (
        <section className="plan">
          <strong>{scenarioLabels[plan.scenario] ?? plan.scenario}</strong>
          <span>{plan.animationPlan.length} шагов / {plan.durationMs} мс</span>
        </section>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
