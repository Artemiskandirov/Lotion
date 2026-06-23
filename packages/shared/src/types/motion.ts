export type FeasibilityLevel = "green" | "yellow" | "orange" | "red";

export type ScoreRow = {
  label: string;
  value: string;
  status: "good" | "limited" | "needs-work" | "poor";
};

export type FeasibilityReport = {
  score: number;
  level: FeasibilityLevel;
  title: string;
  summary: string;
  assetType: string;
  recommendedFormat: "lottie" | "rive" | "sprite-sheet";
  detectedParts: Record<string, string>;
  canAnimate: string[];
  cannotAnimate: string[];
  recommendedScenarios: string[];
  fixes: string[];
  scorecard: ScoreRow[];
  actions: string[];
};

export type MotionAction =
  | "scale_pop"
  | "rotate_open"
  | "shake_x"
  | "float_y"
  | "fade_in"
  | "fade_out"
  | "burst_particles"
  | "shine_sweep"
  | "fly_to_target"
  | "stagger_appear"
  | "draw_stroke"
  | "pulse";

export type MotionStep = {
  target: string;
  action: MotionAction;
  start: number;
  duration: number;
  easing?: "linear" | "ease-out" | "ease-in-out" | "spring";
  params?: Record<string, number | string | boolean>;
};

export type MotionScenario = {
  id: string;
  label: string;
  description: string;
  assetTypes: string[];
  intents: string[];
  steps: MotionStep[];
};

export type AnimationPlan = {
  assetType: string;
  feasibility: FeasibilityLevel;
  score: number;
  format: "lottie" | "rive" | "sprite-sheet";
  scenario: string;
  detectedParts: Record<string, string>;
  durationMs: number;
  width: number;
  height: number;
  animationPlan: MotionStep[];
  notes: string[];
};

export type LottieDocument = {
  v: string;
  fr: number;
  ip: number;
  op: number;
  w: number;
  h: number;
  nm: string;
  ddd: 0;
  assets: unknown[];
  layers: unknown[];
};
