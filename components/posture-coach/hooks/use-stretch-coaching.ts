import { useRef, useState } from "react";

import { createDynamicStretchRuntimeState, type DynamicStretchRuntimeState } from "@/lib/stretching/dynamic-movement-engine";
import type { StretchCoachingResult } from "@/lib/types";

export function useStretchCoaching(createInitialState: () => StretchCoachingResult) {
  const [stretchCoaching, setStretchCoaching] = useState<StretchCoachingResult>(createInitialState);
  const lastStretchFeedbackUpdateAtRef = useRef(0);
  const stretchHoldStartedAtRef = useRef<number | null>(null);
  const smoothedStretchMatchRef = useRef<number | null>(null);
  const stretchCompletionMatchSamplesRef = useRef<number[]>([]);
  const latestStretchCoachingRef = useRef<StretchCoachingResult>(createInitialState());
  const dynamicStretchRuntimeRef = useRef<DynamicStretchRuntimeState>(createDynamicStretchRuntimeState());

  return {
    stretchCoaching, setStretchCoaching, lastStretchFeedbackUpdateAtRef, stretchHoldStartedAtRef,
    smoothedStretchMatchRef, stretchCompletionMatchSamplesRef, latestStretchCoachingRef, dynamicStretchRuntimeRef,
  };
}
