import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STRETCH_BEEP_STORAGE_KEY, STRETCH_TTS_COOLDOWN_MS, STRETCH_TTS_STORAGE_KEY, STRETCH_TTS_VOICE_STORAGE_KEY } from "@/components/posture-coach/constants";

type StretchSettingsDraft = {
  beepEnabled: boolean;
  ttsEnabled: boolean;
  ttsVoiceUri: string;
};

type SettingsSaveStatus = "idle" | "saving" | "saved" | "error";

export function useStretchAudio(isStretchingMode: boolean) {
  const [stretchBeepEnabled, setStretchBeepEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(STRETCH_BEEP_STORAGE_KEY) !== "false";
  });
  const [stretchTtsEnabled, setStretchTtsEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(STRETCH_TTS_STORAGE_KEY) !== "false";
  });
  const [stretchTtsVoiceUri, setStretchTtsVoiceUri] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(STRETCH_TTS_VOICE_STORAGE_KEY) ?? "";
  });
  const [isStretchSettingsOpen, setIsStretchSettingsOpen] = useState(false);
  const [stretchSettingsDraft, setStretchSettingsDraft] = useState<StretchSettingsDraft>({ beepEnabled: true, ttsEnabled: true, ttsVoiceUri: "" });
  const [stretchSettingsSaveStatus, setStretchSettingsSaveStatus] = useState<SettingsSaveStatus>("idle");
  const [stretchTtsVoices, setStretchTtsVoices] = useState<SpeechSynthesisVoice[]>([]);
  const isStretchingRef = useRef(isStretchingMode);
  const stretchBeepAudioContextRef = useRef<AudioContext | null>(null);
  const stretchBeepEventKeysRef = useRef<Set<string>>(new Set());
  const stretchTtsEnabledRef = useRef(stretchTtsEnabled);
  const stretchTtsVoiceUriRef = useRef(stretchTtsVoiceUri);
  const stretchTtsVoicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const stretchTtsEventKeysRef = useRef<Set<string>>(new Set());
  const stretchTtsUserStartedRef = useRef(false);
  const lastStretchTtsMessageRef = useRef<{ message: string; spokenAt: number } | null>(null);

  useEffect(() => { isStretchingRef.current = isStretchingMode; }, [isStretchingMode]);
  useEffect(() => { stretchTtsEnabledRef.current = stretchTtsEnabled; }, [stretchTtsEnabled]);
  useEffect(() => { stretchTtsVoiceUriRef.current = stretchTtsVoiceUri; }, [stretchTtsVoiceUri]);
  useEffect(() => { stretchTtsVoicesRef.current = stretchTtsVoices; }, [stretchTtsVoices]);
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setStretchTtsVoices(voices);
      stretchTtsVoicesRef.current = voices;
    };
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);
  useEffect(() => () => {
    void stretchBeepAudioContextRef.current?.close();
    stretchBeepAudioContextRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const playStretchBeep = useCallback((count: 1 | 2 | 3, eventKey: string, delayMs = 0) => {
    if (!stretchBeepEnabled || typeof window === "undefined" || !isStretchingRef.current) {
      return;
    }
    if (stretchBeepEventKeysRef.current.has(eventKey)) {
      return;
    }
    stretchBeepEventKeysRef.current.add(eventKey);

    const audioWindow = window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    const AudioContextConstructor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextConstructor) {
      return;
    }

    let audioContext = stretchBeepAudioContextRef.current;
    if (!audioContext) {
      audioContext = new AudioContextConstructor();
      stretchBeepAudioContextRef.current = audioContext;
    }

    const playSequence = async () => {
      if (!audioContext) {
        return;
      }
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      for (let index = 0; index < count; index += 1) {
        window.setTimeout(() => {
          if (!audioContext) {
            return;
          }
          const oscillator = audioContext.createOscillator();
          const gain = audioContext.createGain();
          const startAt = audioContext.currentTime;
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(880, startAt);
          gain.gain.setValueAtTime(0.0001, startAt);
          gain.gain.exponentialRampToValueAtTime(0.045, startAt + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.12);
          oscillator.connect(gain);
          gain.connect(audioContext.destination);
          oscillator.start(startAt);
          oscillator.stop(startAt + 0.13);
          oscillator.onended = () => {
            oscillator.disconnect();
            gain.disconnect();
          };
        }, index * 180);
      }
    };

    window.setTimeout(() => {
      void playSequence().catch((error) => {
        console.warn("Failed to play stretch beep:", error);
      });
    }, delayMs);
  }, [stretchBeepEnabled]);
  const updateStretchBeepEnabled = useCallback((enabled: boolean) => {
    setStretchBeepEnabled(enabled);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STRETCH_BEEP_STORAGE_KEY, String(enabled));
    }
  }, []);
  const speakStretchCue = useCallback((message: string, eventKey: string, delayMs = 0) => {
    if (
      !stretchTtsEnabled ||
      !stretchTtsEnabledRef.current ||
      !stretchTtsUserStartedRef.current ||
      typeof window === "undefined" ||
      !("speechSynthesis" in window) ||
      typeof SpeechSynthesisUtterance === "undefined"
    ) {
      return;
    }
    if (stretchTtsEventKeysRef.current.has(eventKey)) {
      return;
    }

    const now = Date.now();
    const lastMessage = lastStretchTtsMessageRef.current;
    if (
      lastMessage &&
      lastMessage.message === message &&
      now - lastMessage.spokenAt < STRETCH_TTS_COOLDOWN_MS
    ) {
      return;
    }

    stretchTtsEventKeysRef.current.add(eventKey);
    lastStretchTtsMessageRef.current = { message, spokenAt: now + delayMs };

    window.setTimeout(() => {
      if (
        !stretchTtsEnabled ||
        !stretchTtsEnabledRef.current ||
        !stretchTtsUserStartedRef.current ||
        typeof window === "undefined" ||
        !("speechSynthesis" in window) ||
        typeof SpeechSynthesisUtterance === "undefined"
      ) {
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      const selectedVoice = stretchTtsVoicesRef.current.find((voice) => voice.voiceURI === stretchTtsVoiceUriRef.current);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
      } else {
        utterance.lang = "ko-KR";
      }
      utterance.rate = 0.95;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    }, delayMs);
  }, [stretchTtsEnabled]);
  const updateStretchTtsEnabled = useCallback((enabled: boolean) => {
    stretchTtsEnabledRef.current = enabled;
    setStretchTtsEnabled(enabled);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STRETCH_TTS_STORAGE_KEY, String(enabled));
      if (!enabled && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    }
  }, []);
  const updateStretchTtsVoice = useCallback((voiceUri: string) => {
    stretchTtsVoiceUriRef.current = voiceUri;
    setStretchTtsVoiceUri(voiceUri);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STRETCH_TTS_VOICE_STORAGE_KEY, voiceUri);
    }
  }, []);
  const openStretchSettings = useCallback(() => {
    setStretchSettingsDraft({
      beepEnabled: stretchBeepEnabled,
      ttsEnabled: stretchTtsEnabled,
      ttsVoiceUri: stretchTtsVoiceUri,
    });
    setStretchSettingsSaveStatus("idle");
    setIsStretchSettingsOpen(true);
  }, [stretchBeepEnabled, stretchTtsEnabled, stretchTtsVoiceUri]);
  const closeStretchSettings = useCallback(() => {
    setStretchSettingsSaveStatus("idle");
    setIsStretchSettingsOpen(false);
  }, []);
  const updateStretchSettingsDraft = useCallback((changes: Partial<StretchSettingsDraft>) => {
    setStretchSettingsDraft((current) => ({
      ...current,
      ...changes,
    }));
    setStretchSettingsSaveStatus("idle");
  }, []);
  const handleResetStretchSettings = useCallback(() => {
    setStretchSettingsDraft({
      beepEnabled: true,
      ttsEnabled: true,
      ttsVoiceUri: "",
    });
    setStretchSettingsSaveStatus("idle");
  }, []);
  const handleApplyStretchSettings = useCallback(() => {
    updateStretchBeepEnabled(stretchSettingsDraft.beepEnabled);
    updateStretchTtsEnabled(stretchSettingsDraft.ttsEnabled);
    updateStretchTtsVoice(stretchSettingsDraft.ttsVoiceUri);
    setStretchSettingsSaveStatus("saved");
  }, [stretchSettingsDraft, updateStretchBeepEnabled, updateStretchTtsEnabled, updateStretchTtsVoice]);

  const stretchTtsVoiceOptions = useMemo(() => {
    const koreanVoices = stretchTtsVoices.filter((voice) => voice.lang.toLowerCase().startsWith("ko"));
    const otherVoices = stretchTtsVoices.filter((voice) => !voice.lang.toLowerCase().startsWith("ko"));
    return [...koreanVoices, ...otherVoices];
  }, [stretchTtsVoices]);
  const resetStretchAudioEvents = useCallback((userStarted = false) => {
    stretchBeepEventKeysRef.current = new Set();
    stretchTtsEventKeysRef.current = new Set();
    stretchTtsUserStartedRef.current = userStarted;
  }, []);
  const setStretchTtsUserStarted = useCallback((started: boolean) => {
    stretchTtsUserStartedRef.current = started;
  }, []);

  return {
    stretchBeepEnabled, stretchTtsEnabled, stretchTtsVoiceUri, isStretchSettingsOpen,
    stretchSettingsDraft, stretchSettingsSaveStatus, stretchTtsVoiceOptions,
    isStretchBeepSupported: typeof window === "undefined" || Boolean(window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext),
    isStretchTtsSupported: typeof window === "undefined" || ("speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined"),
    playStretchBeep, speakStretchCue, updateStretchBeepEnabled, updateStretchTtsEnabled,
    updateStretchTtsVoice, openStretchSettings, closeStretchSettings, updateStretchSettingsDraft,
    handleResetStretchSettings, handleApplyStretchSettings, resetStretchAudioEvents,
    setStretchTtsUserStarted,
  };
}

