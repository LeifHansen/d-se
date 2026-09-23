import { cn } from "@/lib/utils";

export type LogoTone = "white" | "ink" | "turquoise" | "pink";

interface LogoProps {
  variant?: "wordmark" | "stacked" | "emblem";
  className?: string;
  /** Palette colour for the mark. Omit to inherit `currentColor`. */
  tone?: LogoTone;
}

const toneToColor: Record<LogoTone, string> = {
  white: "hsl(var(--white))",
  ink: "hsl(var(--ink))",
  turquoise: "hsl(var(--turquoise))",
  pink: "hsl(var(--pink))",
};

/** Mountain-inside-droplet emblem. Strokes only, so it tints with `color`. */
export function Emblem({
  className,
  color = "currentColor",
  strokeWidth = 3.5,
}: {
  className?: string;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 120 140"
      className={cn("inline-block", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M60 6 C 90 38, 106 62, 106 84 C 106 110, 84 130, 60 130 C 36 130, 14 110, 14 84 C 14 62, 30 38, 60 6 Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <path
        d="M28 102 L 50 70 L 60 88 L 72 70 L 92 102"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <line
        x1="28"
        y1="102"
        x2="92"
        y2="102"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({ variant = "wordmark", className, tone }: LogoProps) {
  const color = tone ? toneToColor[tone] : "currentColor";

  if (variant === "emblem") {
    return <Emblem className={className} color={color} />;
  }

  if (variant === "stacked") {
    return (
      <div className={cn("inline-flex flex-col items-center gap-2", className)}>
        <Emblem className="h-12 w-auto" color={color} />
        <span
          className="font-wordmark text-3xl"
          style={{ color, letterSpacing: "0.2em" }}
        >
          DŌSE
        </span>
      </div>
    );
  }

  // wordmark
  return (
    <span className={cn("font-wordmark text-2xl", className)} style={{ color }}>
      DŌSE
    </span>
  );
}
