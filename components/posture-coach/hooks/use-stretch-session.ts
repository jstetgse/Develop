import { useCallback, useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { STRETCH_CALIBRATION_MAX_MOVEMENT, STRETCH_CALIBRATION_MIN_SAMPLES, STRETCH_CALIBRATION_TARGET_MS, STRETCH_FEEDBACK_INTERVAL_MS, STRETCH_HOLD_TARGET_MS } from "@/components/posture-coach/constants";
import type { AppMode, Tab } from "@/components/posture-coach/types";
import type { Landmark } from "@/components/posture-coach/mediapipe/mediapipe-types";
import { averageStretchCalibration, createStretchCalibrationSample } from "@/lib/stretching/calibration-engine";
import { analyzeDynamicStretchStep, createDynamicStretchRuntimeState, isDynamicStretchStep } from "@/lib/stretching/dynamic-movement-engine";
import { analyzeStretchStep } from "@/lib/stretching/coaching-engine";
import { shouldPublishStretchFeedback, smoothStretchScore } from "@/lib/stretching/stretch-score";
import { getStretchById } from "@/lib/stretch-analysis";
import { saveStretchLog } from "@/lib/repositories/stretch-session-repository";
import type { StretchCoachingResult, StretchStep } from "@/lib/types";
import { useStretchProgress } from "@/components/posture-coach/hooks/use-stretch-progress";
import { useStretchCalibration } from "@/components/posture-coach/hooks/use-stretch-calibration";
import { useStretchCoaching } from "@/components/posture-coach/hooks/use-stretch-coaching";

function createInitialStretchState(): StretchCoachingResult { return { stretchId: null, stepIndex: 0, isPoseValid: false, poseScore: null, coachingMessage: "스트레칭을 선택해주세요.", holdSeconds: 0 }; }
function usesPersonalizedStretchAnalysis(id: string | null) { return id === "neck-stretch" || id === "shoulder-stretch" || id === "back-stretch"; }
function getStretchStepSpeechMessage(step: StretchStep, index: number) { return `${index + 1}단계입니다. ${step.title}. ${step.instruction}`; }

type Ref<T> = MutableRefObject<T>;
type Props = {
  isRunning: boolean;
  appMode: AppMode;
  uidRef: Ref<string | null>;
  sessionIdRef: Ref<string | null>;
  appModeRef: Ref<AppMode>;
  alertVisibleUntilRef: Ref<number>;
  postureAlertVisibleUntilRef: Ref<number>;
  badPostureStartedAtRef: Ref<number | null>;
  posturePausedStartedAtRef: Ref<number | null>;
  totalPosturePausedMsRef: Ref<number>;
  wasPostureRunningBeforeStretchRef: Ref<boolean>;
  setActiveTab: Dispatch<SetStateAction<Tab>>;
  setAppMode: Dispatch<SetStateAction<AppMode>>;
  setModeMessage: Dispatch<SetStateAction<string | null>>;
  setCameraText: Dispatch<SetStateAction<string>>;
  setCameraTone: Dispatch<SetStateAction<"good" | "warn" | "danger" | "neutral">>;
  setAlertMessage: Dispatch<SetStateAction<string | null>>;
  startApp: () => Promise<void>;
  playStretchBeep: (count: 1 | 2 | 3, eventKey: string, delayMs?: number) => void;
  speakStretchCue: (message: string, eventKey: string, delayMs?: number) => void;
  resetStretchAudioEvents: (userStarted?: boolean) => void;
  setStretchTtsUserStarted: (started: boolean) => void;
};

export function useStretchSession(props: Props) {
  const { isRunning, appMode, uidRef, sessionIdRef, appModeRef, alertVisibleUntilRef, postureAlertVisibleUntilRef, badPostureStartedAtRef, posturePausedStartedAtRef, totalPosturePausedMsRef, wasPostureRunningBeforeStretchRef, setActiveTab, setAppMode, setModeMessage, setCameraText, setCameraTone, setAlertMessage, startApp, playStretchBeep, speakStretchCue, resetStretchAudioEvents, setStretchTtsUserStarted } = props;
  const {
    activeStretchId, setActiveStretchId, showAllStretchOptions, setShowAllStretchOptions,
    isStretchDropdownOpen, setIsStretchDropdownOpen, activeStretchStepIndex, setActiveStretchStepIndex,
    completedStretchSteps, setCompletedStretchSteps, isStretchCompleteModalOpen, setIsStretchCompleteModalOpen,
    activeStretchIdRef, activeStretchStepIndexRef, completedStretchStepsRef,
  } = useStretchProgress();
  const {
    stretchCalibrationStatus, setStretchCalibrationStatus, stretchCalibrationMessage, setStretchCalibrationMessage,
    stretchCalibrationRef, stretchCalibrationStatusRef, stretchCalibrationStartedAtRef, stretchCalibrationSamplesRef,
  } = useStretchCalibration();
  const {
    stretchCoaching, setStretchCoaching, lastStretchFeedbackUpdateAtRef, stretchHoldStartedAtRef,
    smoothedStretchMatchRef, stretchCompletionMatchSamplesRef, latestStretchCoachingRef, dynamicStretchRuntimeRef,
  } = useStretchCoaching(createInitialStretchState);
  const isStretchingMode = appMode === "stretching";

  const resetDynamicStretchRuntime = useCallback(() => {
    dynamicStretchRuntimeRef.current = createDynamicStretchRuntimeState();
  }, []);
  const setIsStretchingMode = useCallback((nextIsStretching: boolean) => {
    if (nextIsStretching) {
      appModeRef.current = "stretching";
      setAppMode("stretching");
      return;
    }

    if (wasPostureRunningBeforeStretchRef.current) {
      if (posturePausedStartedAtRef.current !== null) {
        totalPosturePausedMsRef.current += Date.now() - posturePausedStartedAtRef.current;
        posturePausedStartedAtRef.current = null;
      }
      wasPostureRunningBeforeStretchRef.current = false;
      appModeRef.current = "posture";
      setAppMode("posture");
      setActiveTab("analysis");
      setModeMessage("스트레칭이 완료되었습니다. 자세 분석을 다시 시작합니다.");
      setCameraText("카메라 분석 중");
      setCameraTone("good");
      return;
    }

    appModeRef.current = "paused";
    setAppMode("paused");
  }, []);
  const resetStretchCalibration = useCallback((message = "스트레칭 분석을 시작하면 기준 자세를 측정합니다.") => {
    dynamicStretchRuntimeRef.current = createDynamicStretchRuntimeState();
    stretchCalibrationRef.current = null;
    stretchCalibrationStatusRef.current = "idle";
    stretchCalibrationStartedAtRef.current = null;
    stretchCalibrationSamplesRef.current = [];
    setStretchCalibrationStatus("idle");
    setStretchCalibrationMessage(message);
  }, []);

  const beginStretchCalibration = useCallback(() => {
    resetDynamicStretchRuntime();
    if (!usesPersonalizedStretchAnalysis(activeStretchIdRef.current)) {
      stretchCalibrationRef.current = null;
      stretchCalibrationStatusRef.current = "ready";
      stretchCalibrationStartedAtRef.current = null;
      stretchCalibrationSamplesRef.current = [];
      setStretchCalibrationStatus("ready");
      setStretchCalibrationMessage("기존 기준으로 동작 정확도를 분석합니다.");
      return;
    }

    stretchCalibrationRef.current = null;
    stretchCalibrationStatusRef.current = "calibrating";
    stretchCalibrationStartedAtRef.current = Date.now();
    stretchCalibrationSamplesRef.current = [];
    stretchHoldStartedAtRef.current = null;
    smoothedStretchMatchRef.current = null;
    setStretchCalibrationStatus("calibrating");
    setStretchCalibrationMessage("기준 자세 측정 중...");
    latestStretchCoachingRef.current = {
      stretchId: activeStretchIdRef.current,
      stepIndex: activeStretchStepIndexRef.current,
      isPoseValid: false,
      poseScore: null,
      matchPercentage: null,
      incorrectParts: [],
      correctionMessages: [],
      coachingMessage: "기준 자세 측정 중...",
      holdSeconds: 0,
    };
    setStretchCoaching(latestStretchCoachingRef.current);
  }, [resetDynamicStretchRuntime]);

  const processStretchCalibration = useCallback((landmarks?: Landmark[] | null) => {
    if (stretchCalibrationStatusRef.current !== "calibrating") {
      return false;
    }

    const sample = createStretchCalibrationSample(landmarks);
    if (!sample) {
      stretchHoldStartedAtRef.current = null;
      setStretchCalibrationMessage("기준 자세를 다시 측정 중입니다. 잠시만 자세를 유지해주세요.");
      latestStretchCoachingRef.current = {
        stretchId: activeStretchIdRef.current,
        stepIndex: activeStretchStepIndexRef.current,
        isPoseValid: false,
        poseScore: null,
        matchPercentage: null,
        incorrectParts: [],
        correctionMessages: ["몸이 잘 보이도록 카메라 위치를 조정해주세요."],
        coachingMessage: "몸이 잘 보이도록 카메라 위치를 조정해주세요.",
        holdSeconds: 0,
      };
      setStretchCoaching(latestStretchCoachingRef.current);
      setStretchCalibrationMessage("몸이 잘 보이도록 카메라 위치를 조정해주세요.");
      return true;
    }

    stretchCalibrationSamplesRef.current.push(sample);
    const samples = stretchCalibrationSamplesRef.current;
    const first = samples[0]?.bodyCenter;
    const maxMovement = first
      ? samples.reduce((max, current) => Math.max(max, Math.hypot(current.bodyCenter.x - first.x, current.bodyCenter.y - first.y)), 0)
      : 0;

    if (maxMovement > STRETCH_CALIBRATION_MAX_MOVEMENT) {
      stretchCalibrationRef.current = null;
      stretchCalibrationStatusRef.current = "calibrating";
      stretchCalibrationStartedAtRef.current = Date.now();
      stretchCalibrationSamplesRef.current = [];
      stretchHoldStartedAtRef.current = null;
      smoothedStretchMatchRef.current = null;
      setStretchCalibrationStatus("calibrating");
      setStretchCalibrationMessage("기준 자세를 다시 측정 중입니다. 잠시만 자세를 유지해주세요.");
      latestStretchCoachingRef.current = {
        stretchId: activeStretchIdRef.current,
        stepIndex: activeStretchStepIndexRef.current,
        isPoseValid: false,
        poseScore: null,
        matchPercentage: null,
        incorrectParts: [],
        correctionMessages: ["기준 자세를 유지해주세요."],
        coachingMessage: "기준 자세를 유지해주세요.",
        holdSeconds: 0,
      };
      setStretchCoaching(latestStretchCoachingRef.current);
      return true;
    }

    const elapsed = Date.now() - (stretchCalibrationStartedAtRef.current ?? Date.now());
    const hasEnoughSamples =
      samples.length >= STRETCH_CALIBRATION_MIN_SAMPLES ||
      (elapsed >= STRETCH_CALIBRATION_TARGET_MS * 2 && samples.length >= 4);
    if (elapsed >= STRETCH_CALIBRATION_TARGET_MS && hasEnoughSamples) {
      const calibration = averageStretchCalibration(samples);
      if (calibration) {
        stretchCalibrationRef.current = calibration;
        stretchCalibrationStatusRef.current = "ready";
        stretchCalibrationStartedAtRef.current = null;
        setStretchCalibrationStatus("ready");
        setStretchCalibrationMessage("개인 맞춤 가이드가 준비되었습니다.");
        latestStretchCoachingRef.current = {
          stretchId: activeStretchIdRef.current,
          stepIndex: activeStretchStepIndexRef.current,
          isPoseValid: false,
          poseScore: null,
          matchPercentage: null,
          incorrectParts: [],
          correctionMessages: [],
          coachingMessage: "개인 맞춤 가이드가 준비되었습니다.",
          holdSeconds: 0,
        };
        setStretchCoaching(latestStretchCoachingRef.current);
      }
    }

    return true;
  }, []);

  const updateStretchCoaching = useCallback((nextResult: StretchCoachingResult, force = false) => {
    const now = Date.now();
    let stableResult = nextResult;
    const activeStepIndex = activeStretchStepIndexRef.current;
    if (nextResult.isDynamic) {
      const rawScore = nextResult.matchPercentage ?? nextResult.poseScore;
      const smoothedScore =
        typeof rawScore === "number"
          ? Math.round(
              smoothedStretchMatchRef.current === null
                ? rawScore
                : smoothedStretchMatchRef.current * 0.65 + rawScore * 0.35
            )
          : null;
      smoothedStretchMatchRef.current = smoothedScore;
      stableResult = {
        ...nextResult,
        poseScore: smoothedScore,
        matchPercentage: smoothedScore,
        isPoseValid: typeof smoothedScore === "number" && smoothedScore >= 70,
        holdSeconds: 0,
      };

      if (typeof smoothedScore === "number") {
        stretchCompletionMatchSamplesRef.current = [...stretchCompletionMatchSamplesRef.current.slice(-239), smoothedScore];
      }

      if (stableResult.isStepCompleted && !completedStretchStepsRef.current.has(activeStepIndex)) {
        const nextCompleted = new Set(completedStretchStepsRef.current);
        nextCompleted.add(activeStepIndex);
        completedStretchStepsRef.current = nextCompleted;
        setCompletedStretchSteps([...nextCompleted].sort((left, right) => left - right));

        const uid = uidRef.current;
        const sessionId = sessionIdRef.current;
        const stretchId = activeStretchIdRef.current;
        const stretch = getStretchById(stretchId);
        if (uid && sessionId && stretchId) {
          void saveStretchLog(uid, sessionId, {
            createdAt: new Date().toISOString(),
            userId: uid,
            stretchId,
            stretchName: stretch?.name ?? stretchId,
            stepIndex: activeStepIndex,
            action: "dynamic-step-complete",
            completedAt: new Date().toISOString(),
            poseScore: stableResult.poseScore,
            matchPercentage: stableResult.matchPercentage,
            repeatCount: stableResult.repeatCount,
            feedbackSummary: stableResult.coachingMessage,
          });
        }

        if (stretch) {
          const isLastStep = activeStepIndex >= stretch.steps.length - 1;
          if (isLastStep) {
            playStretchBeep(3, `stretch-complete:${stretch.id}`);
            speakStretchCue(
              `${activeStepIndex + 1}단계가 완료되었습니다. 스트레칭이 완료되었습니다. 수고하셨습니다.`,
              `stretch-complete:${stretch.id}`
            );
            setIsStretchingMode(false);
            setIsStretchCompleteModalOpen(true);
            stableResult = {
              ...stableResult,
              isStepCompleted: true,
              coachingMessage: "스트레칭 완료!",
            };
          } else {
            const nextStepIndex = activeStepIndex + 1;
            const nextStep = stretch.steps[nextStepIndex];
            playStretchBeep(2, `step-complete:${stretch.id}:${activeStepIndex}`);
            playStretchBeep(1, `step-start:${stretch.id}:${nextStepIndex}`, 520);
            speakStretchCue(
              `${activeStepIndex + 1}단계가 완료되었습니다. 다음 단계를 준비해주세요.`,
              `step-complete:${stretch.id}:${activeStepIndex}`
            );
            if (nextStep) {
              speakStretchCue(
                getStretchStepSpeechMessage(nextStep, nextStepIndex),
                `step-start:${stretch.id}:${nextStepIndex}`,
                2_400
              );
            }
            activeStretchStepIndexRef.current = nextStepIndex;
            setActiveStretchStepIndex(nextStepIndex);
            resetDynamicStretchRuntime();
            stretchHoldStartedAtRef.current = null;
            smoothedStretchMatchRef.current = null;
            lastStretchFeedbackUpdateAtRef.current = 0;
            stableResult = {
              stretchId: stretch.id,
              stepIndex: nextStepIndex,
              isPoseValid: false,
              poseScore: null,
              coachingMessage: "다음 단계로 이동했습니다. 안내에 맞춰 자세를 준비해주세요.",
              holdSeconds: 0,
            };
          }
        }
      }

      const elapsed = now - lastStretchFeedbackUpdateAtRef.current;
      if (!force && elapsed < STRETCH_FEEDBACK_INTERVAL_MS) {
        return;
      }

      latestStretchCoachingRef.current = stableResult;
      lastStretchFeedbackUpdateAtRef.current = now;
      setStretchCoaching(stableResult);
      return;
    }

    const rawMatch = nextResult.matchPercentage ?? nextResult.poseScore;
    const smoothedMatch =
      typeof rawMatch === "number" ? smoothStretchScore(smoothedStretchMatchRef.current, rawMatch, 0.75) : null;

    smoothedStretchMatchRef.current = smoothedMatch;
    stableResult = {
      ...nextResult,
      poseScore: smoothedMatch,
      matchPercentage: smoothedMatch,
      isPoseValid: typeof smoothedMatch === "number" && smoothedMatch >= 85,
      coachingMessage:
        smoothedMatch === null
          ? "카메라에 몸이 잘 보이도록 위치를 조정해주세요."
          : smoothedMatch >= 85
            ? "좋아요! 자세를 유지하세요."
            : smoothedMatch >= 70
              ? nextResult.correctionMessages?.[0] ?? "거의 맞았습니다. 조금만 조정해주세요."
              : nextResult.correctionMessages?.[0] ?? "가이드 틀에 몸을 맞춰주세요.",
    };

    if (nextResult.coachingMessage === "자세가 감지되지 않습니다.") {
      stretchHoldStartedAtRef.current = null;
      stableResult = { ...stableResult, holdSeconds: 0 };
    } else if (stableResult.isPoseValid) {
      const isStartingHold = stretchHoldStartedAtRef.current === null;
      stretchHoldStartedAtRef.current ??= now;
      if (isStartingHold) {
        speakStretchCue("좋아요. 그대로 유지하세요.", `hold-start:${activeStretchIdRef.current}:${activeStepIndex}`);
      }
      if (typeof smoothedMatch === "number") {
        stretchCompletionMatchSamplesRef.current = [...stretchCompletionMatchSamplesRef.current.slice(-239), smoothedMatch];
      }
      const holdSeconds = Math.floor((now - stretchHoldStartedAtRef.current) / 1000);
      const isCompleted = now - stretchHoldStartedAtRef.current >= STRETCH_HOLD_TARGET_MS;
      stableResult = {
        ...stableResult,
        holdSeconds: Math.min(holdSeconds, STRETCH_HOLD_TARGET_MS / 1000),
        isStepCompleted: isCompleted,
        coachingMessage:
          isCompleted
            ? "현재 단계가 완료되었습니다. 다음 단계로 이동하세요."
            : stableResult.coachingMessage,
      };

      if (isCompleted && !completedStretchStepsRef.current.has(activeStepIndex)) {
        const nextCompleted = new Set(completedStretchStepsRef.current);
        nextCompleted.add(activeStepIndex);
        completedStretchStepsRef.current = nextCompleted;
        setCompletedStretchSteps([...nextCompleted].sort((left, right) => left - right));

        const uid = uidRef.current;
        const sessionId = sessionIdRef.current;
        const stretchId = activeStretchIdRef.current;
        const stretch = getStretchById(stretchId);
        if (uid && sessionId && stretchId) {
          void saveStretchLog(uid, sessionId, {
            createdAt: new Date().toISOString(),
            userId: uid,
            stretchId,
            stretchName: stretch?.name ?? stretchId,
            stepIndex: activeStepIndex,
            action: "step-complete",
            completedAt: new Date().toISOString(),
            poseScore: stableResult.poseScore,
            matchPercentage: stableResult.matchPercentage,
            incorrectParts: stableResult.incorrectParts ?? [],
            coachingMessage: stableResult.coachingMessage,
            feedbackSummary: stableResult.coachingMessage,
          });
        }

        if (stretch) {
          const isLastStep = activeStepIndex >= stretch.steps.length - 1;
          if (isLastStep) {
            const matchSamples = stretchCompletionMatchSamplesRef.current;
            const averageMatchPercentage = matchSamples.length
              ? Math.round(matchSamples.reduce((sum, score) => sum + score, 0) / matchSamples.length)
              : stableResult.matchPercentage;
            playStretchBeep(3, `stretch-complete:${stretch.id}`);
            speakStretchCue(
              `${activeStepIndex + 1}단계가 완료되었습니다. 스트레칭이 완료되었습니다. 수고하셨습니다.`,
              `stretch-complete:${stretch.id}`
            );
            setIsStretchingMode(false);
            setIsStretchCompleteModalOpen(true);
            stableResult = {
              ...stableResult,
              holdSeconds: STRETCH_HOLD_TARGET_MS / 1000,
              isStepCompleted: true,
              coachingMessage: "스트레칭 완료!",
            };
            stableResult.coachingMessage = "스트레칭 완료!";
            if (uid && sessionId && stretchId) {
              const completedAt = new Date().toISOString();
              void saveStretchLog(uid, sessionId, {
                createdAt: completedAt,
                userId: uid,
                stretchId,
                stretchName: stretch.name,
                action: "complete",
                completedAt,
                sessionId,
                averageMatchPercentage,
                totalSteps: stretch.steps.length,
                completedSteps: stretch.steps.length,
                feedbackSummary: "스트레칭 완료!",
              });
            }
          } else {
            const nextStepIndex = activeStepIndex + 1;
            const nextStep = stretch.steps[nextStepIndex];
            playStretchBeep(2, `step-complete:${stretch.id}:${activeStepIndex}`);
            playStretchBeep(1, `step-start:${stretch.id}:${nextStepIndex}`, 520);
            speakStretchCue(
              `${activeStepIndex + 1}단계가 완료되었습니다. 다음 단계를 준비해주세요.`,
              `step-complete:${stretch.id}:${activeStepIndex}`
            );
            if (nextStep) {
              speakStretchCue(
                getStretchStepSpeechMessage(nextStep, nextStepIndex),
                `step-start:${stretch.id}:${nextStepIndex}`,
                2_400
              );
            }
            activeStretchStepIndexRef.current = nextStepIndex;
            setActiveStretchStepIndex(nextStepIndex);
            resetDynamicStretchRuntime();
            stretchHoldStartedAtRef.current = null;
            smoothedStretchMatchRef.current = null;
            lastStretchFeedbackUpdateAtRef.current = 0;
            stableResult = {
              stretchId: stretch.id,
              stepIndex: nextStepIndex,
              isPoseValid: false,
              poseScore: null,
              coachingMessage: "다음 단계로 자동 이동했습니다. 안내에 맞춰 자세를 준비해주세요.",
              holdSeconds: 0,
            };
          }
        }
      }
    } else {
      stretchHoldStartedAtRef.current = null;
      stableResult = { ...nextResult, holdSeconds: 0 };
    }

    if (!shouldPublishStretchFeedback(now, lastStretchFeedbackUpdateAtRef.current, STRETCH_FEEDBACK_INTERVAL_MS, force)) {
      return;
    }

    latestStretchCoachingRef.current = stableResult;
    lastStretchFeedbackUpdateAtRef.current = now;
    setStretchCoaching(stableResult);
  }, [playStretchBeep, resetDynamicStretchRuntime, setIsStretchingMode, speakStretchCue]);


  const handleStretchSelection = useCallback((stretchId: string) => {
    setActiveStretchId(stretchId);
    setShowAllStretchOptions(false);
    setActiveStretchStepIndex(0);
    setCompletedStretchSteps([]);
    activeStretchIdRef.current = stretchId;
    activeStretchStepIndexRef.current = 0;
    completedStretchStepsRef.current = new Set();
    resetStretchAudioEvents(false);
    if (appModeRef.current === "stretching") {
      setIsStretchingMode(false);
    }
    stretchHoldStartedAtRef.current = null;
    smoothedStretchMatchRef.current = null;
    stretchCompletionMatchSamplesRef.current = [];
    lastStretchFeedbackUpdateAtRef.current = 0;
    resetStretchCalibration();
    latestStretchCoachingRef.current = {
      stretchId,
      stepIndex: 0,
      isPoseValid: false,
      poseScore: null,
      coachingMessage: "스트레칭 분석 시작을 누르면 실시간 피드백을 제공합니다.",
      holdSeconds: 0,
    };
    setStretchCoaching(latestStretchCoachingRef.current);
  }, [resetStretchAudioEvents, resetStretchCalibration]);

  const handleStartStretchingMode = useCallback(async () => {
    if (!activeStretchIdRef.current) {
      return;
    }

    const wasPostureRunning = isRunning && appModeRef.current === "posture";
    wasPostureRunningBeforeStretchRef.current = wasPostureRunning;
    posturePausedStartedAtRef.current = wasPostureRunning ? Date.now() : null;
    badPostureStartedAtRef.current = null;
    alertVisibleUntilRef.current = 0;
    postureAlertVisibleUntilRef.current = 0;
    setAlertMessage(null);
    setActiveTab("stretching");
    setModeMessage("스트레칭 모드로 전환합니다. 자세 분석이 일시중지됩니다.");
    setIsStretchingMode(true);
    resetStretchAudioEvents(true);
    playStretchBeep(1, `step-start:${activeStretchIdRef.current}:${activeStretchStepIndexRef.current}`);
    const activeStretch = getStretchById(activeStretchIdRef.current);
    const activeStep = activeStretch?.steps[activeStretchStepIndexRef.current];
    if (activeStretch) {
      speakStretchCue(
        `${activeStretch.name}을 시작합니다. 무리하지 말고 편한 범위까지만 움직여주세요.`,
        `stretch-start:${activeStretch.id}`
      );
    }
    if (activeStretch && activeStep) {
      speakStretchCue(
        getStretchStepSpeechMessage(activeStep, activeStretchStepIndexRef.current),
        `step-start:${activeStretch.id}:${activeStretchStepIndexRef.current}`,
        2_400
      );
    }
    beginStretchCalibration();

    if (!isRunning) {
      await startApp();
    }

    const uid = uidRef.current;
    const sessionId = sessionIdRef.current;
    if (uid && sessionId) {
      const payload: Record<string, unknown> = {
        createdAt: new Date().toISOString(),
        stretchId: activeStretchIdRef.current,
        stepIndex: activeStretchStepIndexRef.current,
        action: "start",
      };
      void saveStretchLog(uid, sessionId, payload);
    }
  }, [beginStretchCalibration, isRunning, playStretchBeep, resetStretchAudioEvents, speakStretchCue, startApp]);

  const handleStopStretchingMode = useCallback(async () => {
    setIsStretchingMode(false);
    setStretchTtsUserStarted(false);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    stretchHoldStartedAtRef.current = null;
    smoothedStretchMatchRef.current = null;
    lastStretchFeedbackUpdateAtRef.current = 0;
    resetStretchCalibration();
    const uid = uidRef.current;
    const sessionId = sessionIdRef.current;
    if (uid && sessionId && activeStretchIdRef.current) {
      await saveStretchLog(uid, sessionId, {
        createdAt: new Date().toISOString(),
        stretchId: activeStretchIdRef.current,
        stepIndex: activeStretchStepIndexRef.current,
        action: "stop",
        poseScore: latestStretchCoachingRef.current.poseScore,
        coachingMessage: latestStretchCoachingRef.current.coachingMessage,
      });
    }
    latestStretchCoachingRef.current = activeStretchIdRef.current
      ? {
          stretchId: activeStretchIdRef.current,
          stepIndex: activeStretchStepIndexRef.current,
          isPoseValid: false,
          poseScore: null,
          coachingMessage: "스트레칭 분석 시작을 누르면 실시간 피드백을 제공합니다.",
          holdSeconds: 0,
        }
      : createInitialStretchState();
    setStretchCoaching(latestStretchCoachingRef.current);
  }, [resetStretchCalibration, setStretchTtsUserStarted]);

  const handleNextStretchStep = useCallback(() => {
    const stretch = getStretchById(activeStretchIdRef.current);
    if (!stretch) {
      return;
    }

    const currentStepIndex = activeStretchStepIndexRef.current;
    const nextCompleted = new Set(completedStretchStepsRef.current);
    nextCompleted.add(currentStepIndex);
    completedStretchStepsRef.current = nextCompleted;
    setCompletedStretchSteps([...nextCompleted].sort((left, right) => left - right));

    const nextStepIndex = Math.min(currentStepIndex + 1, stretch.steps.length - 1);
    activeStretchStepIndexRef.current = nextStepIndex;
    setActiveStretchStepIndex(nextStepIndex);
    resetDynamicStretchRuntime();
    stretchHoldStartedAtRef.current = null;
    smoothedStretchMatchRef.current = null;
    lastStretchFeedbackUpdateAtRef.current = 0;

    const isComplete = nextCompleted.size >= stretch.steps.length && currentStepIndex >= stretch.steps.length - 1;
    latestStretchCoachingRef.current = {
      stretchId: stretch.id,
      stepIndex: nextStepIndex,
      isPoseValid: false,
      poseScore: null,
      matchPercentage: null,
      incorrectParts: [],
      correctionMessages: [],
      coachingMessage: isComplete
        ? "스트레칭 완료!"
        : "다음 단계 자세를 준비한 뒤 안내에 맞춰 움직여주세요.",
      holdSeconds: 0,
      isStepCompleted: isComplete,
    };
    setStretchCoaching(latestStretchCoachingRef.current);

    const uid = uidRef.current;
    const sessionId = sessionIdRef.current;
    if (uid && sessionId) {
      const completedAt = new Date().toISOString();
      const matchSamples = stretchCompletionMatchSamplesRef.current;
      const averageMatchPercentage = matchSamples.length
        ? Math.round(matchSamples.reduce((sum, score) => sum + score, 0) / matchSamples.length)
        : latestStretchCoachingRef.current.matchPercentage ?? latestStretchCoachingRef.current.poseScore ?? null;
      const payload: Record<string, unknown> = {
        createdAt: completedAt,
        sessionId,
        stretchId: stretch.id,
        stretchName: stretch.name,
        stepIndex: currentStepIndex,
        action: isComplete ? "complete" : "manual-next",
        completedSteps: nextCompleted.size,
        totalSteps: stretch.steps.length,
        feedbackSummary: isComplete ? "스트레칭 완료!" : latestStretchCoachingRef.current.coachingMessage,
      };
      if (isComplete) {
        payload.completedAt = completedAt;
        payload.averageMatchPercentage = averageMatchPercentage;
      }
      void saveStretchLog(uid, sessionId, payload);
    }

    if (isComplete) {
      playStretchBeep(3, `stretch-complete:${stretch.id}`);
      speakStretchCue(
        `${currentStepIndex + 1}단계가 완료되었습니다. 스트레칭이 완료되었습니다. 수고하셨습니다.`,
        `stretch-complete:${stretch.id}`
      );
      setIsStretchingMode(false);
      setIsStretchCompleteModalOpen(true);
      resetStretchCalibration();
    } else if (appModeRef.current === "stretching") {
      playStretchBeep(2, `step-complete:${stretch.id}:${currentStepIndex}`);
      playStretchBeep(1, `step-start:${stretch.id}:${nextStepIndex}`, 520);
      speakStretchCue(
        `${currentStepIndex + 1}단계가 완료되었습니다. 다음 단계를 준비해주세요.`,
        `step-complete:${stretch.id}:${currentStepIndex}`
      );
      speakStretchCue(
        getStretchStepSpeechMessage(stretch.steps[nextStepIndex], nextStepIndex),
        `step-start:${stretch.id}:${nextStepIndex}`,
        2_400
      );
    }
  }, [playStretchBeep, resetDynamicStretchRuntime, resetStretchCalibration, setIsStretchingMode, speakStretchCue]);

  const handleSelectStretchStep = useCallback(
    (stepIndex: number) => {
      const stretch = getStretchById(activeStretchIdRef.current);
      if (!stretch || stepIndex < 0 || stepIndex >= stretch.steps.length) {
        return;
      }

      activeStretchStepIndexRef.current = stepIndex;
      setActiveStretchStepIndex(stepIndex);
      if (appModeRef.current === "stretching") {
        playStretchBeep(1, `step-start:${stretch.id}:${stepIndex}`);
      }
      resetDynamicStretchRuntime();
      stretchHoldStartedAtRef.current = null;
      lastStretchFeedbackUpdateAtRef.current = 0;
      latestStretchCoachingRef.current = {
        stretchId: stretch.id,
        stepIndex,
        isPoseValid: false,
        poseScore: null,
        coachingMessage: "선택한 단계 자세를 준비한 뒤 안내에 맞춰 움직여주세요.",
        holdSeconds: 0,
      };
      setStretchCoaching(latestStretchCoachingRef.current);
    },
    [playStretchBeep, resetDynamicStretchRuntime]
  );

  const handleClearStretchSelection = useCallback(() => {
    if (isStretchingMode) {
      void handleStopStretchingMode();
    }
    setActiveStretchId(null);
    setActiveStretchStepIndex(0);
    setCompletedStretchSteps([]);
    activeStretchIdRef.current = null;
    activeStretchStepIndexRef.current = 0;
    completedStretchStepsRef.current = new Set();
    resetStretchAudioEvents(false);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    stretchHoldStartedAtRef.current = null;
    smoothedStretchMatchRef.current = null;
    stretchCompletionMatchSamplesRef.current = [];
    lastStretchFeedbackUpdateAtRef.current = 0;
    resetStretchCalibration();
    latestStretchCoachingRef.current = createInitialStretchState();
    setStretchCoaching(latestStretchCoachingRef.current);
  }, [handleStopStretchingMode, isStretchingMode, resetStretchAudioEvents, resetStretchCalibration]);

  const handleCloseStretchCompleteModal = useCallback(() => {
    setIsStretchCompleteModalOpen(false);
  }, []);

  const handleReturnToAnalysisAfterStretch = useCallback(() => {
    setIsStretchCompleteModalOpen(false);
    if (isStretchingMode) {
      void handleStopStretchingMode();
    }
    setActiveTab("analysis");
  }, [handleStopStretchingMode, isStretchingMode]);

  const handleDoAnotherStretch = useCallback(() => {
    setIsStretchCompleteModalOpen(false);
    handleClearStretchSelection();
  }, [handleClearStretchSelection]);


  const selectedStretch = useMemo(() => getStretchById(activeStretchId), [activeStretchId]);
  const activeStretchStep = selectedStretch?.steps[activeStretchStepIndex] ?? null;
  const nextStretchStep = selectedStretch?.steps[activeStretchStepIndex + 1] ?? null;
  const isSelectedStretchComplete = Boolean(selectedStretch && completedStretchSteps.length >= selectedStretch.steps.length);
  const stretchAccuracyScore = stretchCoaching.matchPercentage ?? stretchCoaching.poseScore;

  const processFrame = useCallback((landmarks?: Landmark[] | null) => {
    if (processStretchCalibration(landmarks)) return;
    if (stretchCalibrationStatusRef.current !== "ready" || !activeStretchIdRef.current) { stretchHoldStartedAtRef.current = null; return; }
    const step = getStretchById(activeStretchIdRef.current)?.steps[activeStretchStepIndexRef.current];
    updateStretchCoaching(isDynamicStretchStep(step) ? analyzeDynamicStretchStep(activeStretchIdRef.current, activeStretchStepIndexRef.current, landmarks ?? null, dynamicStretchRuntimeRef.current, Date.now(), stretchCalibrationRef.current) : analyzeStretchStep(activeStretchIdRef.current, activeStretchStepIndexRef.current, landmarks ?? null, stretchCalibrationRef.current));
  }, [processStretchCalibration, updateStretchCoaching]);
  const resetForAppStop = useCallback(() => {
    lastStretchFeedbackUpdateAtRef.current = 0; stretchHoldStartedAtRef.current = null; smoothedStretchMatchRef.current = null;
    latestStretchCoachingRef.current = activeStretchIdRef.current ? { stretchId: activeStretchIdRef.current, stepIndex: activeStretchStepIndexRef.current, isPoseValid: false, poseScore: null, coachingMessage: "카메라를 준비하고 있습니다.", holdSeconds: 0 } : createInitialStretchState();
    setStretchCoaching(latestStretchCoachingRef.current); resetStretchCalibration();
  }, [resetStretchCalibration]);
  const resetForAppStart = useCallback(() => {
    smoothedStretchMatchRef.current = null; stretchCompletionMatchSamplesRef.current = []; lastStretchFeedbackUpdateAtRef.current = 0; stretchHoldStartedAtRef.current = null;
    latestStretchCoachingRef.current = activeStretchIdRef.current ? { stretchId: activeStretchIdRef.current, stepIndex: activeStretchStepIndexRef.current, isPoseValid: false, poseScore: null, coachingMessage: "현재 단계 자세를 준비한 뒤 안내에 맞춰 움직여주세요.", holdSeconds: 0 } : createInitialStretchState();
    setStretchCoaching(latestStretchCoachingRef.current);
  }, []);
  return { activeStretchId, showAllStretchOptions, isStretchDropdownOpen, activeStretchStepIndex, completedStretchSteps, isStretchCompleteModalOpen, stretchCalibrationStatus, stretchCalibrationMessage, stretchCoaching, selectedStretch, activeStretchStep, nextStretchStep, isSelectedStretchComplete, stretchAccuracyScore, isStretchingMode, activeStretchIdRef, activeStretchStepIndexRef, latestStretchCoachingRef, stretchCalibrationRef, handleStretchSelection, handleStartStretchingMode, handleStopStretchingMode, handleNextStretchStep, handleSelectStretchStep, handleClearStretchSelection, handleCloseStretchCompleteModal, handleReturnToAnalysisAfterStretch, handleDoAnotherStretch, setShowAllStretchOptions, setIsStretchDropdownOpen, setIsStretchingMode, processFrame, resetForAppStart, resetForAppStop };
}
