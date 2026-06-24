export type {
  AssetIntent,
  AssetLayer,
  AssetLayerType,
  AssetRequest,
  AssetSnapshot,
  LayerStats
} from "./types/asset";
export type {
  AnimationPlan,
  FeasibilityLevel,
  FeasibilityReport,
  LottieDocument,
  MotionAction,
  MotionScenario,
  MotionStep,
  ScoreRow
} from "./types/motion";
export { flattenLayers, getLayerStats, detectParts, inferAssetType } from "./motion-schema/asset-analysis";
export { runFeasibilityCheck, suggestScenarioIds } from "./motion-schema/feasibility";
export { generateMotionPlan } from "./motion-schema/planner";
export { motionRecipes, getRecipe } from "./motion-recipes/recipes";
export { compilePlanToLottie } from "./lottie/compile";
export { compileFromDSL } from "./lottie/dsl-compile";
export { svgPathToLottieShape } from "./lottie/svg-path";
export type { LottieBezier } from "./lottie/svg-path";
export { normalizeAssetRequest } from "./validators/asset";

export type {
  Easing,
  Keyframe,
  LayerOp,
  SecondaryMotion,
  StoryboardDSL,
  StoryboardPlanResult,
  Track
} from "./dsl/schema";
export { storyboardJSONSchema, validateStoryboardDSL } from "./dsl/schema";

export {
  applyAnticipation,
  applyDisneyPrinciples,
  applyOvershoot,
  applySecondary,
  bezierForEasing,
  deriveSecondaryTrack,
  expandEasing,
  sampleScalarAt,
  springSamples
} from "./physics/disney";
