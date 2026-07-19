import { Bone, PersonStanding, ShieldCheck } from "lucide-react";
import type { JSX, ReactNode } from "react";
import type { PostureRecommendationArea, StretchStep } from "@/lib/types";

export function getPostureAreaIcon(area: PostureRecommendationArea, className = "h-4 w-4") {
  if (area === "neck") {
    return <Bone className={className} />;
  }
  if (area === "torso") {
    return <PersonStanding className={className} />;
  }
  return <ShieldCheck className={className} />;
}

export function getGenericStretchPictogram(className: string): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="32" cy="12" r="6" />
      <path d="M32 18v15" />
      <path d="M18 27c5-5 23-5 28 0" />
      <path d="M25 33l-7 13" />
      <path d="M39 33l7 13" />
      <path d="M23 50h18" />
    </svg>
  );
}

export function getStretchStepPictogram(checkType: StretchStep["checkType"], className = "h-6 w-6"): JSX.Element {
  const icon = (children: ReactNode) => (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="currentColor"
      aria-hidden="true"
    >
      {children}
    </svg>
  );

  const person = ({
    head = [32, 10, 5],
    torso = "M29 18c-3 8-3 16 0 25h10c3-9 3-17 0-25z",
    leftArm = "M28 23c-6 3-10 8-12 15l6 2c2-5 5-9 9-11z",
    rightArm = "M40 23c5 3 8 7 10 13l-6 2c-2-5-5-8-8-10z",
    leftLeg = "M29 41c-4 6-7 11-10 17h8c2-4 5-8 8-13z",
    rightLeg = "M39 41c5 5 9 10 12 17h-8c-3-5-6-9-10-13z",
    extras,
  }: {
    head?: [number, number, number];
    torso?: string;
    leftArm?: string;
    rightArm?: string;
    leftLeg?: string;
    rightLeg?: string;
    extras?: ReactNode;
  }) => (
    <>
      <circle cx={head[0]} cy={head[1]} r={head[2]} />
      <path d={torso} />
      <path d={leftArm} />
      <path d={rightArm} />
      <path d={leftLeg} />
      <path d={rightLeg} />
      {extras}
    </>
  );

  const arrowRight = (x: number, y: number) => (
    <path d={`M${x} ${y}h13l-4-4 2-2 8 7-8 7-2-2 4-4H${x}z`} opacity="0.6" />
  );

  const arrowLeft = (x: number, y: number) => (
    <path d={`M${x + 19} ${y}H${x + 6}l4-4-2-2-8 7 8 7 2-2-4-4h13z`} opacity="0.6" />
  );

  switch (checkType) {
    case "neck-side-pull":
      return icon(
        person({
          head: [29, 13, 5],
          torso: "M27 20c-2 8-2 17 1 27h10c2-10 2-19-1-27z",
          leftArm: "M28 22c-7 1-12 5-16 12l5 5c3-5 7-8 13-10z",
          rightArm: "M38 23c5 3 8 8 9 15l-6 2c-1-5-3-9-7-12z",
          leftLeg: "M29 46c-3 4-5 8-7 12h8c2-3 4-6 6-9z",
          rightLeg: "M38 46c3 4 6 8 8 12h-8c-2-3-4-6-7-9z",
          extras: (
            <>
              <path d="M18 18c5-7 13-9 21-5l-5-6 4-2 10 13-15 4-1-4 6-2c-6-3-12-1-16 4z" opacity="0.65" />
              <path d="M24 20c2-6 7-9 13-8l-2 6c-4-1-7 1-9 5z" opacity="0.55" />
            </>
          ),
        })
      );
    case "neck-forward-pull":
      return icon(
        person({
          head: [32, 17, 5],
          torso: "M27 23c-2 8-2 17 1 27h10c3-10 3-19 0-27z",
          leftArm: "M27 25c-7 2-12 6-15 12l5 5c3-5 7-8 13-10z",
          rightArm: "M38 25c7 2 12 6 15 12l-5 5c-3-5-7-8-13-10z",
          leftLeg: "M29 49c-3 3-5 6-7 9h8c1-2 3-4 5-6z",
          rightLeg: "M38 49c3 3 5 6 7 9h-8c-1-2-3-4-5-6z",
          extras: <path d="M17 15c9-9 24-9 33 0l-2-7 4-1 5 16-17-2 1-4 6 1c-8-7-19-7-27 1z" opacity="0.65" />,
        })
      );
    case "neck-back-tilt":
      return icon(
        person({
          head: [32, 13, 5],
          torso: "M27 21c-2 8-2 17 1 27h10c3-10 3-19 0-27z",
          leftArm: "M28 25c-5 3-8 7-10 13l5 4c2-4 5-7 9-10z",
          rightArm: "M38 25c5 3 8 7 10 13l-5 4c-2-4-5-7-9-10z",
          leftLeg: "M29 47c-3 4-5 7-7 11h8c1-3 3-5 5-8z",
          rightLeg: "M38 47c3 4 5 7 7 11h-8c-1-3-3-5-5-8z",
          extras: (
            <>
              <path d="M25 14c3-5 9-6 14-2l-4 4c-3-2-6-1-8 2z" opacity="0.55" />
              <path d="M38 7c7 5 10 12 8 20l5-4 3 3-11 11-6-14 4-1 2 6c2-7-1-13-7-16z" opacity="0.65" />
              <path d="M49 6h8v5h-8zM50 11h6v9h-6zM48 20a5 5 0 1 0 10 0 5 5 0 0 0-10 0z" opacity="0.5" />
            </>
          ),
        })
      );
    case "neck-circle":
      return icon(
        person({
          head: [38, 17, 5],
          torso: "M28 24c-2 8-2 17 1 27h10c3-10 3-19 0-27z",
          leftArm: "M29 27c-4 3-7 7-8 13l6 2c1-4 3-7 6-9z",
          rightArm: "M39 27c4 3 7 7 8 13l-6 2c-1-4-3-7-6-9z",
          leftLeg: "M30 50c-3 3-5 6-7 8h8c1-2 3-4 5-6z",
          rightLeg: "M39 50c3 3 5 6 6 8h-8c-1-2-3-4-5-6z",
          extras: (
            <>
              <path d="M17 19c5-12 19-17 31-10l-6-6 3-3 13 13-18 4-1-4 7-2c-10-5-21-1-25 9z" opacity="0.65" />
              <path d="M55 20c3 13-6 25-19 27l6 4-2 4-16-9 13-12 3 3-5 5c10-2 17-11 14-21z" opacity="0.65" />
              <path d="M24 19c4 2 8 2 12 0l1 4c-5 3-11 3-17 0z" opacity="0.4" />
            </>
          ),
        })
      );
    case "shoulder-roll":
      return icon(
        person({
          head: [32, 10, 5],
          torso: "M28 18c-2 8-2 16 0 25h10c3-9 3-17 0-25z",
          leftArm: "M27 22c-5 2-8 6-9 12l6 2c1-4 3-7 7-9z",
          rightArm: "M39 22c5 2 8 6 9 12l-6 2c-1-4-3-7-7-9z",
          leftLeg: "M29 42c-3 5-6 10-8 16h8c2-4 4-8 7-12z",
          rightLeg: "M38 42c4 5 7 10 9 16h-8c-2-4-4-8-7-12z",
          extras: (
            <>
              <path d="M15 21c3-7 9-10 16-8l-4-4 2-3 9 8-10 7-2-3 4-3c-5-1-9 1-11 6z" opacity="0.55" />
              <path d="M49 21c-3-7-9-10-16-8l4-4-2-3-9 8 10 7 2-3-4-3c5-1 9 1 11 6z" opacity="0.55" />
            </>
          ),
        })
      );
    case "shoulder-cross":
      return icon(
        person({
          head: [32, 10, 5],
          torso: "M28 18c-2 8-2 16 0 25h10c3-9 3-17 0-25z",
          leftArm: "M19 27c9 0 16 3 22 9l-5 5c-5-5-10-7-18-7z",
          rightArm: "M47 27c-9 0-16 3-22 9l5 5c5-5 10-7 18-7z",
          leftLeg: "M29 42c-3 5-5 10-7 16h8c2-4 4-8 6-12z",
          rightLeg: "M38 42c3 5 6 10 8 16h-8c-2-4-4-8-6-12z",
          extras: arrowLeft(8, 32),
        })
      );
    case "shoulder-overhead":
      return icon(
        person({
          head: [32, 16, 5],
          torso: "M28 24c-2 7-2 14 0 22h10c3-8 3-15 0-22z",
          leftArm: "M27 25c-6-5-9-10-9-17h7c0 5 2 8 7 12z",
          rightArm: "M39 25c6-5 9-10 9-17h-7c0 5-2 8-7 12z",
          leftLeg: "M29 45c-3 4-5 8-7 13h8c2-3 4-6 6-9z",
          rightLeg: "M38 45c3 4 5 8 7 13h-8c-2-3-4-6-6-9z",
          extras: <path d="M25 4h14l-3-3 2-2 8 7-8 7-2-2 3-3H25z" opacity="0.55" />,
        })
      );
    case "shoulder-chest-open":
      return icon(
        person({
          head: [32, 10, 5],
          torso: "M28 18c-2 8-2 16 0 25h10c3-9 3-17 0-25z",
          leftArm: "M29 24c-6 1-11 0-16-4l-3 6c6 5 13 7 21 4z",
          rightArm: "M37 24c6 1 11 0 16-4l3 6c-6 5-13 7-21 4z",
          leftLeg: "M29 42c-3 5-6 10-8 16h8c2-4 4-8 7-12z",
          rightLeg: "M38 42c4 5 7 10 9 16h-8c-2-4-4-8-7-12z",
          extras: (
            <>
              {arrowLeft(6, 23)}
              {arrowRight(45, 23)}
            </>
          ),
        })
      );
    case "wrist-roll":
      return icon(
        person({
          head: [30, 10, 5],
          torso: "M26 18c-2 8-2 16 0 25h10c3-9 3-17 0-25z",
          leftArm: "M25 24c-5 3-8 7-10 13l5 3c2-4 5-8 9-10z",
          rightArm: "M37 23c6 4 10 8 13 14l-6 3c-3-5-6-8-11-11z",
          leftLeg: "M27 42c-3 5-5 10-7 16h8c2-4 4-8 6-12z",
          rightLeg: "M36 42c4 5 7 10 9 16h-8c-2-4-4-8-7-12z",
          extras: <path d="M45 15c7 2 11 8 9 15l4-3 2 3-9 8-6-10 3-2 2 4c1-5-1-9-6-11z" opacity="0.6" />,
        })
      );
    case "wrist-back-press":
      return icon(
        person({
          head: [32, 10, 5],
          torso: "M28 18c-2 8-2 16 0 25h10c3-9 3-17 0-25z",
          leftArm: "M28 26c-6 2-10 5-14 10l5 4c3-4 6-6 11-8z",
          rightArm: "M38 26c5 2 9 5 13 10l-5 4c-3-4-7-6-11-8z",
          leftLeg: "M29 42c-3 5-6 10-8 16h8c2-4 4-8 7-12z",
          rightLeg: "M38 42c4 5 7 10 9 16h-8c-2-4-4-8-7-12z",
          extras: <path d="M16 36h34v7H16zM22 29h6v7h-6zM36 29h6v7h-6z" opacity="0.65" />,
        })
      );
    case "wrist-open-close":
      return icon(
        person({
          head: [31, 10, 5],
          torso: "M27 18c-2 8-2 16 0 25h10c3-9 3-17 0-25z",
          leftArm: "M27 24c-5 3-8 7-10 13l5 3c2-4 5-8 9-10z",
          rightArm: "M38 24c5 3 9 7 12 13l-6 3c-2-4-5-7-9-10z",
          leftLeg: "M28 42c-3 5-5 10-7 16h8c2-4 4-8 6-12z",
          rightLeg: "M37 42c4 5 7 10 9 16h-8c-2-4-4-8-7-12z",
          extras: (
            <>
              <path d="M50 30l8-7v14z" opacity="0.6" />
              <circle cx="47" cy="30" r="3" opacity="0.7" />
              <path d="M43 46l9-5 2 4-5 3 5 3-2 4z" opacity="0.6" />
            </>
          ),
        })
      );
    case "wrist-pull":
      return icon(
        person({
          head: [32, 10, 5],
          torso: "M28 18c-2 8-2 16 0 25h10c3-9 3-17 0-25z",
          leftArm: "M28 25c-5 2-9 5-13 10l5 4c3-4 6-6 11-8z",
          rightArm: "M38 25c7 2 12 5 17 10l-5 5c-4-4-8-7-14-8z",
          leftLeg: "M29 42c-3 5-6 10-8 16h8c2-4 4-8 7-12z",
          rightLeg: "M38 42c4 5 7 10 9 16h-8c-2-4-4-8-7-12z",
          extras: arrowRight(45, 36),
        })
      );
    case "back-side":
      return icon(
        person({
          head: [35, 14, 5],
          torso: "M31 21c-8 8-11 17-10 28h10c0-8 3-15 9-22z",
          leftArm: "M29 22c-4-5-6-10-5-17h7c0 5 2 8 6 12z",
          rightArm: "M39 25c5-3 8-8 10-14l6 3c-2 8-7 14-14 18z",
          leftLeg: "M23 48c-3 3-6 6-9 10h8c2-2 4-4 7-7z",
          rightLeg: "M31 48c5 3 10 6 15 10h-10c-4-3-7-5-11-7z",
          extras: (
            <>
              {arrowLeft(7, 24)}
              {arrowRight(42, 24)}
            </>
          ),
        })
      );
    case "back-forward-reach":
      return icon(
        person({
          head: [42, 25, 5],
          torso: "M20 29c9-4 18-4 27 1l-3 9c-8-3-15-3-22 0z",
          leftArm: "M43 30c5 0 10 2 14 5l-3 6c-4-3-8-4-13-4z",
          rightArm: "M42 36c5 1 9 3 13 7l-4 5c-3-3-7-5-12-6z",
          leftLeg: "M21 37c-4 5-8 9-13 13l6 5c5-4 9-8 13-13z",
          rightLeg: "M29 38c-1 6-1 12 1 18h8c-2-5-2-10-1-15z",
          extras: arrowRight(44, 17),
        })
      );
    case "back-twist":
      return icon(
        person({
          head: [32, 10, 5],
          torso: "M27 18c-3 8-2 17 2 26h10c-4-10-4-18 0-26z",
          leftArm: "M27 24c-6 0-11 2-15 6l4 5c4-3 8-4 13-4z",
          rightArm: "M39 24c6 1 10 4 14 9l-5 4c-3-4-6-6-11-7z",
          leftLeg: "M29 43c-5 2-9 5-14 10l6 5c3-3 7-6 12-8z",
          rightLeg: "M39 43c4 4 8 8 12 15h-9c-3-4-6-8-10-11z",
          extras: (
            <>
              <path d="M17 20c9-6 20-6 29 0l-5 2 2 4 12-5-8-10-3 3 3 4c-10-6-21-5-31 2z" opacity="0.6" />
              <path d="M17 46c10 5 21 5 31-1l-3-3 3-3 8 9-11 6-2-4 5-2c-9 4-19 4-28-1z" opacity="0.5" />
            </>
          ),
        })
      );
    case "back-hip-circle":
      return icon(
        person({
          head: [32, 10, 5],
          torso: "M28 18c-2 8-2 16 0 25h10c3-9 3-17 0-25z",
          leftArm: "M27 24c-5 3-8 7-10 13l5 3c2-4 5-8 9-10z",
          rightArm: "M39 24c5 3 8 7 10 13l-5 3c-2-4-5-8-9-10z",
          leftLeg: "M29 42c-3 5-6 10-8 16h8c2-4 4-8 7-12z",
          rightLeg: "M38 42c4 5 7 10 9 16h-8c-2-4-4-8-7-12z",
          extras: <path d="M20 40c2-8 9-13 18-12l-4-4 3-3 10 8-11 8-2-3 4-4c-6 0-11 4-13 10 1 7 6 11 13 11l-4-4 3-3 10 8-10 8-3-3 4-4c-10 0-17-6-18-15z" opacity="0.6" />,
        })
      );
    case "leg-forward-fold":
      return icon(
        person({
          head: [43, 31, 5],
          torso: "M18 28c10-5 20-4 31 3l-4 8c-8-4-15-4-23 0z",
          leftArm: "M45 33c4 2 7 5 10 10l-5 4c-2-3-5-5-9-7z",
          rightArm: "M38 36c3 4 5 8 6 13l-6 2c-1-4-3-7-6-10z",
          leftLeg: "M22 37c-5 5-9 9-14 13l6 5c4-3 8-7 13-12z",
          rightLeg: "M30 38c-1 6 0 11 2 18h8c-2-5-3-10-2-15z",
          extras: <path d="M48 47h11v6H48z" opacity="0.55" />,
        })
      );
    case "leg-knee-pull":
      return icon(
        person({
          head: [31, 10, 5],
          torso: "M27 18c-2 8-2 16 0 25h10c3-9 3-17 0-25z",
          leftArm: "M27 26c-4 4-6 9-5 15l6-1c0-4 1-7 4-10z",
          rightArm: "M39 26c4 4 6 9 5 15l-6-1c0-4-1-7-4-10z",
          leftLeg: "M28 42c-2 5-4 10-5 16h8c1-4 2-8 5-12z",
          rightLeg: "M38 42c4 1 7 4 9 8l-5 5c-2-3-4-5-8-6z",
          extras: <path d="M34 42c4-7 8-9 13-8l2 7c-5-1-8 1-11 7z" opacity="0.9" />,
        })
      );
    case "leg-quad-pull":
      return icon(
        person({
          head: [32, 10, 5],
          torso: "M28 18c-2 8-2 16 0 25h10c3-9 3-17 0-25z",
          leftArm: "M27 24c-5 3-8 7-10 13l5 3c2-4 5-8 9-10z",
          rightArm: "M39 24c4 5 7 10 8 17l-6 1c-1-5-3-9-7-12z",
          leftLeg: "M29 42c-2 5-3 10-4 16h8c1-4 2-8 4-12z",
          rightLeg: "M38 43c5-1 8-4 9-9l6 3c-2 8-8 13-16 14z",
          extras: <path d="M48 34c2 0 4 1 5 3l-2 5c-2-1-4-1-6 0z" opacity="0.7" />,
        })
      );
    case "leg-calf-stretch":
      return icon(
        person({
          head: [34, 12, 5],
          torso: "M29 19c-4 7-4 15-1 23h10c3-8 3-15-1-23z",
          leftArm: "M29 24c-6 1-11 4-15 9l5 5c3-4 7-6 12-7z",
          rightArm: "M38 24c5 2 9 5 12 10l-5 4c-3-4-6-6-11-7z",
          leftLeg: "M29 41c-6 1-11 4-16 9l5 6c4-4 9-6 15-7z",
          rightLeg: "M38 41c7 4 12 8 18 15h-10c-4-4-8-7-13-10z",
          extras: <path d="M51 20h7v38h-7z" opacity="0.55" />,
        })
      );
    default:
      return getGenericStretchPictogram(className);
  }
}


export function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}


