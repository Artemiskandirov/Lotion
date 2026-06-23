import type { AssetLayer, AssetLayerType, AssetSnapshot, AssetIntent } from "@lotion/shared";

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

function colorToHex(color: RGB, opacity = 1): string {
  const toChannel = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, "0");
  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255);
  const base = `#${toChannel(color.r)}${toChannel(color.g)}${toChannel(color.b)}`;
  return alpha < 255 ? `${base}${alpha.toString(16).padStart(2, "0")}` : base;
}

function paintColors(node: SceneNode, key: "fills" | "strokes"): string[] | undefined {
  const paints = (node as unknown as Record<string, unknown>)[key];
  if (!Array.isArray(paints)) return undefined;
  const colors = paints.flatMap((paint) => {
    if (!paint || typeof paint !== "object") return [];
    const typedPaint = paint as Partial<SolidPaint>;
    if (typedPaint.type !== "SOLID" || !typedPaint.color) return [];
    if (typedPaint.visible === false) return [];
    return [colorToHex(typedPaint.color, typedPaint.opacity ?? 1)];
  });
  return colors.length ? colors : undefined;
}

function numberProperty(node: SceneNode, key: string): number | undefined {
  const value = (node as unknown as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function serializeNode(node: SceneNode, rootBounds: Rect | undefined): AssetLayer {
  const bounds = "absoluteBoundingBox" in node ? node.absoluteBoundingBox : undefined;
  const children = "children" in node ? node.children.map((child) => serializeNode(child, rootBounds)) : undefined;
  const rootX = rootBounds?.x ?? 0;
  const rootY = rootBounds?.y ?? 0;

  return {
    id: node.id,
    name: node.name,
    type: mapNodeType(node),
    shapeKind: node.type,
    visible: node.visible,
    opacity: numberProperty(node, "opacity"),
    rotation: numberProperty(node, "rotation"),
    width: boundsValue(bounds, "width", "width" in node ? node.width : 0),
    height: boundsValue(bounds, "height", "height" in node ? node.height : 0),
    x: boundsValue(bounds, "x", rootX) - rootX,
    y: boundsValue(bounds, "y", rootY) - rootY,
    fills: paintNames(node, "fills"),
    strokes: paintNames(node, "strokes"),
    fillColors: paintColors(node, "fills"),
    strokeColors: paintColors(node, "strokes"),
    strokeWeight: numberProperty(node, "strokeWeight"),
    cornerRadius: numberProperty(node, "cornerRadius"),
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
    layers: [serializeNode(node, bounds)],
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
    const body = { asset, intent };
    const path = type === "check-feasibility" ? "/api/feasibility-check" : "/api/generate-lottie";
    const result = await postToBackend(backendUrl, path, body);
    const preview =
      type === "generate-lottie"
        ? { svg: asset.svg, width: asset.width, height: asset.height }
        : undefined;

    log("info", "Команда выполнена", { type, hasPreview: Boolean(preview?.svg) });
    figma.ui.postMessage({ type: "result", requestType: type, result, preview });
  } catch (error) {
    const details = describeError(error);
    log("error", "Команда завершилась ошибкой", details);
    const messageText = details.message || "Что-то пошло не так.";
    figma.ui.postMessage({ type: "error", message: messageText });
  }
};
