export function getStretchVoiceLabel(voice: SpeechSynthesisVoice) {
  return `${voice.name} (${voice.lang})`;
}
