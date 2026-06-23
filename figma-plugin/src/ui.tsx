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
  attention_float: "Мягкое движение",
  spring_bounce: "Пружинный прыжок",
  progress_fill: "Заполнение прогресса"
};

const actionLabels: Record<string, string> = {
  pulse: "сжимается",
  scale_pop: "распружинивается",
  soft_bounce: "мягко подпрыгивает",
  squash_stretch: "сжимается и растягивается",
  float_y: "прыгает",
  shake_x: "дрожит после приземления",
  shake_rotate: "покачивается",
  rotate_open: "поворачивается",
  fade_in: "появляется",
  fade_out: "исчезает",
  burst_particles: "даёт всплеск",
  sparkle_burst: "рассыпает искры",
  coin_burst: "рассыпает монетки",
  shine_sweep: "блестит",
  fly_to_target: "летит к цели",
  stagger_appear: "появляется частями",
  draw_stroke: "рисуется линией",
  button_press: "нажимается",
  pulse_glow: "подсвечивается"
};

function App() {
  const [intent, setIntent] = useState<AssetIntent>({
    prompt: "",
    durationSec: 2
  });
  const [report, setReport] = useState<FeasibilityReport | null>(null);
  const [plan, setPlan] = useState<AnimationPlan | null>(null);
  const [lottie, setLottie] = useState<LottieDocument | null>(null);
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
        setLottie(null);
        setPreview(null);
      } else {
        addUiLog("info", "UI получил план генерации", {
          scenario: message.result.plan.scenario,
          durationMs: message.result.plan.durationMs,
          hasPreview: Boolean(message.preview?.svg)
        });
        setPlan(message.result.plan);
        setLottie(message.result.lottie);
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
    setLottie(null);
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

  function previewStyle(plan: AnimationPlan) {
    const duration = `${Math.max(0.5, Math.min(5, plan.durationMs / 1000))}s`;
    return {
      "--preview-duration": duration
    } as CSSProperties;
  }

  function planTitle(currentPlan: AnimationPlan) {
    const actions = currentPlan.animationPlan.map((step) => step.action);
    if (currentPlan.scenario === "spring_bounce" || (actions.includes("soft_bounce") || actions.includes("float_y")) && (actions.includes("scale_pop") || actions.includes("pulse") || actions.includes("squash_stretch"))) {
      return "Пружинный прыжок";
    }
    if (actions.includes("shake_x")) return "Дрожание";
    return scenarioLabels[currentPlan.scenario] ?? currentPlan.scenario;
  }

  function planSummary(currentPlan: AnimationPlan) {
    const actions = currentPlan.animationPlan.map((step) => step.action);
    if ((actions.includes("soft_bounce") || actions.includes("float_y")) && (actions.includes("scale_pop") || actions.includes("pulse") || actions.includes("squash_stretch"))) {
      return "Объект сначала сжимается, затем отталкивается вверх, возвращается вниз и мягко прожимается на посадке.";
    }
    return currentPlan.notes.find((note) => !note.startsWith("AI motion plan") && !note.startsWith("Duration target")) ?? "";
  }

  function formatStepTime(ms: number) {
    return `${(ms / 1000).toFixed(2)}с`;
  }

  function lottieJson() {
    return lottie ? JSON.stringify(lottie, null, 2) : "";
  }

  function downloadLottie() {
    if (!lottie || !plan) return;
    const fileName = `lotion-${plan.scenario}-${Date.now()}.json`;
    const blob = new Blob([JSON.stringify(lottie, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    addUiLog("info", "Lottie JSON скачан", { fileName });
  }

  function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  }

  function firstPreviewLayer() {
    return (lottie?.layers ?? []).map(asRecord).find((layer) => layer.ty === 2 || layer.ty === 4);
  }

  function numberArray(value: unknown): number[] | undefined {
    return Array.isArray(value) && value.every((item) => typeof item === "number") ? value : undefined;
  }

  function keyList(layer: Record<string, unknown>, key: string) {
    const ks = asRecord(layer.ks);
    const prop = asRecord(ks[key]);
    return Array.isArray(prop.k) ? prop.k.map(asRecord) : [];
  }

  function valueAt(layer: Record<string, unknown>, key: string, frame: number, fallback: number[]) {
    const keys = keyList(layer, key);
    if (!keys.length) return fallback;
    const exact = keys.find((item) => item.t === frame);
    const nearest = exact ?? keys.filter((item) => typeof item.t === "number" && item.t <= frame).at(-1) ?? keys[0];
    return numberArray(nearest.s) ?? fallback;
  }

  function lottiePreviewSrc(layer: Record<string, unknown> | undefined) {
    if (!layer || layer.ty !== 2 || typeof layer.refId !== "string") return "";
    const asset = (lottie?.assets ?? []).map(asRecord).find((item) => item.id === layer.refId);
    return typeof asset?.p === "string" ? asset.p : "";
  }

  function shapePreviewStyle(layer: Record<string, unknown> | undefined): CSSProperties {
    const shapeGroup = (Array.isArray(layer?.shapes) ? layer?.shapes : []).map(asRecord)[0];
    const items = Array.isArray(shapeGroup?.it) ? shapeGroup.it.map(asRecord) : [];
    const geometry = items.find((item) => item.ty === "rc" || item.ty === "el");
    const fill = items.find((item) => item.ty === "fl");
    const size = numberArray(asRecord(asRecord(geometry).s).k) ?? [lottie?.w ?? 80, lottie?.h ?? 80];
    const color = numberArray(asRecord(asRecord(fill).c).k) ?? [0.24, 0.42, 0.94, 1];
    const rgb = color.slice(0, 3).map((value) => Math.round(Math.max(0, Math.min(1, value)) * 255));

    return {
      width: `${Math.max(8, size[0])}px`,
      height: `${Math.max(8, size[1])}px`,
      borderRadius: geometry?.ty === "el" ? "999px" : "12px",
      background: `rgb(${rgb.join(", ")})`
    };
  }

  function previewKeyframesFromLottie() {
    const layer = firstPreviewLayer();
    if (!layer || !lottie) return "";
    const frameSet = new Set<number>([0, Number(lottie.op) || 1]);
    ["p", "s", "r", "o"].forEach((key) => {
      keyList(layer, key).forEach((item) => {
        if (typeof item.t === "number") frameSet.add(item.t);
      });
    });
    const op = Math.max(1, Number(lottie.op) || 1);
    const frames = Array.from(frameSet).sort((a, b) => a - b);
    const body = frames.map((frame) => {
      const p = valueAt(layer, "p", frame, [lottie.w / 2, lottie.h / 2, 0]);
      const s = valueAt(layer, "s", frame, [100, 100, 100]);
      const r = valueAt(layer, "r", frame, [0]);
      const o = valueAt(layer, "o", frame, [100]);
      const x = p[0] - lottie.w / 2;
      const y = p[1] - lottie.h / 2;
      const percent = Number(((frame / op) * 100).toFixed(2));
      return `${percent}% { opacity: ${(o[0] / 100).toFixed(3)}; transform: translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(r[0] ?? 0).toFixed(1)}deg) scale(${(s[0] / 100).toFixed(3)}, ${(s[1] / 100).toFixed(3)}); }`;
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
              <style>{previewKeyframesFromLottie()}</style>
              <div className="preview-stage" style={previewStyle(plan)}>
                {lottiePreviewSrc(firstPreviewLayer()) ? (
                  <img className="preview-asset dynamic" src={lottiePreviewSrc(firstPreviewLayer())} alt="" />
                ) : firstPreviewLayer() ? (
                  <div className="preview-shape dynamic" style={shapePreviewStyle(firstPreviewLayer())} />
                ) : (
                  <span>Preview появится здесь</span>
                )}
              </div>
              <div className="preview-meta">
                <strong>{planTitle(plan)}</strong>
                <span>{(plan.durationMs / 1000).toFixed(1)} сек / {plan.animationPlan.length} шага</span>
              </div>
              <div className="preview-details">
                <p className="preview-summary">{planSummary(plan)}</p>
                <ol className="motion-steps">
                  {plan.animationPlan.map((step, index) => (
                    <li key={`${step.action}-${step.start}-${index}`}>
                      <span>{formatStepTime(step.start)}</span>
                      <strong>{actionLabels[step.action] ?? step.action}</strong>
                    </li>
                  ))}
                </ol>
              </div>
              {lottie ? (
                <section className="export-panel">
                  <div className="export-head">
                    <strong>Lottie JSON</strong>
                    <button onClick={downloadLottie}>Скачать .json</button>
                  </div>
                  <textarea className="json-output lottie-output" readOnly value={lottieJson()} />
                </section>
              ) : null}
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
