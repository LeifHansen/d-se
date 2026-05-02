import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "wordmark" | "stacked" | "emblem";
  className?: string;
  tone?: "cream" | "teal" | "gold";
}

const toneToColor: Record<NonNullable<LogoProps["tone"]>, string> = {
  cream: "hsl(45 49% 90%)",
  teal: "hsl(170 58% 14%)",
  gold: "hsl(42 53% 54%)",
};

export function Emblem({
  className,
  color = "hsl(45 49% 90%)",
}: {
  className?: string;
  color?: string;
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
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path
        d="M28 102 L 50 70 L 60 88 L 72 70 L 92 102"
        stroke={color}
        strokeWidth="3.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <line
        x1="28"
        y1="102"
        x2="92"
        y2="102"
        stroke={color}
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({ variant = "wordmark", className, tone = "cream" }: LogoProps) {
  const color = toneToColor[tone];

  if (variant === "emblem") {
    return <Emblem className={className} color={color} />;
  }

  if (variant === "stacked") {
    return (
      <div className={cn("inline-flex flex-col items-center gap-2", className)}>
        <Emblem className="h-12 w-auto" color={color} />
        <span
          className="font-wordmark text-2xl"
          style={{ color, letterSpacing: "0.18em" }}
        >
          DŌSE
        </span>
      </div>
    );
  }

  // wordmark
  return (
    <span
      className={cn("font-wordmark text-xl tracking-[0.18em]", className)}
      style={{ color }}
    >
      DŌSE
    </span>
  );
}
