import type { AssetLayer, AssetLayerType, AssetSnapshot, AssetIntent, StoryboardDSL, Track, LayerOp, Keyframe } from "@lotion/shared";

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

type NodeSnapshot = {
  id: string;
  relativeTransform: Transform;
  opacity?: number;
  rotation?: number;
};

figma.showUI(__html__, { width: 460, height: 760, themeColors: true });

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
    return { name: error.name, message: error.message, stack: error.stack };
  }
  if (error && typeof error === "object") {
    try {
      return { name: "ObjectError", message: JSON.stringify(error) };
    } catch (jsonError) {
      return { name: "ObjectError", message: Object.prototype.toString.call(error) };
    }
  }
  return { name: "UnknownError", message: String(error) };
}

log("info", "Плагин запущен", { backendUrl: defaultBackendUrl });

function mapNodeType(node: SceneNode): AssetLayerType {
  if (node.type === "FRAME") return "frame";
  if (node.type === "GROUP" || node.type === "SECTION") return "group";
  if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") return "component";
  if (node.type === "INSTANCE") return "instance";
  if (node.type === "VECTOR" || node.type === "BOOLEAN_OPERATION") return "vector";
  if (["RECTANGLE", "ELLIPSE", "POLYGON", "STAR", "LINE"].indexOf(node.type) >= 0) return "shape";
  if (node.type === "TEXT") return "text";
  const fills = paintNames(node, "fills");
  if (fills && fills.indexOf("image") >= 0) return "image";
  return "unknown";
}

