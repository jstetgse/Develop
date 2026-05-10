declare module "@mediapipe/pose" {
  export const POSE_CONNECTIONS: unknown;

  export class Pose {
    constructor(options: { locateFile: (file: string) => string });
    setOptions(options: Record<string, unknown>): void;
    onResults(callback: (results: { poseLandmarks?: Array<{ x: number; y: number; visibility?: number }> | null }) => void): void;
    send(input: { image: HTMLVideoElement }): Promise<void>;
  }
}

declare module "@mediapipe/drawing_utils" {
  export function drawConnectors(
    context: CanvasRenderingContext2D,
    landmarks: Array<{ x: number; y: number; visibility?: number }>,
    connections: unknown,
    style?: Record<string, unknown>
  ): void;

  export function drawLandmarks(
    context: CanvasRenderingContext2D,
    landmarks: Array<{ x: number; y: number; visibility?: number }>,
    style?: Record<string, unknown>
  ): void;
}
