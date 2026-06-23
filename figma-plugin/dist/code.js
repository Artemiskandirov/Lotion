var defaultBackendUrl = "https://lotion-figma-plugin.vercel.app";
var logBuffer = [];
var logLimit = 200;
var logSequence = 0;

figma.showUI(__html__, { width: 420, height: 720, themeColors: true });

function safeData(data) {
  if (data === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(data));
  } catch (error) {
    return String(data);
  }
}

function log(level, message, data) {
  var entry = {
    id: ++logSequence,
    time: new Date().toISOString(),
    level,
    source: "plugin",
    message,
    data: safeData(data)
  };

  logBuffer.push(entry);
  if (logBuffer.length > logLimit) logBuffer.splice(0, logBuffer.length - logLimit);

  if (level === "error") console.error("[lotion] " + message, data || "");
  else if (level === "warn") console.warn("[lotion] " + message, data || "");
  else console.log("[lotion] " + message, data || "");

  figma.ui.postMessage({ type: "log-entry", entry });
}

function describeError(error) {
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

async function loadPreviewFont() {
  try {
    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    await figma.loadFontAsync({ family: "Inter", style: "Medium" });
    return true;
  } catch (error) {
    log("warn", "Не удалось загрузить Inter для подписей storyboard", describeError(error));
    return false;
  }
}

function actionLabel(action) {
  var labels = {
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

  return labels[action] || action;
}

function transformForProgress(plan, progress, index) {
  var offsetX = 0;
  var offsetY = 0;
  var scale = 1;
  var rotation = 0;
  var opacity = 1;

  for (const step of plan.animationPlan) {
    if (step.action === "float_y") offsetY -= Math.sin(progress * Math.PI) * 28;
    if (step.action === "shake_x") offsetX += [0, -12, 12, 0][index] || 0;
    if (step.action === "scale_pop" || step.action === "pulse") scale *= [0.9, 1.16, 0.98, 1][index] || 1;
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

function setNodeSize(node, width, height) {
  if (typeof node.resizeWithoutConstraints === "function") {
    node.resizeWithoutConstraints(width, height);
    return;
  }

  if (typeof node.resize === "function") {
    node.resize(width, height);
  }
}

function setNodePlacement(node, x, y, opacity, rotation) {
  node.x = x;
  node.y = y;
  if (typeof node.opacity === "number") node.opacity = opacity;
  if (typeof node.rotation === "number") node.rotation = rotation;
}

function createText(parent, text, x, y, size) {
  var node = figma.createText();
  node.fontName = { family: "Inter", style: size >= 14 ? "Medium" : "Regular" };
  node.characters = text;
  node.fontSize = size;
  node.fills = [{ type: "SOLID", color: { r: 0.42, g: 0.42, b: 0.45 } }];
  node.x = x;
  node.y = y;
  parent.appendChild(node);
}

async function createGeneratedStoryboard(source, result) {
  var bounds = "absoluteBoundingBox" in source ? source.absoluteBoundingBox : undefined;
  var sourceWidth = Math.max(24, Math.round(boundsValue(bounds, "width", "width" in source ? source.width : result.plan.width)));
  var sourceHeight = Math.max(24, Math.round(boundsValue(bounds, "height", "height" in source ? source.height : result.plan.height)));
  var frameCount = 4;
  var padding = 18;
  var cellWidth = Math.max(128, sourceWidth + 42);
  var canvasHeight = Math.max(190, sourceHeight + 92);
  var frame = figma.createFrame();
  var sourceX = boundsValue(bounds, "x", "x" in source ? source.x : 0);
  var sourceY = boundsValue(bounds, "y", "y" in source ? source.y : 0);
  var fontReady = await loadPreviewFont();

  frame.name = "Lotion storyboard - " + result.plan.scenario;
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
    createText(frame, result.plan.scenario + " / " + result.plan.durationMs + " ms / score " + result.plan.score, padding, 34, 11);
  }

  for (var index = 0; index < frameCount; index += 1) {
    var progress = index / (frameCount - 1);
    var clone = source.clone();
    var transform = transformForProgress(result.plan, progress, index);
    var width = Math.max(1, sourceWidth * transform.scale);
    var height = Math.max(1, sourceHeight * transform.scale);
    var baseX = padding + index * cellWidth + (cellWidth - width) / 2;
    var baseY = 62 + (sourceHeight - height) / 2;

    frame.appendChild(clone);
    setNodeSize(clone, width, height);
    setNodePlacement(clone, baseX + transform.offsetX, baseY + transform.offsetY, transform.opacity, transform.rotation);

    if (fontReady) {
      var actions = result.plan.animationPlan.map((step) => actionLabel(step.action)).join(" + ");
      createText(frame, Math.round(progress * 100) + "%", padding + index * cellWidth, canvasHeight - 44, 11);
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

function mapNodeType(node) {
  if (node.type === "FRAME") return "frame";
  if (node.type === "GROUP" || node.type === "SECTION") return "group";
  if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") return "component";
  if (node.type === "INSTANCE") return "instance";
  if (node.type === "VECTOR" || node.type === "BOOLEAN_OPERATION") return "vector";
  if (["RECTANGLE", "ELLIPSE", "POLYGON", "STAR", "LINE"].includes(node.type)) return "shape";
  if (node.type === "TEXT") return "text";
  var fills = paintNames(node, "fills");
  if (fills && fills.includes("image")) return "image";
  return "unknown";
}

function boundsValue(bounds, key, fallback) {
  return bounds && typeof bounds[key] === "number" ? bounds[key] : fallback;
}

function paintNames(node, key) {
  const paints = node[key];
  if (!Array.isArray(paints)) return undefined;
  return paints.map((paint) => {
    if (!paint || typeof paint !== "object" || !("type" in paint)) return "unknown";
    return String(paint.type).toLowerCase();
  });
}

function serializeNode(node) {
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

async function selectionToAsset() {
  const selection = figma.currentPage.selection;
  log("info", "Читаю выделение", { count: selection.length });
  if (selection.length !== 1) {
    throw new Error("Выдели один объект или фрейм в Figma.");
  }

  const node = selection[0];
  const bounds = "absoluteBoundingBox" in node ? node.absoluteBoundingBox : undefined;
  let svg;

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

async function postToBackend(backendUrl, path, body) {
  const endpoint = `${backendUrl.replace(/\/$/, "")}${path}`;
  log("info", "Отправляю запрос в backend", {
    endpoint,
    bodyBytes: JSON.stringify(body).length
  });

  let response;
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

  return response.json();
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
      "intent" in message && typeof message.intent === "object" ? message.intent : {};
    log("info", "Получена команда из UI", { type, backendUrl, intent });
    const asset = await selectionToAsset();
    const sourceNode = figma.currentPage.selection[0];
    const body = { asset, intent };
    const path = type === "check-feasibility" ? "/api/feasibility-check" : "/api/generate-lottie";
    const result = await postToBackend(backendUrl, path, body);
    let createdPreview;

    if (type === "generate-lottie" && sourceNode) {
      try {
        createdPreview = await createGeneratedStoryboard(sourceNode, result);
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
