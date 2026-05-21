import { ArrowRight } from "lucide-react";

const messages = [
  "1000MG HEMP-DERIVED DELTA-9 THC",
  "TRACKED FROM FARM TO FINAL PRODUCT",
  "RAPID ONSET · STABLE SHELF LIFE",
  "EVERY BATCH THIRD-PARTY LAB TESTED",
  "FREE SHIPPING ON ORDERS $60+",
];

export function PromoBanner() {
  // Repeat once for seamless marquee scroll
  const items = [...messages, ...messages];
  return (
    <div
      className="w-full overflow-hidden border-b"
      style={{
        background: "hsl(95 14% 67%)",
        color: "hsl(166 95% 19%)",
        borderColor: "hsl(95 18% 55%)",
      }}
      data-testid="promo-banner"
    >
      <div className="marquee-track flex w-max items-center py-2">
        {items.map((msg, i) => (
          <div
            key={`${msg}-${i}`}
            className="flex items-center gap-3 px-8 text-[11px] font-medium uppercase tracking-[0.22em]"
          >
            <span>{msg}</span>
            <ArrowRight className="h-3 w-3" />
          </div>
        ))}
      </div>
    </div>
  );
}
