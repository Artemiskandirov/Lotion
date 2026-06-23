var defaultBackendUrl = "https://lotion-figma-plugin-git-main-artiskandirov-gmailcoms-projects.vercel.app";

figma.showUI(__html__, { width: 420, height: 620, themeColors: true });

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
  if (selection.length !== 1) {
    throw new Error("Выдели один объект или фрейм в Figma.");
  }

  const node = selection[0];
  const bounds = "absoluteBoundingBox" in node ? node.absoluteBoundingBox : undefined;
  let svg;

  try {
    svg = await node.exportAsync({ format: "SVG_STRING" });
  } catch (error) {
    svg = undefined;
  }

  return {
    id: node.id,
    name: node.name,
    type: mapNodeType(node),
    width: Math.max(1, Math.round(boundsValue(bounds, "width", "width" in node ? node.width : 256))),
    height: Math.max(1, Math.round(boundsValue(bounds, "height", "height" in node ? node.height : 256))),
    layers: [serializeNode(node)],
    svg
  };
}

async function postToBackend(backendUrl, path, body) {
  const response = await fetch(`${backendUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Сервер вернул ошибку ${response.status}`);
  }

  return response.json();
}

figma.ui.onmessage = async (message) => {
  if (!message || typeof message !== "object") return;

  const type = "type" in message ? message.type : undefined;
  if (type !== "check-feasibility" && type !== "generate-lottie") return;

  try {
    const backendUrl =
      "backendUrl" in message && typeof message.backendUrl === "string"
        ? message.backendUrl
        : defaultBackendUrl;
    const intent =
      "intent" in message && typeof message.intent === "object" ? message.intent : {};
    const asset = await selectionToAsset();
    const body = { asset, intent };
    const path = type === "check-feasibility" ? "/api/feasibility-check" : "/api/generate-lottie";
    const result = await postToBackend(backendUrl, path, body);

    figma.ui.postMessage({ type: "result", requestType: type, result });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Что-то пошло не так.";
    figma.ui.postMessage({ type: "error", message: messageText });
  }
};
