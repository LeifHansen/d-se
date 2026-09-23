const reviews = [
  {
    quote:
      "It mixes in completely clear — no oil slick, no aftertaste. You'd never know it was in the glass until it hits.",
    author: "Maya R.",
    location: "Brooklyn, NY",
  },
  {
    quote:
      "The onset is genuinely fast and predictable. I finally trust a product to do the same thing every time.",
    author: "Jordan T.",
    location: "Austin, TX",
  },
  {
    quote:
      "I checked the batch ID and actually found the lab report. That kind of transparency sold me for good.",
    author: "Priya S.",
    location: "Los Angeles, CA",
  },
];

export function TestimonialSection() {
  return (
    <section
      id="press"
      data-testid="testimonial-section"
      className="grain relative overflow-hidden bg-pink-tint text-ink"
    >
      <div
        aria-hidden="true"
        className="watermark watermark-pink -right-4 top-4 text-[26vw] md:text-[16vw]"
        data-watermark="03"
      />

      <div className="relative mx-auto max-w-7xl px-6 py-20 md:px-10 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow text-pink-deep">Sip Notes</p>
          <h2 className="mt-4 font-display text-6xl leading-[0.92] md:text-7xl">
            Loved by the{" "}
            <span className="font-display-italic text-pink">curious-sober.</span>
          </h2>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {reviews.map((r, i) => (
            <figure
              key={r.author}
              className="rounded-3xl border border-silver bg-white p-7 shadow-sm"
              data-testid={`testimonial-${i + 1}`}
            >
              <div
                className="flex gap-1 text-pink"
                role="img"
                aria-label="Rated 5 out of 5"
              >
                {Array.from({ length: 5 }).map((_, idx) => (
                  <span key={idx} aria-hidden="true">
                    ★
                  </span>
                ))}
              </div>
              <blockquote className="mt-4 text-lg font-medium leading-snug">
                "{r.quote}"
              </blockquote>
              <figcaption className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-silver-dark">
                — {r.author} · {r.location}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
