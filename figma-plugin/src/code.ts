import type { AnimationPlan, AssetLayer, AssetLayerType, AssetSnapshot, AssetIntent, LottieDocument } from "@lotion/shared";

const defaultBackendUrl = "https://lotion-figma-plugin.vercel.app";
const logBuffer: LogEntry[] = [];
const logLimit = 200;
let logSequence = 0;

type LogLevel = "info" | "warn" | "error";
type LogEntry = {
  id: number;
  time: string;
  level: LogLevel;
  source: "plugin";
  message: string;
  data?: unknown;
};

type GenerateResult = {
  plan: AnimationPlan;
  lottie: LottieDocument;
};

figma.showUI(__html__, { width: 420, height: 720, themeColors: true });

function safeData(data: unknown): unknown {
  if (data === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(data));
  } catch (error) {
    return String(data);
  }
}

function log(level: LogLevel, message: string, data?: unknown): void {
  const entry: LogEntry = {
    id: ++logSequence,
    time: new Date().toISOString(),
    level,
    source: "plugin",
    message,
    data: safeData(data)
  };

  logBuffer.push(entry);
  if (logBuffer.length > logLimit) logBuffer.splice(0, logBuffer.length - logLimit);

  if (level === "error") console.error(`[lotion] ${message}`, data ?? "");
  else if (level === "warn") console.warn(`[lotion] ${message}`, data ?? "");
  else console.log(`[lotion] ${message}`, data ?? "");

  figma.ui.postMessage({ type: "log-entry", entry });
}

function describeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  if (error && typeof error === "object") {
    try {
      return {
        name: "ObjectError",
        message: JSON.stringify(error)
      };
    } catch (jsonError) {
      return {
        name: "ObjectError",
        message: Object.prototype.toString.call(error)
      };
    }
  }

  return {
    name: "UnknownError",
    message: String(error)
  };
}

log("info", "Плагин запущен", { backendUrl: defaultBackendUrl });

async function loadPreviewFont(): Promise<boolean> {
  try {
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    await figma.loadFontAsync({ family: "Inter", style: "Medium" });
    return true;
  } catch (error) {
    log("warn", "Не удалось загрузить Inter для подписей storyboard", describeError(error));
    return false;
  }
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    scale_pop: "pop",
    rotate_open: "rotate",
    shake_x: "shake",
    float_y: "bounce",
    fade_in: "fade in",
    fade_out: "fade out",
    burst_particles: "particles",
    shine_sweep: "shine",
    fly_to_target: "fly",
    stagger_appear: "stagger",
    draw_stroke: "draw",
    pulse: "pulse"
  };

  return labels[action] ?? action;
}

function transformForProgress(plan: AnimationPlan, progress: number, index: number) {
  let offsetX = 0;
  let offsetY = 0;
  let scale = 1;
  let rotation = 0;
  let opacity = 1;

  for (const step of plan.animationPlan) {
    if (step.action === "float_y") offsetY -= Math.sin(progress * Math.PI) * 28;
    if (step.action === "shake_x") offsetX += [0, -12, 12, 0][index] ?? 0;
    if (step.action === "scale_pop" || step.action === "pulse") scale *= [0.9, 1.16, 0.98, 1][index] ?? 1;
    if (step.action === "rotate_open") rotation += -34 * progress;
    if (step.action === "fly_to_target") {
      offsetX += progress * 54;
      offsetY -= progress * 46;
    }
    if (step.action === "fade_in") opacity *= Math.max(0.16, progress);
    if (step.action === "fade_out") opacity *= Math.max(0.16, 1 - progress);
  }

  return { offsetX, offsetY, scale, rotation, opacity };
}

function setNodeSize(node: SceneNode, width: number, height: number): void {
  const maybeResizable = node as SceneNode & {
    resizeWithoutConstraints?: (width: number, height: number) => void;
    resize?: (width: number, height: number) => void;
  };

  if (typeof maybeResizable.resizeWithoutConstraints === "function") {
    maybeResizable.resizeWithoutConstraints(width, height);
    return;
  }

  if (typeof maybeResizable.resize === "function") {
    maybeResizable.resize(width, height);
  }
}

function setNodePlacement(node: SceneNode, x: number, y: number, opacity: number, rotation: number): void {
  const placed = node as SceneNode & {
    x: number;
    y: number;
    opacity?: number;
    rotation?: number;
  };

  placed.x = x;
  placed.y = y;
  if (typeof placed.opacity === "number") placed.opacity = opacity;
  if (typeof placed.rotation === "number") placed.rotation = rotation;
}

function createText(parent: FrameNode, text: string, x: number, y: number, size = 11): void {
  const node = figma.createText();
  node.fontName = { family: "Inter", style: size >= 14 ? "Medium" : "Regular" };
  node.characters = text;
  node.fontSize = size;
  node.fills = [{ type: "SOLID", color: { r: 0.42, g: 0.42, b: 0.45 } }];
  node.x = x;
  node.y = y;
  parent.appendChild(node);
}

