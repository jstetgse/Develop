import type { PostureScreenEffectLevel } from "@/lib/posture/posture-screen-effect";

export function PostureScreenEffectOverlay({ level }: { level: PostureScreenEffectLevel }) {
  if (level === "none") return null;

  return (
    <div className={`posture-screen-effect-overlay posture-screen-effect-overlay--${level}`} aria-hidden="true">
      <div className="posture-screen-effect-vignette" />
      <div className="posture-screen-effect-scanline posture-screen-effect-scanline--one" />
      <div className="posture-screen-effect-scanline posture-screen-effect-scanline--two" />
      <svg className="posture-screen-effect-cracks" viewBox="0 0 1000 600" preserveAspectRatio="none">
        <g className="posture-crack posture-crack--left">
          <path d="M0 80 L82 118 L142 104 L184 166 L244 184 L286 252" />
          <path d="M82 118 L72 190 L112 235 L98 302" />
          <path d="M184 166 L174 106 L214 62" />
          <path d="M244 184 L232 238 L266 292" />
        </g>
        <g className="posture-crack posture-crack--right">
          <path d="M1000 35 L930 92 L882 88 L834 152 L772 166 L714 238" />
          <path d="M930 92 L944 166 L906 214 L920 278" />
          <path d="M834 152 L850 96 L816 48" />
          <path d="M772 166 L782 224 L746 272" />
        </g>
        <g className="posture-crack posture-crack--shattered">
          <path d="M514 0 L486 68 L518 124 L478 184 L506 246 L462 318 L492 392 L448 468 L470 600" />
          <path d="M478 184 L400 164 L344 202 L286 190" />
          <path d="M506 246 L582 216 L648 244 L714 220" />
          <path d="M462 318 L376 336 L318 390 L234 406" />
          <path d="M492 392 L570 376 L636 424 L724 440" />
          <path d="M400 164 L420 96 L380 52" />
          <path d="M648 244 L670 310 L728 344" />
        </g>
      </svg>
      <div className="posture-screen-effect-impact" />
    </div>
  );
}
