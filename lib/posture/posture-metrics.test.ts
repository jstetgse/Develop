import { describe, expect, it } from "vitest";

import {
  calculateImagePostureMetrics,
  calculateWorldPostureMetrics,
  comparePostureMetrics,
  getAngleFromVertical3D,
  isValidFrameSize,
  type FrameSize,
  type PostureLandmark,
} from "@/lib/posture/posture-metrics";
import type { SelectedSide } from "@/lib/types";

const LANDMARK_INDEX = {
  left: { ear: 7, shoulder: 11, hip: 23 },
  right: { ear: 8, shoulder: 12, hip: 24 },
} as const;

function createImageLandmarks(
  neckAngle: number,
  trunkAngle: number,
  frameSize: FrameSize,
  side: SelectedSide = "left"
) {
  const landmarks = Array.from(
    { length: 33 },
    (): PostureLandmark => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 })
  );
  const indices = LANDMARK_INDEX[side];
  const shoulder = { x: frameSize.videoWidth * 0.5, y: frameSize.videoHeight * 0.45 };
  const length = Math.min(frameSize.videoWidth, frameSize.videoHeight) * 0.2;
  const neckRadians = (neckAngle * Math.PI) / 180;
  const trunkRadians = (trunkAngle * Math.PI) / 180;
  const ear = {
    x: shoulder.x + Math.sin(neckRadians) * length,
    y: shoulder.y - Math.cos(neckRadians) * length,
  };
  const hip = {
    x: shoulder.x - Math.sin(trunkRadians) * length,
    y: shoulder.y + Math.cos(trunkRadians) * length,
  };

  landmarks[indices.ear] = {
    x: ear.x / frameSize.videoWidth,
    y: ear.y / frameSize.videoHeight,
    visibility: 1,
  };
  landmarks[indices.shoulder] = {
    x: shoulder.x / frameSize.videoWidth,
    y: shoulder.y / frameSize.videoHeight,
    visibility: 1,
  };
  landmarks[indices.hip] = {
    x: hip.x / frameSize.videoWidth,
    y: hip.y / frameSize.videoHeight,
    visibility: 1,
  };
  return landmarks;
}

function createWorldLandmarks(side: SelectedSide = "left") {
  const landmarks = Array.from(
    { length: 33 },
    (): PostureLandmark => ({ x: 0, y: 0, z: 0, visibility: 1 })
  );
  const indices = LANDMARK_INDEX[side];
  landmarks[indices.ear] = { x: 0.1, y: -0.6, z: 0, visibility: 1 };
  landmarks[indices.shoulder] = { x: 0, y: -0.4, z: 0, visibility: 1 };
  landmarks[indices.hip] = { x: 0, y: 0, z: 0, visibility: 1 };
  return landmarks;
}

