import { useState } from "react";
import { X, Gift } from "lucide-react";

export function MysteryOfferPill() {
  const [open, setOpen] = useState(true);

  if (!open) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-30 flex items-center gap-3 rounded-full px-4 py-2.5 shadow-lg"
      style={{
        background: "hsl(42 53% 54%)",
        color: "hsl(170 58% 14%)",
      }}
      data-testid="mystery-offer"
    >
      <Gift className="h-4 w-4" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.22em]">
        Mystery Offer
      </span>
      <button
        aria-label="Dismiss offer"
        onClick={() => setOpen(false)}
        className="ml-1 grid h-5 w-5 place-items-center rounded-full hover:bg-black/10"
        data-testid="mystery-offer-close"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
