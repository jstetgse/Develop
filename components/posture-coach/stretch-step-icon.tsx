import { Check } from "lucide-react";
import type { StretchStep } from "@/lib/types";

type StretchStepIconProps = {
  checkType: StretchStep["checkType"];
  className?: string;
};

type StretchStepIconTileProps = StretchStepIconProps & {
  stepNumber: number;
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

function DirectionArrow({ d }: { d: string }) {
  return <path d={d} strokeWidth="2.1" />;
}

function CurvedArrow({ d }: { d: string }) {
  return <path d={d} strokeWidth="2.1" />;
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

export function StretchStepIcon({ checkType, className = "h-8 w-8" }: StretchStepIconProps) {
  switch (checkType) {
    case "neck-side-pull":
      return (
        <BaseIcon className={className}>
          <path d="M15 32h18" />
          <path d="M24 31l2-9" />
          <circle cx="30" cy="17" r="5" />
          <path d="M34 12c4 2 6 6 5 10" />
          <path d="M19 20c3 3 7 4 12 2" />
          <DirectionArrow d="M22 16h-7m0 0 3-3m-3 3 3 3" />
        </BaseIcon>
      );
    case "neck-forward-pull":
      return (
        <BaseIcon className={className}>
          <path d="M15 32h18" />
          <path d="M24 31l-1-9" />
          <circle cx="23" cy="17" r="5" />
          <path d="M16 13c5-4 12-4 17 0" />
          <path d="M17 19c4 3 9 4 14 2" />
          <DirectionArrow d="M24 23v9m0 0-3-3m3 3 3-3" />
        </BaseIcon>
      );
    case "neck-back-tilt":
      return (
        <BaseIcon className={className}>
          <path d="M15 32h18" />
          <path d="M24 31l4-9" />
          <circle cx="30" cy="16" r="5" />
          <path d="M18 21c4 0 8-2 12-5" />
          <DirectionArrow d="M31 23l5-9m0 0 1 4m-1-4-4 1" />
        </BaseIcon>
      );
    case "neck-circle":
      return (
        <BaseIcon className={className}>
          <path d="M15 33h18" />
          <path d="M24 32v-10" />
          <circle cx="24" cy="17" r="5" />
          <CurvedArrow d="M15 17c2-7 10-11 17-7" />
          <path d="M32 10h-5m5 0-2-4" />
          <CurvedArrow d="M33 22c-2 7-10 11-17 7" />
          <path d="M16 29h5m-5 0 2 4" />
        </BaseIcon>
      );
    case "shoulder-roll":
      return (
        <BaseIcon className={className}>
          <circle cx="24" cy="11" r="4" />
          <path d="M15 23h18" />
          <path d="M18 35l3-12 3 9 3-9 3 12" />
          <circle cx="16" cy="22" r="3" />
          <circle cx="32" cy="22" r="3" />
          <CurvedArrow d="M10 20c0-5 4-8 9-8" />
          <path d="M19 12h-4m4 0-2-4" />
          <CurvedArrow d="M38 20c0-5-4-8-9-8" />
          <path d="M29 12h4m-4 0 2-4" />
        </BaseIcon>
      );
    case "shoulder-cross":
      return (
        <BaseIcon className={className}>
          <circle cx="24" cy="11" r="4" />
          <path d="M16 23h16" />
          <path d="M18 35l3-12 3 9 3-9 3 12" />
          <path d="M11 29h20" />
          <path d="M31 29l-4-3m4 3-4 3" />
          <path d="M34 24l5-4" />
        </BaseIcon>
      );
    case "shoulder-overhead":
      return (
        <BaseIcon className={className}>
          <circle cx="24" cy="15" r="4" />
          <path d="M17 25h14" />
          <path d="M18 25c-3-5-3-11 1-17" />
          <path d="M30 25c4-5 4-11 1-17" />
          <path d="M19 8h12" />
          <DirectionArrow d="M24 10V4m0 0-3 3m3-3 3 3" />
          <path d="M19 39l3-14 2 8 2-8 3 14" />
        </BaseIcon>
      );
    case "shoulder-chest-open":
      return (
        <BaseIcon className={className}>
          <circle cx="24" cy="11" r="4" />
          <path d="M16 23h16" />
          <path d="M18 35l3-12 3 9 3-9 3 12" />
          <path d="M17 23c-5 1-8 0-12-4" />
          <path d="M31 23c5 1 8 0 12-4" />
          <DirectionArrow d="M10 18H4m0 0 3-3m-3 3 3 3" />
          <DirectionArrow d="M38 18h6m0 0-3-3m3 3-3 3" />
        </BaseIcon>
      );
    case "wrist-roll":
      return (
        <BaseIcon className={className}>
          <path d="M11 31l13-13" />
          <path d="M24 18l8 8" />
          <path d="M30 26l6-6" />
          <path d="M19 25l7 7" />
          <circle cx="31" cy="24" r="8" />
          <path d="M39 24l-3-3m3 3-3 3" />
        </BaseIcon>
      );
    case "wrist-back-press":
      return (
        <BaseIcon className={className}>
          <path d="M9 24h18" />
          <path d="M27 24l7-7" />
          <path d="M16 17l10 10" />
          <path d="M18 31l-7 7" />
          <path d="M11 17l20 20" />
          <path d="M22 18l4-4m-4 4-4-4" />
        </BaseIcon>
      );
    case "wrist-open-close":
      return (
        <BaseIcon className={className}>
          <path d="M12 32l12-12" />
          <path d="M24 20l8 8" />
          <path d="M18 19l4-5" />
          <path d="M22 14l5 4" />
          <path d="M27 28l5 5" />
          <DirectionArrow d="M36 18h7m0 0-3-3m3 3-3 3" />
          <DirectionArrow d="M35 35h-7m0 0 3-3m-3 3 3 3" />
        </BaseIcon>
      );
    case "wrist-pull":
      return (
        <BaseIcon className={className}>
          <path d="M10 31l13-13" />
          <path d="M23 18l8 8" />
          <path d="M30 26l7-6" />
          <path d="M22 28l8 8" />
          <path d="M31 30c5 0 8-2 11-6" />
          <DirectionArrow d="M41 24h5m0 0-3-3m3 3-3 3" />
        </BaseIcon>
      );
    case "back-side":
      return (
        <BaseIcon className={className}>
          <circle cx="27" cy="10" r="4" />
          <path d="M27 14c-6 5-9 12-8 22" />
          <path d="M19 24c-4-3-6-7-6-13" />
          <path d="M19 36h15" />
          <path d="M26 23l8 3" />
          <DirectionArrow d="M15 23H7m0 0 3-3m-3 3 3 3" />
        </BaseIcon>
      );
    case "back-forward-reach":
      return (
        <BaseIcon className={className}>
          <circle cx="35" cy="17" r="4" />
          <path d="M14 29c9-6 18-6 27 0" />
          <path d="M36 24l8 5" />
          <path d="M33 27l8 8" />
          <DirectionArrow d="M37 14h8m0 0-3-3m3 3-3 3" />
          <path d="M18 31l-8 9" />
          <path d="M27 31l1 11" />
        </BaseIcon>
      );
    case "back-twist":
      return (
        <BaseIcon className={className}>
          <circle cx="24" cy="10" r="4" />
          <path d="M17 22l14-3" />
          <path d="M20 22c-3 6-3 12 1 18" />
          <path d="M29 20c4 6 4 12 0 20" />
          <path d="M17 40h15" />
          <CurvedArrow d="M12 27c7-5 16-5 23 0" />
          <path d="M35 27h-6m6 0-3-4" />
        </BaseIcon>
      );
    case "back-hip-circle":
      return (
        <BaseIcon className={className}>
          <circle cx="24" cy="10" r="4" />
          <path d="M18 21h12" />
          <path d="M20 21l-2 14" />
          <path d="M28 21l2 14" />
          <path d="M15 35c4 4 14 5 20 0" />
          <CurvedArrow d="M14 33c1-8 9-13 18-10" />
          <path d="M32 23l-5-1m5 1-3-4" />
        </BaseIcon>
      );
    case "leg-forward-fold":
      return (
        <BaseIcon className={className}>
          <circle cx="34" cy="12" r="4" />
          <path d="M31 16c-4 3-7 7-9 12" />
          <path d="M22 28c4 2 9 2 14 1" />
          <path d="M36 29l5 5" />
          <path d="M22 28l-11 12" />
          <path d="M23 28l10 12" />
          <path d="M11 40h25" />
          <path d="M32 31l-3 5" />
        </BaseIcon>
      );
    case "leg-knee-pull":
      return (
        <BaseIcon className={className}>
          <circle cx="22" cy="10" r="4" />
          <path d="M22 15v14" />
          <path d="M22 29l-2 13" />
          <path d="M22 29c5-5 9-6 14-4" />
          <path d="M36 25l-7 7" />
          <path d="M18 20c4 6 10 9 18 9" />
          <path d="M28 18c2 4 5 6 9 7" />
          <path d="M15 42h10" />
        </BaseIcon>
      );
    case "leg-quad-pull":
      return (
        <BaseIcon className={className}>
          <circle cx="22" cy="10" r="4" />
          <path d="M22 15v14" />
          <path d="M21 29l-3 13" />
          <path d="M23 29c7 1 11-2 12-9" />
          <path d="M35 20l-8 3" />
          <path d="M26 18c4 0 7 1 10 3" />
          <path d="M18 42h8" />
          <path d="M33 20l4-4" />
        </BaseIcon>
      );
    case "leg-calf-stretch":
      return (
        <BaseIcon className={className}>
          <circle cx="18" cy="11" r="4" />
          <path d="M20 15c3 5 6 9 12 12" />
          <path d="M32 27h8" />
          <path d="M27 26c-2 5-5 9-9 14" />
          <path d="M27 27c6 4 10 8 15 13" />
          <path d="M18 40h24" />
          <path d="M20 24l-7 7" />
          <path d="M23 26l-9 1" />
        </BaseIcon>
      );
    default: {
      const _exhaustive: never = checkType;
      void _exhaustive;
      return <FallbackIcon className={className} />;
    }
  }
}

export function StretchStepIconTile({
  checkType,
  stepNumber,
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
      <span className="absolute left-1 top-1 text-[11px] font-bold leading-none text-current opacity-55">
        {stepNumber}
      </span>
      <StretchStepIcon checkType={checkType} className={iconSizeClass} />
      {state === "completed" && (
        <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center bg-[#18755B] text-white">
          <Check className="h-2.5 w-2.5" />
        </span>
      )}
    </div>
  );
}