async function createGeneratedStoryboard(source: SceneNode, result: GenerateResult): Promise<{ id: string; name: string }> {
  const bounds = "absoluteBoundingBox" in source ? source.absoluteBoundingBox : undefined;
  const sourceWidth = Math.max(24, Math.round(boundsValue(bounds, "width", "width" in source ? source.width : result.plan.width)));
  const sourceHeight = Math.max(24, Math.round(boundsValue(bounds, "height", "height" in source ? source.height : result.plan.height)));
  const frameCount = 4;
  const padding = 18;
  const cellWidth = Math.max(128, sourceWidth + 42);
  const canvasHeight = Math.max(190, sourceHeight + 92);
  const frame = figma.createFrame();
  const sourceX = boundsValue(bounds, "x", "x" in source ? source.x : 0);
  const sourceY = boundsValue(bounds, "y", "y" in source ? source.y : 0);
  const fontReady = await loadPreviewFont();

  frame.name = `Lotion storyboard - ${result.plan.scenario}`;
  frame.resize(padding * 2 + cellWidth * frameCount, canvasHeight);
  frame.x = sourceX + sourceWidth + 80;
  frame.y = sourceY;
  frame.fills = [{ type: "SOLID", color: { r: 0.96, g: 0.96, b: 0.97 } }];
  frame.strokes = [{ type: "SOLID", color: { r: 0.82, g: 0.82, b: 0.84 } }];
  frame.strokeWeight = 1;
  frame.cornerRadius = 18;
  frame.setPluginData("lotionPlan", JSON.stringify(result.plan));
  frame.setPluginData("lotionLottie", JSON.stringify(result.lottie));

  figma.currentPage.appendChild(frame);

  if (fontReady) {
    createText(frame, "Lotion Lottie storyboard", padding, 14, 14);
    createText(frame, `${result.plan.scenario} / ${result.plan.durationMs} ms / score ${result.plan.score}`, padding, 34, 11);
  }

  for (let index = 0; index < frameCount; index += 1) {
    const progress = index / (frameCount - 1);
    const clone = source.clone();
    const transform = transformForProgress(result.plan, progress, index);
    const width = Math.max(1, sourceWidth * transform.scale);
    const height = Math.max(1, sourceHeight * transform.scale);
    const baseX = padding + index * cellWidth + (cellWidth - width) / 2;
    const baseY = 62 + (sourceHeight - height) / 2;

    frame.appendChild(clone);
    setNodeSize(clone, width, height);
    setNodePlacement(clone, baseX + transform.offsetX, baseY + transform.offsetY, transform.opacity, transform.rotation);

    if (fontReady) {
      const actions = result.plan.animationPlan.map((step) => actionLabel(step.action)).join(" + ");
      createText(frame, `${Math.round(progress * 100)}%`, padding + index * cellWidth, canvasHeight - 44, 11);
      createText(frame, actions || "static", padding + index * cellWidth, canvasHeight - 28, 10);
    }
  }

  figma.currentPage.selection = [frame];
  figma.viewport.scrollAndZoomIntoView([frame]);
  figma.notify("Lotion: storyboard создан на холсте");
  log("info", "Storyboard создан на холсте", {
    frameId: frame.id,
    frameName: frame.name,
    scenario: result.plan.scenario,
    lottieBytes: JSON.stringify(result.lottie).length
  });

  return { id: frame.id, name: frame.name };
}

function mapNodeType(node: SceneNode): AssetLayerType {
  if (node.type === "FRAME") return "frame";
  if (node.type === "GROUP" || node.type === "SECTION") return "group";
  if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") return "component";
  if (node.type === "INSTANCE") return "instance";
  if (node.type === "VECTOR" || node.type === "BOOLEAN_OPERATION") return "vector";
  if (["RECTANGLE", "ELLIPSE", "POLYGON", "STAR", "LINE"].includes(node.type)) return "shape";
  if (node.type === "TEXT") return "text";
  const fills = paintNames(node, "fills");
  if (fills && fills.includes("image")) return "image";
  return "unknown";
}

function boundsValue(bounds: Rect | undefined, key: "width" | "height" | "x" | "y", fallback: number): number {
  return bounds && typeof bounds[key] === "number" ? bounds[key] : fallback;
}

function paintNames(node: SceneNode, key: "fills" | "strokes"): string[] | undefined {
  const paints = (node as unknown as Record<string, unknown>)[key];
  if (!Array.isArray(paints)) return undefined;
  return paints.map((paint) => {
    if (!paint || typeof paint !== "object" || !("type" in paint)) return "unknown";
    return String((paint as { type: unknown }).type).toLowerCase();
  });
}