describe("aspect-corrected image posture metrics", () => {
  it.each([
    { videoWidth: 1600, videoHeight: 900 },
    { videoWidth: 1200, videoHeight: 900 },
    { videoWidth: 900, videoHeight: 900 },
    { videoWidth: 720, videoHeight: 1280 },
  ])("returns the same physical angles for $videoWidth x $videoHeight", (frameSize) => {
    const result = calculateImagePostureMetrics(
      createImageLandmarks(20, 12, frameSize),
      "left",
      frameSize
    );

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.value.absoluteNeckAngle).toBeCloseTo(20, 8);
      expect(result.value.trunkAngle).toBeCloseTo(12, 8);
      expect(result.value.relativeNeckAngle).toBeCloseTo(8, 8);
    }
  });

  it.each([
    { videoWidth: 0, videoHeight: 720 },
    { videoWidth: -1, videoHeight: 720 },
    { videoWidth: 1280, videoHeight: 0 },
    { videoWidth: Number.NaN, videoHeight: 720 },
    { videoWidth: 1280, videoHeight: Number.POSITIVE_INFINITY },
  ])("rejects invalid frame size %#", (frameSize) => {
    expect(isValidFrameSize(frameSize)).toBe(false);
    const result = calculateImagePostureMetrics(
      createImageLandmarks(10, 5, { videoWidth: 1280, videoHeight: 720 }),
      "left",
      frameSize
    );
    expect(result).toMatchObject({ valid: false, reason: "invalid-frame-size" });
  });

  it.each([
    ["x", Number.NaN],
    ["x", Number.POSITIVE_INFINITY],
    ["y", Number.NaN],
    ["y", Number.NEGATIVE_INFINITY],
  ] as const)("rejects invalid image %s coordinate %s", (axis, value) => {
    const frameSize = { videoWidth: 1280, videoHeight: 720 };
    const landmarks = createImageLandmarks(10, 5, frameSize);
    landmarks[7][axis] = value;
    expect(calculateImagePostureMetrics(landmarks, "left", frameSize)).toMatchObject({
      valid: false,
      reason: "invalid-landmark",
    });
  });

  it("rejects missing and zero-length required landmarks", () => {
    const frameSize = { videoWidth: 1280, videoHeight: 720 };
    expect(calculateImagePostureMetrics([], "left", frameSize)).toMatchObject({
      valid: false,
      reason: "missing-landmark",
    });

    const landmarks = createImageLandmarks(0, 0, frameSize);
    landmarks[7] = { ...landmarks[11] };
    expect(calculateImagePostureMetrics(landmarks, "left", frameSize)).toMatchObject({
      valid: false,
      reason: "zero-length-vector",
    });
  });

  it("returns equal absolute angles for left and right input", () => {
    const frameSize = { videoWidth: 1280, videoHeight: 720 };
    const left = calculateImagePostureMetrics(
      createImageLandmarks(35, 20, frameSize, "left"),
      "left",
      frameSize
    );
    const right = calculateImagePostureMetrics(
      createImageLandmarks(35, 20, frameSize, "right"),
      "right",
      frameSize
    );
    expect(left.valid && left.value).toEqual(right.valid && right.value);
  });
});

describe("world posture shadow metrics", () => {
  it("uses the unsigned world Y axis", () => {
    expect(getAngleFromVertical3D({ x: 0, y: -1, z: 0 })).toBeCloseTo(0, 8);
    expect(getAngleFromVertical3D({ x: 0, y: 1, z: 0 })).toBeCloseTo(0, 8);
  });

  it("does not mutate world landmarks and compares paired raw metrics", () => {
    const worldLandmarks = createWorldLandmarks();
    const before = structuredClone(worldLandmarks);
    const frameSize = { videoWidth: 1280, videoHeight: 720 };
    const image = calculateImagePostureMetrics(
      createImageLandmarks(20, 0, frameSize),
      "left",
      frameSize
    );
    const world = calculateWorldPostureMetrics(worldLandmarks, "left");
    const comparison = comparePostureMetrics(image, world);

    expect(world.valid).toBe(true);
    expect(comparison.difference.absoluteNeckAngle).not.toBeNull();
    expect(worldLandmarks).toEqual(before);
  });

  it("keeps valid image metrics isolated from missing or invalid world data", () => {
    const frameSize = { videoWidth: 1280, videoHeight: 720 };
    const image = calculateImagePostureMetrics(
      createImageLandmarks(20, 0, frameSize),
      "left",
      frameSize
    );
    const missingWorld = calculateWorldPostureMetrics(null, "left");
    const invalidWorldLandmarks = createWorldLandmarks();
    invalidWorldLandmarks[7].z = Number.NaN;
    const invalidWorld = calculateWorldPostureMetrics(invalidWorldLandmarks, "left");

    expect(image.valid).toBe(true);
    expect(missingWorld.valid).toBe(false);
    expect(invalidWorld.valid).toBe(false);
    expect(comparePostureMetrics(image, invalidWorld).difference).toEqual({
      absoluteNeckAngle: null,
      trunkAngle: null,
      relativeNeckAngle: null,
    });
  });
});
