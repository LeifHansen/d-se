import { Star } from "lucide-react";

export function Stars({
  rating,
  size = 16,
  color = "hsl(42 53% 54%)",
  emptyColor = "hsla(170, 58%, 14%, 0.2)",
  interactive = false,
  onChange,
}: {
  rating: number | null | undefined;
  size?: number;
  color?: string;
  emptyColor?: string;
  interactive?: boolean;
  onChange?: (value: number) => void;
}) {
  const value = Math.max(0, Math.min(5, rating ?? 0));
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role={interactive ? "radiogroup" : "img"}
      aria-label={
        rating != null ? `Rated ${value.toFixed(1)} out of 5` : "No reviews yet"
      }
      data-testid="stars"
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = i <= Math.round(value);
        const StarEl = (
          <Star
            key={i}
            width={size}
            height={size}
            fill={filled ? color : "none"}
            stroke={filled ? color : emptyColor}
            strokeWidth={1.5}
          />
        );
        if (!interactive) return StarEl;
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={i === Math.round(value)}
            aria-label={`${i} star${i === 1 ? "" : "s"}`}
            onClick={() => onChange?.(i)}
            className="cursor-pointer bg-transparent p-0"
            data-testid={`star-${i}`}
          >
            {StarEl}
          </button>
        );
      })}
    </span>
  );
}