function serializeNode(node: SceneNode): AssetLayer {
  const bounds = "absoluteBoundingBox" in node ? node.absoluteBoundingBox : undefined;
  const children = "children" in node ? node.children.map((child) => serializeNode(child)) : undefined;

  return {
    id: node.id,
    name: node.name,
    type: mapNodeType(node),
    visible: node.visible,
    width: boundsValue(bounds, "width", "width" in node ? node.width : 0),
    height: boundsValue(bounds, "height", "height" in node ? node.height : 0),
    x: boundsValue(bounds, "x", 0),
    y: boundsValue(bounds, "y", 0),
    fills: paintNames(node, "fills"),
    strokes: paintNames(node, "strokes"),
    children
  };
}

async function selectionToAsset(): Promise<AssetSnapshot> {
  const selection = figma.currentPage.selection;
  log("info", "Читаю выделение", { count: selection.length });
  if (selection.length !== 1) {
    throw new Error("Выдели один объект или фрейм в Figma.");
  }

  const node = selection[0];
  const bounds = "absoluteBoundingBox" in node ? node.absoluteBoundingBox : undefined;
  let svg: string | undefined;

  try {
    svg = await node.exportAsync({ format: "SVG_STRING" });
    log("info", "SVG экспортирован", { nodeId: node.id, bytes: svg.length });
  } catch (error) {
    log("warn", "SVG экспорт не получился, продолжаю без SVG", describeError(error));
    svg = undefined;
  }

  const asset = {
    id: node.id,
    name: node.name,
    type: mapNodeType(node),
    width: Math.max(1, Math.round(boundsValue(bounds, "width", "width" in node ? node.width : 256))),
    height: Math.max(1, Math.round(boundsValue(bounds, "height", "height" in node ? node.height : 256))),
    layers: [serializeNode(node)],
    svg
  };

  log("info", "Выделение собрано", {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    width: asset.width,
    height: asset.height,
    hasSvg: Boolean(asset.svg)
  });

  return asset;
}

async function postToBackend<T>(backendUrl: string, path: string, body: unknown): Promise<T> {
  const endpoint = `${backendUrl.replace(/\/$/, "")}${path}`;
  log("info", "Отправляю запрос в backend", {
    endpoint,
    bodyBytes: JSON.stringify(body).length
  });

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (error) {
    log("error", "Fetch до backend упал", { endpoint, error: describeError(error) });
    throw new Error(`Не удалось подключиться к backend: ${endpoint}. ${describeError(error).message}`);
  }

  log("info", "Backend ответил", {
    endpoint,
    status: response.status,
    ok: response.ok
  });

  if (!response.ok) {
    throw new Error(`Сервер вернул ошибку ${response.status}: ${endpoint}`);
  }

  return response.json() as Promise<T>;
}

figma.ui.onmessage = async (message) => {
  if (!message || typeof message !== "object") return;

  const type = "type" in message ? message.type : undefined;
  if (type === "request-logs") {
    figma.ui.postMessage({ type: "log-snapshot", logs: logBuffer });
    return;
  }

  if (type === "clear-logs") {
    logBuffer.splice(0, logBuffer.length);
    log("info", "Логи очищены");
    figma.ui.postMessage({ type: "log-snapshot", logs: logBuffer });
    return;
  }

  if (type !== "check-feasibility" && type !== "generate-lottie") return;

  try {
    const backendUrl =
      "backendUrl" in message && typeof message.backendUrl === "string"
        ? message.backendUrl
        : defaultBackendUrl;
    const intent =
      "intent" in message && typeof message.intent === "object"
        ? (message.intent as AssetIntent)
        : {};
    log("info", "Получена команда из UI", { type, backendUrl, intent });
    const asset = await selectionToAsset();
    const sourceNode = figma.currentPage.selection[0];
    const body = { asset, intent };
    const path = type === "check-feasibility" ? "/api/feasibility-check" : "/api/generate-lottie";
    const result = await postToBackend(backendUrl, path, body);
    let createdPreview: { id: string; name: string } | undefined;

    if (type === "generate-lottie" && sourceNode) {
      try {
        createdPreview = await createGeneratedStoryboard(sourceNode, result as GenerateResult);
      } catch (previewError) {
        log("error", "Storyboard не создан", describeError(previewError));
        figma.notify("Lotion: Lottie сгенерирован, но storyboard не удалось создать. Смотри логи.");
      }
    }

    log("info", "Команда выполнена", { type, createdPreview });
    figma.ui.postMessage({ type: "result", requestType: type, result, createdPreview });
  } catch (error) {
    const details = describeError(error);
    log("error", "Команда завершилась ошибкой", details);
    const messageText = details.message || "Что-то пошло не так.";
    figma.ui.postMessage({ type: "error", message: messageText });
  }
};
