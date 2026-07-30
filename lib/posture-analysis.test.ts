import { describe, expect, it } from "vitest";

import { PostureAnalyzer, scoreNeck, scoreTrunk } from "@/lib/posture-analysis";
import type { PostureLandmark } from "@/lib/posture/posture-metrics";

const FRAME_SIZE = { videoWidth: 1280, videoHeight: 720 };

function createLandmarks(neckAngle: number, trunkAngle = 0, offsetX = 0) {
  const landmarks = Array.from(
    { length: 33 },
    (): PostureLandmark => ({ x: 0.5, y: 0.5, visibility: 1 })
  );
  const shoulder = {
    x: FRAME_SIZE.videoWidth * (0.5 + offsetX),
    y: FRAME_SIZE.videoHeight * 0.45,
  };
  const length = FRAME_SIZE.videoHeight * 0.2;
  const neckRadians = (neckAngle * Math.PI) / 180;
  const trunkRadians = (trunkAngle * Math.PI) / 180;
  landmarks[7] = {
    x: (shoulder.x + Math.sin(neckRadians) * length) / FRAME_SIZE.videoWidth,
    y: (shoulder.y - Math.cos(neckRadians) * length) / FRAME_SIZE.videoHeight,
    visibility: 1,
  };
  landmarks[11] = {
    x: shoulder.x / FRAME_SIZE.videoWidth,
    y: shoulder.y / FRAME_SIZE.videoHeight,
    visibility: 1,
  };
  landmarks[23] = {
    x: (shoulder.x - Math.sin(trunkRadians) * length) / FRAME_SIZE.videoWidth,
    y: (shoulder.y + Math.cos(trunkRadians) * length) / FRAME_SIZE.videoHeight,
    visibility: 1,
  };
  return landmarks;
}

describe("existing score bands", () => {
  it.each([
    [0, 100],
    [10, 100],
    [10.001, 85],
    [20, 85],
    [20.001, 70],
    [35, 70],
    [35.001, 50],
    [50, 50],
    [50.001, 30],
  ])("keeps neck boundary %s at score %s", (angle, expected) => {
    expect(scoreNeck(angle)).toBe(expected);
  });

  it.each([
    [0, 100],
    [5, 100],
    [5.001, 80],
    [12, 80],
    [12.001, 60],
    [20, 60],
    [20.001, 35],
  ])("keeps trunk boundary %s at score %s", (angle, expected) => {
    expect(scoreTrunk(angle)).toBe(expected);
  });
});

describe("PostureAnalyzer aspect-corrected input", () => {
  it.each([0, 5, 10, 12, 20, 35, 50])("reports a physical angle of %s degrees", (angle) => {
    const analyzer = new PostureAnalyzer();
    const result = analyzer.analyze(createLandmarks(angle), "left", FRAME_SIZE);
    expect(result.isTracking).toBe(true);
    expect(result.metrics?.neckAngleDegrees).toBeCloseTo(angle, 8);
  });

  it.each([0, 5, 10, 12, 20, 35, 50])(
    "reports a physical trunk angle of %s degrees",
    (angle) => {
      const analyzer = new PostureAnalyzer();
      const result = analyzer.analyze(createLandmarks(0, angle), "left", FRAME_SIZE);
      expect(result.isTracking).toBe(true);
      expect(result.metrics?.trunkLeanDegrees).toBeCloseTo(angle, 8);
    }
  );

  it("keeps invalid frames out of metricHistory", () => {
    const analyzer = new PostureAnalyzer();
    analyzer.analyze(createLandmarks(0), "left", FRAME_SIZE);
    const invalid = createLandmarks(0);
    invalid[7].x = Number.NaN;
    expect(analyzer.analyze(invalid, "left", FRAME_SIZE).isTracking).toBe(false);

    const result = analyzer.analyze(createLandmarks(19), "left", FRAME_SIZE);
    expect(result.metrics?.neckScore).toBeCloseTo((100 + 85) / 2, 8);
  });

  it("keeps invalid frames out of motionHistory and does not move previousCenter", () => {
    const analyzer = new PostureAnalyzer();
    analyzer.analyze(createLandmarks(0), "left", FRAME_SIZE);
    expect(
      analyzer.analyze(createLandmarks(0, 0, 0.2), "left", {
        videoWidth: 0,
        videoHeight: 720,
      }).isTracking
    ).toBe(false);

    const result = analyzer.analyze(createLandmarks(0), "left", FRAME_SIZE);
    expect(result.metrics?.stabilityAverage).toBe(0);
    expect(result.metrics?.stabilityScore).toBe(100);
  });

  it("does not accept a frame size fallback", () => {
    const analyzer = new PostureAnalyzer();
    expect(analyzer.analyze(createLandmarks(0), "left").isTracking).toBe(false);
  });
});
