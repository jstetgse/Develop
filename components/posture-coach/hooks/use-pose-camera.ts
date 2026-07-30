import { useCallback, useEffect, useRef } from "react";
import type { StretchCalibration } from "@/lib/stretching/calibration-engine";
import { isDynamicStretchStep } from "@/lib/stretching/dynamic-movement-engine";
import { getStretchById } from "@/lib/stretch-analysis";
import { drawDynamicStretchGuidePose, drawStretchGuidePose } from "@/lib/stretch-guide";
import type { StretchCoachingResult } from "@/lib/types";
import type { Tab } from "@/components/posture-coach/types";
import type {
  MediaPipeWindow,
  PoseFrameMetadata,
  PoseInstance,
  PoseResults,
} from "@/components/posture-coach/mediapipe/mediapipe-types";
import { loadBrowserScript, resolveDrawingExports, resolvePoseExports, waitForVideoReady } from "@/components/posture-coach/mediapipe/mediapipe-loader";

type OverlayState = {
  stretchId: string | null;
  stepIndex: number;
  coaching: StretchCoachingResult;
  calibration: StretchCalibration | null;
};

type UsePoseCameraOptions = {
  activeTab: Tab;
  isRunning: boolean;
  showLandmarks: boolean;
  onPoseFrame: (results: PoseResults, metadata: PoseFrameMetadata) => void;
  getOverlayState: () => OverlayState;
};

