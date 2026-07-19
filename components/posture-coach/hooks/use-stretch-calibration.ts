import { useRef, useState } from "react";

import type { StretchCalibration, StretchCalibrationSample } from "@/lib/stretching/calibration-engine";

export type StretchCalibrationStatus = "idle" | "calibrating" | "ready" | "failed";

export function useStretchCalibration() {
  const [stretchCalibrationStatus, setStretchCalibrationStatus] = useState<StretchCalibrationStatus>("idle");
  const [stretchCalibrationMessage, setStretchCalibrationMessage] = useState("스트레칭 분석을 시작하면 기준 자세를 측정합니다.");
  const stretchCalibrationRef = useRef<StretchCalibration | null>(null);
  const stretchCalibrationStatusRef = useRef<StretchCalibrationStatus>("idle");
  const stretchCalibrationStartedAtRef = useRef<number | null>(null);
  const stretchCalibrationSamplesRef = useRef<StretchCalibrationSample[]>([]);

  return {
    stretchCalibrationStatus, setStretchCalibrationStatus, stretchCalibrationMessage, setStretchCalibrationMessage,
    stretchCalibrationRef, stretchCalibrationStatusRef, stretchCalibrationStartedAtRef, stretchCalibrationSamplesRef,
  };
}
