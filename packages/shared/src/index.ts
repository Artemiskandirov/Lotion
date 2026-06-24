export type {
  AssetIntent,
  AssetLayer,
  AssetLayerType,
  AssetRequest,
  AssetSnapshot,
  LayerStats
} from "./types/asset";
export type { LottieDocument } from "./types/motion";

export {
  flattenLayers,
  getLayerStats,
  detectParts,
  inferAssetType
} from "./motion-schema/asset-analysis";

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