function boundsValue(bounds: Rect | null | undefined, key: "width" | "height" | "x" | "y", fallback: number): number {
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

function serializeNode(node: SceneNode, rootBounds: Rect | null | undefined): AssetLayer {
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

async function selectionToAsset(): Promise<{ asset: AssetSnapshot; node: SceneNode }> {
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
    log("warn", "SVG экспорт не получился", describeError(error));
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

  return { asset, node };
}

async function postToBackend<T>(backendUrl: string, path: string, body: unknown): Promise<T> {
  const endpoint = `${backendUrl.replace(/\/$/, "")}${path}`;
  log("info", "Отправляю запрос в backend", { endpoint, bodyBytes: JSON.stringify(body).length });

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (error) {
    log("error", "Fetch до backend упал", { endpoint, error: describeError(error) });
    throw new Error(`Не удалось подключиться к backend: ${endpoint}.`);
  }

  if (!response.ok) {
    throw new Error(`Сервер вернул ошибку ${response.status}: ${endpoint}`);
  }

  return response.json() as Promise<T>;
}

function findNodeById(root: SceneNode, ref: string): SceneNode | null {
  if (root.id === ref || root.name === ref) return root;
  if ("children" in root) {
    for (const child of root.children) {
      const found = findNodeById(child, ref);
      if (found) return found;
    }
  }
  return null;
}

function snapshotNode(node: SceneNode): NodeSnapshot {
  return {
    id: node.id,
    relativeTransform: "relativeTransform" in node ? cloneTransform(node.relativeTransform) : identityTransform(),
    opacity: "opacity" in node ? node.opacity : undefined,
    rotation: "rotation" in node ? node.rotation : undefined
  };
}

function restoreNode(node: SceneNode, snapshot: NodeSnapshot): void {
  if ("relativeTransform" in node) {
    (node as unknown as { relativeTransform: Transform }).relativeTransform = cloneTransform(snapshot.relativeTransform);
  }
  if (typeof snapshot.opacity === "number" && "opacity" in node) {
    (node as unknown as { opacity: number }).opacity = snapshot.opacity;
  }
}

function identityTransform(): Transform {
  return [
    [1, 0, 0],
    [0, 1, 0]
  ];
}

function cloneTransform(t: Transform): Transform {
  return [
    [t[0][0], t[0][1], t[0][2]],
    [t[1][0], t[1][1], t[1][2]]
  ];
}

function sampleScalar(kfs: Keyframe[], prop: "tx" | "ty" | "sx" | "sy" | "rot" | "op", t: number, fallback: number): number {
  const filtered = kfs.filter((kf) => typeof (kf as Record<string, unknown>)[prop] === "number");
  if (filtered.length === 0) return fallback;
  if (t <= filtered[0].t) return (filtered[0] as Record<string, unknown>)[prop] as number;
  if (t >= filtered[filtered.length - 1].t) return (filtered[filtered.length - 1] as Record<string, unknown>)[prop] as number;
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

function applyTrackAtTime(rootNode: SceneNode, track: Track, t: number, originalSnapshot: NodeSnapshot): void {
  const node = findNodeById(rootNode, track.layerRef);
  if (!node) return;

  const tx = sampleScalar(track.keyframes, "tx", t, 0);
  const ty = sampleScalar(track.keyframes, "ty", t, 0);
  const sx = sampleScalar(track.keyframes, "sx", t, 1);
  const sy = sampleScalar(track.keyframes, "sy", t, 1);
  const rot = sampleScalar(track.keyframes, "rot", t, 0);
  const op = sampleScalar(track.keyframes, "op", t, 1);

  if (!("relativeTransform" in node)) return;

  const base = originalSnapshot.relativeTransform;
  const radians = (rot * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  const m00 = cos * sx;
  const m01 = -sin * sy;
  const m10 = sin * sx;
  const m11 = cos * sy;

  const transform: Transform = [
    [m00, m01, base[0][2] + tx],
    [m10, m11, base[1][2] + ty]
  ];

  (node as unknown as { relativeTransform: Transform }).relativeTransform = transform;

  if ("opacity" in node) {
    (node as unknown as { opacity: number }).opacity = Math.max(0, Math.min(1, op));
  }
}

async function renderStoryboardFrames(rootNode: SceneNode, dsl: StoryboardDSL, frameCount: number): Promise<string[]> {
  const snapshots = new Map<string, NodeSnapshot>();
  for (const track of dsl.tracks) {
    const node = findNodeById(rootNode, track.layerRef);
    if (node) snapshots.set(track.layerRef, snapshotNode(node));
  }

  const frames: string[] = [];
  try {
    for (let i = 0; i < frameCount; i += 1) {
      const t = i / Math.max(1, frameCount - 1);
      for (const track of dsl.tracks) {
        const snap = snapshots.get(track.layerRef);
        if (snap) applyTrackAtTime(rootNode, track, t, snap);
      }
      const bytes = await rootNode.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 } });
      frames.push(uint8ToBase64(bytes));
    }
  } finally {
    for (const track of dsl.tracks) {
      const node = findNodeById(rootNode, track.layerRef);
      const snap = snapshots.get(track.layerRef);
      if (node && snap) restoreNode(node, snap);
    }
  }
  return frames;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

async function applyLayerOps(rootNode: SceneNode, ops: LayerOp[]): Promise<void> {
  for (const op of ops) {
    try {
      if (op.op === "rename") {
        const node = findNodeById(rootNode, op.id);
        if (node) node.name = op.name;
      } else if (op.op === "group") {
        const nodes = op.ids.map((id) => findNodeById(rootNode, id)).filter((n): n is SceneNode => n !== null);
        if (nodes.length >= 2) {
          const parent = nodes[0].parent;
          if (parent && "appendChild" in parent) {
            const group = figma.group(nodes, parent as BaseNode & ChildrenMixin);
            group.name = op.name;
          }
        }
      } else if (op.op === "isolate") {
        const node = findNodeById(rootNode, op.id);
        if (node && node.parent && node.parent.parent && "appendChild" in node.parent.parent) {
          (node.parent.parent as BaseNode & ChildrenMixin).appendChild(node);
        }
      }
    } catch (error) {
      log("warn", "LayerOp пропущен", { op, error: describeError(error) });
    }
  }
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
    figma.ui.postMessage({ type: "log-snapshot", logs: logBuffer });
    return;
  }

  try {
    const backendUrl = "backendUrl" in message && typeof message.backendUrl === "string" ? message.backendUrl : defaultBackendUrl;

    if (type === "plan-storyboard") {
      const intent = "intent" in message && typeof message.intent === "object" ? (message.intent as AssetIntent) : {};
      log("info", "plan-storyboard", { intent });
      const { asset, node } = await selectionToAsset();
      const plan = await postToBackend<{ dsl: StoryboardDSL; layerOps: LayerOp[]; rationale: string }>(
        backendUrl,
        "/api/plan-storyboard",
        { asset, intent }
      );

      if (plan.layerOps && plan.layerOps.length) {
        await applyLayerOps(node, plan.layerOps);
      }

      const frameCount = 7;
      const frames = await renderStoryboardFrames(node, plan.dsl, frameCount);
      log("info", "Storyboard frames rendered", { count: frames.length });

      figma.ui.postMessage({ type: "storyboard-ready", dsl: plan.dsl, rationale: plan.rationale, frames, asset });
      return;
    }

    if (type === "commit-lottie") {
      const dsl = "dsl" in message ? (message.dsl as StoryboardDSL) : null;
      const asset = "asset" in message ? (message.asset as AssetSnapshot) : null;
      if (!dsl || !asset) throw new Error("commit-lottie: нет dsl/asset");
      log("info", "commit-lottie");
      const result = await postToBackend<{ lottie: unknown }>(backendUrl, "/api/compile-lottie", { dsl, asset });
      figma.ui.postMessage({ type: "lottie-ready", lottie: result.lottie, dsl, asset });
      return;
    }

    if (type === "check-feasibility" || type === "generate-lottie") {
      const intent = "intent" in message && typeof message.intent === "object" ? (message.intent as AssetIntent) : {};
      const { asset } = await selectionToAsset();
      const body = { asset, intent };
      const path = type === "check-feasibility" ? "/api/feasibility-check" : "/api/generate-lottie";
      const result = await postToBackend(backendUrl, path, body);
      const preview = type === "generate-lottie" ? { svg: asset.svg, width: asset.width, height: asset.height } : undefined;
      figma.ui.postMessage({ type: "result", requestType: type, result, preview });
      return;
    }
  } catch (error) {
    const details = describeError(error);
    log("error", "Команда завершилась ошибкой", details);
    figma.ui.postMessage({ type: "error", message: details.message || "Что-то пошло не так." });
  }
};
