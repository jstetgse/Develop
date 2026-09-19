import { Check } from "lucide-react";
import type { StretchStep } from "@/lib/types";

type StretchStepIconProps = {
  checkType: StretchStep["checkType"];
  className?: string;
};

type StretchStepIconTileProps = StretchStepIconProps & {
  state: "active" | "inactive" | "completed";
  size?: "default" | "large";
};

function BaseIcon({ children, className = "h-8 w-8" }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function FallbackIcon({ className }: { className?: string }) {
  return (
    <BaseIcon className={className}>
      <circle cx="24" cy="16" r="5" />
      <path d="M24 21v12" />
      <path d="M15 28h18" />
      <path d="M18 40h12" />
    </BaseIcon>
  );
}

function GeneratedStepIconMask({ src, className }: { src: string; className: string }) {
  return (
    <span
      className={`block shrink-0 bg-current ${className}`}
      style={{
        WebkitMaskImage: `url("${src}")`,
        maskImage: `url("${src}")`,
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
      aria-hidden="true"
    />
  );
}

export function StretchStepIcon({ checkType, className = "h-8 w-8" }: StretchStepIconProps) {
  switch (checkType) {
    case "neck-side-pull":
      return <GeneratedStepIconMask src="/icons/stretch/neck-side-pull.png" className={className} />;
    case "neck-forward-pull":
      return <GeneratedStepIconMask src="/icons/stretch/neck-forward-pull.png" className={className} />;
    case "neck-back-tilt":
      return <GeneratedStepIconMask src="/icons/stretch/neck-back-tilt.png" className={className} />;
    case "neck-circle":
      return <GeneratedStepIconMask src="/icons/stretch/neck-circle.png" className={className} />;
    case "shoulder-roll":
      return <GeneratedStepIconMask src="/icons/stretch/shoulder-roll.png" className={className} />;
    case "shoulder-cross":
      return <GeneratedStepIconMask src="/icons/stretch/shoulder-cross.png" className={className} />;
    case "shoulder-overhead":
      return <GeneratedStepIconMask src="/icons/stretch/shoulder-overhead.png" className={className} />;
    case "shoulder-chest-open":
      return <GeneratedStepIconMask src="/icons/stretch/shoulder-chest-open.png" className={className} />;
    case "wrist-roll":
      return <GeneratedStepIconMask src="/icons/stretch/wrist-roll.png" className={className} />;
    case "wrist-back-press":
      return <GeneratedStepIconMask src="/icons/stretch/wrist-back-press.png" className={className} />;
    case "wrist-open-close":
      return <GeneratedStepIconMask src="/icons/stretch/wrist-open-close.png" className={className} />;
    case "wrist-pull":
      return <GeneratedStepIconMask src="/icons/stretch/wrist-pull.png" className={className} />;
    case "back-side":
      return <GeneratedStepIconMask src="/icons/stretch/back-side.png" className={className} />;
    case "back-forward-reach":
      return <GeneratedStepIconMask src="/icons/stretch/back-forward-reach.png" className={className} />;
    case "back-twist":
      return <GeneratedStepIconMask src="/icons/stretch/back-twist.png" className={className} />;
    case "back-hip-circle":
      return <GeneratedStepIconMask src="/icons/stretch/back-hip-circle.png" className={className} />;
    case "leg-forward-fold":
      return <GeneratedStepIconMask src="/icons/stretch/leg-forward-fold.png" className={className} />;
    case "leg-knee-pull":
      return <GeneratedStepIconMask src="/icons/stretch/leg-knee-pull.png" className={className} />;
    case "leg-quad-pull":
      return <GeneratedStepIconMask src="/icons/stretch/leg-quad-pull.png" className={className} />;
    case "leg-calf-stretch":
      return <GeneratedStepIconMask src="/icons/stretch/leg-calf-stretch.png" className={className} />;
    default: {
      const _exhaustive: never = checkType;
      void _exhaustive;
      return <FallbackIcon className={className} />;
    }
  }
}

export function StretchStepIconTile({
  checkType,
  state,
  size = "default",
}: StretchStepIconTileProps) {
  const isLarge = size === "large";
  const tileSizeClass = isLarge ? "h-14 w-14" : "h-12 w-12";
  const iconSizeClass = isLarge ? "h-10 w-10" : "h-9 w-9";
  const toneClass =
    state === "active"
      ? "border-[#70E5C4] bg-[#D6F3EB] text-[#18755B]"
      : state === "completed"
        ? "border-[#C4F6E8] bg-[#E7FFF7] text-[#18755B]"
        : "border-gray-200 bg-gray-50 text-[#94A3B8]";

  return (
    <div className={`relative flex shrink-0 items-center justify-center border ${tileSizeClass} ${toneClass}`}>
      <StretchStepIcon checkType={checkType} className={iconSizeClass} />
      {state === "completed" && (
        <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center bg-[#18755B] text-white">
          <Check className="h-2.5 w-2.5" />
        </span>
      )}
    </div>
  );
}
