import { POSE_CONNECTIONS_FALLBACK } from "@/components/posture-coach/constants";
import type { DrawingModuleShape, PoseInstance } from "@/components/posture-coach/mediapipe/mediapipe-types";

export function resolvePoseExports(moduleValue: unknown): {
  PoseClass: (new (config: { locateFile: (file: string) => string }) => PoseInstance) | null;
  poseConnections: Array<[number, number]> | unknown;
} {
  const candidates = [
    moduleValue,
    typeof moduleValue === "object" && moduleValue ? (moduleValue as { default?: unknown }).default : null,
    typeof window !== "undefined"
      ? (window as Window & { Pose?: unknown; POSE_CONNECTIONS?: unknown })
      : null,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const record = candidate as Record<string, unknown>;
    const poseClass = record.Pose;
    if (typeof poseClass === "function") {
      return {
        PoseClass: poseClass as new (config: { locateFile: (file: string) => string }) => PoseInstance,
        poseConnections: (record.POSE_CONNECTIONS as Array<[number, number]> | unknown) ?? POSE_CONNECTIONS_FALLBACK,
      };
    }
  }

  return { PoseClass: null, poseConnections: POSE_CONNECTIONS_FALLBACK };
}

export function resolveDrawingExports(moduleValue: unknown): DrawingModuleShape {
  const candidates = [
    moduleValue,
    typeof moduleValue === "object" && moduleValue ? (moduleValue as { default?: unknown }).default : null,
    typeof window !== "undefined"
      ? (window as Window & {
          drawConnectors?: DrawingModuleShape["drawConnectors"];
          drawLandmarks?: DrawingModuleShape["drawLandmarks"];
        })
      : null,
  ];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const record = candidate as DrawingModuleShape;
    if (typeof record.drawConnectors === "function" || typeof record.drawLandmarks === "function") {
      return record;
    }
  }

  return {};
}

export function loadBrowserScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }

    const script = existing ?? document.createElement("script");
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`MediaPipe script load timed out: ${src}`));
    }, 15000);

    script.onload = () => {
      window.clearTimeout(timeoutId);
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => {
      window.clearTimeout(timeoutId);
      reject(new Error(`MediaPipe script load failed: ${src}`));
    };

    if (!existing) {
      script.src = src;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

export function waitForVideoReady(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    const isReady = () =>
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0;
    if (isReady()) {
      resolve();
      return;
    }

    let timeoutId = 0;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("loadedmetadata", handleReady);
      video.removeEventListener("canplay", handleReady);
      video.removeEventListener("error", handleError);
    };
    const handleReady = () => {
      if (!isReady()) {
        return;
      }
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Video stream failed before metadata was available."));
    };

    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for video metadata."));
    }, 10000);
    video.addEventListener("loadedmetadata", handleReady);
    video.addEventListener("canplay", handleReady);
    video.addEventListener("error", handleError);
  });
}



