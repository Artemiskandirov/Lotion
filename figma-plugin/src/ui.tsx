import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { CSSProperties } from "react";
import type { AssetIntent, FeasibilityReport, AnimationPlan, LottieDocument } from "@lotion/shared";
import "./ui.css";

const backendUrl = "https://lotion-figma-plugin.vercel.app";

type PluginMessage =
  | { type: "result"; requestType: "check-feasibility"; result: FeasibilityReport }
  | {
      type: "result";
      requestType: "generate-lottie";
      result: { plan: AnimationPlan; lottie: LottieDocument };
      preview?: { svg?: string; width: number; height: number };
    }
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
    prompt: "",
    durationSec: 2
  });
  const [report, setReport] = useState<FeasibilityReport | null>(null);
  const [plan, setPlan] = useState<AnimationPlan | null>(null);
  const [preview, setPreview] = useState<{ svg?: string; width: number; height: number } | null>(null);
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
        setPreview(null);
      } else {
        addUiLog("info", "UI получил план генерации", {
          scenario: message.result.plan.scenario,
          durationMs: message.result.plan.durationMs,
          hasPreview: Boolean(message.preview?.svg)
        });
        setPlan(message.result.plan);
        setPreview(message.preview ?? null);
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
    setPreview(null);
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

  function formatLogEntry(entry: LogEntry) {
    const time = new Date(entry.time).toLocaleTimeString("ru-RU");
    const data = formatLogData(entry.data);
    return [
      `${time} ${entry.source} ${entry.level}`,
      entry.message,
      data
    ].filter(Boolean).join("\n");
  }

  function formatLogs() {
    return logs.length ? logs.map(formatLogEntry).join("\n\n") : "Логов пока нет.";
  }

  function previewSrc() {
    return preview?.svg ? `data:image/svg+xml;utf8,${encodeURIComponent(preview.svg)}` : "";
  }

  function previewStyle(plan: AnimationPlan) {
    const duration = `${Math.max(0.5, Math.min(5, plan.durationMs / 1000))}s`;
    return {
      "--preview-duration": duration
    } as CSSProperties;
  }

  function transformAtProgress(currentPlan: AnimationPlan, progress: number) {
    let x = 0;
    let y = 0;
    let scaleX = 1;
    let scaleY = 1;
    let rotate = 0;
    let opacity = 1;

    for (const step of currentPlan.animationPlan) {
      const start = step.start / currentPlan.durationMs;
      const end = (step.start + step.duration) / currentPlan.durationMs;
      if (progress < start || progress > end) continue;

      const local = Math.max(0, Math.min(1, (progress - start) / Math.max(0.001, end - start)));
      const wave = Math.sin(local * Math.PI);

      if (step.action === "float_y") y -= wave * 34;
      if (step.action === "shake_x") x += Math.sin(local * Math.PI * 8) * 12 * (1 - local * 0.35);
      if (step.action === "scale_pop" || step.action === "pulse") {
        scaleX *= 1 + wave * 0.14;
        scaleY *= 1 - wave * 0.08;
      }
      if (step.action === "rotate_open") rotate -= wave * 16;
      if (step.action === "fly_to_target") {
        x += local * 52;
        y -= local * 42;
      }
      if (step.action === "fade_in") opacity *= Math.max(0.2, local);
      if (step.action === "fade_out") opacity *= Math.max(0.2, 1 - local);
      if (step.action === "burst_particles" || step.action === "shine_sweep") scaleX *= 1 + wave * 0.05;
    }

    return {
      opacity,
      transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${rotate.toFixed(1)}deg) scale(${scaleX.toFixed(3)}, ${scaleY.toFixed(3)})`
    };
  }

  function previewKeyframes(currentPlan: AnimationPlan) {
    const frames = [0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100];
    const body = frames.map((frame) => {
      const sample = transformAtProgress(currentPlan, frame / 100);
      return `${frame}% { opacity: ${sample.opacity.toFixed(3)}; transform: ${sample.transform}; }`;
    }).join("\n");

    return `@keyframes lotion-dynamic-preview {\n${body}\n}`;
  }

  return (
    <main className={activeTab === "logs" ? "logs-mode" : ""}>
      {activeTab === "check" ? (
        <header>
          <p className="eyebrow">Lotion</p>
          <h1>Генерация Lottie</h1>
          <p className="intro">Выдели объект, опиши движение одним prompt-ом и задай длительность до 5 секунд.</p>
        </header>
      ) : null}

      {activeTab === "check" ? (
        <div className="status">
          <span className="status-dot" />
          <span>Backend: lotion-figma-plugin.vercel.app</span>
        </div>
      ) : null}

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
              Prompt
              <textarea
                placeholder="Например: прыгает как мячик с лёгким squash/stretch, весело и мягко"
                value={intent.prompt}
                rows={5}
                onChange={(event) => setIntent({ ...intent, prompt: event.target.value })}
              />
            </label>

            <label>
              Длительность: {intent.durationSec ?? 2} сек
              <input
                type="range"
                min="0.5"
                max="5"
                step="0.5"
                value={intent.durationSec ?? 2}
                onChange={(event) => setIntent({ ...intent, durationSec: Number(event.target.value) })}
              />
            </label>
          </section>

          <button className="generate-button" onClick={() => send("generate-lottie")} disabled={loading !== null || !intent.prompt?.trim()}>
            {loading === "generate-lottie" ? "Генерирую..." : "Сгенерировать"}
          </button>

          {error ? <div className="error">{error}</div> : null}

          {plan ? (
            <section className="preview-panel">
              <style>{previewKeyframes(plan)}</style>
              <div className="preview-stage" style={previewStyle(plan)}>
                {preview?.svg ? <img className="preview-asset dynamic" src={previewSrc()} alt="" /> : <span>Preview появится здесь</span>}
              </div>
              <div className="preview-meta">
                <strong>{scenarioLabels[plan.scenario] ?? plan.scenario}</strong>
                <span>{(plan.durationMs / 1000).toFixed(1)} сек / {plan.animationPlan.length} шага</span>
              </div>
              <textarea className="json-output" readOnly value={JSON.stringify({ plan }, null, 2)} />
            </section>
          ) : null}
        </>
      ) : (
        <section className="logs-panel">
          <div className="logs-head">
            <strong>Логи</strong>
            <button onClick={clearLogs}>Очистить</button>
          </div>
          <textarea className="logs-text" readOnly value={formatLogs()} />
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

    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
