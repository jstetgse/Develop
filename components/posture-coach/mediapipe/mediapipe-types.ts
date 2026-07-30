export type Landmark = {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
};

export type PoseResults = {
  poseLandmarks?: Landmark[] | null;
  poseWorldLandmarks?: Landmark[] | null;
};

export type PoseFrameMetadata = {
  videoWidth: number;
  videoHeight: number;
  timestamp: number;
};

export type PoseInstance = {
  setOptions: (options: Record<string, unknown>) => void;
  onResults: (callback: (results: PoseResults) => void) => void;
  initialize?: () => Promise<void>;
  send: (payload: { image: HTMLVideoElement }) => Promise<void>;
  close?: () => Promise<void> | void;
};

export type DrawingModuleShape = {
  drawConnectors?: (
    ctx: CanvasRenderingContext2D,
    landmarks: Landmark[],
    connections: Array<[number, number]> | unknown,
    style?: Record<string, unknown>
  ) => void;
  drawLandmarks?: (
    ctx: CanvasRenderingContext2D,
    landmarks: Landmark[],
    style?: Record<string, unknown>
  ) => void;
};

export type MediaPipeWindow = Window & {
  Pose?: new (config: { locateFile: (file: string) => string }) => PoseInstance;
  POSE_CONNECTIONS?: Array<[number, number]> | unknown;
  drawConnectors?: DrawingModuleShape["drawConnectors"];
  drawLandmarks?: DrawingModuleShape["drawLandmarks"];
};
