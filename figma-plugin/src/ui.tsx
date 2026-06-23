import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AssetIntent, FeasibilityReport, AnimationPlan, LottieDocument } from "@lotion/shared";
import "./ui.css";

const defaultBackendUrl = "https://lotion-figma-plugin-git-main-artiskandirov-gmailcoms-projects.vercel.app";

type PluginMessage =
  | { type: "result"; requestType: "check-feasibility"; result: FeasibilityReport }
  | { type: "result"; requestType: "generate-lottie"; result: { plan: AnimationPlan; lottie: LottieDocument } }
  | { type: "error"; message: string };

function App() {
  const [backendUrl, setBackendUrl] = useState(defaultBackendUrl);
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
  const [loading, setLoading] = useState<"check" | "generate" | null>(null);

  useEffect(() => {
    window.onmessage = (event: MessageEvent<{ pluginMessage: PluginMessage }>) => {
      const message = event.data.pluginMessage;
      if (!message) return;

      setLoading(null);
      if (message.type === "error") {
        setError(message.message);
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
    setLoading(type === "check-feasibility" ? "check" : "generate");
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

  return (
    <main>
      <header>
        <p>Motion Feasibility Check</p>
        <h1>Can this be animated?</h1>
      </header>

      <label>
        Backend
        <input value={backendUrl} onChange={(event) => setBackendUrl(event.target.value)} />
      </label>

      <label>
        What is it?
        <input value={intent.whatIsIt} onChange={(event) => setIntent({ ...intent, whatIsIt: event.target.value })} />
      </label>

      <label>
        Where is it used?
        <input value={intent.whereUsed} onChange={(event) => setIntent({ ...intent, whereUsed: event.target.value })} />
      </label>

      <label>
        What should happen?
        <input
          value={intent.desiredAction}
          onChange={(event) => setIntent({ ...intent, desiredAction: event.target.value })}
        />
      </label>

      <label>
        Mood
        <input value={intent.mood} onChange={(event) => setIntent({ ...intent, mood: event.target.value })} />
      </label>

      <label>
        Prompt
        <textarea value={intent.prompt} rows={3} onChange={(event) => setIntent({ ...intent, prompt: event.target.value })} />
      </label>

      <div className="buttons">
        <button onClick={() => send("check-feasibility")} disabled={loading !== null}>
          {loading === "check" ? "Checking..." : "Check"}
        </button>
        <button className="dark" onClick={() => send("generate-lottie")} disabled={loading !== null}>
          {loading === "generate" ? "Generating..." : "Generate"}
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {report ? (
        <section className={`report ${report.level}`}>
          <div>
            <strong>{report.title}</strong>
            <span>{report.assetType}</span>
          </div>
          <p>{report.summary}</p>
          <ul>
            {report.canAnimate.slice(0, 4).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="actions">
            {report.actions.map((action) => (
              <span key={action}>{action}</span>
            ))}
          </div>
        </section>
      ) : null}

      {plan ? (
        <section className="plan">
          <strong>{plan.scenario}</strong>
          <span>{plan.animationPlan.length} steps / {plan.durationMs} ms</span>
        </section>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
