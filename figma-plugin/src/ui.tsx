import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AssetIntent, AssetSnapshot, Keyframe, LottieDocument, StoryboardDSL, Track } from "@lotion/shared";
import "./ui.css";

const defaultBackendUrl = "https://lotion-figma-plugin.vercel.app";
const FRAME_COUNT = 7;

function sampleScalar(
  kfs: Keyframe[],
  prop: "tx" | "ty" | "sx" | "sy" | "rot" | "op",
  t: number,
  fallback: number
): number {
  const filtered = kfs.filter((kf) => typeof (kf as Record<string, unknown>)[prop] === "number");
  if (filtered.length === 0) return fallback;
  if (t <= filtered[0].t) return (filtered[0] as Record<string, unknown>)[prop] as number;
  if (t >= filtered[filtered.length - 1].t)
    return (filtered[filtered.length - 1] as Record<string, unknown>)[prop] as number;
  for (let i = 0; i < filtered.length - 1; i += 1) {
    const a = filtered[i];
    const b = filtered[i + 1];
    if (t >= a.t && t <= b.t) {
      const ratio = (t - a.t) / (b.t - a.t || 1);
      const va = (a as Record<string, unknown>)[prop] as number;
      const vb = (b as Record<string, unknown>)[prop] as number;
      return va + (vb - va) * ratio;
    }
  }
  return fallback;
}

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    const encoded = btoa(unescape(encodeURIComponent(svg)));
    img.src = `data:image/svg+xml;base64,${encoded}`;
  });
}

async function renderStoryboardClientSide(asset: AssetSnapshot, dsl: StoryboardDSL): Promise<string[]> {
  if (!asset.svg) return [];
  const width = Math.max(1, Math.round(asset.width));
  const height = Math.max(1, Math.round(asset.height));
  const padding = Math.max(width, height) * 0.5;
  const canvasW = Math.round(width + padding * 2);
  const canvasH = Math.round(height + padding * 2);

  let img: HTMLImageElement;
  try {
    img = await loadSvgImage(asset.svg);
  } catch {
    return [];
  }

  const track: Track | undefined = dsl.tracks[0];
  const frames: string[] = [];
  for (let i = 0; i < FRAME_COUNT; i += 1) {
    const t = i / Math.max(1, FRAME_COUNT - 1);
    const canvas = document.createElement("canvas");
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.clearRect(0, 0, canvasW, canvasH);

    if (track) {
      const tx = sampleScalar(track.keyframes, "tx", t, 0);
      const ty = sampleScalar(track.keyframes, "ty", t, 0);
      const sx = sampleScalar(track.keyframes, "sx", t, 1);
      const sy = sampleScalar(track.keyframes, "sy", t, 1);
      const rot = sampleScalar(track.keyframes, "rot", t, 0);
      const op = sampleScalar(track.keyframes, "op", t, 1);
      ctx.globalAlpha = Math.max(0, Math.min(1, op));
      ctx.translate(canvasW / 2 + tx, canvasH / 2 + ty);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.scale(sx, sy);
      ctx.drawImage(img, -width / 2, -height / 2, width, height);
    } else {
      ctx.drawImage(img, padding, padding, width, height);
    }
    frames.push(canvas.toDataURL("image/png"));
  }
  return frames;
}

type LogEntry = {
  id: number;
  time: string;
  level: "info" | "warn" | "error";
  source: "ui" | "plugin";
  message: string;
  data?: unknown;
};

type StoryboardReady = {
  type: "storyboard-ready";
  dsl: StoryboardDSL;
  rationale: string;
  asset: AssetSnapshot;
};

type LottieReady = {
  type: "lottie-ready";
  lottie: LottieDocument;
  dsl: StoryboardDSL;
  asset: AssetSnapshot;
};

type PluginMessage =
  | StoryboardReady
  | LottieReady
  | { type: "error"; message: string }
  | { type: "log-entry"; entry: LogEntry }
  | { type: "log-snapshot"; logs: LogEntry[] }
  | { type: "backend-url"; backendUrl: string };

type Step = "prompt" | "storyboard" | "lottie";

