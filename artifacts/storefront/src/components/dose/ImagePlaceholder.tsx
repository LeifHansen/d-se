import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** What belongs here once real imagery lands, e.g. "Hero bottle shot". */
  label: string;
  /** Optional production note, e.g. "Replace · 1200 × 1500". */
  hint?: string;
  /** Stable id exposed as `data-placeholder` so designers can find each slot. */
  slug?: string;
  /** CSS aspect-ratio, e.g. "4 / 5". Use "auto" to fill the parent. */
  aspect?: string;
  tone?: "light" | "dark";
  className?: string;
};

const CORNERS = [
  "left-3 top-3 border-l-2 border-t-2",
  "right-3 top-3 border-r-2 border-t-2",
  "bottom-3 left-3 border-b-2 border-l-2",
  "bottom-3 right-3 border-b-2 border-r-2",
];

/**
 * Designed stand-in for imagery that has not been shot yet. Every instance is
 * labelled and carries a `data-placeholder` id; swap the component for a real
 * <img>/<Image> when the asset is ready.
 */
export function ImagePlaceholder({
  label,
  hint,
  slug,
  aspect = "4 / 5",
  tone = "light",
  className,
}: Props) {
  const dark = tone === "dark";
  const id = slug ?? label.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  return (
    <div
      role="img"
      aria-label={`Image placeholder: ${label}`}
      data-placeholder={id}
      className={cn(
        "grain relative flex w-full items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed",
        dark
          ? "grain-dark border-white/20 bg-ink-soft text-white"
          : "border-silver bg-silver-light text-ink",
        className,
      )}
      style={{ aspectRatio: aspect }}
    >
      <div
        aria-hidden="true"
        className={cn(
          "halftone pointer-events-none absolute -right-12 -top-12 h-56 w-56",
          dark ? "text-white/40" : "text-ink/40",
        )}
      />
      {CORNERS.map((c) => (
        <span
          key={c}
          aria-hidden="true"
          className={cn(
            "absolute h-5 w-5",
            c,
            dark ? "border-white/35" : "border-ink/30",
          )}
        />
      ))}
      <div className="relative flex flex-col items-center gap-3 px-6 text-center">
        <span
          className={cn(
            "sticker sticker-flat",
            dark ? "sticker-turquoise" : "sticker-ink",
          )}
        >
          <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
          Image placeholder
        </span>
        <p className="font-display text-2xl leading-none">{label}</p>
        {hint ? (
          <p
            className={cn(
              "text-[11px] uppercase tracking-[0.2em]",
              dark ? "text-white/75" : "text-graphite",
            )}
          >
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
