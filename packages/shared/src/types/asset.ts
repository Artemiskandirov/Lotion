export type AssetLayerType =
  | "frame"
  | "group"
  | "component"
  | "instance"
  | "vector"
  | "shape"
  | "text"
  | "image"
  | "unknown";

export type AssetLayer = {
  id: string;
  name: string;
  type: AssetLayerType;
  visible?: boolean;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  fills?: string[];
  strokes?: string[];
  children?: AssetLayer[];
};

export type AssetSnapshot = {
  id: string;
  name: string;
  type: AssetLayerType;
  width: number;
  height: number;
  layers: AssetLayer[];
  svg?: string;
};

export type AssetIntent = {
  whatIsIt?: string;
  whereUsed?: string;
  desiredAction?: string;
  mood?: string;
  prompt?: string;
};

export type AssetRequest = {
  asset: AssetSnapshot;
  intent: AssetIntent;
};

export type LayerStats = {
  totalLayers: number;
  groups: number;
  vectors: number;
  shapes: number;
  text: number;
  images: number;
  maxDepth: number;
  namedParts: string[];
};