function App() {
  const [step, setStep] = useState<Step>("prompt");
  const [intent, setIntent] = useState<AssetIntent>({ prompt: "", durationSec: 2 });
  const [loading, setLoading] = useState<null | "plan" | "compile">(null);
  const [error, setError] = useState("");
  const [dsl, setDsl] = useState<StoryboardDSL | null>(null);
  const [asset, setAsset] = useState<AssetSnapshot | null>(null);
  const [rationale, setRationale] = useState("");
  const [frames, setFrames] = useState<string[]>([]);
  const [lottie, setLottie] = useState<LottieDocument | null>(null);
  const [activeFrame, setActiveFrame] = useState(0);
  const [tab, setTab] = useState<"main" | "logs" | "settings">("main");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [backendUrl, setBackendUrl] = useState(defaultBackendUrl);
  const [backendDraft, setBackendDraft] = useState(defaultBackendUrl);

  useEffect(() => {
    window.onmessage = (event: MessageEvent<{ pluginMessage: PluginMessage }>) => {
      const message = event.data.pluginMessage;
      if (!message) return;

      if (message.type === "log-entry") {
        setLogs((current) => [...current, message.entry].slice(-220));
        return;
      }
      if (message.type === "log-snapshot") {
        setLogs((current) => {
          const uiOnly = current.filter((e) => e.source === "ui");
          return [...uiOnly, ...message.logs].slice(-220);
        });
        return;
      }
      if (message.type === "error") {
        setLoading(null);
        setError(message.message);
        return;
      }
      if (message.type === "storyboard-ready") {
        setLoading(null);
        setDsl(message.dsl);
        setRationale(message.rationale);
        setAsset(message.asset);
        setActiveFrame(0);
        setStep("storyboard");
        void renderStoryboardClientSide(message.asset, message.dsl).then((rendered) => {
          setFrames(rendered);
        });
        return;
      }
      if (message.type === "lottie-ready") {
        setLoading(null);
        setLottie(message.lottie);
        setStep("lottie");
        return;
      }
      if (message.type === "backend-url") {
        setBackendUrl(message.backendUrl);
        setBackendDraft(message.backendUrl);
        return;
      }
    };
    parent.postMessage({ pluginMessage: { type: "request-logs" } }, "*");
  }, []);

  useEffect(() => {
    if (step !== "storyboard" || frames.length === 0) return;
    const durationMs = (dsl?.durationMs ?? 2000) / frames.length;
    const id = window.setInterval(() => {
      setActiveFrame((f) => (f + 1) % frames.length);
    }, Math.max(80, durationMs));
    return () => window.clearInterval(id);
  }, [step, frames.length, dsl?.durationMs]);

  function planStoryboard() {
    setError("");
    setLoading("plan");
    setFrames([]);
    parent.postMessage(
      { pluginMessage: { type: "plan-storyboard", intent } },
      "*"
    );
  }

  function approveStoryboard() {
    if (!dsl || !asset) return;
    setError("");
    setLoading("compile");
    parent.postMessage(
      { pluginMessage: { type: "commit-lottie", dsl, asset } },
      "*"
    );
  }

  function saveBackendUrl() {
    parent.postMessage(
      { pluginMessage: { type: "set-backend-url", backendUrl: backendDraft } },
      "*"
    );
  }

  function resetBackendUrl() {
    setBackendDraft(defaultBackendUrl);
    parent.postMessage(
      { pluginMessage: { type: "set-backend-url", backendUrl: defaultBackendUrl } },
      "*"
    );
  }

  function backToPrompt() {
    setStep("prompt");
    setDsl(null);
    setFrames([]);
    setLottie(null);
    setRationale("");
  }

  function downloadLottie() {
    if (!lottie) return;
    const fileName = `lotion-storyboard-${Date.now()}.json`;
    const blob = new Blob([JSON.stringify(lottie, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function clearLogs() {
    setLogs([]);
    parent.postMessage({ pluginMessage: { type: "clear-logs" } }, "*");
  }

  function formatLogs() {
    if (!logs.length) return "Логов пока нет.";
    return logs
      .map((e) => {
        const time = new Date(e.time).toLocaleTimeString("ru-RU");
        const data = e.data === undefined ? "" : `\n${JSON.stringify(e.data, null, 2)}`;
        return `${time} ${e.source} ${e.level}\n${e.message}${data}`;
      })
      .join("\n\n");
  }

  return (
    <main className={tab === "logs" ? "logs-mode" : ""}>
      {tab === "main" ? (
        <header>
          <p className="eyebrow">Lotion · Director Mode</p>
          <h1>SVG → раскадровка → Lottie</h1>
          <p className="intro">AI планирует движение по принципам Disney, ты одобряешь PNG-раскадровку, затем плагин собирает Lottie с spring-физикой и морфингом.</p>
        </header>
      ) : null}

      <nav className="tabs">
        <button className={tab === "main" ? "active" : ""} onClick={() => setTab("main")}>
          Анимация
        </button>
        <button className={tab === "logs" ? "active" : ""} onClick={() => setTab("logs")}>
          Логи
        </button>
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>
          Backend
        </button>
      </nav>

      {tab === "settings" ? (
        <section className="logs-panel">
          <div className="logs-head">
            <strong>Backend URL</strong>
            <button onClick={resetBackendUrl}>Сбросить</button>
          </div>
          <p className="intro">
            Текущий: <code>{backendUrl}</code>
            <br />
            Для локальной разработки укажи <code>http://localhost:3000</code> и запусти <code>npm run dev:backend</code>.
          </p>
          <input
            type="text"
            value={backendDraft}
            onChange={(e) => setBackendDraft(e.target.value)}
            style={{ width: "100%", padding: 8, marginBottom: 8 }}
          />
          <button onClick={saveBackendUrl}>Сохранить</button>
        </section>
      ) : null}

      {tab === "logs" ? (
        <section className="logs-panel">
          <div className="logs-head">
            <strong>Логи</strong>
            <button onClick={clearLogs}>Очистить</button>
          </div>
          <textarea className="logs-text" readOnly value={formatLogs()} />
        </section>
      ) : null}

      {tab === "main" && step === "prompt" ? (
        <>
          <section className="form">
            <label>
              Prompt
              <textarea
                placeholder="Например: подпрыгивает как мячик с лёгким squash, на приземлении пружинит"
                value={intent.prompt}
                rows={5}
                onChange={(event) => setIntent({ ...intent, prompt: event.target.value })}
              />
            </label>
            <label>
              Длительность: {intent.durationSec ?? 2} сек
              <input
                type="range"
                min="1"
                max="5"
                step="0.5"
                value={intent.durationSec ?? 2}
                onChange={(event) => setIntent({ ...intent, durationSec: Number(event.target.value) })}
              />
            </label>
          </section>
          <button
            className="generate-button"
            onClick={planStoryboard}
            disabled={loading !== null || !intent.prompt?.trim()}
          >
            {loading === "plan" ? "Готовлю раскадровку..." : "Сгенерировать раскадровку"}
          </button>
          {error ? <div className="error">{error}</div> : null}
        </>
      ) : null}

      {tab === "main" && step === "storyboard" && frames.length > 0 ? (
        <section className="preview-panel">
          <div className="preview-stage">
            <img className="preview-asset" src={frames[activeFrame]} alt={`frame ${activeFrame + 1}`} />
          </div>
          <div className="preview-meta">
            <strong>Раскадровка · {frames.length} кадров</strong>
            <span>{((dsl?.durationMs ?? 0) / 1000).toFixed(1)} сек · loop</span>
          </div>
          <div className="frames-grid">
            {frames.map((src, idx) => (
              <button
                key={idx}
                className={`frame-thumb ${idx === activeFrame ? "active" : ""}`}
                onClick={() => setActiveFrame(idx)}
                aria-label={`Кадр ${idx + 1}`}
              >
                <img src={src} alt="" />
                <span>{idx + 1}</span>
              </button>
            ))}
          </div>
          {rationale ? <p className="preview-summary">{rationale}</p> : null}
          <div className="buttons">
            <button className="secondary" onClick={backToPrompt} disabled={loading !== null}>
              Назад
            </button>
            <button onClick={approveStoryboard} disabled={loading !== null}>
              {loading === "compile" ? "Собираю Lottie..." : "Одобрить → Lottie"}
            </button>
          </div>
          <button className="secondary" onClick={planStoryboard} disabled={loading !== null}>
            Перегенерировать
          </button>
          {error ? <div className="error">{error}</div> : null}
        </section>
      ) : null}

      {tab === "main" && step === "lottie" && lottie ? (
        <section className="preview-panel">
          <div className="preview-stage">
            <span>Lottie готов — {(lottie.op / lottie.fr).toFixed(2)} сек · {lottie.layers.length} слоёв</span>
          </div>
          <div className="buttons">
            <button className="secondary" onClick={() => setStep("storyboard")}>
              К раскадровке
            </button>
            <button onClick={downloadLottie}>Скачать .json</button>
          </div>
          <textarea className="json-output lottie-output" readOnly value={JSON.stringify(lottie, null, 2)} />
          {error ? <div className="error">{error}</div> : null}
        </section>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
