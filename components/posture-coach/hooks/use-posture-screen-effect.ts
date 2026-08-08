import { useCallback, useEffect, useRef, useState } from "react";

import {
  createPostureScreenEffectState,
  shouldPlayPostureEffectSound,
  updatePostureScreenEffectState,
  type PostureScreenEffectLevel,
} from "@/lib/posture/posture-screen-effect";

type AudioWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

type Props = {
  isRunning: boolean;
  isTracking: boolean;
  neckAngleDegrees: number | null;
  soundEnabled: boolean;
};

function createNoiseBuffer(audioContext: AudioContext, durationSeconds: number) {
  const frameCount = Math.max(1, Math.floor(audioContext.sampleRate * durationSeconds));
  const buffer = audioContext.createBuffer(1, frameCount, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < frameCount; index += 1) {
    const fade = 1 - index / frameCount;
    data[index] = (Math.random() * 2 - 1) * fade;
  }
  return buffer;
}

function playCrackSound(audioContext: AudioContext, level: Exclude<PostureScreenEffectLevel, "none">) {
  const startAt = audioContext.currentTime + 0.01;
  const isShattered = level === "shattered";
  const duration = isShattered ? 0.55 : 0.22;

  const noise = audioContext.createBufferSource();
  const noiseFilter = audioContext.createBiquadFilter();
  const noiseGain = audioContext.createGain();
  noise.buffer = createNoiseBuffer(audioContext, duration);
  noiseFilter.type = isShattered ? "highpass" : "bandpass";
  noiseFilter.frequency.setValueAtTime(isShattered ? 1_600 : 2_400, startAt);
  noiseFilter.Q.setValueAtTime(isShattered ? 0.7 : 2.8, startAt);
  noiseGain.gain.setValueAtTime(0.0001, startAt);
  noiseGain.gain.exponentialRampToValueAtTime(isShattered ? 0.16 : 0.08, startAt + 0.012);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(audioContext.destination);
  noise.start(startAt);
  noise.stop(startAt + duration);

  const impact = audioContext.createOscillator();
  const impactGain = audioContext.createGain();
  impact.type = isShattered ? "sawtooth" : "triangle";
  impact.frequency.setValueAtTime(isShattered ? 120 : 320, startAt);
  impact.frequency.exponentialRampToValueAtTime(isShattered ? 42 : 150, startAt + duration);
  impactGain.gain.setValueAtTime(isShattered ? 0.09 : 0.035, startAt);
  impactGain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  impact.connect(impactGain);
  impactGain.connect(audioContext.destination);
  impact.start(startAt);
  impact.stop(startAt + duration);

  noise.onended = () => {
    noise.disconnect();
    noiseFilter.disconnect();
    noiseGain.disconnect();
  };
  impact.onended = () => {
    impact.disconnect();
    impactGain.disconnect();
  };
}

export function usePostureScreenEffect({
  isRunning,
  isTracking,
  neckAngleDegrees,
  soundEnabled,
}: Props) {
  const [level, setLevel] = useState<PostureScreenEffectLevel>("none");
  const machineRef = useRef(createPostureScreenEffectState(Date.now()));
  const inputRef = useRef({ isRunning, isTracking, neckAngleDegrees });
  const soundEnabledRef = useRef(soundEnabled);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastPlayedAtRef = useRef<Record<Exclude<PostureScreenEffectLevel, "none">, number | null>>({
    cracked: null,
    shattered: null,
  });

  useEffect(() => {
    inputRef.current = { isRunning, isTracking, neckAngleDegrees };
  }, [isRunning, isTracking, neckAngleDegrees]);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const unlockAudio = useCallback(async () => {
    if (typeof window === "undefined") return;
    const audioWindow = window as AudioWindow;
    const AudioContextConstructor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextConstructor) return;
    const audioContext = audioContextRef.current ?? new AudioContextConstructor();
    audioContextRef.current = audioContext;
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
  }, []);

  const playSound = useCallback((nextLevel: Exclude<PostureScreenEffectLevel, "none">) => {
    if (!soundEnabledRef.current) return;
    const audioContext = audioContextRef.current;
    if (!audioContext) return;
    const play = () => playCrackSound(audioContext, nextLevel);
    if (audioContext.state === "suspended") {
      void audioContext.resume().then(play).catch((error) => {
        console.warn("Failed to resume posture effect audio:", error);
      });
      return;
    }
    play();
  }, []);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const previous = machineRef.current;
      const next = updatePostureScreenEffectState(previous, { now, ...inputRef.current });
      machineRef.current = next;
      if (next.level !== previous.level) {
        setLevel(next.level);
      }
      if (next.level !== "none") {
        const lastPlayedAt = lastPlayedAtRef.current[next.level];
        if (shouldPlayPostureEffectSound({
          previousLevel: previous.level,
          nextLevel: next.level,
          now,
          lastPlayedAt,
        })) {
          lastPlayedAtRef.current[next.level] = now;
          playSound(next.level);
        }
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 100);
    return () => window.clearInterval(intervalId);
  }, [playSound]);

  useEffect(() => {
    if (isRunning) return;
    machineRef.current = createPostureScreenEffectState(Date.now());
    setLevel("none");
    lastPlayedAtRef.current = { cracked: null, shattered: null };
    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close();
    }
  }, [isRunning]);

  useEffect(() => () => {
    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close();
    }
  }, []);

  return { level, unlockAudio };
}
