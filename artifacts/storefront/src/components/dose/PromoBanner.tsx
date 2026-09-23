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
      className="w-full overflow-hidden bg-ink text-white"
      data-testid="promo-banner"
    >
      <div className="marquee-track flex w-max items-center py-2">
        {items.map((msg, i) => (
          <div
            key={`${msg}-${i}`}
            className="flex items-center gap-4 px-6 text-[11px] font-semibold uppercase tracking-[0.24em]"
            aria-hidden={i >= messages.length ? "true" : undefined}
          >
            <span>{msg}</span>
            <span
              aria-hidden="true"
              className="block h-1.5 w-1.5 rotate-45 bg-pink-soft"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
