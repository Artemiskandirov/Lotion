"use strict";
(() => {
  // src/code.ts
  var defaultBackendUrl = "https://lotion-figma-plugin.vercel.app";
  var backendStorageKey = "lotion:backendUrl";
  var currentBackendUrl = defaultBackendUrl;
  var logBuffer = [];
  var logLimit = 200;
  var logSequence = 0;
  figma.showUI(__html__, { width: 460, height: 760, themeColors: true });
  function safeData(data) {
    if (data === void 0) return void 0;
    try {
      return JSON.parse(JSON.stringify(data));
    } catch (error) {
      return String(data);
    }
  }
  function log(level, message, data) {
    const entry = {
      id: ++logSequence,
      time: (/* @__PURE__ */ new Date()).toISOString(),
      level,
      source: "plugin",
      message,
      data: safeData(data)
    };
    logBuffer.push(entry);
    if (logBuffer.length > logLimit) logBuffer.splice(0, logBuffer.length - logLimit);
    if (level === "error") console.error(`[lotion] ${message}`, data != null ? data : "");
    else if (level === "warn") console.warn(`[lotion] ${message}`, data != null ? data : "");
    else console.log(`[lotion] ${message}`, data != null ? data : "");
    figma.ui.postMessage({ type: "log-entry", entry });
  }
  function describeError(error) {
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
  async function loadBackendUrl() {
    try {
      const stored = await figma.clientStorage.getAsync(backendStorageKey);
      if (typeof stored === "string" && stored.trim()) {
        currentBackendUrl = stored.trim();
      }
    } catch (error) {
      log("warn", "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C backend URL \u0438\u0437 clientStorage", describeError(error));
    }
    log("info", "\u041F\u043B\u0430\u0433\u0438\u043D \u0437\u0430\u043F\u0443\u0449\u0435\u043D", { backendUrl: currentBackendUrl });
    figma.ui.postMessage({ type: "backend-url", backendUrl: currentBackendUrl });
  }
  void loadBackendUrl();
  function mapNodeType(node) {
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
  function boundsValue(bounds, key, fallback) {
    return bounds && typeof bounds[key] === "number" ? bounds[key] : fallback;
  }
  function paintNames(node, key) {
    const paints = node[key];
    if (!Array.isArray(paints)) return void 0;
    return paints.map((paint) => {
      if (!paint || typeof paint !== "object" || !("type" in paint)) return "unknown";
      return String(paint.type).toLowerCase();
    });
  }
  function colorToHex(color, opacity = 1) {
    const toChannel = (value) => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, "0");
    const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255);
    const base = `#${toChannel(color.r)}${toChannel(color.g)}${toChannel(color.b)}`;
    return alpha < 255 ? `${base}${alpha.toString(16).padStart(2, "0")}` : base;
  }
  function paintColors(node, key) {
    const paints = node[key];
    if (!Array.isArray(paints)) return void 0;
    const colors = paints.flatMap((paint) => {
      var _a;
      if (!paint || typeof paint !== "object") return [];
      const typedPaint = paint;
      if (typedPaint.type !== "SOLID" || !typedPaint.color) return [];
      if (typedPaint.visible === false) return [];
      return [colorToHex(typedPaint.color, (_a = typedPaint.opacity) != null ? _a : 1)];
    });
    return colors.length ? colors : void 0;
  }
  function numberProperty(node, key) {
    const value = node[key];
    return typeof value === "number" && Number.isFinite(value) ? value : void 0;
  }
  function serializeNode(node, rootBounds) {
    var _a, _b;
    const bounds = "absoluteBoundingBox" in node ? node.absoluteBoundingBox : void 0;
    const children = "children" in node ? node.children.map((child) => serializeNode(child, rootBounds)) : void 0;
    const rootX = (_a = rootBounds == null ? void 0 : rootBounds.x) != null ? _a : 0;
    const rootY = (_b = rootBounds == null ? void 0 : rootBounds.y) != null ? _b : 0;
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
  async function selectionToAsset() {
    const selection = figma.currentPage.selection;
    log("info", "\u0427\u0438\u0442\u0430\u044E \u0432\u044B\u0434\u0435\u043B\u0435\u043D\u0438\u0435", { count: selection.length });
    if (selection.length !== 1) {
      throw new Error("\u0412\u044B\u0434\u0435\u043B\u0438 \u043E\u0434\u0438\u043D \u043E\u0431\u044A\u0435\u043A\u0442 \u0438\u043B\u0438 \u0444\u0440\u0435\u0439\u043C \u0432 Figma.");
    }
    const node = selection[0];
    const bounds = "absoluteBoundingBox" in node ? node.absoluteBoundingBox : void 0;
    let svg;
    try {
      svg = await node.exportAsync({ format: "SVG_STRING" });
      log("info", "SVG \u044D\u043A\u0441\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u043D", { nodeId: node.id, bytes: svg.length });
    } catch (error) {
      log("warn", "SVG \u044D\u043A\u0441\u043F\u043E\u0440\u0442 \u043D\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u043B\u0441\u044F", describeError(error));
      svg = void 0;
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
  async function postToBackend(backendUrl, path, body) {
    const endpoint = `${backendUrl.replace(/\/$/, "")}${path}`;
    log("info", "\u041E\u0442\u043F\u0440\u0430\u0432\u043B\u044F\u044E \u0437\u0430\u043F\u0440\u043E\u0441 \u0432 backend", { endpoint, bodyBytes: JSON.stringify(body).length });
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
    } catch (error) {
      log("error", "Fetch \u0434\u043E backend \u0443\u043F\u0430\u043B", { endpoint, error: describeError(error) });
      throw new Error(`\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u0442\u044C\u0441\u044F \u043A backend: ${endpoint}.`);
    }
    if (!response.ok) {
      throw new Error(`\u0421\u0435\u0440\u0432\u0435\u0440 \u0432\u0435\u0440\u043D\u0443\u043B \u043E\u0448\u0438\u0431\u043A\u0443 ${response.status}: ${endpoint}`);
    }
    return response.json();
  }
  function findNodeById(root, ref) {
    if (root.id === ref || root.name === ref) return root;
    if ("children" in root) {
      for (const child of root.children) {
        const found = findNodeById(child, ref);
        if (found) return found;
      }
    }
    return null;
  }
  function snapshotNode(node) {
    return {
      id: node.id,
      relativeTransform: "relativeTransform" in node ? cloneTransform(node.relativeTransform) : identityTransform(),
      opacity: "opacity" in node ? node.opacity : void 0,
      rotation: "rotation" in node ? node.rotation : void 0
    };
  }
  function restoreNode(node, snapshot) {
    if ("relativeTransform" in node) {
      node.relativeTransform = cloneTransform(snapshot.relativeTransform);
    }
    if (typeof snapshot.opacity === "number" && "opacity" in node) {
      node.opacity = snapshot.opacity;
    }
  }
  function identityTransform() {
    return [
      [1, 0, 0],
      [0, 1, 0]
    ];
  }
  function cloneTransform(t) {
    return [
      [t[0][0], t[0][1], t[0][2]],
      [t[1][0], t[1][1], t[1][2]]
    ];
  }
  function sampleScalar(kfs, prop, t, fallback) {
    const filtered = kfs.filter((kf) => typeof kf[prop] === "number");
    if (filtered.length === 0) return fallback;
    if (t <= filtered[0].t) return filtered[0][prop];
    if (t >= filtered[filtered.length - 1].t) return filtered[filtered.length - 1][prop];
    for (let i = 0; i < filtered.length - 1; i += 1) {
      const a = filtered[i];
      const b = filtered[i + 1];
      if (t >= a.t && t <= b.t) {
        const ratio = (t - a.t) / (b.t - a.t || 1);
        const va = a[prop];
        const vb = b[prop];
        return va + (vb - va) * ratio;
      }
    }
    return fallback;
  }
  function applyTrackAtTime(rootNode, track, t, originalSnapshot) {
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
    const radians = rot * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const m00 = cos * sx;
    const m01 = -sin * sy;
    const m10 = sin * sx;
    const m11 = cos * sy;
    const transform = [
      [m00, m01, base[0][2] + tx],
      [m10, m11, base[1][2] + ty]
    ];
    node.relativeTransform = transform;
    if ("opacity" in node) {
      node.opacity = Math.max(0, Math.min(1, op));
    }
  }
  async function renderStoryboardFrames(rootNode, dsl, frameCount) {
    const snapshots = /* @__PURE__ */ new Map();
    for (const track of dsl.tracks) {
      const node = findNodeById(rootNode, track.layerRef);
      if (node) snapshots.set(track.layerRef, snapshotNode(node));
    }
    const frames = [];
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
  function uint8ToBase64(bytes) {
    let binary = "";
    const chunkSize = 32768;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return `data:image/png;base64,${btoa(binary)}`;
  }
  async function applyLayerOps(rootNode, ops) {
    for (const op of ops) {
      try {
        if (op.op === "rename") {
          const node = findNodeById(rootNode, op.id);
          if (node) node.name = op.name;
        } else if (op.op === "group") {
          const nodes = op.ids.map((id) => findNodeById(rootNode, id)).filter((n) => n !== null);
          if (nodes.length >= 2) {
            const parent = nodes[0].parent;
            if (parent && "appendChild" in parent) {
              const group = figma.group(nodes, parent);
              group.name = op.name;
            }
          }
        } else if (op.op === "isolate") {
          const node = findNodeById(rootNode, op.id);
          if (node && node.parent && node.parent.parent && "appendChild" in node.parent.parent) {
            node.parent.parent.appendChild(node);
          }
        }
      } catch (error) {
        log("warn", "LayerOp \u043F\u0440\u043E\u043F\u0443\u0449\u0435\u043D", { op, error: describeError(error) });
      }
    }
  }
  figma.ui.onmessage = async (message) => {
    if (!message || typeof message !== "object") return;
    const type = "type" in message ? message.type : void 0;
    if (type === "request-logs") {
      figma.ui.postMessage({ type: "log-snapshot", logs: logBuffer });
      figma.ui.postMessage({ type: "backend-url", backendUrl: currentBackendUrl });
      return;
    }
    if (type === "clear-logs") {
      logBuffer.splice(0, logBuffer.length);
      figma.ui.postMessage({ type: "log-snapshot", logs: logBuffer });
      return;
    }
    if (type === "set-backend-url") {
      const next = "backendUrl" in message && typeof message.backendUrl === "string" ? message.backendUrl.trim() : "";
      currentBackendUrl = next || defaultBackendUrl;
      try {
        await figma.clientStorage.setAsync(backendStorageKey, currentBackendUrl);
      } catch (error) {
        log("warn", "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C backend URL", describeError(error));
      }
      log("info", "Backend URL \u043E\u0431\u043D\u043E\u0432\u043B\u0451\u043D", { backendUrl: currentBackendUrl });
      figma.ui.postMessage({ type: "backend-url", backendUrl: currentBackendUrl });
      return;
    }
    try {
      const backendUrl = currentBackendUrl;
      if (type === "plan-storyboard") {
        const intent = "intent" in message && typeof message.intent === "object" ? message.intent : {};
        log("info", "plan-storyboard", { intent });
        const { asset, node } = await selectionToAsset();
        const plan = await postToBackend(
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
        const dsl = "dsl" in message ? message.dsl : null;
        const asset = "asset" in message ? message.asset : null;
        if (!dsl || !asset) throw new Error("commit-lottie: \u043D\u0435\u0442 dsl/asset");
        log("info", "commit-lottie");
        const result = await postToBackend(backendUrl, "/api/compile-lottie", { dsl, asset });
        figma.ui.postMessage({ type: "lottie-ready", lottie: result.lottie, dsl, asset });
        return;
      }
    } catch (error) {
      const details = describeError(error);
      log("error", "\u041A\u043E\u043C\u0430\u043D\u0434\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043B\u0430\u0441\u044C \u043E\u0448\u0438\u0431\u043A\u043E\u0439", details);
      figma.ui.postMessage({ type: "error", message: details.message || "\u0427\u0442\u043E-\u0442\u043E \u043F\u043E\u0448\u043B\u043E \u043D\u0435 \u0442\u0430\u043A." });
    }
  };
})();