export function usePoseCamera(options: UsePoseCameraOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<PoseInstance | null>(null);
  const poseModuleRef = useRef<unknown>(null);
  const drawingModuleRef = useRef<unknown>(null);
  const rafIdRef = useRef<number | null>(null);
  const pendingFrameMetadataRef = useRef<PoseFrameMetadata[]>([]);
  const onPoseFrameRef = useRef(options.onPoseFrame);
  const overlayStateRef = useRef(options.getOverlayState);
  const showLandmarksRef = useRef(options.showLandmarks);

  useEffect(() => { onPoseFrameRef.current = options.onPoseFrame; }, [options.onPoseFrame]);
  useEffect(() => { overlayStateRef.current = options.getOverlayState; }, [options.getOverlayState]);
  useEffect(() => { showLandmarksRef.current = options.showLandmarks; }, [options.showLandmarks]);

  const ensureMediaPipe = useCallback(async () => {
    const mediaPipeWindow = window as MediaPipeWindow;
    let poseModule: unknown = mediaPipeWindow;
    let drawingModule: unknown = mediaPipeWindow;
    if (!mediaPipeWindow.Pose) {
      try { poseModule = await import("@mediapipe/pose"); Object.assign(mediaPipeWindow, poseModule); }
      catch (error) { console.warn("[posture] MediaPipe Pose import failed, falling back to browser script:", error); await loadBrowserScript("/mediapipe/pose/pose.js"); poseModule = mediaPipeWindow; }
    }
    if (!mediaPipeWindow.drawConnectors || !mediaPipeWindow.drawLandmarks) {
      try { drawingModule = await import("@mediapipe/drawing_utils"); Object.assign(mediaPipeWindow, drawingModule); }
      catch (error) { console.warn("[posture] MediaPipe drawing import failed, falling back to browser script:", error); await loadBrowserScript("/mediapipe/drawing_utils/drawing_utils.js"); drawingModule = mediaPipeWindow; }
    }
    poseModuleRef.current = poseModule;
    drawingModuleRef.current = drawingModule;
  }, []);

  const drawOverlay = useCallback((results: PoseResults) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !video || !context || !video.videoWidth || !video.videoHeight) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight; context.clearRect(0, 0, canvas.width, canvas.height);
    const overlay = overlayStateRef.current();
    const step = getStretchById(overlay.stretchId)?.steps[overlay.stepIndex];
    if (step) {
      context.save(); context.translate(canvas.width, 0); context.scale(-1, 1);
      if (isDynamicStretchStep(step)) drawDynamicStretchGuidePose(context, canvas, step.checkType, results.poseLandmarks ?? null, overlay.coaching, overlay.calibration);
      else drawStretchGuidePose(context, canvas, step.checkType, results.poseLandmarks ?? null, overlay.coaching.incorrectParts ?? [], overlay.calibration);
      context.restore();
    }
    if (!showLandmarksRef.current || !results.poseLandmarks?.length) return;
    const drawing = resolveDrawingExports(drawingModuleRef.current);
    const { poseConnections } = resolvePoseExports(poseModuleRef.current);
    context.save(); context.translate(canvas.width, 0); context.scale(-1, 1);
    drawing.drawConnectors?.(context, results.poseLandmarks, poseConnections, { color: "rgba(59, 130, 246, 0.85)", lineWidth: 3 });
    drawing.drawLandmarks?.(context, results.poseLandmarks, { color: "rgba(255,255,255,0.95)", fillColor: "rgba(59,130,246,0.95)", lineWidth: 1, radius: 3 });
    context.restore();
  }, []);

  const ensureDetector = useCallback(async () => {
    if (detectorRef.current) return detectorRef.current;
    await ensureMediaPipe();
    const { PoseClass } = resolvePoseExports(poseModuleRef.current);
    if (!PoseClass) throw new Error("MediaPipe Pose could not be loaded.");
    const pose = new PoseClass({ locateFile: (file) => `/mediapipe/pose/${file}` });
    pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false, minDetectionConfidence: 0.55, minTrackingConfidence: 0.55 });
    pose.onResults((results) => {
      drawOverlay(results);
      const metadata = pendingFrameMetadataRef.current.shift();
      if (metadata) {
        onPoseFrameRef.current(results, metadata);
      }
    });
    if (pose.initialize) await pose.initialize();
    detectorRef.current = pose;
    return pose;
  }, [drawOverlay, ensureMediaPipe]);

  const startCamera = useCallback(async () => {
    const video = videoRef.current;
    if (!video) throw new Error("Camera video element is not ready.");
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }, audio: false });
    streamRef.current = stream; video.srcObject = stream; await video.play(); await waitForVideoReady(video);
    const detector = await ensureDetector();
    const loop = async () => {
      const currentVideo = videoRef.current;
      if (currentVideo && currentVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && currentVideo.videoWidth > 0 && currentVideo.videoHeight > 0 && detectorRef.current === detector) {
        const metadata = {
          videoWidth: currentVideo.videoWidth,
          videoHeight: currentVideo.videoHeight,
          timestamp: Date.now(),
        };
        pendingFrameMetadataRef.current.push(metadata);
        try {
          await detector.send({ image: currentVideo });
        } catch (error) {
          const pendingIndex = pendingFrameMetadataRef.current.indexOf(metadata);
          if (pendingIndex >= 0) {
            pendingFrameMetadataRef.current.splice(pendingIndex, 1);
          }
          console.error("Pose send failed:", error);
        }
      }
      if (detectorRef.current === detector) rafIdRef.current = requestAnimationFrame(() => void loop());
    };
    rafIdRef.current = requestAnimationFrame(() => void loop());
  }, [ensureDetector]);

  const stopCamera = useCallback(async () => {
    if (rafIdRef.current !== null) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = null; }
    const detector = detectorRef.current; detectorRef.current = null;
    pendingFrameMetadataRef.current = [];
    if (detector?.close) { try { await detector.close(); } catch (error) { console.error("Failed to close pose detector:", error); } }
    streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const captureCurrentFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;
    const canvas = document.createElement("canvas"); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const context = canvas.getContext("2d"); if (!context) return null;
    context.translate(canvas.width, 0); context.scale(-1, 1); context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.78);
  }, []);

  useEffect(() => { const video = videoRef.current; if (video && streamRef.current && video.srcObject !== streamRef.current) { video.srcObject = streamRef.current; void video.play(); } }, [options.activeTab, options.isRunning]);
  useEffect(() => () => { void stopCamera(); }, [stopCamera]);

  return { videoRef, canvasRef, startCamera, stopCamera, captureCurrentFrame };
}
