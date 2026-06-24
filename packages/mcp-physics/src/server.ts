#!/usr/bin/env -S npx tsx
import { springSamples } from "../../shared/src/physics/disney.ts";
import { validateStoryboardDSL } from "../../shared/src/dsl/schema.ts";
import { svgPathToLottieShape } from "../../shared/src/lottie/svg-path.ts";

type JSONRPCRequest = {
  jsonrpc: "2.0";
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
};

type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => unknown;
};

const tools: Tool[] = [
  {
    name: "spring_curve",
    description: "Compute spring-physics bezier samples. Useful for Lottie keyframe generation.",
    inputSchema: {
      type: "object",
      properties: {
        stiffness: { type: "number", description: "120-300 typical" },
        damping: { type: "number", description: "8-20 typical" },
        mass: { type: "number", description: "0.5-3 typical" },
        fromVal: { type: "number" },
        toVal: { type: "number" },
        durationMs: { type: "number" },
        fps: { type: "number", description: "30 or 60" }
      },
      required: ["stiffness", "damping", "fromVal", "toVal", "durationMs"]
    },
    handler: (args) => {
      const samples = springSamples(
        {
          kind: "spring",
          stiffness: Number(args.stiffness),
          damping: Number(args.damping),
          mass: typeof args.mass === "number" ? args.mass : 1
        },
        Number(args.fromVal),
        Number(args.toVal),
        Number(args.durationMs),
        typeof args.fps === "number" ? args.fps : 60
      );
      return { samples };
    }
  },
  {
    name: "validate_lottie",
    description: "Quick structural check of a Lottie 5.x document.",
    inputSchema: {
      type: "object",
      properties: { lottie: { type: "object" } },
      required: ["lottie"]
    },
    handler: (args) => {
      const lottie = args.lottie as Record<string, unknown> | undefined;
      const errors: string[] = [];
      if (!lottie || typeof lottie !== "object") return { valid: false, errors: ["not an object"] };
      if (typeof lottie.v !== "string") errors.push("missing v");
      if (typeof lottie.fr !== "number") errors.push("missing fr");
      if (typeof lottie.ip !== "number") errors.push("missing ip");
      if (typeof lottie.op !== "number") errors.push("missing op");
      if (typeof lottie.w !== "number") errors.push("missing w");
      if (typeof lottie.h !== "number") errors.push("missing h");
      if (!Array.isArray(lottie.layers)) errors.push("layers must be an array");
      return { valid: errors.length === 0, errors };
    }
  },
  {
    name: "morph_compatibility",
    description: "Check if two SVG paths can be morphed directly by counting vertices.",
    inputSchema: {
      type: "object",
      properties: {
        pathA: { type: "string" },
        pathB: { type: "string" }
      },
      required: ["pathA", "pathB"]
    },
    handler: (args) => {
      const a = svgPathToLottieShape(String(args.pathA));
      const b = svgPathToLottieShape(String(args.pathB));
      const compatible = a.v.length === b.v.length && a.c === b.c;
      return {
        compatible,
        verticesA: a.v.length,
        verticesB: b.v.length,
        suggestion: compatible
          ? "Direct morph OK."
          : "Vertex counts differ — Lottie will interpolate as straight tweens. Add intermediate path or match vertex counts via subdivision."
      };
    }
  },
  {
    name: "disney_principles_check",
    description: "Audit a StoryboardDSL for missing Disney principles.",
    inputSchema: {
      type: "object",
      properties: { dsl: { type: "object" } },
      required: ["dsl"]
    },
    handler: (args) => {
      const dsl = validateStoryboardDSL(args.dsl);
      if (!dsl) return { issues: ["Invalid DSL"], score: 0 };
      const issues: string[] = [];
      let score = 100;

      for (const track of dsl.tracks) {
        const easings = track.keyframes.map((kf) => kf.ease?.kind).filter(Boolean);
        if (!easings.includes("anticipation")) {
          issues.push(`Track ${track.layerRef}: no anticipation — add ease.kind="anticipation" to first KF.`);
          score -= 10;
        }
        if (!easings.includes("overshoot") && !easings.includes("spring")) {
          issues.push(`Track ${track.layerRef}: no follow-through — add overshoot or spring to last KF.`);
          score -= 10;
        }
        const hasSquash = track.keyframes.some(
          (kf) => typeof kf.sx === "number" && typeof kf.sy === "number" && kf.sx !== kf.sy
        );
        if (!hasSquash) {
          issues.push(`Track ${track.layerRef}: no squash/stretch — vary sx vs sy for organic motion.`);
          score -= 5;
        }
      }
      return { score: Math.max(0, score), issues };
    }
  }
];

function send(message: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function handle(req: JSONRPCRequest): void {
  if (req.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: req.id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "lotion-physics", version: "0.1.0" }
      }
    });
    return;
  }
  if (req.method === "tools/list") {
    send({
      jsonrpc: "2.0",
      id: req.id,
      result: {
        tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }))
      }
    });
    return;
  }
  if (req.method === "tools/call") {
    const params = req.params ?? {};
    const name = String(params.name ?? "");
    const args = (params.arguments as Record<string, unknown>) ?? {};
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      send({ jsonrpc: "2.0", id: req.id, error: { code: -32601, message: `Unknown tool: ${name}` } });
      return;
    }
    try {
      const result = tool.handler(args);
      send({
        jsonrpc: "2.0",
        id: req.id,
        result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
      });
    } catch (error) {
      send({
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32603, message: error instanceof Error ? error.message : String(error) }
      });
    }
    return;
  }
  if (req.id !== undefined) {
    send({ jsonrpc: "2.0", id: req.id, error: { code: -32601, message: `Unknown method: ${req.method}` } });
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let index: number;
  while ((index = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    try {
      const req = JSON.parse(line) as JSONRPCRequest;
      handle(req);
    } catch (error) {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    }
  }
});
